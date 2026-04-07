import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { subscriptions } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

/**
 * サブスクリプション（課金）ルーター
 * ユーザーのプラン・トライアル状態を管理
 */
export const subscriptionRouter = router({
  /**
   * 自分のプラン情報を取得
   * isPremium: true → プレミアム機能が使える
   * isTrialActive: true → トライアル期間中（プレミアム扱い）
   * trialDaysLeft: 残りトライアル日数
   */
  getMyPlan: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;

    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    // サブスクリプションが存在しない場合はトライアル開始として自動作成
    if (!sub) {
      await db.insert(subscriptions).values({
        userId,
        plan: "free",
        status: "trial",
        trialDays: 45,
      });
      return {
        plan: "free" as const,
        status: "trial" as const,
        isPremium: true, // トライアル中はプレミアム扱い
        isTrialActive: true,
        trialDaysLeft: 45,
        trialStartedAt: new Date(),
      };
    }

    // トライアル残日数を計算
    const trialStarted = new Date(sub.trialStartedAt);
    const now = new Date();
    const daysPassed = Math.floor(
      (now.getTime() - trialStarted.getTime()) / (1000 * 60 * 60 * 24)
    );
    const trialDaysLeft = Math.max(0, sub.trialDays - daysPassed);
    const isTrialActive = sub.status === "trial" && trialDaysLeft > 0;

    // プレミアム判定：activeまたはトライアル期間中
    const isPremium =
      sub.status === "active" ||
      (sub.status === "trial" && isTrialActive);

    return {
      plan: sub.plan,
      status: sub.status,
      isPremium,
      isTrialActive,
      trialDaysLeft,
      trialStartedAt: sub.trialStartedAt,
      currentPeriodEnd: sub.currentPeriodEnd,
    };
  }),
});
