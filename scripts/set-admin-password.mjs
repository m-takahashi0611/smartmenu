import { createConnection } from 'mysql2/promise';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'smartmenu-admin-salt').digest('hex');
}

const password = 'Admin1234';
const hash = hashPassword(password);
console.log('Hash:', hash);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

// Parse the URL
const parsed = new URL(url);
const connection = await createConnection({
  host: parsed.hostname,
  port: parseInt(parsed.port || '3306'),
  user: parsed.username,
  password: parsed.password,
  database: parsed.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});

// Find admin user
const [rows] = await connection.execute(
  "SELECT id, email, name, role FROM users WHERE role = 'admin' LIMIT 5"
);
console.log('Admin users:', rows);

if (rows.length === 0) {
  console.error('No admin users found');
  process.exit(1);
}

// Update all admin users with the hash
for (const user of rows) {
  await connection.execute(
    'UPDATE users SET adminPasswordHash = ? WHERE id = ?',
    [hash, user.id]
  );
  console.log(`Updated password for user: ${user.email || user.name} (id=${user.id})`);
}

await connection.end();
console.log('Done!');
