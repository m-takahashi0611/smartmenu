import 'dotenv/config';
import Stripe from 'stripe';
import { getDb } from '../server/db';
import { subscriptions } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, { apiVersion: '2025-03-31.basil' });
const userId = 570001;
const subId = 'sub_1TJp1H6uSpLS8PF1iJue8s2p';

// Stripeサブスクリプションをキャンセル
try {
  await stripe.subscriptions.cancel(subId);
  console.log('✅ Stripe subscription cancelled:', subId);
} catch (e: any) {
  console.warn('Stripe cancel warning:', e.message);
}

// DBを無料プランに戻す
const db = await getDb();
if (!db) throw new Error('DB not available');

await db.update(subscriptions).set({
  plan: 'free',
  status: 'trial',
  stripeSubscriptionId: null,
  currentPeriodEnd: null,
  cancelledAt: null,
}).where(eq(subscriptions.userId, userId));

console.log('✅ DB reset to free/trial plan');

// 確認
const [updated] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
console.log('Current state:', updated);
