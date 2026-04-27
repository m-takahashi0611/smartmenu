import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLiffContext, reloadWithLoginReset } from "@/contexts/LiffContext";
import { getLoginUrl } from "@/const";
import { useEffect, useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";

const MASCOT_COOKING = "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/chara_cooking-2kPVJfknvoFLpXHRLPVvVs.png";
const MASCOT_STANDING = "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/chara_wave-SJFFFGGiajefS9Vh7cqFQF.png";
const MASCOT_HAPPY = "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/chara_wave-SJFFFGGiajefS9Vh7cqFQF.png";

const LINE_ADD_FRIEND_BASE_URL = "https://line.me/R/ti/p/@073ajwtq";

const features = [
  { icon: "🍽️", title: "AI献立提案", description: "家族構成・冷蔵庫在庫・近隣スーパーの特売情報を組み合わせて、毎日最適な献立をAIが自動生成します。" },
  { icon: "📱", title: "LINE自動配信", description: "毎朝指定した時間に、その日の献立をLINEで受け取れます。忙しい朝でもすぐに確認できます。" },
  { icon: "🛒", title: "買い物リスト自動生成", description: "献立に必要な食材を自動でリスト化。スーパーでの買い物がスムーズになります。" },
  { icon: "🥦", title: "冷蔵庫在庫管理", description: "冷蔵庫にある食材を登録するだけ。消費期限切れを防ぎ、食材を無駄なく使い切れます。" },
  { icon: "👨‍👩‍👧‍👦", title: "家族構成に合わせた提案", description: "アレルギー・好き嫌い・年齢層を考慮した献立を提案。家族全員が喜ぶメニューを。" },
  { icon: "🏪", title: "マイ店舗登録", description: "よく利用するスーパーを登録して特売情報を入力。コストを抑えた献立提案が可能です。" },
];

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const { isLiff, isLoggingIn, liffError, clearLiffError, loginWithLine, buildContactUrl } = useLiffContext();
  const reportErrorMutation = trpc.errorLog.report.useMutation();

  // URLの?refパラメータを取得してLINE友達追加URLに付与
  const lineAddFriendUrl = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) {
      return `${LINE_ADD_FRIEND_BASE_URL}?ref=${encodeURIComponent(ref)}`;
    }
    return LINE_ADD_FRIEND_BASE_URL;
  }, []);

  useEffect(() => {
    console.log("[Home] isLiff:", isLiff, "isLoggingIn:", isLoggingIn, "user:", !!user);
  }, [isLiff, isLoggingIn, user]);

  useEffect(() => {
    const search = window.location.search;
    const isLiffUrl = search.includes("liff.state") || search.includes("liffClientId");
    if (isLiff && isLiffUrl && !authLoading && !user && !isLoggingIn) {
      const timer = setTimeout(() => { loginWithLine(); }, 500);
      return () => clearTimeout(timer);
    }
  }, [isLiff, authLoading, user, isLoggingIn, loginWithLine]);

  const [reported, setReported] = useState(false);
  const ReportButton = () => {
    if (reported) return <span style={{ fontSize: '12px', color: '#7a5c00' }}>✅ 運営に報告しました。対応します。</span>;
    return (
      <button type="button"
        onClick={() => {
          if (!liffError) return;
          reportErrorMutation.mutate({ type: 'user_reported', message: liffError.message, userAgent: navigator.userAgent, extra: { url: window.location.href, timestamp: new Date().toISOString() } }, { onSuccess: () => setReported(true), onError: () => setReported(true) });
        }}
        disabled={reportErrorMutation.isPending}
        style={{ display: 'inline-block', backgroundColor: '#06C755', color: 'white', fontSize: '12px', fontWeight: 'bold', padding: '6px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', textAlign: 'center' }}
      >
        {reportErrorMutation.isPending ? '送信中...' : '📨 運営に報告する'}
      </button>
    );
  };

  const LineLoginButton = ({ size = "lg" }: { size?: "sm" | "lg" }) => {
    const isLoggedIn = !!user;
    return (
      <div style={{ width: size === 'lg' ? '100%' : 'auto' }}>
        {liffError && !isLoggedIn && (
          <div style={{ backgroundColor: '#fff8e1', border: '1px solid #f0c040', borderRadius: '8px', padding: '12px 14px', marginBottom: '10px', fontSize: '13px', color: '#7a5c00', lineHeight: '1.6', whiteSpace: 'pre-line' }}>
            <div>⚠️ {liffError.message}</div>
            <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f0c040', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <ReportButton />
              <a href={buildContactUrl()} style={{ display: 'inline-block', backgroundColor: 'transparent', color: '#7a5c00', fontSize: '12px', fontWeight: 'bold', padding: '6px 14px', borderRadius: '6px', textDecoration: 'none', border: '1px solid #f0c040', textAlign: 'center' }}>✉️ 詳しく問い合わせる</a>
            </div>
          </div>
        )}
        <button type="button"
          onTouchEnd={(e) => { if (isLoggedIn || isLoggingIn) return; e.preventDefault(); e.stopPropagation(); if (liffError) { reloadWithLoginReset(); return; } clearLiffError(); loginWithLine(); }}
          onClick={(e) => { if (isLoggedIn || isLoggingIn) return; e.preventDefault(); e.stopPropagation(); if (liffError) { reloadWithLoginReset(); return; } clearLiffError(); loginWithLine(); }}
          disabled={isLoggingIn || isLoggedIn}
          style={{ backgroundColor: (isLoggingIn || isLoggedIn) ? '#ccc' : (liffError ? '#e67e22' : '#06C755'), color: (isLoggingIn || isLoggedIn) ? '#888' : 'white', fontWeight: 'bold', fontSize: isLoggedIn ? '12px' : (size === 'lg' ? '18px' : '15px'), padding: isLoggedIn ? '6px 14px' : (size === 'lg' ? '18px 32px' : '10px 20px'), borderRadius: '8px', border: 'none', cursor: (isLoggingIn || isLoggedIn) ? 'default' : 'pointer', width: (size === 'lg' && !isLoggedIn) ? '100%' : 'auto', display: 'block', WebkitTapHighlightColor: 'transparent', WebkitUserSelect: 'none', userSelect: 'none', touchAction: 'manipulation', outline: 'none', WebkitAppearance: 'none', minHeight: isLoggedIn ? '28px' : (size === 'lg' ? '56px' : '44px'), opacity: isLoggedIn ? 0.5 : 1 }}
        >
          {isLoggedIn ? "✅ ログイン済み" : isLoggingIn ? "ログイン中..." : liffError ? "🔄 再読み込みする" : "🟢 LINEでログイン"}
        </button>
      </div>
    );
  };

  const renderCTA = (size: "sm" | "lg" = "lg") => {
    if (authLoading) return <Button size={size} disabled className="opacity-60">読み込み中...</Button>;
    if (user) return <Link href="/dashboard"><Button size={size} className="bg-primary text-primary-foreground w-full font-bold rounded-xl shadow-md">ダッシュボードへ →</Button></Link>;
    if (isLiff) return <LineLoginButton size={size} />;
    // refパラメータがある場合はLINE友達追加ボタンを表示
    if (lineAddFriendUrl !== LINE_ADD_FRIEND_BASE_URL) {
      return (
        <a href={lineAddFriendUrl} target="_blank" rel="noopener noreferrer">
          <Button size={size} className="w-full font-bold rounded-xl shadow-md" style={{ backgroundColor: '#06C755', color: 'white' }}>
            🟢 LINEで友達追加する
          </Button>
        </a>
      );
    }
    return <a href={getLoginUrl()}><Button size={size} className="bg-primary text-primary-foreground w-full font-bold rounded-xl shadow-md">無料で始める →</Button></a>;
  };

  return (
    <div className="min-h-screen bg-background overflow-x-hidden" style={{ fontFamily: "'Zen Maru Gothic', 'Noto Sans JP', sans-serif" }}>

      {/* ナビゲーション */}
      <header className="sticky top-0 z-50 backdrop-blur border-b" style={{ backgroundColor: 'rgba(255,248,242,0.95)', borderColor: '#f0d9c8' }}>
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={MASCOT_STANDING} alt="コトコくん" className="h-10 w-10 object-contain rounded-full" style={{ background: '#fff8f2' }} />
            <span className="text-base font-bold whitespace-nowrap" style={{ color: '#FF7F50' }}>献立日和〜coto coto〜</span>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <a href="#how-to-use" className="text-sm transition-colors" style={{ color: '#8a7060' }}>使い方</a>
            <a href="#features" className="text-sm transition-colors" style={{ color: '#8a7060' }}>機能</a>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <Link href="/dashboard">
                <Button size="sm" className="text-white font-bold rounded-xl" style={{ backgroundColor: '#FF7F50' }}>ダッシュボード</Button>
              </Link>
            ) : !isLiff ? (
              <a href={getLoginUrl()}>
                <Button size="sm" className="text-white font-bold rounded-xl" style={{ backgroundColor: '#FF7F50' }}>ログイン</Button>
              </a>
            ) : null}
          </div>
        </div>
      </header>

      {/* ヒーローセクション */}
      <section className="relative pt-12 pb-20 overflow-hidden" style={{ background: 'linear-gradient(135deg, #FFF8F2 0%, #F5F9F0 60%, #FFF3E8 100%)' }}>
        {/* 装飾的な背景要素 */}
        <div className="absolute top-8 right-8 text-6xl opacity-10 select-none pointer-events-none">🌿</div>
        <div className="absolute bottom-12 left-4 text-5xl opacity-10 select-none pointer-events-none">🍊</div>
        <div className="absolute top-1/3 right-1/4 text-4xl opacity-10 select-none pointer-events-none">🥦</div>

        <div className="relative max-w-5xl mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            {/* 左側: テキスト＋CTA */}
            <div className="space-y-5">
              <Badge className="text-sm px-3 py-1 rounded-full font-medium" style={{ backgroundColor: '#FFF0E8', color: '#FF7F50', border: '1px solid #FFB899' }}>
                🤖 AI搭載 × LINE連携
              </Badge>
              <h1 className="text-4xl md:text-5xl font-bold leading-tight" style={{ color: '#3D2B1F' }}>
                毎日の献立を<br />
                <span style={{ color: '#FF7F50' }}>AIが自動提案</span>
              </h1>
              <p className="text-base leading-relaxed" style={{ color: '#6B5040' }}>
                家族構成・冷蔵庫の在庫・近隣スーパーの特売情報を組み合わせて、
                毎朝LINEに最適な献立をお届けします。
                「今日何作ろう」の悩みから解放されましょう。
              </p>
              <div className="flex flex-col gap-3 pt-2">
                {renderCTA("lg")}
                <a href="#how-to-use">
                  <Button size="lg" variant="outline" className="w-full rounded-xl font-medium" style={{ borderColor: '#FF7F50', color: '#FF7F50', backgroundColor: 'transparent' }}>
                    使い方を見る ↓
                  </Button>
                </a>
                {isLiff && !user && (
                  <p className="text-sm text-center" style={{ color: '#8a7060' }}>
                    LINEアカウントでログインして、AI献立提案を始めましょう。
                  </p>
                )}
              </div>
            </div>

            {/* 右側: キャラクター＋サンプルカード */}
            <div className="flex flex-col items-center gap-4">
              {/* マスコットキャラクター */}
              <div className="relative">
                <img
                  src={MASCOT_COOKING}
                  alt="コトコくん"
                  className="w-48 h-48 md:w-64 md:h-64 object-contain rounded-3xl shadow-lg"
                  style={{ border: '3px solid #FFD4B8' }}
                />
                {/* 吹き出し */}
                <div className="absolute -top-4 -right-4 rounded-2xl px-3 py-2 text-xs font-bold shadow-md" style={{ backgroundColor: '#FF7F50', color: 'white', maxWidth: '120px' }}>
                  今日の献立、<br />考えたよ！🍳
                </div>
              </div>
              {/* サンプル献立カード */}
              <div className="w-full max-w-xs rounded-2xl p-4 shadow-md" style={{ backgroundColor: 'white', border: '1px solid #F0D9C8' }}>
                <p className="text-xs font-bold mb-2" style={{ color: '#FF7F50' }}>🍱 今日の献立（サンプル）</p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm rounded-lg px-3 py-1.5" style={{ backgroundColor: '#FFF8F2' }}>
                    <span>🌅</span><span style={{ color: '#3D2B1F' }}>朝食：納豆ご飯・味噌汁</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm rounded-lg px-3 py-1.5" style={{ backgroundColor: '#F5F9F0' }}>
                    <span>☀️</span><span style={{ color: '#3D2B1F' }}>昼食：野菜たっぷりパスタ</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm rounded-lg px-3 py-1.5" style={{ backgroundColor: '#FFF8F2' }}>
                    <span>🌙</span><span style={{ color: '#3D2B1F' }}>夕食：鶏の照り焼き</span>
                  </div>
                </div>
                <div className="mt-2 pt-2 flex gap-3 text-xs" style={{ borderTop: '1px solid #F0D9C8', color: '#8a7060' }}>
                  <span>💰 約1,200円</span>
                  <span>🛒 3品</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 機能紹介セクション */}
      <section id="features" className="py-16" style={{ backgroundColor: '#FDFAF7' }}>
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-bold mb-3" style={{ color: '#3D2B1F' }}>
              献立日和の<span style={{ color: '#FF7F50' }}>主な機能</span>
            </h2>
            <p className="text-sm" style={{ color: '#8a7060' }}>毎日の食卓をもっと豊かに、もっと楽に</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {features.map((f) => (
              <div key={f.title} className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: 'white', border: '1px solid #F0D9C8' }}>
                <div className="text-3xl mb-2">{f.icon}</div>
                <h3 className="text-sm font-bold mb-1" style={{ color: '#3D2B1F' }}>{f.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: '#8a7060' }}>{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 使い方セクション */}
      <section id="how-to-use" className="py-16" style={{ backgroundColor: '#FFF8F2' }}>
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold mb-3" style={{ color: '#3D2B1F' }}>
              <span style={{ color: '#FF7F50' }}>使い方</span>はかんたん！
            </h2>
          </div>

          {/* 使い方画像 */}
          <div className="space-y-5 max-w-sm mx-auto">
            <img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/welcome_step1_new-2gm58iovTBNSsaxx82iY78.png" alt="まず3ステップで始めましょう！" className="w-full block rounded-2xl shadow-md" style={{ border: '2px solid #F0D9C8' }} />
            <img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/welcome_step2_new-hXzFefqagk9VZcSgJNBsX2.png" alt="冷蔵庫の食材を登録する" className="w-full block rounded-2xl shadow-md" style={{ border: '2px solid #F0D9C8' }} />
            <img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/welcome_step3_new-esjJ3fZrqdipgbsJFsWDMt.png" alt="AIに伝えるコツ" className="w-full block rounded-2xl shadow-md" style={{ border: '2px solid #F0D9C8' }} />
          </div>

          {/* CTA */}
          <div className="mt-12 text-center">
            <div className="max-w-xs mx-auto">
              {renderCTA("lg")}
            </div>
          </div>
        </div>
      </section>

      {/* フッター */}
      <footer className="py-8" style={{ borderTop: '1px solid #F0D9C8', backgroundColor: '#FDFAF7' }}>
        <div className="max-w-6xl mx-auto px-4 text-center space-y-3">
          <div className="flex items-center justify-center gap-2 mb-3">
            <img src={MASCOT_STANDING} alt="コトコくん" className="h-8 w-8 object-contain rounded-full" style={{ background: '#fff8f2' }} />
            <span className="text-sm font-bold" style={{ color: '#FF7F50' }}>献立日和〜coto coto〜</span>
          </div>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
            <a href="/terms" className="text-xs hover:underline" style={{ color: '#8a7060' }}>利用規約</a>
            <a href="/privacy" className="text-xs hover:underline" style={{ color: '#8a7060' }}>プライバシーポリシー</a>
            <a href="/tokushoho" className="text-xs hover:underline" style={{ color: '#8a7060' }}>特定商取引法に基づく表示</a>
            <a href="/cancel-policy" className="text-xs hover:underline" style={{ color: '#8a7060' }}>キャンセルポリシー</a>
            <a href="/contact" className="text-xs hover:underline" style={{ color: '#8a7060' }}>お問い合わせ</a>
          </div>
          <p className="text-xs" style={{ color: '#b0a090' }}>© 2025 献立日和～coto coto～. AI献立提案サービス</p>
        </div>
      </footer>
    </div>
  );
}
