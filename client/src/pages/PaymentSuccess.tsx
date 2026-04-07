import { useEffect } from "react";
import { useLocation } from "wouter";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

/**
 * Stripe Checkout完了後のリダイレクト先
 * 支払い成功を表示してダッシュボードへ誘導
 */
export default function PaymentSuccess() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  useEffect(() => {
    // サブスクリプション情報を再取得してキャッシュを更新
    utils.subscription.getMyPlan.invalidate();
  }, [utils]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        {/* 成功アイコン */}
        <div className="flex justify-center">
          <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center">
            <CheckCircle className="w-14 h-14 text-green-500" />
          </div>
        </div>

        {/* メッセージ */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">
            プレミアムプランへようこそ！
          </h1>
          <p className="text-gray-600">
            お支払いが完了しました。
          </p>
          <p className="text-gray-600">
            献立日和〜coto coto〜のプレミアム機能が<br />
            すべてご利用いただけます。
          </p>
        </div>

        {/* プレミアム特典 */}
        <div className="bg-orange-50 rounded-xl p-4 text-left space-y-2">
          <p className="font-semibold text-orange-800 text-sm">✨ 解放された機能</p>
          <ul className="space-y-1 text-sm text-orange-700">
            <li>🍱 お弁当モード（家族別・曜日設定）</li>
            <li>🎯 献立テーマ設定（健康・節約・調理スタイル）</li>
            <li>📊 詳細な栄養バランス分析</li>
            <li>🛒 買い物リストの自動最適化</li>
          </ul>
        </div>

        {/* ダッシュボードへ */}
        <Button
          onClick={() => navigate("/dashboard")}
          className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 text-base font-semibold rounded-xl"
        >
          ダッシュボードへ戻る
        </Button>

        <p className="text-xs text-gray-400">
          ご請求に関するお問い合わせは、ダッシュボードの「プラン管理」からご確認いただけます。
        </p>
      </div>
    </div>
  );
}
