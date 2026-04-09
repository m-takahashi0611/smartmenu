import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { subscriptions } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getStripe } from "../stripe/client";
import { STRIPE_PRODUCTS } from "../stripe/products";
import { TRPCError } from "@trpc/server";

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
        currentPeriodEnd: null as Date | null,
        stripeSubscriptionId: null as string | null,
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
      stripeSubscriptionId: sub.stripeSubscriptionId,
    };
  }),

  /**
   * Stripe Checkoutセッションを作成して決済URLを返す
   */
  createCheckoutSession: protectedProcedure
    .input(z.object({ origin: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const userEmail = ctx.user.email ?? undefined;
      const userName = ctx.user.name ?? undefined;

      const stripe = getStripe();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      // 既存のサブスクリプション情報を取得
      const [sub] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .limit(1);

      // すでにアクティブなサブスクリプションがある場合はエラー
      if (sub?.status === "active" && sub?.stripeSubscriptionId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "すでにプレミアムプランに加入しています",
        });
      }

      // Stripe Customerを作成または再利用
      let stripeCustomerId = sub?.stripeCustomerId ?? undefined;
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: userEmail,
          name: userName,
          metadata: {
            userId: userId.toString(),
          },
        });
        stripeCustomerId = customer.id;

        // DBにCustomer IDを保存
        if (sub) {
          await db
            .update(subscriptions)
            .set({ stripeCustomerId })
            .where(eq(subscriptions.userId, userId));
        } else {
          await db.insert(subscriptions).values({
            userId,
            plan: "free",
            status: "trial",
            trialDays: 45,
            stripeCustomerId,
          });
        }
      }

      // Checkout Sessionを作成
      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        payment_method_types: ["card"],
        line_items: [
          {
            price: STRIPE_PRODUCTS.premium.priceId,
            quantity: 1,
          },
        ],
        mode: "subscription",
        allow_promotion_codes: true,
        success_url: `${input.origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${input.origin}/dashboard`,
        client_reference_id: userId.toString(),
        metadata: {
          userId: userId.toString(),
          customerEmail: userEmail ?? "",
          customerName: userName ?? "",
        },
      });

      return { url: session.url };
    }),

  /**
   * サブスクリプションをキャンセル（期末解約）
   */
  cancelSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.user.id;

    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    if (!sub?.stripeSubscriptionId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "アクティブなサブスクリプションが見つかりません",
      });
    }

    const stripe = getStripe();

    try {
      // 期末でキャンセル（即時解約ではなく次回更新日に解約）
      await stripe.subscriptions.update(sub.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
    } catch (err: any) {
      // すでにキャンセル済みのサブスクリプションの場合は正常として扱う
      const msg = err?.message ?? "";
      if (msg.includes("canceled subscription can only update")) {
        // DBのステータスだけ更新して正常終了
        await db
          .update(subscriptions)
          .set({ cancelledAt: new Date() })
          .where(eq(subscriptions.userId, userId));
        return { success: true, alreadyCancelled: true };
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "解約処理中にエラーが発生しました。しばらくしてから再度お試しください。",
      });
    }

    // DBのステータスを更新
    await db
      .update(subscriptions)
      .set({ cancelledAt: new Date() })
      .where(eq(subscriptions.userId, userId));

    return { success: true };
  }),

  /**
   * カスタマーポータルURLを取得（支払い方法変更・請求書確認）
   */
  getCustomerPortalUrl: protectedProcedure
    .input(z.object({ origin: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      const [sub] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .limit(1);

      if (!sub?.stripeCustomerId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Stripeカスタマー情報が見つかりません",
        });
      }

      const stripe = getStripe();
      const session = await stripe.billingPortal.sessions.create({
        customer: sub.stripeCustomerId,
        return_url: `${input.origin}/dashboard`,
      });

      return { url: session.url };
    }),
});
