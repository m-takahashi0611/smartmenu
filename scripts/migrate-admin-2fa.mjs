import { createConnection } from "mysql2/promise";
import { config } from "dotenv";
config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not found");
  process.exit(1);
}

const conn = await createConnection(DATABASE_URL);

const sqls = [
  // 管理者パスワードハッシュ
  `ALTER TABLE \`users\` ADD COLUMN IF NOT EXISTS \`adminPasswordHash\` varchar(255)`,
  // OTPシークレット（TOTP用）
  `ALTER TABLE \`users\` ADD COLUMN IF NOT EXISTS \`adminOtpSecret\` varchar(64)`,
  // OTPセッション管理テーブル
  `CREATE TABLE IF NOT EXISTS \`admin_otp_sessions\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`userId\` int NOT NULL,
    \`otpCode\` varchar(6) NOT NULL,
    \`expiresAt\` timestamp NOT NULL,
    \`used\` tinyint(1) NOT NULL DEFAULT 0,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`admin_otp_sessions_id\` PRIMARY KEY(\`id\`)
  )`,
];

for (const sql of sqls) {
  try {
    await conn.execute(sql);
    const preview = sql.trim().split("\n")[0].substring(0, 60);
    console.log(`✓ Executed: ${preview}...`);
  } catch (err) {
    console.error(`✗ Failed: ${err.message}`);
  }
}

await conn.end();
console.log("Migration complete!");
