import { createConnection } from "mysql2/promise";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const conn = await createConnection(DATABASE_URL);

try {
  // テスターのopenId: line:U0f3e85852f5e8650573d0b30379f5bd8
  const lineUserId = "U0f3e85852f5e8650573d0b30379f5bd8";

  console.log("=== users table (openId=line:...) ===");
  const [users] = await conn.execute(
    "SELECT id, openId, name, email, role FROM users WHERE openId = ?",
    [`line:${lineUserId}`]
  );
  console.log(JSON.stringify(users, null, 2));

  console.log("\n=== line_users table (lineUserId) ===");
  const [lineUsers] = await conn.execute(
    "SELECT id, userId, lineUserId, displayName, isActive FROM line_users WHERE lineUserId = ?",
    [lineUserId]
  );
  console.log(JSON.stringify(lineUsers, null, 2));

  console.log("\n=== users table (id=1200001) ===");
  const [userById] = await conn.execute(
    "SELECT id, openId, name, email, role FROM users WHERE id = ?",
    [1200001]
  );
  console.log(JSON.stringify(userById, null, 2));

  // line_usersにレコードがある場合、そのuserIdでfridgeItemsを確認
  if (lineUsers.length > 0 && lineUsers[0].userId) {
    const uid = lineUsers[0].userId;
    console.log(`\n=== fridge_items (userId=${uid}) ===`);
    const [fridgeItems] = await conn.execute(
      "SELECT id, name, quantity FROM fridge_items WHERE userId = ? LIMIT 10",
      [uid]
    );
    console.log(JSON.stringify(fridgeItems, null, 2));
  }

} finally {
  await conn.end();
}
