import 'dotenv/config';
import Stripe from 'stripe';
import { getDb } from '../server/db';
import { subscriptions } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, { apiVersion: '2025-03-31.basil' });

// 最新のCheckout Sessionを確認
const sessions = await stripe.checkout.sessions.list({ limit: 3 });
console.log('=== Recent Checkout Sessions ===');
for (const s of sessions.data) {
  console.log(`Session: ${s.id} | Status: ${s.status} | client_ref: ${s.client_reference_id} | sub: ${s.subscription}`);
}

// sub_1TJp1H6uSpLS8PF1iJue8s2p の詳細を取得
const subId = 'sub_1TJp1H6uSpLS8PF1iJue8s2p';
const sub = await stripe.subscriptions.retrieve(subId, { expand: ['items'] });
const subAny = sub as any;

const periodEnd = subAny?.items?.data?.[0]?.current_period_end;
const currentPeriodEnd = periodEnd ? new Date(periodEnd * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const userId = 570001; // client_reference_id から

console.log('\n=== Subscription Details ===');
console.log('Sub ID:', subId);
console.log('Customer:', sub.customer);
console.log('Period end:', currentPeriodEnd.toISOString());
console.log('User ID:', userId);

const db = await getDb();
if (!db) throw new Error('DB not available');

// DBの現在の状態を確認
const [existing] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
console.log('\n=== Current DB State ===');
console.log(existing);

// DBを更新
await db.update(subscriptions).set({
  plan: 'premium',
  status: 'active',
  stripeCustomerId: sub.customer as string,
  stripeSubscriptionId: subId,
  currentPeriodEnd,
  cancelledAt: null,
}).where(eq(subscriptions.userId, userId));

console.log('\n✅ DB updated successfully!');

// 確認
const [updated] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
console.log('Updated DB state:', updated);
