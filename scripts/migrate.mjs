import { createConnection } from "mysql2/promise";
import { readFileSync } from "fs";
import { config } from "dotenv";

config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not found");
  process.exit(1);
}

const conn = await createConnection(DATABASE_URL);

const sqls = [
  `CREATE TABLE IF NOT EXISTS \`line_conversation_history\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`lineUserId\` varchar(64) NOT NULL,
    \`role\` enum('user','assistant') NOT NULL,
    \`content\` text NOT NULL,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`line_conversation_history_id\` PRIMARY KEY(\`id\`)
  )`,
  `ALTER TABLE \`line_users\` ADD COLUMN IF NOT EXISTS \`latitude\` double`,
  `ALTER TABLE \`line_users\` ADD COLUMN IF NOT EXISTS \`longitude\` double`,
  `ALTER TABLE \`line_users\` ADD COLUMN IF NOT EXISTS \`region\` varchar(100)`,
];

for (const sql of sqls) {
  try {
    await conn.execute(sql);
    console.log("✓ Executed:", sql.slice(0, 60) + "...");
  } catch (err) {
    if (err.code === "ER_DUP_FIELDNAME" || err.code === "ER_TABLE_EXISTS_ERROR") {
      console.log("⚠ Already exists (skipping):", sql.slice(0, 60) + "...");
    } else {
      console.error("✗ Error:", err.message, "SQL:", sql.slice(0, 60));
    }
  }
}

await conn.end();
console.log("Migration complete!");
