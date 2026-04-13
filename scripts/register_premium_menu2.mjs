/**
 * 課金ユーザー向けプレミアムリッチメニューをLINEに登録するスクリプト（圧縮版）
 * Usage: node scripts/register_premium_menu2.mjs [lineUserId]
 */
import * as https from "https";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const dotenv = require("dotenv");
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), "../.env") });

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";

if (!LINE_CHANNEL_ACCESS_TOKEN) {
  console.error("❌ LINE_CHANNEL_ACCESS_TOKEN が設定されていません");
  process.exit(1);
}

// 圧縮済みJPEG画像（672KB）
const COMPRESSED_IMAGE_PATH = "/home/ubuntu/webdev-static-assets/premium_rich_menu_compressed_q85.jpg";

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

function uploadRichMenuImageFromBuffer(richMenuId, imageBuffer, contentType) {
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

function buildPremiumRichMenuBody() {
  return {
    size: { width: 2500, height: 1686 },
    selected: true,
    name: "献立日和 プレミアムメニュー",
    chatBarText: "メニューを開く",
    areas: [
      { bounds: { x: 0, y: 0, width: 833, height: 843 }, action: { type: "message", label: "今日の献立", text: "今日の献立" } },
      { bounds: { x: 833, y: 0, width: 834, height: 843 }, action: { type: "message", label: "冷蔵庫管理", text: "冷蔵庫の中身を教えて" } },
      { bounds: { x: 1667, y: 0, width: 833, height: 843 }, action: { type: "message", label: "買い物リスト", text: "買い物リストを教えて" } },
      { bounds: { x: 0, y: 843, width: 833, height: 843 }, action: { type: "uri", label: "ダッシュボードへ", uri: "https://liff.line.me/2009630713-AotlJytF" } },
      { bounds: { x: 833, y: 843, width: 834, height: 843 }, action: { type: "message", label: "今日だけ特別", text: "今日だけ特別" } },
      { bounds: { x: 1667, y: 843, width: 833, height: 843 }, action: { type: "message", label: "家計簿", text: "家計簿" } },
    ],
  };
}

async function main() {
  const targetLineUserId = process.argv[2];

  console.log("🚀 プレミアムリッチメニュー登録開始（圧縮版）...");

  // 1. 既存の未完成メニューを削除
  console.log("🗑️  既存の未完成メニューを削除中...");
  const delRes = await lineApiRequest("DELETE", "/v2/bot/richmenu/richmenu-10b53c4737b32a5f9221e0db715ef9a9");
  console.log(`削除結果: ${delRes.status}`);

  // 2. メニュー作成
  console.log("📋 リッチメニュー作成中...");
  const createRes = await lineApiRequest("POST", "/v2/bot/richmenu", buildPremiumRichMenuBody());
  if (createRes.status !== 200) {
    console.error("❌ メニュー作成失敗:", JSON.stringify(createRes.data));
    process.exit(1);
  }
  const richMenuId = createRes.data.richMenuId;
  console.log("✅ メニュー作成完了:", richMenuId);

  // 3. ローカルの圧縮JPEG画像をアップロード
  console.log("🖼️  ローカル画像を読み込み中...");
  const imageBuffer = fs.readFileSync(COMPRESSED_IMAGE_PATH);
  console.log(`✅ 画像読み込み完了: ${(imageBuffer.length / 1024).toFixed(0)}KB`);

  console.log("📤 画像アップロード中...");
  await uploadRichMenuImageFromBuffer(richMenuId, imageBuffer, "image/jpeg");
  console.log("✅ 画像アップロード完了");

  // 4. 特定ユーザーに適用
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
  console.log("\n⚠️  このIDをDBに保存するSQL:");
  console.log(`  INSERT INTO system_settings (\`key\`, value) VALUES ('premium_rich_menu_id', '${richMenuId}') ON DUPLICATE KEY UPDATE value = '${richMenuId}';`);
}

main().catch((e) => {
  console.error("❌ エラー:", e);
  process.exit(1);
});
