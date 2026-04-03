import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

const pool = mysql.createPool(process.env.DATABASE_URL);
const db = drizzle(pool);

const sql1 = `CREATE TABLE IF NOT EXISTS \`menu_themes\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`lineUserId\` varchar(64) NOT NULL,
  \`rawInput\` text NOT NULL,
  \`mainDish\` varchar(50),
  \`noodleType\` varchar(50),
  \`cuisine\` varchar(50),
  \`flavor\` varchar(100),
  \`texture\` varchar(50),
  \`cookingMethod\` varchar(50),
  \`scene\` varchar(50),
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT \`menu_themes_id\` PRIMARY KEY(\`id\`)
)`;

const sql2 = `CREATE TABLE IF NOT EXISTS \`user_preferences\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`lineUserId\` varchar(64) NOT NULL,
  \`memberName\` varchar(50),
  \`preferenceType\` enum('dislike','allergy','favorite','restriction') NOT NULL,
  \`ingredient\` varchar(100) NOT NULL,
  \`note\` text,
  \`active\` boolean NOT NULL DEFAULT true,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`user_preferences_id\` PRIMARY KEY(\`id\`)
)`;

const conn = await pool.getConnection();
try {
  await conn.execute(sql1);
  console.log('✅ menu_themes table created');
  await conn.execute(sql2);
  console.log('✅ user_preferences table created');
} catch (e) {
  console.error('Error:', e.message);
} finally {
  conn.release();
  await pool.end();
}
