import mysql from 'mysql2/promise';
import https from 'https';

async function switchToPremiumMenu(lineUserId, premiumMenuId, channelAccessToken) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.line.me',
      path: '/v2/bot/user/' + lineUserId + '/richmenu/' + premiumMenuId,
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
        console.log('Status:', res.statusCode, 'Response:', data);
        resolve({ status: res.statusCode, body: data });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // 課金メニューIDをDBから取得
  const [menuRows] = await conn.execute("SELECT value FROM system_settings WHERE `key`='premium_rich_menu_id' LIMIT 1");
  console.log('Premium menu:', menuRows);
  const premiumMenuId = menuRows[0]?.value;
  if (!premiumMenuId) {
    console.error('Premium menu ID not found');
    await conn.end();
    return;
  }
  
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const lineUserIds = [
    { id: 'U16b177433495e9e03aa2a267632e3fab', name: '野崎めぐみ' },
    { id: 'U86a223edaedf8ca8170f9f28be36f703', name: 'Mifu' },
  ];
  
  for (const user of lineUserIds) {
    console.log(`Switching to premium menu for: ${user.name} (${user.id})`);
    const result = await switchToPremiumMenu(user.id, premiumMenuId, token);
    console.log('Result:', result);
  }
  
  await conn.end();
}

main().catch(console.error);
