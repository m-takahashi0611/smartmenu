import * as crypto from "crypto";
import * as https from "https";
import { z } from "zod";
import { getLineUserByLineId, getDb, insertDeliveryLog, getFridgeItems, getFamilyProfile, getFamilyMembers, getRecentMenuPlans } from "../db";
import { lineUsers } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { generateMenuPlan } from "./menu";
import { publicProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { getWeatherInfo, formatWeatherForPrompt } from "../weather";

// ─── LINE API helper ──────────────────────────────────────────────────────────

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET ?? "";

export async function sendLineMessage(lineUserId: string, messages: object[]) {
  const body = JSON.stringify({
    to: lineUserId,
    messages,
  });

  return new Promise<void>((resolve, reject) => {
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
          if (res.statusCode && res.statusCode >= 400) {
            console.error("[LINE] Push message failed:", res.statusCode, data);
            reject(new Error(`LINE API error: ${res.statusCode}`));
          } else {
            resolve();
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export async function replyLineMessage(replyToken: string, messages: object[]) {
  const body = JSON.stringify({ replyToken, messages });

  return new Promise<void>((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.line.me",
        path: "/v2/bot/message/reply",
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
          if (res.statusCode && res.statusCode >= 400) {
            console.error("[LINE] Reply message failed:", res.statusCode, data);
            reject(new Error(`LINE API error: ${res.statusCode}`));
          } else {
            resolve();
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export async function getLineUserProfile(lineUserId: string): Promise<{
  userId: string;
  displayName: string;
  pictureUrl?: string;
} | null> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.line.me",
        path: `/v2/bot/profile/${lineUserId}`,
        method: "GET",
        headers: {
          Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode === 200) {
            resolve(JSON.parse(data));
          } else {
            resolve(null);
          }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.end();
  });
}

// ─── Signature verification ───────────────────────────────────────────────────

export function verifyLineSignature(body: string, signature: string): boolean {
  if (!LINE_CHANNEL_SECRET) return false;
  const hash = crypto
    .createHmac("sha256", LINE_CHANNEL_SECRET)
    .update(body)
    .digest("base64");
  return hash === signature;
}

// ─── AI文脈理解型チャット応答 ─────────────────────────────────────────────────

/**
 * ユーザーのメッセージに対してAIが文脈を理解して献立に関連する返答を生成する
 * 天気・冷蔵庫・家族情報を活用して、常に「食」に結びつけた応答を返す
 */
async function generateContextualReply(
  userMessage: string,
  userId: number | null,
  displayName: string
): Promise<string> {
  // 天気情報を取得（東京デフォルト）
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];
  const today = new Date().toISOString().split("T")[0];

  const [todayWeather, tomorrowWeather] = await Promise.all([
    getWeatherInfo(35.68, 139.69, today),
    getWeatherInfo(35.68, 139.69, tomorrowStr),
  ]);

  const todayWeatherDesc = formatWeatherForPrompt(todayWeather);
  const tomorrowWeatherDesc = formatWeatherForPrompt(tomorrowWeather);

  // ユーザー情報を取得（ログイン済みの場合）
  let fridgeDesc = "冷蔵庫情報なし";
  let familyDesc = "家族情報なし";
  let recentMenuDesc = "なし";

  if (userId) {
    const [fridgeItems, familyProfile, recentPlans] = await Promise.all([
      getFridgeItems(userId),
      getFamilyProfile(userId),
      getRecentMenuPlans(userId, 3),
    ]);

    if (fridgeItems.length > 0) {
      fridgeDesc = fridgeItems.map((f) => `${f.name}（${f.quantity ?? "適量"}）`).join("、");
    }

    if (familyProfile) {
      const members = await getFamilyMembers(familyProfile.id);
      if (members.length > 0) {
        familyDesc = members.map((m) => `${m.name}（${m.ageGroup}）`).join("、");
      }
    }

    if (recentPlans.length > 0) {
      recentMenuDesc = recentPlans
        .flatMap((p) => {
          try {
            const data = typeof p.menuData === "string" ? JSON.parse(p.menuData) : p.menuData;
            return [data?.dinner].filter(Boolean);
          } catch { return []; }
        })
        .join("、");
    }
  }

  // 天気が雨かどうか
  const isTomorrowRainy = tomorrowWeather && tomorrowWeather.weatherCode >= 51;
  const isTodayRainy = todayWeather && todayWeather.weatherCode >= 51;
  const isTodayHot = todayWeather && todayWeather.temperatureMax >= 28;
  const isTodayCold = todayWeather && todayWeather.temperatureMax <= 10;

  const rainyTomorrowMsg = isTomorrowRainy
    ? "雨だと買い物が面倒ですよね。冷蔵庫の食材だけで作れる料理を提案しましょうか？"
    : "外出しやすい天気ですね！新鮮な食材を買いに行けそうです。";
  const hotMsg = isTodayHot ? "暑い日はさっぱりした料理がおすすめです！" : "";
  const coldMsg = isTodayCold ? "寒い日は体を温めるお鍋やシチューはいかがでしょう？" : "";

  const systemPrompt = `あなたはエプロン執事という名前の、日本の家庭向け献立アシスタントです。
LINEでユーザーと会話しており、どんな質問も必ず食事・献立・料理に結びつけて答えることが最大の特徴です。

[絶対ルール]
1. 献立に関係のない質問を返してはいけない（どんな風に過ごす予定なの？はNG）
2. 天気の質問には天気情報とそれに合った料理提案をセットで答える
3. 雨・悪天候の場合は買い物が大変だから冷蔵庫の食材で作れるものを提案する
4. 暑い日はさっぱりした料理、寒い日は体を温める料理を提案する
5. 常に親しみやすく、主婦に寄り添うトーンで話す（執事らしく丁寧だが温かい）
6. 返答は3〜5行程度に収める（長すぎない）
7. ユーザーの名前 ${displayName}さん を適度に使う

[現在の情報]
今日の天気：${todayWeatherDesc}
明日の天気：${tomorrowWeatherDesc}
冷蔵庫の食材：${fridgeDesc}
家族構成：${familyDesc}
最近の夕食：${recentMenuDesc}

[応答パターン例]
天気を聞かれたら：明日は${tomorrowWeatherDesc}の予報です。${rainyTomorrowMsg}
暑い日：${hotMsg}
寒い日：${coldMsg}`;
  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });

    return response.choices[0]?.message?.content as string ?? "申し訳ありません、うまく答えられませんでした。「献立」と送ると今日の献立を提案します🍽️";
  } catch (err) {
    console.error("[LINE] AI reply generation failed:", err);
    return "申し訳ありません、少し混み合っています。「献立」と送ると今日の献立を提案します🍽️";
  }
}

// ─── Webhook event handler ────────────────────────────────────────────────────

export async function handleLineWebhookEvent(event: any) {
  const { type, source, replyToken } = event;
  const lineUserId: string = source?.userId;

  if (!lineUserId) return;

  if (type === "follow") {
    // ユーザーが友達追加したとき
    const profile = await getLineUserProfile(lineUserId);
    const db = await getDb();
    if (db) {
      const existing = await getLineUserByLineId(lineUserId);
      if (!existing) {
        console.log(`[LINE] New follower: ${lineUserId}`);
      } else {
        await db.update(lineUsers).set({
          displayName: profile?.displayName ?? "ユーザー",
          pictureUrl: profile?.pictureUrl ?? null,
          isActive: true,
          updatedAt: new Date(),
        }).where(eq(lineUsers.lineUserId, lineUserId));
      }
    }

    await replyLineMessage(replyToken, [
      {
        type: "text",
        text: `こんにちは、${profile?.displayName ?? "ゲスト"}さん！\n献立日和～coto coto～へようこそ🍽️\n\n毎日の献立をAIがご提案します✨\n\nまずはダッシュボードから家族構成や冷蔵庫の食材を登録してください🥕\n\n👇 ダッシュボードはこちら\nhttps://www.kondatebiyori.com`,
      },
    ]);
  } else if (type === "unfollow") {
    const db = await getDb();
    if (db) {
      await db.update(lineUsers).set({ isActive: false, updatedAt: new Date() }).where(eq(lineUsers.lineUserId, lineUserId));
    }
  } else if (type === "message" && event.message?.type === "text") {
    const text: string = event.message.text.trim();
    const lineUser = await getLineUserByLineId(lineUserId);
    const userId = lineUser?.userId ?? null;
    const displayName = lineUser?.displayName ?? "ゲスト";

    // ─── キーワードマッチング（優先） ───────────────────────────────────────
    if (text === "献立" || text === "今日の献立" || text === "献立を教えて") {
      if (!userId) {
        await replyLineMessage(replyToken, [
          {
            type: "text",
            text: `${displayName}さん、まずはアプリにログインして家族情報を登録してください🙏\n\n👇 こちらから\nhttps://www.kondatebiyori.com`,
          },
        ]);
        return;
      }

      try {
        const today = new Date().toISOString().split("T")[0];
        const result = await generateMenuPlan(userId, today);

        await replyLineMessage(replyToken, [{ type: "text", text: result.message }]);

        await insertDeliveryLog({
          userId,
          lineUserId,
          menuPlanId: result.menuPlanId ?? null,
          status: "success",
          deliveredAt: new Date(),
        });
      } catch (err) {
        console.error("[LINE] Menu generation failed:", err);
        await replyLineMessage(replyToken, [
          { type: "text", text: "申し訳ありません。献立の生成に失敗しました。しばらくしてからもう一度お試しください。" },
        ]);
      }
      return;
    }

    if (text === "ヘルプ" || text === "help") {
      await replyLineMessage(replyToken, [
        {
          type: "text",
          text: "【献立日和～coto coto～ の使い方】\n\n📋 献立 → 今日の献立を提案\n🌤️ 天気 → 天気に合った料理を提案\n🧊 冷蔵庫 → 在庫で作れる料理を提案\n\n⚙️ 設定（家族構成・冷蔵庫・店舗）はアプリから\n👇 https://www.kondatebiyori.com",
        },
      ]);
      return;
    }

    // ─── AI文脈理解型応答（その他すべての発言） ─────────────────────────────
    try {
      const reply = await generateContextualReply(text, userId, displayName);
      await replyLineMessage(replyToken, [{ type: "text", text: reply }]);
    } catch (err) {
      console.error("[LINE] Contextual reply failed:", err);
      await replyLineMessage(replyToken, [
        { type: "text", text: "「献立」と送ると今日の献立を提案します🍽️" },
      ]);
    }
  }
}

// ─── tRPC router ──────────────────────────────────────────────────────────────

export const lineRouter = router({
  getWebhookInfo: publicProcedure.query(() => {
    return {
      channelId: process.env.LINE_CHANNEL_ID ?? "",
      webhookConfigured: !!LINE_CHANNEL_SECRET,
    };
  }),
});
