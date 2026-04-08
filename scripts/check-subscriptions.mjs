import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Load env
const dotenv = require('dotenv');
dotenv.config({ path: '/home/ubuntu/smartmenu/.env' });

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const res = await pool.query(`
  SELECT s.id, s.user_id, s.plan, s.status, 
         s.stripe_subscription_id, s.stripe_customer_id, 
         s.current_period_end, s.updated_at, u.name
  FROM subscriptions s 
  JOIN users u ON s.user_id = u.id 
  ORDER BY s.updated_at DESC 
  LIMIT 10
`);

console.log('=== Subscriptions ===');
res.rows.forEach(row => {
  console.log(`User: ${row.name} | Plan: ${row.plan} | Status: ${row.status} | StripeSubId: ${row.stripe_subscription_id || 'none'} | Updated: ${row.updated_at}`);
});

await pool.end();
