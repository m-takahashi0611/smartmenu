/**
 * LIFF Context - Android/iOS LINE内ブラウザ対応版
 *
 * 設計方針:
 * - User-Agent で "Line/" を検出した場合 isLiff=true
 * - liff.init() にタイムアウトを設けて必ず setIsLoggingIn(false) を呼ぶ
 * - LINE内ブラウザ(isInClient=true)では liff.login() を呼ばない
 *   → liff.init()後に自動的にログイン済みになるため
 *   → liff.login()を呼ぶとループが発生するため
 * - sessionStorage でログイン試行回数を管理し、3回失敗したら即座にループ停止
 * - ループ停止後はエラーUI（再読み込み・運営報告・問い合わせボタン）を表示
 * - エラー発生時はサーバーに送信してオーナーに通知
 */
import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { trpc } from "@/lib/trpc";

const LIFF_ID = import.meta.env.VITE_LIFF_ID as string;
const LIFF_INIT_TIMEOUT_MS = 15000; // 15秒タイムアウト
const LOGIN_ATTEMPT_KEY = "liff_login_attempts";
const MAX_LOGIN_ATTEMPTS = 3; // 3回失敗でループ停止

type LiffError = {
  message: string;
  canRetry: boolean;
};

type LiffContextType = {
  isLiff: boolean;
  isLoggingIn: boolean;
  liffError: LiffError | null;
  liffLineName: string | null;
  clearLiffError: () => void;
  loginWithLine: () => Promise<void>;
  buildContactUrl: () => string;
};

const LiffContext = createContext<LiffContextType>({
  isLiff: false,
  isLoggingIn: false,
  liffError: null,
  liffLineName: null,
  clearLiffError: () => {},
  loginWithLine: async () => {},
  buildContactUrl: () => '/contact',
});

/**
 * LINEのLIFF URL経由またはLINE内ブラウザかどうかを判定する
 */
function detectIsLiff(): boolean {
  const search = window.location.search;
  if (search.includes("liff.state") || search.includes("liffClientId")) {
    return true;
  }
  const ua = navigator.userAgent || "";
  if (ua.includes("Line/") || ua.includes("LIFF")) {
    return true;
  }
  return false;
}

/**
 * ログイン試行回数を取得
 */
function getLoginAttempts(): number {
  try {
    return parseInt(sessionStorage.getItem(LOGIN_ATTEMPT_KEY) ?? "0", 10);
  } catch {
    return 0;
  }
}

/**
 * ログイン試行回数をインクリメントして返す
 */
function incrementLoginAttempts(): number {
  try {
    const current = getLoginAttempts();
    const next = current + 1;
    sessionStorage.setItem(LOGIN_ATTEMPT_KEY, String(next));
    return next;
  } catch {
    return 1;
  }
}

/**
 * ログイン試行回数をリセット
 */
function resetLoginAttempts(): void {
  try {
    sessionStorage.removeItem(LOGIN_ATTEMPT_KEY);
  } catch {
    // ignore
  }
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
  const [isLiff] = useState(() => {
    if (!LIFF_ID) return false;
    return detectIsLiff();
  });
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [liffError, setLiffError] = useState<LiffError | null>(() => {
    // 初期表示時にすでに試行回数が上限に達していたらエラーUIを表示
    if (getLoginAttempts() >= MAX_LOGIN_ATTEMPTS) {
      return {
        message: `ログインを${MAX_LOGIN_ATTEMPTS}回試みましたが、うまくいきませんでした。\n「再読み込みする」または「運営に報告する」をタップしてください。`,
        canRetry: true,
      };
    }
    return null;
  });
  const [liffLineName, setLiffLineName] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const reportErrorMutation = trpc.errorLog.report.useMutation();

  const loginMutation = trpc.lineAuth.loginWithLine.useMutation({
    onSuccess: () => {
      resetLoginAttempts();
      utils.auth.me.invalidate();
      window.location.href = "/dashboard";
    },
    onError: (err) => {
      console.error("[LIFF] Session creation failed:", err);
      setIsLoggingIn(false);
      const errMsg = err.message || "セッション作成エラー";
      setLiffError({
        message: "ログインに失敗しました。もう一度お試しください。",
        canRetry: true,
      });
      reportErrorMutation.mutate({
        type: "login_session_failed",
        message: errMsg,
        userAgent: navigator.userAgent,
      });
    },
  });

  const clearLiffError = useCallback(() => {
    setLiffError(null);
  }, []);

  const buildContactUrl = useCallback(() => {
    const params = new URLSearchParams();
    params.set('from', 'error');
    if (liffLineName) params.set('name', liffLineName);
    if (liffError) {
      params.set('errorType', liffError.message.includes('タイムアウト') ? 'timeout' : 'login_failed');
      params.set('errorMsg', liffError.message);
    }
    params.set('ua', navigator.userAgent.substring(0, 200));
    params.set('at', new Date().toISOString());
    return `/contact?${params.toString()}`;
  }, [liffLineName, liffError]);

  const loginWithLine = useCallback(async () => {
    if (!LIFF_ID) {
      console.error("[LIFF] LIFF_ID not configured");
      return;
    }

    // ─── ループ防止：試行回数チェック ───────────────────────────────
    const attempts = incrementLoginAttempts();
    console.log(`[LIFF] Login attempt #${attempts}/${MAX_LOGIN_ATTEMPTS}`);

    if (attempts > MAX_LOGIN_ATTEMPTS) {
      // 上限超過：即座にループ停止
      console.error(`[LIFF] Login attempts exceeded (${attempts}). Stopping loop.`);
      setIsLoggingIn(false);
      setLiffError({
        message: `ログインを${MAX_LOGIN_ATTEMPTS}回試みましたが、うまくいきませんでした。\n「再読み込みする」または「運営に報告する」をタップしてください。`,
        canRetry: true,
      });
      reportErrorMutation.mutate({
        type: "liff_login_loop_detected",
        message: `Login loop detected: ${attempts} attempts`,
        userAgent: navigator.userAgent,
        extra: { url: window.location.href, attempts, timestamp: new Date().toISOString() },
      });
      return;
    }
    // ────────────────────────────────────────────────────────────────

    setIsLoggingIn(true);
    setLiffError(null);
    console.log("[LIFF] Starting login flow...");

    try {
      const liff = (await import("@line/liff")).default;

      console.log("[LIFF] Initializing (timeout: " + LIFF_INIT_TIMEOUT_MS + "ms)...");
      await liffInitWithTimeout(liff, LIFF_ID, LIFF_INIT_TIMEOUT_MS);

      const isInClient = liff.isInClient();
      const isLoggedIn = liff.isLoggedIn();
      console.log("[LIFF] Initialized. isLoggedIn:", isLoggedIn, "isInClient:", isInClient);

      if (!isLoggedIn) {
        if (isInClient) {
          // LINE内ブラウザなのにログインできていない
          // → liff.login()を呼ぶとループするので呼ばない
          console.warn("[LIFF] isInClient=true but not logged in. Stopping.");
          setIsLoggingIn(false);
          setLiffError({
            message: "認証の準備ができていません。\n「再読み込みする」をタップしてください。",
            canRetry: true,
          });
          reportErrorMutation.mutate({
            type: "liff_inclient_not_logged_in",
            message: "isInClient=true but isLoggedIn=false",
            userAgent: navigator.userAgent,
            extra: { url: window.location.href, attempts, timestamp: new Date().toISOString() },
          });
          return;
        }

        // LINE外ブラウザ → liff.login()でLINE認証画面へ
        const redirectUri = window.location.origin + "/";
        console.log("[LIFF] Not in client, redirecting to LINE login... redirectUri:", redirectUri);
        liff.login({ redirectUri });
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
      setLiffLineName(profile.displayName);
      await loginMutation.mutateAsync({
        idToken,
        lineUserId: profile.userId,
        displayName: profile.displayName,
        pictureUrl: profile.pictureUrl ?? undefined,
      });
    } catch (err) {
      console.error("[LIFF] Login flow failed:", err);
      setIsLoggingIn(false);

      const errMsg = err instanceof Error ? err.message : "不明なエラー";
      const isTimeout = errMsg.includes("timed out");

      setLiffError({
        message: isTimeout
          ? "読み込みがタイムアウトしました。\n「再読み込みする」ボタンをタップしてください。"
          : `ログインエラーが発生しました。\nもう一度お試しください。`,
        canRetry: true,
      });

      try {
        reportErrorMutation.mutate({
          type: isTimeout ? "liff_init_timeout" : "liff_login_failed",
          message: errMsg,
          userAgent: navigator.userAgent,
          extra: {
            url: window.location.href,
            attempts,
            timestamp: new Date().toISOString(),
          },
        });
      } catch {
        // ignore
      }
    }
  }, [loginMutation, reportErrorMutation]);

  /**
   * 再読み込みボタン用：試行回数をリセットしてリロード
   */
  const reloadWithReset = useCallback(() => {
    resetLoginAttempts();
    window.location.reload();
  }, []);

  return (
    <LiffContext.Provider value={{
      isLiff,
      isLoggingIn: isLoggingIn || loginMutation.isPending,
      liffError,
      liffLineName,
      clearLiffError,
      loginWithLine,
      buildContactUrl,
    }}>
      {children}
    </LiffContext.Provider>
  );
}

export function useLiffContext() {
  return useContext(LiffContext);
}

/**
 * 再読み込みボタン用：試行回数をリセットしてリロード（外部から呼べるユーティリティ）
 */
export function reloadWithLoginReset(): void {
  resetLoginAttempts();
  window.location.reload();
}
