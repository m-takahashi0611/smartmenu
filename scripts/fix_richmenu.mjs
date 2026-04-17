import https from 'https';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// DBから標準メニューIDを取得
const [rows] = await conn.execute("SELECT `value` FROM system_settings WHERE `key` = 'normalRichMenuId'");
const normalMenuId = rows[0]?.value;
console.log('normalMenuId:', normalMenuId);

if (!normalMenuId) {
  console.log('標準メニューIDがDBにありません');
  await conn.end();
  process.exit(1);
}

const lineUserId = 'U3a978d44ad16e83f704e5130e7e3298f';
const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;

await new Promise((resolve, reject) => {
  const req = https.request({
    hostname: 'api.line.me',
    path: `/v2/bot/user/${lineUserId}/richmenu/${normalMenuId}`,
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  }, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      console.log('result:', res.statusCode, data);
      resolve(null);
    });
  });
  req.on('error', reject);
  req.end();
});

await conn.end();
console.log('完了');
