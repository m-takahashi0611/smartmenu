import 'dotenv/config';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, { apiVersion: '2025-03-31.basil' });

const sub = await stripe.subscriptions.retrieve('sub_1TJp1H6uSpLS8PF1iJue8s2p');
console.log('=== Full Subscription Object Keys ===');
console.log(Object.keys(sub));
console.log('\n=== Relevant Fields ===');
const subAny = sub as any;
console.log('billing_cycle_anchor:', subAny.billing_cycle_anchor);
console.log('current_period_end:', subAny.current_period_end);
console.log('current_period_start:', subAny.current_period_start);
console.log('next_pending_invoice_item_invoice:', subAny.next_pending_invoice_item_invoice);
// items内のフィールドも確認
if (sub.items?.data?.[0]) {
  const item = sub.items.data[0] as any;
  console.log('\nItem keys:', Object.keys(item));
  console.log('item.current_period_end:', item.current_period_end);
  console.log('item.current_period_start:', item.current_period_start);
}
