/**
 * LIFF Context - Android LINE内ブラウザ対応版
 *
 * 設計方針:
 * - liff.stateパラメータがある場合のみ isLiff=true（LIFF URL経由）
 * - User-Agent で "Line/" を検出しても isLiff=false（通常のOAuthログインを使用）
 *   → Android LINE内ブラウザでは liff.init() が失敗するケースがあるため
 * - liff.init() にタイムアウトを設けて必ず setIsLoggingIn(false) を呼ぶ
 */
import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { trpc } from "@/lib/trpc";

const LIFF_ID = import.meta.env.VITE_LIFF_ID as string;
const LIFF_INIT_TIMEOUT_MS = 10000; // 10秒タイムアウト

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
 * LINEのLIFF URL経由またはLINE内ブラウザかどうかを判定する
 *
 * 【設計方針】
 * - liff.stateパラメータがある場合 → LIFF URL経由（isLiff=true）
 * - User-Agent に "Line/" が含まれる場合 → LINE内ブラウザ（isLiff=true）
 *   → liff.init()は使わず、LINEログインボタンのみ表示する
 *   → ボタンタップ時にliff.init()を実行する（タイムアウト付き）
 */
function detectIsLiff(): boolean {
  const search = window.location.search;

  // liff.stateパラメータが存在する場合 → LIFF URL経由
  if (search.includes("liff.state") || search.includes("liffClientId")) {
    return true;
  }

  // User-Agent判定: LINE内ブラウザ（Android/iOS両対応）
  const ua = navigator.userAgent || "";
  if (ua.includes("Line/") || ua.includes("LIFF")) {
    return true;
  }

  return false;
}

/**
 * liff.init() にタイムアウトを設けるラッパー
 */
async function liffInitWithTimeout(liff: any, liffId: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`liff.init() timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    liff.init({ liffId }).then(() => {
      clearTimeout(timer);
      resolve();
    }).catch((err: any) => {
      clearTimeout(timer);
      reject(err);
    });
  });
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

      console.log("[LIFF] Initializing (timeout: " + LIFF_INIT_TIMEOUT_MS + "ms)...");
      await liffInitWithTimeout(liff, LIFF_ID, LIFF_INIT_TIMEOUT_MS);
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
