import { createConnection } from 'mysql2/promise';
import { config } from 'dotenv';
config();

const conn = await createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute(
  'SELECT userId, otpCode, expiresAt, used, createdAt FROM admin_otp_sessions ORDER BY createdAt DESC LIMIT 10'
);
console.log('最新OTPセッション:');
for (const row of rows) {
  console.log(`  userId: ${row.userId}, code: ${row.otpCode}, expires: ${row.expiresAt}, used: ${row.used}, created: ${row.createdAt}`);
}
await conn.end();
