import { getDb } from './server/db.ts';
import { lineUsers, lineConversationHistory } from './drizzle/schema.ts';
import { eq } from 'drizzle-orm';

const db = await getDb();

// 舞さんのline_users情報
const maiUser = await db.select().from(lineUsers).where(eq(lineUsers.displayName, '舞')).limit(1);
console.log('舞さんのline_users:', JSON.stringify(maiUser, null, 2));

if (maiUser.length > 0) {
  const lineUserId = maiUser[0].lineUserId;
  
  // トーク履歴件数
  const history = await db.select().from(lineConversationHistory).where(eq(lineConversationHistory.lineUserId, lineUserId));
  console.log('\nトーク履歴件数:', history.length);
  
  // 最新5件
  console.log('\n最新5件:');
  history.slice(-5).forEach((h, i) => {
    console.log(`${i+1}. [${h.role}] ${h.content.substring(0, 50)}... (${h.createdAt})`);
  });
}

process.exit(0);
