import { Request, Response } from "express";
import Stripe from "stripe";
import { getStripe } from "./client";
import { ENV } from "../_core/env";
import { getDb } from "../db";
import { subscriptions, lineUsers } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { switchToPremiumMenu, switchToNormalMenu } from "../routers/richMenu";

/**
 * Stripe API 2025-03-31.basil では current_period_end は
 * subscription直下ではなく items.data[0] に移動している
 */
function getSubscriptionPeriodEnd(stripeSubscription: any): Date {
  // 新API: items.data[0].current_period_end
  const itemPeriodEnd = stripeSubscription?.items?.data?.[0]?.current_period_end;
  if (itemPeriodEnd && typeof itemPeriodEnd === "number") {
    return new Date(itemPeriodEnd * 1000);
  }
  // 旧API: subscription.current_period_end（フォールバック）
  const subPeriodEnd = stripeSubscription?.current_period_end;
  if (subPeriodEnd && typeof subPeriodEnd === "number") {
    return new Date(subPeriodEnd * 1000);
  }
  // どちらもなければ1ヶ月後をデフォルト
  const fallback = new Date();
  fallback.setMonth(fallback.getMonth() + 1);
  console.warn("[Stripe Webhook] current_period_end not found, using fallback:", fallback.toISOString());
  return fallback;
}

/**
 * Stripe Webhookイベントを処理する
 * /api/stripe/webhook エンドポイントで受信
 */
export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  const sig = req.headers["stripe-signature"] as string;
  const rawBody = req.body as Buffer;

  let event: Stripe.Event;

  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, sig, ENV.stripeWebhookSecret);
  } catch (err: any) {
    console.error("[Stripe Webhook] Signature verification failed:", err.message);
    res.status(400).json({ error: `Webhook Error: ${err.message}` });
    return;
  }

  console.log(`[Stripe Webhook] Event received: ${event.type} (${event.id})`);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutSessionCompleted(session);
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaid(invoice);
        break;
      }
      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (err: any) {
    console.error(`[Stripe Webhook] Error processing event ${event.type}:`, err);
    res.status(500).json({ error: "Webhook processing failed" });
  }
}

/**
 * Checkout完了 → サブスクリプションをアクティブ化
 */
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const userId = parseInt(session.client_reference_id ?? session.metadata?.userId ?? "0");
  if (!userId) {
    console.error("[Stripe Webhook] No userId in checkout session:", session.id);
    return;
  }

  const stripeSubscriptionId = session.subscription as string;
  const stripeCustomerId = session.customer as string;

  if (!stripeSubscriptionId) {
    console.error("[Stripe Webhook] No subscription ID in checkout session:", session.id);
    return;
  }

  // Stripeからサブスクリプション詳細を取得（items展開）
  const stripe = getStripe();
  const stripeSubscriptionRaw = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
    expand: ["items"],
  });
  const currentPeriodEnd = getSubscriptionPeriodEnd(stripeSubscriptionRaw);

  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // サブスクリプションをアクティブ化
  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  if (existing) {
    await db
      .update(subscriptions)
      .set({
        plan: "premium",
        status: "active",
        stripeCustomerId,
        stripeSubscriptionId,
        currentPeriodEnd,
        cancelledAt: null,
      })
      .where(eq(subscriptions.userId, userId));
  } else {
    await db.insert(subscriptions).values({
      userId,
      plan: "premium",
      status: "active",
      trialDays: 45,
      stripeCustomerId,
      stripeSubscriptionId,
      currentPeriodEnd,
    });
  }

  console.log(`[Stripe Webhook] User ${userId} upgraded to premium. Period end: ${currentPeriodEnd.toISOString()}`);

  // LINEリッチメニューを課金メニューに切り替え
  try {
    const lineUser = await db.select({ lineUserId: lineUsers.lineUserId })
      .from(lineUsers)
      .where(eq(lineUsers.userId, userId))
      .limit(1);
    if (lineUser.length > 0 && lineUser[0].lineUserId) {
      await switchToPremiumMenu(lineUser[0].lineUserId);
      console.log(`[Stripe Webhook] 課金メニューに切り替え完了: userId=${userId}, lineUserId=${lineUser[0].lineUserId}`);
    }
  } catch (e) {
    console.error("[Stripe Webhook] リッチメニュー切り替え失敗:", e);
  }
}

/**
 * サブスクリプション更新 → 期末日を更新
 */
async function handleSubscriptionUpdated(stripeSubscription: Stripe.Subscription): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const currentPeriodEnd = getSubscriptionPeriodEnd(stripeSubscription);
  const isCancelAtPeriodEnd = stripeSubscription.cancel_at_period_end;

  // stripeSubscriptionIdで対象ユーザーを検索
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubscription.id))
    .limit(1);

  if (!sub) {
    console.warn(`[Stripe Webhook] No subscription found for Stripe ID: ${stripeSubscription.id}`);
    return;
  }

  await db
    .update(subscriptions)
    .set({
      currentPeriodEnd,
      status: isCancelAtPeriodEnd ? "cancelled" : "active",
    })
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubscription.id));

  console.log(`[Stripe Webhook] Subscription updated for user ${sub.userId}. Cancel at period end: ${isCancelAtPeriodEnd}`);
}

/**
 * サブスクリプション削除 → 期限切れに変更
 */
async function handleSubscriptionDeleted(stripeSubscription: Stripe.Subscription): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // 先にuserIdを取得（DB更新前に取得しないとstripeSubscriptionIdがnullになって検索できなくなる）
  const [targetSub] = await db.select({ userId: subscriptions.userId })
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubscription.id))
    .limit(1);

  await db
    .update(subscriptions)
    .set({
      plan: "free",
      status: "expired",
      stripeSubscriptionId: null,
      cancelledAt: new Date(),
    })
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubscription.id));

  // LINEリッチメニューを通常メニューに戻す
  try {
    if (targetSub?.userId) {
      const lineUser = await db.select({ lineUserId: lineUsers.lineUserId })
        .from(lineUsers)
        .where(eq(lineUsers.userId, targetSub.userId))
        .limit(1);
      if (lineUser.length > 0 && lineUser[0].lineUserId) {
        await switchToNormalMenu(lineUser[0].lineUserId);
        console.log(`[Stripe Webhook] 通常メニューに戻し完了: userId=${targetSub.userId}`);
      }
    }
  } catch (e) {
    console.error("[Stripe Webhook] リッチメニュー戻し失敗:", e);
  }

  console.log(`[Stripe Webhook] Subscription deleted: ${stripeSubscription.id}`);
}

/**
 * 請求書支払い完了 → 次回請求日を更新
 */
async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  // Stripe API v2025+: subscription info is in invoice.parent.subscription_details
  const invoiceAny = invoice as any;
  const stripeSubscriptionId: string | undefined =
    invoiceAny.subscription ||
    invoiceAny.parent?.subscription_details?.subscription ||
    undefined;

  if (!stripeSubscriptionId) return;

  const db = await getDb();
  if (!db) return;

  const stripe = getStripe();
  const stripeSubscriptionRaw = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
    expand: ["items"],
  });
  const currentPeriodEnd = getSubscriptionPeriodEnd(stripeSubscriptionRaw);

  await db
    .update(subscriptions)
    .set({
      status: "active",
      currentPeriodEnd,
    })
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId));

  console.log(`[Stripe Webhook] Invoice paid for subscription: ${stripeSubscriptionId}. New period end: ${currentPeriodEnd.toISOString()}`);
}
