/**
 * LIFF Context - シンプル版
 *
 * 設計方針:
 * - liff.init()の完了を待ってボタンを有効化するのではなく、
 *   ボタンタップ時にinit→loginを直列実行する
 * - ボタンは常に押せる状態（disabledにしない）
 * - isLiff判定はURLパラメータ（liff.state）で行う（init不要）
 */
import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { trpc } from "@/lib/trpc";

const LIFF_ID = import.meta.env.VITE_LIFF_ID as string;

type LiffContextType = {
  isLiff: boolean;
  isLoggingIn: boolean;
  loginWithLine: () => Promise<void>;
};

const LiffContext = createContext<LiffContextType>({
  isLiff: false,
  isLoggingIn: false,
  loginWithLine: async () => {},
});

/**
 * LIFF URLから開かれたかどうかをURLパラメータで判定する
 * liff.init()不要で即座に判定可能
 */
function detectIsLiff(): boolean {
  // LIFF URLから開かれた場合、URLに liff.state パラメータが含まれる
  // または、URLが https://liff.line.me/ から始まる場合
  const url = window.location.href;
  const search = window.location.search;

  // liff.stateパラメータが存在する場合はLIFF環境
  if (search.includes("liff.state") || search.includes("liffClientId")) {
    return true;
  }

  // LIFF_IDが設定されていて、かつLINEのUser-Agentを持つ場合
  const ua = navigator.userAgent;
  if (LIFF_ID && (ua.includes("Line/") || ua.includes("LIFF"))) {
    return true;
  }

  // URLにliff関連パラメータがある場合
  if (url.includes("liff") || search.includes("code=") && search.includes("state=")) {
    // OAuthコールバックの可能性もあるので、より厳密に判定
    if (search.includes("liff")) {
      return true;
    }
  }

  return false;
}

export function LiffProvider({ children }: { children: ReactNode }) {
  // URLパラメータで即座にisLiffを判定（init不要）
  const [isLiff] = useState(() => {
    if (!LIFF_ID) return false;
    return detectIsLiff();
  });
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const utils = trpc.useUtils();
  const loginMutation = trpc.lineAuth.loginWithLine.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      window.location.href = "/dashboard";
    },
    onError: (err) => {
      console.error("[LIFF] Session creation failed:", err);
      setIsLoggingIn(false);
      alert("ログインに失敗しました。もう一度お試しください。");
    },
  });

  const loginWithLine = useCallback(async () => {
    if (!LIFF_ID) {
      console.error("[LIFF] LIFF_ID not configured");
      return;
    }

    setIsLoggingIn(true);
    console.log("[LIFF] Starting login flow...");

    try {
      // 毎回liff.init()を実行（ボタンタップ時）
      const liff = (await import("@line/liff")).default;

      console.log("[LIFF] Initializing...");
      await liff.init({ liffId: LIFF_ID });
      console.log("[LIFF] Initialized. isLoggedIn:", liff.isLoggedIn(), "isInClient:", liff.isInClient());

      if (!liff.isLoggedIn()) {
        // 未ログイン → LINE認証画面へリダイレクト
        // redirectUriはLINEデベロッパーコンソールに登録したエンドポイントURLのオリジンを使用
        // window.location.hrefを使うと登録URLと不一致になり400エラーが発生するため
        // エンドポイントURLはLINEデベロッパーコンソールに登録された値と完全一致させる必要がある
        const endpointOrigin = "https://www.kondatebiyori.com";
        const redirectUri = endpointOrigin + "/";
        console.log("[LIFF] Not logged in, redirecting to LINE login... redirectUri:", redirectUri);
        liff.login({ redirectUri });
        // リダイレクト後はここには戻らない
        return;
      }

      // ログイン済み → IDトークンでセッション発行
      console.log("[LIFF] Already logged in, getting profile...");
      const idToken = liff.getIDToken();
      const profile = await liff.getProfile();

      if (!idToken) {
        throw new Error("IDトークンが取得できませんでした");
      }

      console.log("[LIFF] Got profile:", profile.displayName);
      await loginMutation.mutateAsync({
        idToken,
        lineUserId: profile.userId,
        displayName: profile.displayName,
        pictureUrl: profile.pictureUrl ?? undefined,
      });
    } catch (err) {
      console.error("[LIFF] Login flow failed:", err);
      setIsLoggingIn(false);
      alert(`ログインエラー: ${err instanceof Error ? err.message : "不明なエラー"}`);
    }
  }, [loginMutation]);

  return (
    <LiffContext.Provider value={{
      isLiff,
      isLoggingIn: isLoggingIn || loginMutation.isPending,
      loginWithLine,
    }}>
      {children}
    </LiffContext.Provider>
  );
}

export function useLiffContext() {
  return useContext(LiffContext);
}
