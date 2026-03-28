import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import OpenAI from "openai";

const db = admin.firestore();

// ─── OpenAI クライアント ─────────────────────────────────────
function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  return new OpenAI({ apiKey });
}

// ─── 献立生成コアロジック ────────────────────────────────────
export async function generateMenuForUser(
  uid: string,
  planDate: string
): Promise<{ messageText: string; menuPlanId: string | null }> {
  // 既存プランがあれば返す
  const existing = await db
    .collection("users")
    .doc(uid)
    .collection("menuPlans")
    .where("planDate", "==", planDate)
    .limit(1)
    .get();

  if (!existing.empty) {
    const doc = existing.docs[0];
    return { messageText: doc.data().messageText, menuPlanId: doc.id };
  }

  // 家族情報・冷蔵庫・店舗を取得
  const [profileSnap, membersSnap, fridgeSnap, storesSnap, recentSnap] = await Promise.all([
    db.collection("users").doc(uid).collection("familyProfile").doc("profile").get(),
    db.collection("users").doc(uid).collection("familyMembers").get(),
    db.collection("users").doc(uid).collection("fridgeItems").get(),
    db.collection("users").doc(uid).collection("stores").get(),
    db.collection("users").doc(uid).collection("menuPlans")
      .orderBy("planDate", "desc").limit(7).get(),
  ]);

  const profile = profileSnap.data();
  const members = membersSnap.docs.map((d) => d.data());
  const fridgeItems = fridgeSnap.docs.map((d) => d.data().name);
  const stores = storesSnap.docs.map((d) => d.data());
  const recentMenus = recentSnap.docs.map((d) => `${d.data().planDate}: ${d.data().dinner}`);

  // アレルギー・嗜好を集約
  const allAllergies = [...new Set(members.flatMap((m: any) => m.allergies ?? []))];
  const allDislikes = [...new Set(members.flatMap((m: any) => m.dislikes ?? []))];
  const mainStore = stores.find((s: any) => s.isMain);

  const prompt = `あなたは家庭料理の専門家です。以下の条件で今日（${planDate}）の献立を提案してください。

【家族構成】
大人${profile?.adults ?? 2}人、子供${profile?.children ?? 0}人
${members.map((m: any) => `・${m.name}（${m.age ?? "?"}歳）`).join("\n")}

【アレルギー・禁忌】
${allAllergies.length > 0 ? allAllergies.join("、") : "なし"}

【苦手な食材】
${allDislikes.length > 0 ? allDislikes.join("、") : "なし"}

【冷蔵庫の食材】（できるだけ使ってください）
${fridgeItems.length > 0 ? fridgeItems.join("、") : "特になし"}

【近くのスーパー・特売情報】
${mainStore ? `${mainStore.name}: ${mainStore.saleInfo ?? "特売情報なし"}` : "登録なし"}

【1日の予算目安】
${profile?.budgetPerDay ? `${profile.budgetPerDay.toLocaleString()}円` : "1,500円"}

【最近の献立】（重複を避けてください）
${recentMenus.length > 0 ? recentMenus.join("\n") : "なし"}

以下のJSON形式で回答してください：
{
  "breakfast": "朝食メニュー名",
  "lunch": "昼食メニュー名",
  "dinner": "夕食メニュー名",
  "dinnerRecipe": "夕食の簡単な作り方（2〜3文）",
  "shoppingList": ["買い物が必要な食材1", "食材2"],
  "tips": "今日の料理のポイントや節約アドバイス（1文）",
  "estimatedCost": 1200
}`;

  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "あなたは家庭料理の専門家です。必ずJSONのみで回答してください。" },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.8,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned empty response");

  const menuData = JSON.parse(content);

  // LINEメッセージ本文を生成
  const messageText = `🍽️ ${planDate} の献立

🌅 朝食：${menuData.breakfast}
☀️ 昼食：${menuData.lunch}
🌙 夕食：${menuData.dinner}

📖 夕食の作り方：
${menuData.dinnerRecipe}

💡 ${menuData.tips}

🛒 買い物リスト：
${menuData.shoppingList.map((item: string) => `・${item}`).join("\n")}

💰 目安費用：約${menuData.estimatedCost.toLocaleString()}円`;

  // Firestoreに保存
  const planRef = await db.collection("users").doc(uid).collection("menuPlans").add({
    uid,
    planDate,
    ...menuData,
    messageText,
    isDelivered: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // 買い物リストも保存
  if (menuData.shoppingList.length > 0) {
    const batch = db.batch();
    menuData.shoppingList.forEach((name: string) => {
      const ref = db.collection("users").doc(uid).collection("shoppingItems").doc();
      batch.set(ref, {
        uid,
        menuPlanId: planRef.id,
        listDate: planDate,
        name,
        isChecked: false,
        addedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
  }

  return { messageText, menuPlanId: planRef.id };
}

// ─── Callable Function（LIFF から呼び出し） ──────────────────
export const generateMenu = onCall(
  { secrets: ["OPENAI_API_KEY"] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "ログインが必要です");
    const uid = request.auth.uid;
    const planDate = (request.data.date as string) ?? new Date().toISOString().split("T")[0];
    return generateMenuForUser(uid, planDate);
  }
);

export const getMenuHistory = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "ログインが必要です");
  const uid = request.auth.uid;
  const limit = (request.data.limit as number) ?? 14;

  const snap = await db
    .collection("users")
    .doc(uid)
    .collection("menuPlans")
    .orderBy("planDate", "desc")
    .limit(limit)
    .get();

  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
});
