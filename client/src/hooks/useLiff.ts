/**
 * LIFF SDK フック
 * LINEアプリ内ブラウザでの認証を管理する
 */
import { useEffect, useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";

const LIFF_ID = import.meta.env.VITE_LIFF_ID as string;

type LiffState = {
  isLiff: boolean;          // LINEアプリ内ブラウザかどうか
  isInitialized: boolean;   // LIFF SDK初期化完了
  isLoggedIn: boolean;      // LINEでログイン済み
  isLoading: boolean;
  error: string | null;
};

export function useLiff() {
  const [state, setState] = useState<LiffState>({
    isLiff: false,
    isInitialized: false,
    isLoggedIn: false,
    isLoading: true,
    error: null,
  });

  const utils = trpc.useUtils();
  const loginMutation = trpc.lineAuth.loginWithLine.useMutation({
    onSuccess: () => {
      // セッション発行後にauth.meを再取得
      utils.auth.me.invalidate();
    },
  });

  const initLiff = useCallback(async () => {
    if (!LIFF_ID) {
      setState(s => ({ ...s, isLoading: false, isLiff: false }));
      return;
    }

    try {
      const liff = (await import("@line/liff")).default;
      await liff.init({ liffId: LIFF_ID });

      const isInClient = liff.isInClient();
      const isLoggedIn = liff.isLoggedIn();

      setState(s => ({
        ...s,
        isLiff: isInClient,
        isInitialized: true,
        isLoggedIn,
        isLoading: false,
      }));

      // LINEアプリ内でログイン済みの場合、自動的にセッション発行
      if (isInClient && isLoggedIn) {
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
          // 自動ログイン失敗は無視（手動ログインにフォールバック）
        }
      }
    } catch (err) {
      console.error("[LIFF] Init failed:", err);
      setState(s => ({
        ...s,
        isLoading: false,
        isLiff: false,
        error: "LIFF初期化に失敗しました",
      }));
    }
  }, []);

  useEffect(() => {
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

  return {
    ...state,
    loginWithLine,
    isLoggingIn: loginMutation.isPending,
  };
}
