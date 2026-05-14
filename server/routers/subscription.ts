import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { subscriptions, campaignCodes, lineUsers } from "../../drizzle/schema";
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
        trialDays: 20,
      });
      return {
        plan: "free" as const,
        status: "trial" as const,
        isPremium: false, // ① トライアルはプレミアムでない（機能制限あり）
        isTrialActive: true,
        trialDaysLeft: 20,
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

    // プレミアム判定（設計書準拠）:
    //   ① plan=free, status=trial     → isPremium=false
    //   ② plan=premium, status=trial  → isPremium=true（課金無料期間中）
    //   ③ plan=premium, status=active → isPremium=true
    //   ④ plan=free, status=cancelled → isPremium=false
    const isPremium =
      sub.status === "active" ||
      (sub.plan === "premium" && sub.status === "trial") ||
      (sub.status === "cancelled" && sub.currentPeriodEnd != null && new Date(sub.currentPeriodEnd) > new Date());

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
            trialDays: 20,
            stripeCustomerId,
          });
        }
      }

      // キャンペーンコードを自動適用（LINEのref=パラメータから取得）
      let stripeCouponId: string | undefined;
      let appliedCampaignCode: string | undefined;
      try {
        // ユーザーのLINEアカウントからreferralCodeを取得
        const lineUser = await db
          .select({ referralCode: lineUsers.referralCode })
          .from(lineUsers)
          .where(eq(lineUsers.userId, userId))
          .limit(1);
        const refCode = lineUser[0]?.referralCode;
        if (refCode) {
          // campaign_codesテーブルでコードを検索
          const [campaign] = await db
            .select()
            .from(campaignCodes)
            .where(eq(campaignCodes.code, refCode))
            .limit(1);
          if (campaign && campaign.isActive) {
            const isExpired = campaign.expiresAt && new Date(campaign.expiresAt) < new Date();
            if (!isExpired) {
              // Stripeにクーポンを作成（初回決済のみ適用）
              const coupon = await stripe.coupons.create({
                percent_off: parseFloat(campaign.discountPercent as string),
                duration: "once",
                name: `${campaign.label ?? campaign.code} 割引`,
                metadata: { campaignCode: campaign.code, userId: userId.toString() },
              });
              stripeCouponId = coupon.id;
              appliedCampaignCode = campaign.code;
              console.log(`[Checkout] Applied campaign coupon: ${campaign.code} (${campaign.discountPercent}% off) for userId=${userId}`);
            }
          }
        }
      } catch (couponErr) {
        // クーポン作成失敗してもチェックアウトは続行
        console.warn('[Checkout] Failed to create coupon:', couponErr);
      }

      // Checkout Sessionを作成
      const sessionParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
        customer: stripeCustomerId,
        payment_method_types: ["card"],
        line_items: [
          {
            price: STRIPE_PRODUCTS.premium.priceId,
            quantity: 1,
          },
        ],
        mode: "subscription",
        allow_promotion_codes: !stripeCouponId, // クーポン自動適用時はプロモコード入力を無効化
        success_url: `${input.origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${input.origin}/dashboard`,
        client_reference_id: userId.toString(),
        metadata: {
          userId: userId.toString(),
          customerEmail: userEmail ?? "",
          customerName: userName ?? "",
          campaignCode: appliedCampaignCode ?? "",
        },
      };
      if (stripeCouponId) {
        (sessionParams as any).discounts = [{ coupon: stripeCouponId }];
      }
      const session = await stripe.checkout.sessions.create(sessionParams);

      // 適用済コードをDBに保存
      if (appliedCampaignCode) {
        await db
          .update(subscriptions)
          .set({ campaignCode: appliedCampaignCode })
          .where(eq(subscriptions.userId, userId));
        // 使用回数をインクリメント
        await db.execute(
          `UPDATE campaign_codes SET usageCount = usageCount + 1 WHERE code = '${appliedCampaignCode.replace(/'/g, "''")}'`
        );
      }

      return { url: session.url, appliedCampaignCode };
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
          .set({ cancelledAt: new Date(), status: "cancelled" })
          .where(eq(subscriptions.userId, userId));
        return { success: true, alreadyCancelled: true };
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "解約処理中にエラーが発生しました。しばらくしてから再度お試しください。",
      });
    }

    // DBのステータスを更新（cancelledに変更してUIが即時切り替わるようにする）
    await db
      .update(subscriptions)
      .set({ cancelledAt: new Date(), status: "cancelled" })
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
