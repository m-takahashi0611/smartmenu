import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";

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
  const { user, loading } = useAuth();

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* ナビゲーション */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🍽️</span>
            <span className="text-xl font-bold text-primary">SmartMenu</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">機能</a>
            <a href="#how-it-works" className="hover:text-foreground transition-colors">使い方</a>
          </nav>
          <div className="flex items-center gap-3">
            {!loading && (
              user ? (
                <Link href="/dashboard">
                  <Button size="sm" className="bg-primary text-primary-foreground">
                    ダッシュボードへ
                  </Button>
                </Link>
              ) : (
                <a href={getLoginUrl()}>
                  <Button size="sm" className="bg-primary text-primary-foreground">
                    ログイン / 登録
                  </Button>
                </a>
              )
            )}
          </div>
        </div>
      </header>

      {/* ヒーローセクション */}
      <section className="relative">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background pointer-events-none" />
        <div className="max-w-6xl mx-auto px-4 py-12 md:py-32">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <Badge className="mb-4 bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">
                🤖 AI搭載 × LINE連携
              </Badge>
              <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-6 text-foreground">
                毎日の献立を<br />
                <span className="text-primary">AIが自動提案</span>
              </h1>
              <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                家族構成・冷蔵庫の在庫・近隣スーパーの特売情報を組み合わせて、
                毎朝LINEに最適な献立をお届けします。
                「今日何作ろう」の悩みから解放されましょう。
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                {user ? (
                  <Link href="/dashboard">
                    <Button size="lg" className="w-full sm:w-auto bg-primary text-primary-foreground text-base px-8">
                      ダッシュボードへ →
                    </Button>
                  </Link>
                ) : (
                  <a href={getLoginUrl()}>
                    <Button size="lg" className="w-full sm:w-auto bg-primary text-primary-foreground text-base px-8">
                      無料で始める →
                    </Button>
                  </a>
                )}
                <a href="#how-it-works">
                  <Button size="lg" variant="outline" className="w-full sm:w-auto text-base px-8">
                    使い方を見る
                  </Button>
                </a>
              </div>
            </div>
            <div className="relative hidden md:block">
              <div className="bg-card rounded-2xl shadow-xl border border-border p-6 max-w-sm mx-auto">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-xl">🤖</div>
                  <div>
                    <p className="font-semibold text-sm">SmartMenu AI</p>
                    <p className="text-xs text-muted-foreground">今日の献立をお届けします</p>
                  </div>
                </div>
                <div className="bg-primary/5 rounded-xl p-4 text-sm space-y-2">
                  <p className="font-semibold text-primary">🍽️ 今日の献立</p>
                  <p>🌅 朝食：納豆ご飯・味噌汁</p>
                  <p>☀️ 昼食：野菜たっぷりパスタ</p>
                  <p>🌙 夕食：鶏の照り焼き・ほうれん草のおひたし</p>
                  <div className="border-t border-border pt-2 mt-2">
                    <p className="text-xs text-muted-foreground">💰 目安費用：約1,200円</p>
                    <p className="text-xs text-muted-foreground">🛒 買い物リスト：3品</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 機能セクション */}
      <section id="features" className="py-20 bg-muted/30">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">SmartMenuの機能</h2>
            <p className="text-muted-foreground text-lg">毎日の料理をもっと楽に、もっと賢く</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <Card key={feature.title} className="border-border hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="text-3xl mb-3">{feature.icon}</div>
                  <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* 使い方セクション */}
      <section id="how-it-works" className="py-20">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">かんたん4ステップ</h2>
            <p className="text-muted-foreground text-lg">設定は最短5分で完了します</p>
          </div>
          <div className="grid md:grid-cols-4 gap-6">
            {steps.map((step, index) => (
              <div key={step.step} className="text-center relative">
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-1/2 w-full h-0.5 bg-border" />
                )}
                <div className="relative z-10 w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold mx-auto mb-4">
                  {step.step}
                </div>
                <h3 className="font-semibold mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTAセクション */}
      <section className="py-20 bg-primary text-primary-foreground">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">今すぐ始めましょう</h2>
          <p className="text-primary-foreground/80 text-lg mb-8">
            毎日の「今日何作ろう」から解放されて、家族との時間を大切に。
          </p>
          {user ? (
            <Link href="/dashboard">
              <Button size="lg" variant="secondary" className="text-base px-10">
                ダッシュボードへ →
              </Button>
            </Link>
          ) : (
            <a href={getLoginUrl()}>
              <Button size="lg" variant="secondary" className="text-base px-10">
                無料で始める →
              </Button>
            </a>
          )}
        </div>
      </section>

      {/* フッター */}
      <footer className="py-8 border-t border-border">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🍽️</span>
            <span className="font-bold text-primary">SmartMenu</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © 2025 SmartMenu. AI献立提案サービス
          </p>
        </div>
      </footer>
    </div>
  );
}
