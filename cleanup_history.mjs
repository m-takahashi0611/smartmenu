// 重複「献立」データのクリーンアップスクリプト
// 各ユーザーの連続した「献立」メッセージを1件だけ残して削除する

import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

// mysql://user:pass@host:port/db?params の形式をパース
const url = new URL(DATABASE_URL);
const connection = await mysql.createConnection({
  host: url.hostname,
  port: parseInt(url.port) || 4000,
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1).split('?')[0],
  ssl: { rejectUnauthorized: false },
});

console.log('Connected to DB');

// 現在の状況を確認 (カラム名: lineUserId, createdAt)
const [stats] = await connection.execute(
  `SELECT lineUserId, COUNT(*) as total, 
   SUM(CASE WHEN content = '献立' THEN 1 ELSE 0 END) as kondo_count
   FROM line_conversation_history 
   GROUP BY lineUserId
   ORDER BY total DESC`
);
console.log('Current stats:', JSON.stringify(stats, null, 2));

// 各ユーザーの重複「献立」を削除（連続する同じ内容を1件残す）
const [users] = await connection.execute(
  `SELECT DISTINCT lineUserId FROM line_conversation_history WHERE content = '献立'`
);

for (const user of users) {
  const lineUserId = user.lineUserId;
  
  // そのユーザーの「献立」メッセージを時系列順で取得
  const [kondateMessages] = await connection.execute(
    `SELECT id, createdAt FROM line_conversation_history 
     WHERE lineUserId = ? AND content = '献立' AND role = 'user'
     ORDER BY createdAt ASC`,
    [lineUserId]
  );
  
  console.log(`User ${lineUserId}: found ${kondateMessages.length} '献立' messages`);
  
  if (kondateMessages.length <= 1) continue;
  
  // 1分以内に連続する「献立」は重複とみなして削除対象に
  const toDelete = [];
  let prevTime = null;
  
  for (const msg of kondateMessages) {
    const msgTime = new Date(msg.createdAt).getTime();
    if (prevTime !== null && msgTime - prevTime < 60 * 1000) {
      // 前のメッセージから1分以内 → 重複として削除
      toDelete.push(msg.id);
    } else {
      prevTime = msgTime;
    }
  }
  
  if (toDelete.length > 0) {
    console.log(`User ${lineUserId}: deleting ${toDelete.length} duplicate '献立' messages`);
    await connection.execute(
      `DELETE FROM line_conversation_history WHERE id IN (${toDelete.map(() => '?').join(',')})`,
      toDelete
    );
  } else {
    console.log(`User ${lineUserId}: no duplicates found (messages are spaced > 1 min apart)`);
  }
}

// 結果確認
const [statsAfter] = await connection.execute(
  `SELECT lineUserId, COUNT(*) as total, 
   SUM(CASE WHEN content = '献立' THEN 1 ELSE 0 END) as kondo_count
   FROM line_conversation_history 
   GROUP BY lineUserId
   ORDER BY total DESC`
);
console.log('After cleanup:', JSON.stringify(statsAfter, null, 2));

await connection.end();
console.log('Done!');
