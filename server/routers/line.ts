import * as crypto from "crypto";
import * as https from "https";
import { z } from "zod";
import { getLineUserByLineId, getDb, insertDeliveryLog } from "../db";
import { lineUsers } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { generateMenuPlan } from "./menu";
import { publicProcedure, router } from "../_core/trpc";

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

// ─── Webhook event handler ────────────────────────────────────────────────────

export async function handleLineWebhookEvent(event: any) {
  const { type, source, replyToken } = event;
  const lineUserId: string = source?.userId;

  if (!lineUserId) return;

  if (type === "follow") {
    // ユーザーが友達追加したとき
    const profile = await getLineUserProfile(lineUserId);
    // LINE ユーザーを DB に保存（userId は後でアプリログイン時に紐付け）
    const db = await getDb();
    if (db) {
      const existing = await getLineUserByLineId(lineUserId);
      if (!existing) {
        // 未登録の場合は仮ユーザーとして保存（userId=0 は未紐付けを示す）
        // 実際のユーザー紐付けはアプリログイン時に行う
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
    // ブロックされたとき
    const db = await getDb();
    if (db) {
      await db.update(lineUsers).set({ isActive: false, updatedAt: new Date() }).where(eq(lineUsers.lineUserId, lineUserId));
    }
  } else if (type === "message" && event.message?.type === "text") {
    const text: string = event.message.text.trim();

    if (text === "献立" || text === "今日の献立") {
      // 手動で献立を要求
      const lineUser = await getLineUserByLineId(lineUserId);
      if (!lineUser?.userId) {
        await replyLineMessage(replyToken, [
          {
            type: "text",
            text: "まずはアプリで家族情報を登録してください。",
          },
        ]);
        return;
      }

      try {
        const today = new Date().toISOString().split("T")[0];
        const result = await generateMenuPlan(lineUser.userId, today);

        await replyLineMessage(replyToken, [
          {
            type: "text",
            text: result.message,
          },
        ]);

        await insertDeliveryLog({
          userId: lineUser.userId,
          lineUserId,
          menuPlanId: result.menuPlanId ?? null,
          status: "success",
          deliveredAt: new Date(),
        });
      } catch (err) {
        console.error("[LINE] Menu generation failed:", err);
        await replyLineMessage(replyToken, [
          {
            type: "text",
            text: "申し訳ありません。献立の生成に失敗しました。しばらくしてからもう一度お試しください。",
          },
        ]);
      }
    } else if (text === "ヘルプ" || text === "help") {
      await replyLineMessage(replyToken, [
        {
          type: "text",
          text: "【献立日和～coto coto～ の使い方】\n\n📋 「献立」と送ると今日の献立を提案します\n\n⚙️ 設定（家族構成・冷蔵庫・店舗）はアプリから行えます\n\n🛒 買い物リストも自動生成されます",
        },
      ]);
    }
  }
}

// ─── tRPC router (webhook endpoint is handled in Express directly) ─────────────

export const lineRouter = router({
  // LINE Webhook は Express ルートで直接処理するため tRPC は使わない
  // ここでは LINE 関連の設定取得のみ公開
  getWebhookInfo: publicProcedure.query(() => {
    return {
      channelId: process.env.LINE_CHANNEL_ID ?? "",
      webhookConfigured: !!LINE_CHANNEL_SECRET,
    };
  }),
});
