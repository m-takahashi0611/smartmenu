import { useState } from "react";
import { useLocation } from "wouter";
import { Crown, ArrowLeft, CreditCard, Calendar, AlertCircle, Loader2, ExternalLink } from "lucide-react";
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

/**
 * プラン管理ページ
 * - 現在のプラン状態表示
 * - プレミアムへのアップグレード
 * - 解約・カスタマーポータル
 */
export default function PlanManagement() {
  const [, navigate] = useLocation();
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const utils = trpc.useUtils();

  const { data: plan, isLoading } = trpc.subscription.getMyPlan.useQuery();

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
    onSuccess: () => {
      toast.success("解約申請を受け付けました。次回更新日まで引き続きご利用いただけます。");
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-orange-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
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
            {isTrialActive && (
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

              <Button
                onClick={handleUpgrade}
                disabled={createCheckout.isPending}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 font-semibold rounded-xl"
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
