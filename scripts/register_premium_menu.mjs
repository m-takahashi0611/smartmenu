/**
 * 課金ユーザー向けプレミアムリッチメニューをLINEに登録するスクリプト
 * Usage: node scripts/register_premium_menu.mjs [lineUserId]
 */
import * as https from "https";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

// .envを読み込む
const require = createRequire(import.meta.url);
const dotenv = require("dotenv");
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), "../.env") });

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
const DATABASE_URL = process.env.DATABASE_URL ?? "";

if (!LINE_CHANNEL_ACCESS_TOKEN) {
  console.error("❌ LINE_CHANNEL_ACCESS_TOKEN が設定されていません");
  process.exit(1);
}

const PREMIUM_MENU_IMAGE_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/premium_rich_menu_v3_c7229d66.png";

// LINE API リクエストヘルパー
function lineApiRequest(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const req = https.request(
      {
        hostname: "api.line.me",
        path: apiPath,
        method,
        headers: {
          Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
          ...(bodyStr ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(bodyStr) } : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, data: data ? JSON.parse(data) : {} });
          } catch {
            resolve({ status: res.statusCode, data });
          }
        });
      }
    );
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// 画像URLからBufferを取得
function fetchImageBuffer(imgUrl) {
  return new Promise((resolve, reject) => {
    const protocol = imgUrl.startsWith("https") ? https : require("http");
    protocol.get(imgUrl, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

// 画像アップロード
function uploadRichMenuImage(richMenuId, imageBuffer, contentType) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api-data.line.me",
        path: `/v2/bot/richmenu/${richMenuId}/content`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
          "Content-Type": contentType,
          "Content-Length": imageBuffer.length,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Image upload failed: ${res.statusCode} ${data}`));
          } else {
            resolve();
          }
        });
      }
    );
    req.on("error", reject);
    req.write(imageBuffer);
    req.end();
  });
}

// プレミアムメニューのボディ定義
function buildPremiumRichMenuBody() {
  return {
    size: { width: 2500, height: 1686 },
    selected: true,
    name: "献立日和 プレミアムメニュー",
    chatBarText: "メニューを開く",
    areas: [
      // 今日の献立（左上）
      { bounds: { x: 0, y: 0, width: 833, height: 843 }, action: { type: "message", label: "今日の献立", text: "今日の献立" } },
      // 冷蔵庫管理（中上）
      { bounds: { x: 833, y: 0, width: 834, height: 843 }, action: { type: "message", label: "冷蔵庫管理", text: "冷蔵庫の中身を教えて" } },
      // 買い物リスト（右上）
      { bounds: { x: 1667, y: 0, width: 833, height: 843 }, action: { type: "message", label: "買い物リスト", text: "買い物リストを教えて" } },
      // ダッシュボードへ（左下）
      { bounds: { x: 0, y: 843, width: 833, height: 843 }, action: { type: "uri", label: "ダッシュボードへ", uri: "https://liff.line.me/2009630713-AotlJytF" } },
      // 今日だけ特別（中下）
      { bounds: { x: 833, y: 843, width: 834, height: 843 }, action: { type: "message", label: "今日だけ特別", text: "今日だけ特別" } },
      // 家計簿（右下）
      { bounds: { x: 1667, y: 843, width: 833, height: 843 }, action: { type: "message", label: "家計簿", text: "家計簿" } },
    ],
  };
}

async function main() {
  const targetLineUserId = process.argv[2];

  console.log("🚀 プレミアムリッチメニュー登録開始...");

  // 1. メニュー作成
  console.log("📋 リッチメニュー作成中...");
  const createRes = await lineApiRequest("POST", "/v2/bot/richmenu", buildPremiumRichMenuBody());
  if (createRes.status !== 200) {
    console.error("❌ メニュー作成失敗:", JSON.stringify(createRes.data));
    process.exit(1);
  }
  const richMenuId = createRes.data.richMenuId;
  console.log("✅ メニュー作成完了:", richMenuId);

  // 2. 画像アップロード
  console.log("🖼️  画像ダウンロード中...");
  const imageBuffer = await fetchImageBuffer(PREMIUM_MENU_IMAGE_URL);
  console.log(`✅ 画像ダウンロード完了: ${imageBuffer.length} bytes`);

  console.log("📤 画像アップロード中...");
  await uploadRichMenuImage(richMenuId, imageBuffer, "image/png");
  console.log("✅ 画像アップロード完了");

  // 3. 特定ユーザーに適用（引数がある場合）
  if (targetLineUserId) {
    console.log(`👤 ユーザー ${targetLineUserId} に課金メニューを適用中...`);
    const linkRes = await lineApiRequest("POST", `/v2/bot/user/${targetLineUserId}/richmenu/${richMenuId}`);
    if (linkRes.status === 200) {
      console.log("✅ 課金メニュー適用完了！");
    } else {
      console.warn("⚠️  課金メニュー適用失敗:", JSON.stringify(linkRes.data));
    }
  }

  console.log("\n📌 登録結果:");
  console.log(`  richMenuId: ${richMenuId}`);
  console.log(`  画像URL: ${PREMIUM_MENU_IMAGE_URL}`);
  console.log("\n⚠️  このIDをDBに保存するには、サーバーの管理者APIを使うか、以下のSQLを実行してください:");
  console.log(`  INSERT INTO system_settings (\`key\`, value) VALUES ('premium_rich_menu_id', '${richMenuId}') ON DUPLICATE KEY UPDATE value = '${richMenuId}';`);
}

main().catch((e) => {
  console.error("❌ エラー:", e);
  process.exit(1);
});
