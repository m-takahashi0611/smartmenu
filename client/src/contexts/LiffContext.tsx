/**
 * LIFF Context
 * LINEアプリ内ブラウザ・外部ブラウザ両方でLIFF機能を提供する
 *
 * 重要: liffオブジェクトをstateで保持することで、初期化完了後のみログインが可能になる
 */
import { createContext, useContext, useEffect, useState, useCallback, ReactNode, useRef } from "react";
import { trpc } from "@/lib/trpc";

const LIFF_ID = import.meta.env.VITE_LIFF_ID as string;

type LiffSDK = typeof import("@line/liff").default;

type LiffContextType = {
  isLiff: boolean;
  isInClient: boolean;
  isInitialized: boolean;
  isLoggedIn: boolean;
  isLoading: boolean;
  isLoggingIn: boolean;
  error: string | null;
  loginWithLine: () => void;
};

const LiffContext = createContext<LiffContextType>({
  isLiff: false,
  isInClient: false,
  isInitialized: false,
  isLoggedIn: false,
  isLoading: true,
  isLoggingIn: false,
  error: null,
  loginWithLine: () => {},
});

export function LiffProvider({ children }: { children: ReactNode }) {
  const [isLiff, setIsLiff] = useState(false);
  const [isInClient, setIsInClient] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const liffRef = useRef<LiffSDK | null>(null);

  const utils = trpc.useUtils();
  const loginMutation = trpc.lineAuth.loginWithLine.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      window.location.href = "/dashboard";
    },
    onError: (err) => {
      console.error("[LIFF] Session creation failed:", err);
      setIsLoggingIn(false);
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

        // 初期化成功後にliffオブジェクトをrefに保存
        liffRef.current = liff;

        const inClient = liff.isInClient();
        const loggedIn = liff.isLoggedIn();

        setIsLiff(true);
        setIsInClient(inClient);
        setIsLoggedIn(loggedIn);
        setIsInitialized(true);
        setIsLoading(false);

        console.log("[LIFF] Initialized. inClient:", inClient, "loggedIn:", loggedIn);

        // LINEアプリ内でログイン済みなら自動セッション発行
        if (inClient && loggedIn) {
          try {
            setIsLoggingIn(true);
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
            setIsLoggingIn(false);
          }
        } else if (!inClient && loggedIn) {
          // 外部ブラウザでliff.login()コールバック後（ログイン済み）
          // → IDトークンでセッション発行
          try {
            setIsLoggingIn(true);
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
            console.error("[LIFF] External browser login failed:", err);
            setIsLoggingIn(false);
          }
        }
      } catch (err) {
        console.error("[LIFF] Init failed:", err);
        setIsLiff(false);
        setError(null); // 通常ブラウザではエラー表示しない
        setIsLoading(false);
      }
    };

    initLiff();
  }, []);

  const loginWithLine = useCallback(() => {
    const liff = liffRef.current;
    if (!liff) {
      console.error("[LIFF] liff not initialized yet");
      return;
    }
    if (!liff.isLoggedIn()) {
      console.log("[LIFF] Calling liff.login()...");
      liff.login({ redirectUri: window.location.href });
    } else {
      // すでにログイン済みの場合はセッション発行
      setIsLoggingIn(true);
      liff.getProfile().then((profile) => {
        const idToken = liff.getIDToken();
        if (idToken) {
          loginMutation.mutate({
            idToken,
            lineUserId: profile.userId,
            displayName: profile.displayName,
            pictureUrl: profile.pictureUrl ?? undefined,
          });
        }
      }).catch((err) => {
        console.error("[LIFF] Get profile failed:", err);
        setIsLoggingIn(false);
      });
    }
  }, [loginMutation]);

  return (
    <LiffContext.Provider value={{
      isLiff,
      isInClient,
      isInitialized,
      isLoggedIn,
      isLoading,
      isLoggingIn: isLoggingIn || loginMutation.isPending,
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
