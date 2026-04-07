import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { eq } from 'drizzle-orm';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(conn);

// スキーマを直接定義（importの問題を回避）
const userId = 570001;

// 直接SQLで確認・削除
const [rows] = await conn.execute('SELECT id, name, quantity FROM fridge_items WHERE user_id = ?', [userId]);
console.log('削除前の冷蔵庫データ件数:', rows.length);
console.log('データ:', JSON.stringify(rows, null, 2));

const [result] = await conn.execute('DELETE FROM fridge_items WHERE user_id = ?', [userId]);
console.log('削除件数:', result.affectedRows);

// 確認
const [after] = await conn.execute('SELECT COUNT(*) as cnt FROM fridge_items WHERE user_id = ?', [userId]);
console.log('削除後の件数:', after[0].cnt);

await conn.end();
