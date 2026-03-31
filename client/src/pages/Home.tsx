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
  },
  {
    icon: "📱",
    title: "LINE自動配信",
    description: "毎朝指定した時間に、その日の献立をLINEで受け取れます。忙しい朝でもすぐに確認できます。",
  },
  {
    icon: "🛒",
    title: "買い物リスト自動生成",
    description: "献立に必要な食材を自動でリスト化。スーパーでの買い物がスムーズになります。",
  },
  {
    icon: "🥦",
    title: "冷蔵庫在庫管理",
    description: "冷蔵庫にある食材を登録するだけ。消費期限切れを防ぎ、食材を無駄なく使い切れます。",
  },
  {
    icon: "👨‍👩‍👧‍👦",
    title: "家族構成に合わせた提案",
    description: "アレルギー・好き嫌い・年齢層を考慮した献立を提案。家族全員が喜ぶメニューを。",
  },
  {
    icon: "🏪",
    title: "マイ店舗登録",
    description: "よく利用するスーパーを登録して特売情報を入力。コストを抑えた献立提案が可能です。",
  },
];

const steps = [
  { step: "01", title: "LINEで友達追加", desc: "SmartMenuの公式LINEアカウントを友達追加します" },
  { step: "02", title: "家族情報を登録", desc: "家族の人数・年齢・アレルギーなどを設定します" },
  { step: "03", title: "冷蔵庫を登録", desc: "今ある食材と消費期限を入力します" },
  { step: "04", title: "毎朝LINEで受け取る", desc: "指定した時間に献立と買い物リストが届きます" },
];

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const { isLiff, isLoggingIn, loginWithLine } = useLiffContext();

  // デバッグ用ログ
  useEffect(() => {
    console.log("[Home] isLiff:", isLiff, "isLoggingIn:", isLoggingIn, "user:", !!user);
  }, [isLiff, isLoggingIn, user]);

  // LINEログインボタン（常に押せる）
  const LineLoginButton = ({ size = "lg" }: { size?: "sm" | "lg" }) => (
    <button
      type="button"
      onTouchEnd={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isLoggingIn) {
          console.log("[Home] LINE login button touchEnd");
          loginWithLine();
        }
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isLoggingIn) {
          console.log("[Home] LINE login button clicked");
          loginWithLine();
        }
      }}
      disabled={isLoggingIn}
      style={{
        backgroundColor: isLoggingIn ? '#aaa' : '#06C755',
        color: 'white',
        fontWeight: 'bold',
        fontSize: size === 'lg' ? '18px' : '15px',
        padding: size === 'lg' ? '18px 32px' : '10px 20px',
        borderRadius: '12px',
        border: 'none',
        cursor: isLoggingIn ? 'not-allowed' : 'pointer',
        width: size === 'lg' ? '100%' : 'auto',
        display: 'block',
        WebkitTapHighlightColor: 'transparent',
        WebkitUserSelect: 'none',
        userSelect: 'none',
        touchAction: 'manipulation',
        outline: 'none',
        WebkitAppearance: 'none',
        minHeight: size === 'lg' ? '56px' : '44px',
      }}
    >
      {isLoggingIn ? "ログイン中..." : "🟢 LINEでログイン"}
    </button>
  );

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
          <Button size={size} className="bg-primary text-primary-foreground">
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
        <Button size={size} className="bg-primary text-primary-foreground">
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
            <span className="text-2xl">🍽️</span>
            <span className="text-xl font-bold text-primary">SmartMenu</span>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">機能</a>
            <a href="#how-to-use" className="text-sm text-muted-foreground hover:text-foreground transition-colors">使い方</a>
          </nav>
          <div className="flex items-center gap-2">
            {isLiff ? (
              <LineLoginButton size="sm" />
            ) : user ? (
              <Link href="/dashboard">
                <Button size="sm" className="bg-primary text-primary-foreground">ダッシュボードへ →</Button>
              </Link>
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
                <Button size="lg" variant="outline" className="bg-transparent">
                  使い方を見る
                </Button>
                {isLiff && (
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
                      <p className="font-semibold text-foreground">SmartMenu AI</p>
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

      {/* 機能セクション */}
      <section id="features" className="py-20 bg-muted/30">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-4">SmartMenuの機能</h2>
            <p className="text-muted-foreground text-lg">毎日の食事計画をスマートに管理</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <Card key={feature.title} className="border-border/50 hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="text-3xl mb-3">{feature.icon}</div>
                  <h3 className="font-semibold text-foreground mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* 使い方セクション */}
      <section id="how-to-use" className="py-20">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-4">使い方</h2>
            <p className="text-muted-foreground text-lg">4ステップで始められます</p>
          </div>
          <div className="space-y-6">
            {steps.map((step) => (
              <div key={step.step} className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0">
                  {step.step}
                </div>
                <div className="pt-2">
                  <h3 className="font-semibold text-foreground mb-1">{step.title}</h3>
                  <p className="text-sm text-muted-foreground">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTAセクション */}
      <section className="py-20 bg-primary text-primary-foreground">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">今すぐ始めましょう</h2>
          <p className="text-primary-foreground/80 text-lg mb-8">
            毎日の献立の悩みから解放されて、家族との食卓をもっと楽しく。
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            {user ? (
              <Link href="/dashboard">
                <Button size="lg" variant="secondary" className="text-base px-10">
                  ダッシュボードへ →
                </Button>
              </Link>
            ) : isLiff ? (
              <button
                type="button"
                onTouchEnd={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!isLoggingIn) loginWithLine();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!isLoggingIn) loginWithLine();
                }}
                disabled={isLoggingIn}
                style={{
                  backgroundColor: isLoggingIn ? '#aaa' : 'white',
                  color: '#06C755',
                  fontWeight: 'bold',
                  fontSize: '18px',
                  padding: '18px 40px',
                  borderRadius: '12px',
                  border: 'none',
                  cursor: isLoggingIn ? 'not-allowed' : 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                  touchAction: 'manipulation',
                  outline: 'none',
                  WebkitAppearance: 'none',
                  minHeight: '56px',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                }}
              >
                {isLoggingIn ? "ログイン中..." : "🟢 LINEでログイン"}
              </button>
            ) : (
              <a href={getLoginUrl()}>
                <Button size="lg" variant="secondary" className="text-base px-10">
                  無料で始める →
                </Button>
              </a>
            )}
          </div>
        </div>
      </section>

      {/* フッター */}
      <footer className="py-8 border-t border-border">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            © 2024 SmartMenu. AI献立提案サービス
          </p>
        </div>
      </footer>
    </div>
  );
}
