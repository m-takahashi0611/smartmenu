import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import axios from "axios";
import { generateMenuForUser } from "../menu/generate";

const db = admin.firestore();

// ─── 署名検証 ────────────────────────────────────────────────
function verifySignature(rawBody: string, signature: string): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) return false;
  const hash = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  return hash === signature;
}

// ─── LINE API ヘルパー ───────────────────────────────────────
async function replyMessage(replyToken: string, messages: object[]) {
  await axios.post(
    "https://api.line.me/v2/bot/message/reply",
    { replyToken, messages },
    { headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` } }
  );
}

async function getUserProfile(lineUserId: string) {
  try {
    const res = await axios.get(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
      headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
    });
    return res.data as { userId: string; displayName: string; pictureUrl?: string };
  } catch {
    return null;
  }
}

// ─── イベントハンドラー ──────────────────────────────────────
async function handleEvent(event: any) {
  const lineUserId: string = event.source?.userId;
  if (!lineUserId) return;

  if (event.type === "follow") {
    const profile = await getUserProfile(lineUserId);
    const lineUserRef = db.collection("lineUsers").doc(lineUserId);
    const existing = await lineUserRef.get();

    if (!existing.exists) {
      await lineUserRef.set({
        lineUserId,
        displayName: profile?.displayName ?? "ユーザー",
        pictureUrl: profile?.pictureUrl ?? null,
        isActive: true,
        followedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      await lineUserRef.update({
        isActive: true,
        displayName: profile?.displayName ?? existing.data()?.displayName,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    await replyMessage(event.replyToken, [
      {
        type: "text",
        text: `こんにちは！SmartMenuへようこそ🍽️\n\n毎日の献立をAIがご提案します。\n\n👇 まずはアプリで家族構成・冷蔵庫の食材を登録してください。\n\nhttps://smartmenu.vercel.app`,
      },
    ]);
  } else if (event.type === "unfollow") {
    await db.collection("lineUsers").doc(lineUserId).update({
      isActive: false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } else if (event.type === "message" && event.message?.type === "text") {
    const text: string = event.message.text.trim();

    if (text === "献立" || text === "今日の献立") {
      const lineUserDoc = await db.collection("lineUsers").doc(lineUserId).get();
      const uid = lineUserDoc.data()?.uid;

      if (!uid) {
        await replyMessage(event.replyToken, [
          {
            type: "text",
            text: "まずはアプリでアカウント連携をしてください。\nhttps://smartmenu.vercel.app",
          },
        ]);
        return;
      }

      try {
        const today = new Date().toISOString().split("T")[0];
        const result = await generateMenuForUser(uid, today);
        await replyMessage(event.replyToken, [{ type: "text", text: result.messageText }]);

        // 配信ログ
        await db.collection("deliveryLogs").add({
          uid,
          lineUserId,
          menuPlanId: result.menuPlanId ?? null,
          status: "success",
          deliveredAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (err) {
        console.error("[LINE] Menu generation failed:", err);
        await replyMessage(event.replyToken, [
          {
            type: "text",
            text: "申し訳ありません。献立の生成に失敗しました。しばらくしてからもう一度お試しください。",
          },
        ]);
      }
    } else if (text === "ヘルプ" || text === "help") {
      await replyMessage(event.replyToken, [
        {
          type: "text",
          text: "【SmartMenu の使い方】\n\n📋 「献立」と送ると今日の献立を提案します\n\n⚙️ 設定（家族構成・冷蔵庫・店舗）はアプリから\nhttps://smartmenu.vercel.app\n\n🛒 買い物リストも自動生成されます",
        },
      ]);
    }
  }
}

// ─── Cloud Functions エントリーポイント ──────────────────────
export const lineWebhook = onRequest(
  { secrets: ["LINE_CHANNEL_SECRET", "LINE_CHANNEL_ACCESS_TOKEN"], invoker: "public" },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const signature = req.headers["x-line-signature"] as string;
    const rawBody = JSON.stringify(req.body);

    if (!verifySignature(rawBody, signature)) {
      console.warn("[LINE] Invalid signature");
      res.status(401).json({ error: "Invalid signature" });
      return;
    }

    const events = req.body.events ?? [];
    // 非同期処理（LINEは素早くレスポンスを返す必要がある）
    Promise.all(events.map((e: any) => handleEvent(e))).catch((err) =>
      console.error("[LINE] Event processing error:", err)
    );

    res.status(200).json({ status: "ok" });
  }
);
