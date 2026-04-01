import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

console.log('=== users ===');
const [users] = await conn.execute('SELECT id, openId, name, email, role FROM users ORDER BY id');
console.table(users);

console.log('\n=== line_users ===');
const [lineUsers] = await conn.execute('SELECT id, lineUserId, userId, displayName FROM line_users ORDER BY id');
console.table(lineUsers);

console.log('\n=== fridge_items (userId別) ===');
const [fridge] = await conn.execute('SELECT userId, COUNT(*) as count, GROUP_CONCAT(name) as items FROM fridge_items GROUP BY userId');
console.table(fridge);

console.log('\n=== shopping_list_items (userId別) ===');
const [shopping] = await conn.execute('SELECT userId, COUNT(*) as count, GROUP_CONCAT(name) as items FROM shopping_list_items GROUP BY userId');
console.table(shopping);

await conn.end();
