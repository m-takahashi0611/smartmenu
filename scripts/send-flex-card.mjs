import 'dotenv/config';
import https from 'https';

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LINE_USER_ID = 'U3a978d44ad16e83f704e5130e7e3298f'; // 高橋さんのlineUserId

const flexMessage = {
  type: "flex",
  altText: "🎁 20日間 全機能無料体験のご案内",
  contents: {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "🎁 20日間 全機能無料体験",
          weight: "bold",
          size: "lg",
          color: "#ffffff",
          align: "center",
        },
      ],
      backgroundColor: "#FF6B35",
      paddingAll: "16px",
    },
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "カード登録するだけで\nプレミアム機能が20日間タダ！",
          wrap: true,
          size: "sm",
          color: "#555555",
          align: "center",
        },
        {
          type: "separator",
          margin: "md",
        },
        {
          type: "box",
          layout: "vertical",
          margin: "md",
          spacing: "sm",
          contents: [
            { type: "text", text: "✓ AI高精度献立（天気・栄養考慮）", size: "sm", color: "#333333" },
            { type: "text", text: "✓ 買い物リスト自動生成", size: "sm", color: "#333333" },
            { type: "text", text: "✓ チラシ・レシート解析", size: "sm", color: "#333333" },
            { type: "text", text: "✓ 献立テーマ（ダイエットなど）", size: "sm", color: "#333333" },
            { type: "text", text: "✓ お弁当モード", size: "sm", color: "#333333" },
          ],
        },
        {
          type: "separator",
          margin: "md",
        },
        {
          type: "text",
          text: "20日後は月額480円 ／ いつでも解約OK",
          size: "xs",
          color: "#aaaaaa",
          align: "center",
          margin: "md",
        },
      ],
      paddingAll: "16px",
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          action: {
            type: "uri",
            label: "✨ 今すぐ無料で始める →",
            uri: "https://www.kondatebiyori.com/plan",
          },
          style: "primary",
          color: "#FF6B35",
          height: "sm",
        },
      ],
      paddingAll: "12px",
    },
  },
};

const body = JSON.stringify({
  to: LINE_USER_ID,
  messages: [flexMessage],
});

const req = https.request(
  {
    hostname: "api.line.me",
    path: "/v2/bot/message/push",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      "Content-Length": Buffer.byteLength(body),
    },
  },
  (res) => {
    let data = "";
    res.on("data", (chunk) => (data += chunk));
    res.on("end", () => {
      console.log(`Status: ${res.statusCode}`);
      console.log(`Response: ${data}`);
    });
  }
);
req.on("error", (e) => console.error(e));
req.write(body);
req.end();
