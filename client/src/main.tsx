import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

const queryClient = new QueryClient();

/**
 * LIFF環境（LINE内ブラウザ）かどうかを判定する
 * liff.init()不要でUAやURLパラメータから判定
 */
const isLiffEnvironment = (): boolean => {
  const ua = navigator.userAgent;
  const search = window.location.search;
  // LINE内ブラウザのUser-AgentまたはLIFFパラメータがある場合
  return ua.includes("Line/") || ua.includes("LIFF") ||
    search.includes("liff.state") || search.includes("liffClientId");
};

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  // LIFF環境（LINE内ブラウザ）の場合はトップページにリダイレクト（LINEログインボタンがある画面）
  // ただし、/planページ（LINEログインボタンが既にある）にいる場合はリダイレクトしない
  if (isLiffEnvironment()) {
    const currentPath = window.location.pathname;
    // /planや/dashboardなど、未認証でも表示できるページはリダイレクトしない
    const noRedirectPaths = ["/plan", "/terms", "/contact"];
    if (noRedirectPaths.some(p => currentPath.startsWith(p))) {
      return; // このページはそのまま表示（未ログイン用UIがある）
    }
    if (currentPath !== "/") {
      window.location.href = "/";
    }
    return;
  }

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
