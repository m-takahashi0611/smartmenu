import mysql from 'mysql2/promise';
import https from 'https';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function switchToNormalMenu(lineUserId, normalMenuId, channelAccessToken) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.line.me',
      path: '/v2/bot/user/' + lineUserId + '/richmenu/' + normalMenuId,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + channelAccessToken,
        'Content-Type': 'application/json'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log('  LINE API Status:', res.statusCode, 'Body:', data);
        resolve({ status: res.statusCode, body: data });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  // ─── Step 1: 野崎めぐみの古いサブスク4つをキャンセル ───
  console.log('\n=== Step 1: 野崎めぐみの古いサブスクリプションをキャンセル ===');
  const oldSubs = [
    'sub_1TNXZf6uSpLS8PF1pH9yfRDz', // 2026/4/18
    'sub_1TNB4q6uSpLS8PF1gnV1jm3c', // 2026/4/17
    'sub_1TMocV6uSpLS8PF1f0otBVOZ', // 2026/4/16
    'sub_1TMobp6uSpLS8PF1e3f9MUD1', // 2026/4/16
  ];
  for (const subId of oldSubs) {
    try {
      const result = await stripe.subscriptions.cancel(subId);
      console.log(`  キャンセル完了: ${subId} → status: ${result.status}`);
    } catch (e) {
      console.error(`  キャンセル失敗: ${subId}`, e.message);
    }
  }

  // ─── Step 2: 2名のDBをfree/trialに戻す ───
  console.log('\n=== Step 2: 2名のDBをfree/trialに戻す ===');

  // 野崎めぐみ (userId 1410001): stripeCustomerIdは残す、subscriptionIdはnullに戻す
  const [r1] = await conn.execute(
    'UPDATE subscriptions SET plan=?, status=?, stripeSubscriptionId=NULL, currentPeriodEnd=NULL, cancelledAt=NULL WHERE userId=?',
    ['free', 'trial', 1410001]
  );
  console.log('野崎めぐみ (1410001) update:', r1.affectedRows, 'rows affected');

  // Mifu (userId 1440001): 同様
  const [r2] = await conn.execute(
    'UPDATE subscriptions SET plan=?, status=?, stripeSubscriptionId=NULL, currentPeriodEnd=NULL, cancelledAt=NULL WHERE userId=?',
    ['free', 'trial', 1440001]
  );
  console.log('Mifu (1440001) update:', r2.affectedRows, 'rows affected');

  // ─── Step 3: LINEリッチメニューを通常メニューに戻す ───
  console.log('\n=== Step 3: LINEリッチメニューを通常メニューに戻す ===');

  const [menuRows] = await conn.execute("SELECT value FROM system_settings WHERE `key`='number_rich_menu_id' LIMIT 1");
  const normalMenuId = menuRows[0]?.value;
  console.log('通常メニューID:', normalMenuId);

  if (!normalMenuId) {
    console.error('通常メニューID not found');
    await conn.end();
    return;
  }

  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const lineUsers = [
    { id: 'U16b177433495e9e03aa2a267632e3fab', name: '野崎めぐみ' },
    { id: 'U86a223edaedf8ca8170f9f28be36f703', name: 'Mifu' },
  ];

  for (const user of lineUsers) {
    console.log(`  ${user.name} (${user.id}) → 通常メニューに切り替え`);
    await switchToNormalMenu(user.id, normalMenuId, token);
  }

  // ─── 確認 ───
  console.log('\n=== 最終確認 ===');
  const [rows] = await conn.execute(
    'SELECT id, userId, plan, status, stripeCustomerId, stripeSubscriptionId, currentPeriodEnd FROM subscriptions WHERE userId IN (1410001, 1440001)'
  );
  console.table(rows);

  await conn.end();
}

main().catch(console.error);
