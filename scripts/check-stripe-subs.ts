import 'dotenv/config';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, { apiVersion: '2025-03-31.basil' });

// 最新のサブスクリプションを取得
const subs = await stripe.subscriptions.list({ limit: 5 });
console.log('=== Stripe Subscriptions ===');
subs.data.forEach(s => {
  const subAny = s as any;
  console.log('Sub ID:', s.id);
  console.log('Status:', s.status);
  console.log('current_period_end raw:', subAny.current_period_end);
  console.log('type:', typeof subAny.current_period_end);
  if (subAny.current_period_end) {
    console.log('as Date:', new Date(subAny.current_period_end * 1000));
  }
  console.log('customer:', s.customer);
  console.log('---');
});

// 最新のCheckout Sessionsも確認
const sessions = await stripe.checkout.sessions.list({ limit: 3 });
console.log('\n=== Recent Checkout Sessions ===');
sessions.data.forEach(s => {
  console.log('Session ID:', s.id);
  console.log('Status:', s.status);
  console.log('client_reference_id:', s.client_reference_id);
  console.log('subscription:', s.subscription);
  console.log('---');
});
