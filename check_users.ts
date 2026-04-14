import mysql from 'mysql2/promise';

const url = process.env.DATABASE_URL!;
const conn = await mysql.createConnection(url + (url.includes('?') ? '&' : '?') + 'ssl={"rejectUnauthorized":false}');

const [rows] = await conn.execute(`
  SELECT lu.id, lu.lineUserId, lu.userId, lu.displayName, u.name as userName, u.openId
  FROM line_users lu
  LEFT JOIN users u ON lu.userId = u.id
  ORDER BY lu.id DESC
  LIMIT 20
`) as any[];
console.log("line_users + users:");
(rows as any[]).forEach(r => console.log(JSON.stringify(r)));
await conn.end();
