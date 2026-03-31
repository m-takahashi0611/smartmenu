/**
 * LIFF Context
 * LINEアプリ内ブラウザ・外部ブラウザ両方でLIFF機能を提供する
 *
 * LIFF動作モード:
 * - isInClient() = true  → LINEアプリ内ブラウザ → IDトークンで自動ログイン → /dashboard へリダイレクト
 * - isInClient() = false → 外部ブラウザ (LIFF URLから開かれた) → liff.login() でLINE認証画面へ
 *
 * isLiff: LIFF URLから開かれた場合はtrue（インアプリ・外部ブラウザ問わず）
 */
import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { trpc } from "@/lib/trpc";

const LIFF_ID = import.meta.env.VITE_LIFF_ID as string;

type LiffContextType = {
  isLiff: boolean;         // LIFF URLから開かれているか（インアプリ・外部問わず）
  isInClient: boolean;     // LINEアプリ内ブラウザかどうか
  isInitialized: boolean;
  isLoggedIn: boolean;
  isLoading: boolean;
  isLoggingIn: boolean;
  error: string | null;
  loginWithLine: () => Promise<void>;
};

const LiffContext = createContext<LiffContextType>({
  isLiff: false,
  isInClient: false,
  isInitialized: false,
  isLoggedIn: false,
  isLoading: true,
  isLoggingIn: false,
  error: null,
  loginWithLine: async () => {},
});

export function LiffProvider({ children }: { children: ReactNode }) {
  const [isLiff, setIsLiff] = useState(false);
  const [isInClient, setIsInClient] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const loginMutation = trpc.lineAuth.loginWithLine.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
    },
  });

  useEffect(() => {
    if (!LIFF_ID) {
      setIsLoading(false);
      return;
    }

    const initLiff = async () => {
      try {
        const liff = (await import("@line/liff")).default;
        await liff.init({ liffId: LIFF_ID });

        const inClient = liff.isInClient();
        const loggedIn = liff.isLoggedIn();

        // LIFF URLから開かれた場合はisLiff=true
        // (インアプリ・外部ブラウザ問わず、liff.init()が成功した時点でLIFF環境とみなす)
        setIsLiff(true);
        setIsInClient(inClient);
        setIsLoggedIn(loggedIn);
        setIsInitialized(true);
        setIsLoading(false);

        // LINEアプリ内でログイン済みなら自動セッション発行してダッシュボードへ
        if (inClient && loggedIn) {
          try {
            const idToken = liff.getIDToken();
            const profile = await liff.getProfile();
            if (idToken) {
              await loginMutation.mutateAsync({
                idToken,
                lineUserId: profile.userId,
                displayName: profile.displayName,
                pictureUrl: profile.pictureUrl ?? undefined,
              });
              // ログイン成功後、ダッシュボードへリダイレクト
              window.location.href = "/dashboard";
            }
          } catch (err) {
            console.error("[LIFF] Auto login failed:", err);
          }
        }
        // 外部ブラウザの場合はボタンタップ待ち（liff.login()はloginWithLine()で呼ぶ）
      } catch (err) {
        console.error("[LIFF] Init failed:", err);
        // LIFF初期化失敗 = LIFF URLから開かれていない通常ブラウザ
        setIsLiff(false);
        setIsLoading(false);
      }
    };

    initLiff();
  }, []);

  const loginWithLine = useCallback(async () => {
    if (!LIFF_ID) return;
    try {
      const liff = (await import("@line/liff")).default;

      if (!liff.isLoggedIn()) {
        // 外部ブラウザ: LINE認証ページへリダイレクト
        // redirectUri を指定してログイン後に戻ってくる先を明示
        liff.login({ redirectUri: window.location.href });
        return;
      }

      // ログイン済み（外部ブラウザでコールバック後）: IDトークンでセッション発行
      const idToken = liff.getIDToken();
      const profile = await liff.getProfile();
      if (idToken) {
        await loginMutation.mutateAsync({
          idToken,
          lineUserId: profile.userId,
          displayName: profile.displayName,
          pictureUrl: profile.pictureUrl ?? undefined,
        });
        // セッション発行後ダッシュボードへ
        window.location.href = "/dashboard";
      }
    } catch (err) {
      console.error("[LIFF] Login failed:", err);
    }
  }, [loginMutation]);

  return (
    <LiffContext.Provider value={{
      isLiff,
      isInClient,
      isInitialized,
      isLoggedIn,
      isLoading,
      isLoggingIn: loginMutation.isPending,
      error,
      loginWithLine,
    }}>
      {children}
    </LiffContext.Provider>
  );
}

export function useLiffContext() {
  return useContext(LiffContext);
}
