import { createConnection } from "mysql2/promise";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const conn = await createConnection(DATABASE_URL);

try {
  console.log("Applying migration: ALTER TABLE line_users MODIFY COLUMN userId int (nullable)");
  await conn.execute("ALTER TABLE `line_users` MODIFY COLUMN `userId` int;");
  console.log("✅ Migration applied successfully");

  // drizzle migrations テーブルも更新
  await conn.execute(`
    INSERT INTO __drizzle_migrations (hash, created_at)
    VALUES ('0007_same_black_bolt', UNIX_TIMESTAMP() * 1000)
    ON DUPLICATE KEY UPDATE created_at = UNIX_TIMESTAMP() * 1000
  `).catch(() => {
    // テーブルが存在しない場合は無視
    console.log("Note: Could not update drizzle migrations table (may not exist)");
  });

  console.log("✅ Done");
} catch (err) {
  if (err.code === "ER_CANT_CHANGE_COLUMN" || (err.message && err.message.includes("already"))) {
    console.log("Column may already be nullable, checking...");
    const [rows] = await conn.execute("SHOW COLUMNS FROM `line_users` LIKE 'userId'");
    console.log("Current column definition:", rows);
  } else {
    console.error("Migration failed:", err.message);
  }
} finally {
  await conn.end();
}
