import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLiffContext } from "@/contexts/LiffContext";
import { getLoginUrl } from "@/const";
import { useEffect } from "react";

const features = [
  {
    icon: "🍽️",
    title: "AI献立提案",
    description: "家族構成・冷蔵庫在庫・近隣スーパーの特売情報を組み合わせて、毎日最適な献立をAIが自動生成します。",
    link: "/dashboard",
    linkLabel: "献立を見る →",
    requiresAuth: true,
  },
  {
    icon: "📱",
    title: "LINE自動配信",
    description: "毎朝指定した時間に、その日の献立をLINEで受け取れます。忙しい朝でもすぐに確認できます。",
    link: "/dashboard",
    linkLabel: "配信設定へ →",
    requiresAuth: true,
  },
  {
    icon: "🛒",
    title: "買い物リスト自動生成",
    description: "献立に必要な食材を自動でリスト化。スーパーでの買い物がスムーズになります。",
    link: "/shopping",
    linkLabel: "買い物リストへ →",
    requiresAuth: true,
  },
  {
    icon: "🥦",
    title: "冷蔵庫在庫管理",
    description: "冷蔵庫にある食材を登録するだけ。消費期限切れを防ぎ、食材を無駄なく使い切れます。",
    link: "/fridge",
    linkLabel: "冷蔵庫を管理 →",
    requiresAuth: true,
  },
  {
    icon: "👨‍👩‍👧‍👦",
    title: "家族構成に合わせた提案",
    description: "アレルギー・好き嫌い・年齢層を考慮した献立を提案。家族全員が喜ぶメニューを。",
    link: "/family",
    linkLabel: "家族情報を登録 →",
    requiresAuth: true,
  },
  {
    icon: "🏪",
    title: "マイ店舗登録",
    description: "よく利用するスーパーを登録して特売情報を入力。コストを抑えた献立提案が可能です。",
    link: "/stores",
    linkLabel: "店舗を登録 →",
    requiresAuth: true,
  },
];

const stepsAll = [
  { step: "01", title: "LINEで友達追加", desc: "献立日和～coto coto～の公式LINEアカウントを友達追加します", requiresGuest: true },
  { step: "02", title: "家族情報を登録", desc: "家族の人数・年齢・アレルギーなどを設定します", requiresGuest: false },
  { step: "03", title: "冷蔵庫を登録", desc: "今ある食材と消費期限を入力します", requiresGuest: false },
  { step: "04", title: "毎朝LINEで受け取る", desc: "指定した時間に献立と買い物リストが届きます", requiresGuest: false },
];

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const { isLiff, isLoggingIn, loginWithLine } = useLiffContext();

  // デバッグ用ログ
  useEffect(() => {
    console.log("[Home] isLiff:", isLiff, "isLoggingIn:", isLoggingIn, "user:", !!user);
  }, [isLiff, isLoggingIn, user]);

  // LIFF URL経由（liff.stateパラメータあり）の場合のみ自動ログインを実行
  // UA検出（LINEアプリ内ブラウザ）の場合は自動ログインしない（ボタン表示のみ）
  useEffect(() => {
    const search = window.location.search;
    const isLiffUrl = search.includes("liff.state") || search.includes("liffClientId");
    if (isLiff && isLiffUrl && !authLoading && !user && !isLoggingIn) {
      console.log("[Home] LIFF URL detected, auto-retrying LINE login...");
      const timer = setTimeout(() => {
        loginWithLine();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isLiff, authLoading, user, isLoggingIn, loginWithLine]);

  // LINEログインボタン（ログイン済みならグレーアウト・小型化）
  const LineLoginButton = ({ size = "lg" }: { size?: "sm" | "lg" }) => {
    const isLoggedIn = !!user;
    return (
      <button
        type="button"
        onTouchEnd={(e) => {
          if (isLoggedIn || isLoggingIn) return;
          e.preventDefault();
          e.stopPropagation();
          console.log("[Home] LINE login button touchEnd");
          loginWithLine();
        }}
        onClick={(e) => {
          if (isLoggedIn || isLoggingIn) return;
          e.preventDefault();
          e.stopPropagation();
          console.log("[Home] LINE login button clicked");
          loginWithLine();
        }}
        disabled={isLoggingIn || isLoggedIn}
        style={{
          backgroundColor: (isLoggingIn || isLoggedIn) ? '#ccc' : '#06C755',
          color: (isLoggingIn || isLoggedIn) ? '#888' : 'white',
          fontWeight: 'bold',
          // ログイン済みなら小さく
          fontSize: isLoggedIn ? '12px' : (size === 'lg' ? '18px' : '15px'),
          padding: isLoggedIn ? '6px 14px' : (size === 'lg' ? '18px 32px' : '10px 20px'),
          borderRadius: '8px',
          border: 'none',
          cursor: (isLoggingIn || isLoggedIn) ? 'default' : 'pointer',
          width: (size === 'lg' && !isLoggedIn) ? '100%' : 'auto',
          display: 'block',
          WebkitTapHighlightColor: 'transparent',
          WebkitUserSelect: 'none',
          userSelect: 'none',
          touchAction: 'manipulation',
          outline: 'none',
          WebkitAppearance: 'none',
          minHeight: isLoggedIn ? '28px' : (size === 'lg' ? '56px' : '44px'),
          opacity: isLoggedIn ? 0.5 : 1,
        }}
      >
        {isLoggedIn ? "✅ ログイン済み" : isLoggingIn ? "ログイン中..." : "🟢 LINEでログイン"}
      </button>
    );
  };

  // CTAボタンのレンダリング
  const renderCTA = (size: "sm" | "lg" = "lg") => {
    if (authLoading) {
      return (
        <Button size={size} disabled className="opacity-60">
          読み込み中...
        </Button>
      );
    }
    if (user) {
      return (
        <Link href="/dashboard">
          <Button size={size} className="bg-primary text-primary-foreground w-full">
            ダッシュボードへ →
          </Button>
        </Link>
      );
    }
    if (isLiff) {
      return <LineLoginButton size={size} />;
    }
    return (
      <a href={getLoginUrl()}>
        <Button size={size} className="bg-primary text-primary-foreground w-full">
          無料で始める →
        </Button>
      </a>
    );
  };

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* ナビゲーション */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🍽️</span>
            <span className="text-base font-bold text-primary whitespace-nowrap">献立日和〜coto coto〜</span>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <a href="#how-to-use" className="text-sm text-muted-foreground hover:text-foreground transition-colors">使い方</a>
          </nav>
          <div className="flex items-center gap-2">
            {/* ヘッダーのLINEボタン：ログイン済みならグレーアウト小型 */}
            {isLiff ? (
              <LineLoginButton size="sm" />
            ) : user ? (
              <span className="text-xs text-muted-foreground">✅ ログイン済み</span>
            ) : (
              <a href={getLoginUrl()}>
                <Button size="sm" className="bg-primary text-primary-foreground">ログイン</Button>
              </a>
            )}
          </div>
        </div>
      </header>

      {/* ヒーローセクション */}
      <section className="relative pt-16 pb-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-green-50 to-white pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* 左側: テキスト */}
            <div className="space-y-6">
              <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5 text-sm px-3 py-1">
                🤖 AI搭載 × LINE連携
              </Badge>
              <h1 className="text-4xl md:text-5xl font-bold text-foreground leading-tight">
                毎日の献立を<br />
                <span className="text-primary">AIが自動提案</span>
              </h1>
              <p className="text-lg text-muted-foreground leading-relaxed">
                家族構成・冷蔵庫の在庫・近隣スーパーの特売情報を組み合わせて、
                毎朝LINEに最適な献立をお届けします。
                「今日何作ろう」の悩みから解放されましょう。
              </p>
              <div className="flex flex-col gap-3 pt-2">
                {renderCTA("lg")}
                {/* 使い方を見る → アンカーリンクに変更 */}
                <a href="#how-to-use">
                  <Button size="lg" variant="outline" className="bg-transparent w-full">
                    使い方を見る ↓
                  </Button>
                </a>
                {isLiff && !user && (
                  <p className="text-sm text-muted-foreground text-center">
                    LINEアカウントでログインして、AI献立提案を始めましょう。
                  </p>
                )}
              </div>
            </div>

            {/* 右側: サンプルカード */}
            <div className="hidden md:block">
              <Card className="shadow-xl border-border/50">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-xl">🤖</div>
                    <div>
                      <p className="font-semibold text-foreground">献立日和 AI</p>
                      <p className="text-sm text-muted-foreground">今日の献立をお届けします</p>
                    </div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                    <p className="text-sm font-semibold text-primary">🍱 今日の献立</p>
                    <p className="text-sm text-foreground">🌅 朝食：納豆ご飯・味噌汁</p>
                    <p className="text-sm text-foreground">☀️ 昼食：野菜たっぷりパスタ</p>
                    <p className="text-sm text-foreground">🌙 夕食：鶏の照り焼き・ほうれん草のおひたし</p>
                    <div className="pt-2 border-t border-border/50">
                      <p className="text-xs text-muted-foreground">💰 目安費用：約1,200円</p>
                      <p className="text-xs text-muted-foreground">🛒 買い物リスト：3品</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* 使い方セクション */}
      <section id="how-to-use" className="py-20">
        <div className="max-w-4xl mx-auto px-4">
          {/* 使い方説明画像 */}
          <div>
            <div className="space-y-4">
              <img
                src="https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/new_welcome_A_chara-SSjPP6my5BdSozY9MjgQCA.png"
                alt="はじめましょう！"
                className="w-full max-w-sm mx-auto block rounded-2xl shadow-md"
              />
              <img
                src="https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/welcome_B_steps_v2-9A8LjBpnEDhAuoDHCav52d.png"
                alt="まず3ステップで始めましょう！"
                className="w-full max-w-sm mx-auto block rounded-2xl shadow-md"
              />
              <img
                src="https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/new_welcome_02_fridge-d3bkgkRcZQTBCDuaN6bSye.png"
                alt="冷蔵庫の食材を登録する"
                className="w-full max-w-sm mx-auto block rounded-2xl shadow-md"
              />
              <img
                src="https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/new_welcome_03_commands-By9oD4t2reaRVJFbjRnUSq.png"
                alt="AIに伝えるコツ"
                className="w-full max-w-sm mx-auto block rounded-2xl shadow-md"
              />
            </div>
          </div>
          {/* 使い方確認後のCTA */}
          <div className="mt-12 text-center">
            {renderCTA("lg")}
          </div>
        </div>
      </section>

      {/* フッター */}
      <footer className="py-8 border-t border-border">
        <div className="max-w-6xl mx-auto px-4 text-center space-y-3">
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
            <a href="/terms" className="text-xs text-muted-foreground hover:text-primary underline underline-offset-2">利用規約</a>
            <a href="/privacy" className="text-xs text-muted-foreground hover:text-primary underline underline-offset-2">プライバシーポリシー</a>
            <a href="/tokushoho" className="text-xs text-muted-foreground hover:text-primary underline underline-offset-2">特定商取引法に基づく表示</a>
            <a href="/cancel-policy" className="text-xs text-muted-foreground hover:text-primary underline underline-offset-2">キャンセルポリシー</a>
            <a href="/contact" className="text-xs text-muted-foreground hover:text-primary underline underline-offset-2">お問い合わせ</a>
          </div>
          <p className="text-xs text-muted-foreground">
            © 2025 献立日和～coto coto～. AI献立提案サービス
          </p>
        </div>
      </footer>
    </div>
  );
}
