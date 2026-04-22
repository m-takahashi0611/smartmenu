import { createRequire } from 'module';
import fs from 'fs';
import https from 'https';
import http from 'http';

const require = createRequire(import.meta.url);

// 環境変数を読み込む
const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!LINE_TOKEN) {
  console.error('LINE_CHANNEL_ACCESS_TOKEN が設定されていません');
  process.exit(1);
}

function lineRequest(method, path, body, isBuffer = false) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.line.me',
      path,
      method,
      headers: {
        'Authorization': `Bearer ${LINE_TOKEN}`,
        ...(isBuffer ? { 'Content-Type': 'image/jpeg', 'Content-Length': body.length } : { 'Content-Type': 'application/json' }),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(isBuffer ? body : JSON.stringify(body));
    req.end();
  });
}

async function main() {
  // Step1: 既存のプレミアムメニューを削除
  console.log('=== 既存プレミアムメニューを確認 ===');
  const listRes = await lineRequest('GET', '/v2/bot/richmenu/list', null);
  const menus = listRes.body.richmenus || [];
  
  for (const menu of menus) {
    if (menu.name && menu.name.includes('premium')) {
      console.log(`削除: ${menu.richMenuId} (${menu.name})`);
      await lineRequest('DELETE', `/v2/bot/richmenu/${menu.richMenuId}`, null);
    }
  }

  // Step2: 新しいプレミアムメニューを作成（6コマ）
  console.log('\n=== 新しいプレミアムメニューを作成 ===');
  const menuDef = {
    size: { width: 2500, height: 1686 },
    selected: false,
    name: "premium_rich_menu_v2",
    chatBarText: "メニューを開く",
    areas: [
      // 上段左: 今日の献立
      { bounds: { x: 0, y: 0, width: 833, height: 843 }, action: { type: "message", text: "今日の献立" } },
      // 上段中: 冷蔵庫管理
      { bounds: { x: 833, y: 0, width: 834, height: 843 }, action: { type: "message", text: "冷蔵庫" } },
      // 上段右: 買い物リスト
      { bounds: { x: 1667, y: 0, width: 833, height: 843 }, action: { type: "message", text: "買い物リスト" } },
      // 下段左: ダッシュボードへ
      { bounds: { x: 0, y: 843, width: 833, height: 843 }, action: { type: "uri", uri: "https://app.kondatebiyori.com" } },
      // 下段中: 今日だけ特別
      { bounds: { x: 833, y: 843, width: 834, height: 843 }, action: { type: "message", text: "今日だけ特別" } },
      // 下段右: 週間献立
      { bounds: { x: 1667, y: 843, width: 833, height: 843 }, action: { type: "message", text: "週間献立" } },
    ]
  };

  const createRes = await lineRequest('POST', '/v2/bot/richmenu', menuDef);
  if (createRes.status !== 200) {
    console.error('メニュー作成失敗:', createRes.body);
    process.exit(1);
  }
  const newMenuId = createRes.body.richMenuId;
  console.log(`作成成功: ${newMenuId}`);

  // Step3: 新しい画像をアップロード
  console.log('\n=== 画像をアップロード ===');
  const imgBuffer = fs.readFileSync('/tmp/premium_menu_v7.jpg');
  const uploadRes = await lineRequest('POST', `/v2/bot/richmenu/${newMenuId}/content`, imgBuffer, true);
  if (uploadRes.status !== 200) {
    console.error('画像アップロード失敗:', uploadRes.body);
    process.exit(1);
  }
  console.log('画像アップロード成功');

  // Step4: プレミアムユーザーに適用
  console.log('\n=== プレミアムユーザーに適用 ===');
  
  // DBからプレミアムユーザーのLINE IDを取得
  const mysql = require('mysql2/promise');
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  const [rows] = await conn.execute(`
    SELECT u.line_user_id, u.display_name
    FROM users u
    JOIN subscriptions s ON u.id = s.user_id
    WHERE s.status = 'active' AND u.line_user_id IS NOT NULL
  `);
  
  console.log(`対象ユーザー: ${rows.length}名`);
  
  for (const user of rows) {
    const applyRes = await lineRequest('POST', `/v2/bot/user/${user.line_user_id}/richmenu/${newMenuId}`, null);
    console.log(`  ${user.display_name}: ${applyRes.status === 200 ? '✅ 適用成功' : '❌ 失敗 ' + JSON.stringify(applyRes.body)}`);
  }
  
  await conn.end();
  
  // Step5: DBに新しいメニューIDを保存
  const conn2 = await mysql.createConnection(process.env.DATABASE_URL);
  await conn2.execute(`
    UPDATE rich_menu_settings SET rich_menu_id = ?, updated_at = NOW() WHERE menu_type = 'premium'
  `, [newMenuId]);
  await conn2.end();
  
  console.log(`\n✅ 完了: ${newMenuId} を全プレミアムユーザーに適用しました`);
}

main().catch(console.error);
