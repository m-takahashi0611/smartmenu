import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import axios from "axios";
import { generateMenuForUser } from "../menu/generate";

const db = admin.firestore();

async function sendLineMessage(lineUserId: string, messages: object[]) {
  await axios.post(
    "https://api.line.me/v2/bot/message/push",
    { to: lineUserId, messages },
    { headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` } }
  );
}

export const scheduledMenuDelivery = onSchedule(
  {
    schedule: "0 7 * * *", // 毎朝7時（JST）
    timeZone: "Asia/Tokyo",
    secrets: ["LINE_CHANNEL_ACCESS_TOKEN", "OPENAI_API_KEY"],
  },
  async () => {
    const today = new Date().toISOString().split("T")[0];
    console.log(`[Scheduler] 献立配信開始: ${today}`);

    // アクティブなLINEユーザーを全取得
    const lineUsersSnap = await db
      .collection("lineUsers")
      .where("isActive", "==", true)
      .get();

    const results = { total: lineUsersSnap.size, success: 0, failed: 0, skipped: 0 };

    for (const lineUserDoc of lineUsersSnap.docs) {
      const lineUser = lineUserDoc.data();
      const uid = lineUser.uid;

      if (!uid) {
        results.skipped++;
        continue;
      }

      try {
        const result = await generateMenuForUser(uid, today);
        await sendLineMessage(lineUser.lineUserId, [{ type: "text", text: result.messageText }]);

        await db.collection("deliveryLogs").add({
          uid,
          lineUserId: lineUser.lineUserId,
          menuPlanId: result.menuPlanId ?? null,
          status: "success",
          deliveredAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 配信済みフラグを更新
        if (result.menuPlanId) {
          await db
            .collection("users")
            .doc(uid)
            .collection("menuPlans")
            .doc(result.menuPlanId)
            .update({
              isDelivered: true,
              deliveredAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }

        results.success++;
      } catch (err) {
        console.error(`[Scheduler] Failed for ${lineUser.lineUserId}:`, err);
        await db.collection("deliveryLogs").add({
          uid: uid ?? null,
          lineUserId: lineUser.lineUserId,
          menuPlanId: null,
          status: "failed",
          errorMessage: String(err),
          deliveredAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        results.failed++;
      }
    }

    console.log(`[Scheduler] 配信完了:`, results);
  }
);
