import { useState, useEffect } from "react";
import liff from "@line/liff";
import { signInWithCustomToken } from "firebase/auth";
import { auth } from "@/lib/firebase";

interface LiffState {
  isReady: boolean;
  isLoggedIn: boolean;
  profile: { userId: string; displayName: string; pictureUrl?: string } | null;
  error: string | null;
}

export function useLiff() {
  const [state, setState] = useState<LiffState>({
    isReady: false,
    isLoggedIn: false,
    profile: null,
    error: null,
  });

  useEffect(() => {
    const liffId = import.meta.env.VITE_LIFF_ID;
    if (!liffId) {
      setState((s) => ({ ...s, isReady: true, error: "LIFF ID が設定されていません" }));
      return;
    }

    liff
      .init({ liffId })
      .then(async () => {
        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }
        const profile = await liff.getProfile();
        setState({
          isReady: true,
          isLoggedIn: true,
          profile: {
            userId: profile.userId,
            displayName: profile.displayName,
            pictureUrl: profile.pictureUrl,
          },
          error: null,
        });
      })
      .catch((err) => {
        console.error("[LIFF] Init error:", err);
        setState((s) => ({ ...s, isReady: true, error: String(err) }));
      });
  }, []);

  return state;
}
