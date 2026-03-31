/**
 * LIFF Context
 * LINEアプリ内ブラウザの状態をアプリ全体で共有する
 */
import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { trpc } from "@/lib/trpc";

const LIFF_ID = import.meta.env.VITE_LIFF_ID as string;

type LiffContextType = {
  isLiff: boolean;
  isInitialized: boolean;
  isLoggedIn: boolean;
  isLoading: boolean;
  isLoggingIn: boolean;
  error: string | null;
  loginWithLine: () => Promise<void>;
};

const LiffContext = createContext<LiffContextType>({
  isLiff: false,
  isInitialized: false,
  isLoggedIn: false,
  isLoading: true,
  isLoggingIn: false,
  error: null,
  loginWithLine: async () => {},
});

export function LiffProvider({ children }: { children: ReactNode }) {
  const [isLiff, setIsLiff] = useState(false);
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

        setIsLiff(inClient);
        setIsLoggedIn(loggedIn);
        setIsInitialized(true);
        setIsLoading(false);

        // LINEアプリ内でログイン済みなら自動セッション発行
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
            }
          } catch (err) {
            console.error("[LIFF] Auto login failed:", err);
            // 自動ログイン失敗は無視
          }
        }
      } catch (err) {
        console.error("[LIFF] Init failed:", err);
        setError("LIFF初期化に失敗しました");
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
        liff.login();
        return;
      }
      const idToken = liff.getIDToken();
      const profile = await liff.getProfile();
      if (idToken) {
        await loginMutation.mutateAsync({
          idToken,
          lineUserId: profile.userId,
          displayName: profile.displayName,
          pictureUrl: profile.pictureUrl ?? undefined,
        });
      }
    } catch (err) {
      console.error("[LIFF] Login failed:", err);
    }
  }, [loginMutation]);

  return (
    <LiffContext.Provider value={{
      isLiff,
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
