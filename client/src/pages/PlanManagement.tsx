import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { useLocation } from "wouter";
import { Crown, ArrowLeft, CreditCard, Calendar, AlertCircle, Loader2, ExternalLink, Check, X, Share2, Copy, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";

/**
 * プラン管理ページ
 * - 現在のプラン状態表示
 * - プレミアムへのアップグレード
 * - 解約・カスタマーポータル
 */
export default function PlanManagement() {
  const [, navigate] = useLocation();
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const utils = trpc.useUtils();
  const { user, loading: authLoading } = useAuth();

  const { data: plan, isLoading } = trpc.subscription.getMyPlan.useQuery();
  const { data: referralData } = trpc.campaign.getMyReferralCode.useQuery();
  const { data: referralStats } = trpc.campaign.getMyReferralStats.useQuery();

  const createCheckout = trpc.subscription.createCheckoutSession.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        window.open(data.url, "_blank");
        toast.success("決済ページを開きました");
      }
    },
    onError: (err) => {
      toast.error(err.message || "決済ページの作成に失敗しました");
    },
  });

  const cancelSubscription = trpc.subscription.cancelSubscription.useMutation({
    onSuccess: (data) => {
      if ((data as any).alreadyCancelled) {
        toast.success("すでに解約申請済みです。次回更新日まで引き続きご利用いただけます。");
      } else {
        toast.success("解約申請を受け付けました。次回更新日まで引き続きご利用いただけます。");
      }
      utils.subscription.getMyPlan.invalidate();
      setShowCancelDialog(false);
    },
    onError: (err) => {
      toast.error(err.message || "解約処理に失敗しました");
      setShowCancelDialog(false);
    },
  });

  const getPortalUrl = trpc.subscription.getCustomerPortalUrl.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        window.open(data.url, "_blank");
      }
    },
    onError: (err) => {
      toast.error(err.message || "ポータルページの取得に失敗しました");
    },
  });

  const handleUpgrade = () => {
    createCheckout.mutate({ origin: window.location.origin });
  };

  const handlePortal = () => {
    getPortalUrl.mutate({ origin: window.location.origin });
  };

  const handleCancel = () => {
    cancelSubscription.mutate();
  };

  if (isLoading || authLoading) {
    return (
      <div className="min-h-screen bg-orange-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  // 未ログイン時はLINEログインを促す画面を表示
  if (!user) {
    return (
      <div className="min-h-screen bg-orange-50">
        <div className="bg-white border-b border-orange-100 sticky top-0 z-10">
          <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => navigate("/")}
              className="p-2 rounded-full hover:bg-orange-50 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="text-lg font-bold text-gray-900">プラン管理</h1>
          </div>
        </div>
        <div className="max-w-lg mx-auto px-4 py-12 flex flex-col items-center gap-6">
          <div className="text-center space-y-3">
            <Crown className="w-16 h-16 text-orange-400 mx-auto" />
            <h2 className="text-xl font-bold text-gray-900">🎁 20日間 全機能無料体験</h2>
            <p className="text-gray-600 text-sm leading-relaxed">
              カード登録するだけで、プレミアム機能が<br />20日間タダで使えます！
            </p>
          </div>
          <div className="w-full bg-white rounded-2xl shadow-sm p-5 space-y-3">
            <p className="text-sm font-semibold text-gray-700">プレミアムで使える機能：</p>
            <ul className="space-y-2 text-sm text-gray-700">
              {[
                "AI高精度献立（天気・栄養考慮）",
                "買い物リスト自動生成",
                "チラシ・レシート解析",
                "献立テーマ（ダイエットなど）",
                "お弁当モード",
              ].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-orange-500 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-400 text-center pt-1">20日後は月額480円 ／ いつでも解約OK</p>
          </div>
          <Button
            onClick={() => { window.location.href = getLoginUrl("/plan"); }}
            className="w-full bg-[#06C755] hover:bg-[#05a847] text-white py-4 text-base font-bold rounded-xl"
          >
            LINEでログインして始める
          </Button>
          <p className="text-xs text-gray-400 text-center">すでにご利用中の方はLINEログインでそのまま続けられます</p>
        </div>
      </div>
    );
  }

  const isPremium = plan?.isPremium ?? false;
  const isActive = plan?.status === "active";
  const isCancelled = plan?.status === "cancelled";
  const isTrialActive = plan?.isTrialActive ?? false;
  const trialDaysLeft = plan?.trialDaysLeft ?? 0;
  const currentPeriodEnd = plan?.currentPeriodEnd ? new Date(plan.currentPeriodEnd) : null;

  return (
    <div className="min-h-screen bg-orange-50">
      {/* ヘッダー */}
      <div className="bg-white border-b border-orange-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate("/dashboard")}
            className="p-2 rounded-full hover:bg-orange-50 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">プラン管理</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* 現在のプラン状態 */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Crown className="w-5 h-5 text-orange-500" />
              現在のプラン
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* プランバッジ */}
            <div className="flex items-center justify-between">
              <span className="text-gray-600">プラン</span>
              {isActive ? (
                <Badge className="bg-orange-500 text-white">プレミアム</Badge>
              ) : isTrialActive ? (
                <Badge className="bg-blue-500 text-white">トライアル中</Badge>
              ) : isCancelled ? (
                <Badge variant="outline" className="text-orange-600 border-orange-300">解約済み（期末まで有効）</Badge>
              ) : (
                <Badge variant="outline" className="text-gray-500">無料プラン</Badge>
              )}
            </div>

            {/* トライアル残日数 */}
            {/* 無料トライアル残日数：②課金無料期間（plan=premium, status=trial）のみ表示 */}
            {isTrialActive && plan?.plan === "premium" && (
              <div className="flex items-center justify-between">
                <span className="text-gray-600">無料トライアル残日数</span>
                <span className="font-semibold text-blue-600">{trialDaysLeft}日</span>
              </div>
            )}

            {/* 次回請求日 */}
            {isActive && currentPeriodEnd && (
              <div className="flex items-center justify-between">
                <span className="text-gray-600 flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  次回請求日
                </span>
                <span className="font-semibold text-gray-800">
                  {currentPeriodEnd.toLocaleDateString("ja-JP", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              </div>
            )}

            {/* 解約済みの場合 */}
            {isCancelled && currentPeriodEnd && (
              <div className="flex items-center justify-between">
                <span className="text-gray-600 flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  有効期限
                </span>
                <span className="font-semibold text-orange-600">
                  {currentPeriodEnd.toLocaleDateString("ja-JP", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              </div>
            )}

            {/* 月額 */}
            {isActive && (
              <div className="flex items-center justify-between">
                <span className="text-gray-600">月額料金</span>
                <span className="font-semibold text-gray-800">¥480（税込）</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* アップグレードカード（無料・トライアル中） */}
        {!isActive && !isCancelled && (
          <Card className="border-2 border-orange-300 bg-gradient-to-br from-orange-50 to-amber-50 shadow-sm">
            <CardContent className="pt-5 space-y-4">
              <div className="text-center">
                <Crown className="w-10 h-10 text-orange-500 mx-auto mb-2" />
                <h3 className="text-lg font-bold text-gray-900">プレミアムプランにアップグレード</h3>
                <p className="text-sm text-gray-600 mt-1">月額 ¥480（税込）</p>
              </div>

              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-center gap-2">
                  <span className="text-orange-500">✓</span>
                  お弁当モード（家族別・曜日設定）
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-orange-500">✓</span>
                  献立テーマ設定（健康・節約・調理スタイル）
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-orange-500">✓</span>
                  詳細な栄養バランス分析
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-orange-500">✓</span>
                  買い物リストの自動最適化
                </li>
              </ul>

              {/* 利用規約・プライバシーポリシー同意 */}
              <div className="flex items-start gap-2 bg-orange-50/80 border border-orange-200 rounded-lg p-3">
                <Checkbox
                  id="agree-terms"
                  checked={agreedToTerms}
                  onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
                  className="mt-0.5"
                />
                <label htmlFor="agree-terms" className="text-xs text-gray-600 leading-relaxed cursor-pointer">
                  <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-orange-600 underline font-medium">利用規約</a>
                  {" "}および{" "}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-orange-600 underline font-medium">プライバシーポリシー</a>
                  を読み、同意の上でお支払いを行います。
                </label>
              </div>

              <Button
                onClick={handleUpgrade}
                disabled={createCheckout.isPending || !agreedToTerms}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createCheckout.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    処理中...
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4 mr-2" />
                    今すぐアップグレード
                  </>
                )}
              </Button>

              {isTrialActive && (
                <p className="text-xs text-center text-gray-500">
                  トライアル終了後も継続してご利用いただけます
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* アクティブプランの管理 */}
        {isActive && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-gray-600" />
                お支払い管理
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={handlePortal}
                disabled={getPortalUrl.isPending}
                variant="outline"
                className="w-full border-gray-300"
              >
                {getPortalUrl.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ExternalLink className="w-4 h-4 mr-2" />
                )}
                支払い方法・請求書を確認する
              </Button>

              <Button
                onClick={() => setShowCancelDialog(true)}
                variant="outline"
                className="w-full border-red-200 text-red-600 hover:bg-red-50"
              >
                <AlertCircle className="w-4 h-4 mr-2" />
                プランを解約する
              </Button>

              <p className="text-xs text-gray-400 text-center">
                解約後も次回請求日まで引き続きご利用いただけます
              </p>
            </CardContent>
          </Card>
        )}

        {/* プラン比較表 */}
        <div className="mt-2">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Crown className="w-5 h-5 text-orange-500" />
            プラン比較
          </h2>

          {/* プランヘッダー */}
          <div className="grid grid-cols-3 mb-0 rounded-t-2xl overflow-hidden border border-orange-200 border-b-0">
            <div className="bg-gray-100 py-3 flex items-center justify-center" />
            <div className="bg-gray-200 py-3 flex items-center justify-center border-r border-gray-300">
              <span className="text-sm font-bold text-gray-600">無料</span>
            </div>
            <div className="bg-white py-3 flex items-center justify-center border-b border-orange-200">
              <span className="text-sm font-bold text-orange-500">✨ プレミアム</span>
            </div>
          </div>

          {/* 比較テーブル */}
          <div className="bg-white rounded-b-2xl shadow-sm overflow-hidden border border-orange-200 border-t-0">
            {[
              { category: "🤖 AI献立生成", label: "献立の精度", free: "シンプル", premium: "高精度" },
              { category: null, label: "天気・季節を考慮", free: "—", premium: "対応" },
              { category: null, label: "栄養バランス", free: "—", premium: "対応" },
              { category: null, label: "予算目安の提示", free: "—", premium: "対応" },
              { category: null, label: "再生成回数/日", free: "3回まで", premium: "無制限" },
              { category: "📷 画像解析", label: "レシート読み取り", free: "月3回", premium: "無制限" },
              { category: null, label: "チラシ解析", free: "月3回", premium: "無制限" },
              { category: "⚙️ 機能", label: "献立テーマ指定", free: "—", premium: "対応" },
              { category: null, label: "お弁当モード", free: "—", premium: "対応" },
              { category: null, label: "献立履歴", free: "直近7日", premium: "無制限" },
              { category: null, label: "買い物リスト保存", free: "3日間", premium: "1ヶ月" },
              { category: "🎙️ 音声", label: "音声メッセージ", free: "—", premium: "対応" },
            ].map((row, i) => (
              <div key={i}>
                {row.category && (
                  <div className="border-t border-orange-200 bg-orange-500 px-3 py-2">
                    <span className="text-xs font-extrabold text-white">{row.category}</span>
                  </div>
                )}
                <div className="grid grid-cols-3 items-center border-t border-gray-100">
                  <span className="text-xs text-gray-700 px-3 py-2.5 pr-1 leading-tight">{row.label}</span>
                  <div className="flex justify-center py-2.5 border-r border-gray-200 bg-gray-100">
                    <span className={`text-xs text-center px-1 ${
                      row.free === "—" ? "text-gray-400 text-sm" : "text-gray-600 font-medium"
                    }`}>{row.free}</span>
                  </div>
                  <div className="flex justify-center py-2.5 bg-white">
                    <span className={`text-xs font-bold text-center px-1 ${
                      row.premium === "無制限" ? "text-orange-600" :
                      row.premium === "高精度" ? "text-orange-600" :
                      "text-orange-500"
                    }`}>{row.premium}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 月額強調バナー（タップで購入画面へ） */}
          {!isActive && !isCancelled && (
            <button
              onClick={handleUpgrade}
              disabled={createCheckout.isPending}
              className="mt-4 w-full bg-gradient-to-r from-amber-400 via-orange-500 to-red-500 rounded-2xl p-5 text-white text-center shadow-lg active:opacity-90 transition-opacity"
            >
              <p className="text-xs opacity-90 mb-1">今すぐ始める</p>
              <p className="text-3xl font-extrabold">月額 ¥480<span className="text-sm font-normal ml-1">（税込）</span></p>
              <p className="text-xs opacity-80 mt-1">コーヒー1杯分で毎日の献立をAIにおまかせ</p>
              <p className="text-xs mt-2 bg-white/20 rounded-full px-3 py-1 inline-block font-semibold">タップしてアップグレード →</p>
            </button>
          )}
          {(isActive || isCancelled) && (
            <button
              onClick={() => window.location.href = '/plan'}
              className="mt-4 w-full bg-gradient-to-r from-amber-400 via-orange-500 to-red-500 rounded-2xl p-5 text-white text-center shadow-lg active:opacity-90 transition-opacity"
            >
              <p className="text-xs opacity-90 mb-1">現在ご利用中</p>
              <p className="text-3xl font-extrabold">月額 ¥480<span className="text-sm font-normal ml-1">（税込）</span></p>
              <p className="text-xs opacity-80 mt-1">コーヒー1杯分で毎日の献立をAIにおまかせ</p>
              <p className="text-xs mt-2 bg-white/20 rounded-full px-3 py-1 inline-block font-semibold">お支払い管理はこちら →</p>
            </button>
          )}
        </div>

        {/* 友達紹介コード */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-orange-500" />
              友達紹介
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-600">
              あなた専用の紹介リンクを友達にシェアしよう！紹介した友達が登録すると、お互いに特典が受け取れます。
            </p>
            {referralData ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                  <span className="text-sm font-mono text-orange-700 flex-1 truncate">
                    {`${window.location.origin}?ref=${referralData.code}`}
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}?ref=${referralData.code}`);
                      toast.success("リンクをコピーしました");
                    }}
                    className="p-1 hover:bg-orange-100 rounded"
                  >
                    <Copy className="w-4 h-4 text-orange-500" />
                  </button>
                </div>
                <Button
                  variant="outline"
                  className="w-full border-orange-200 text-orange-600 hover:bg-orange-50"
                  onClick={() => {
                    const url = `${window.location.origin}?ref=${referralData.code}`;
                    const text = `献立日和〜coto coto〜で毎日の献立をAIにおまかせ！\n${url}`;
                    if (navigator.share) {
                      navigator.share({ title: '献立日和', text, url });
                    } else {
                      navigator.clipboard.writeText(url);
                      toast.success("リンクをコピーしました");
                    }
                  }}
                >
                  <Share2 className="w-4 h-4 mr-2" />
                  友達に紹介する
                </Button>
                {(referralStats?.usageCount ?? 0) > 0 && (
                  <p className="text-xs text-gray-500 text-center">
                    これまでに <span className="font-bold text-orange-500">{referralStats?.usageCount}</span> 人に紹介しました
                  </p>
                )}
              </div>
            ) : (
              <div className="flex justify-center py-2">
                <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* 解約済みの再加入 */}
        {isCancelled && (
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-5 space-y-3">
              <p className="text-sm text-gray-600 text-center">
                解約申請済みです。有効期限後に無料プランに移行します。
              </p>
              <Button
                onClick={handleUpgrade}
                disabled={createCheckout.isPending}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white"
              >
                {createCheckout.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Crown className="w-4 h-4 mr-2" />
                )}
                プレミアムを再開する
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 解約確認ダイアログ */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>プランを解約しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              解約後も次回請求日まで引き続きプレミアム機能をご利用いただけます。
              次回請求日以降は無料プランに移行します。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {cancelSubscription.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              解約する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
