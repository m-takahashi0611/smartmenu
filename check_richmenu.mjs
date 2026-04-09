import * as https from "https";

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";

async function lineApiRequest(method, apiPath, body) {
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

// リッチメニュー一覧を取得
const listRes = await lineApiRequest("GET", "/v2/bot/richmenu/list");
console.log("=== リッチメニュー一覧 ===");
const menus = listRes.data?.richmenus ?? [];
console.log(`合計: ${menus.length}件`);

for (const menu of menus) {
  console.log(`\n--- ID: ${menu.richMenuId} ---`);
  console.log(`名前: ${menu.name}`);
  console.log(`選択済み: ${menu.selected}`);
  console.log("エリア:");
  for (const area of menu.areas) {
    console.log(`  - アクション: ${JSON.stringify(area.action)}`);
  }
}

// デフォルトリッチメニューを確認
const defaultRes = await lineApiRequest("GET", "/v2/bot/user/all/richmenu");
console.log("\n=== デフォルトリッチメニュー ===");
console.log(JSON.stringify(defaultRes.data));
