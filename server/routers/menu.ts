import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getFamilyMembers,
  getFamilyProfile,
  getFridgeItems,
  getMenuPlanByDate,
  getRecentMenuPlans,
  getStores,
  insertDeliveryLog,
  insertMenuPlan,
  insertShoppingListItems,
  markMenuPlanDelivered,
} from "../db";
import { invokeLLM } from "../_core/llm";
import { protectedProcedure, router } from "../_core/trpc";
import { sendLineMessage } from "./line";
import { getLineUserByUserId } from "../db";
import { getWeatherInfo, formatWeatherForPrompt } from "../weather";

// ─── 献立生成コア関数 ─────────────────────────────────────────────────────────

export async function generateMenuPlan(
  userId: number,
  planDate: string
): Promise<{ message: string; menuPlanId?: number }> {
  // 既存の献立があればそれを返す
  const existing = await getMenuPlanByDate(userId, planDate);
  if (existing) {
    return {
      message: existing.messageText ?? "本日の献立は既に生成されています。",
      menuPlanId: existing.id,
    };
  }

  // 家族情報を取得
  const familyProfile = await getFamilyProfile(userId);
  const familyMemberList = familyProfile
    ? await getFamilyMembers(familyProfile.id)
    : [];

  // 冷蔵庫在庫を取得（期限切れ間近のものを優先）
  const fridgeItemList = await getFridgeItems(userId);
  const today = new Date(planDate);
  const soonExpiry = fridgeItemList.filter((f) => {
    if (!f.expiryDate) return false;
    const expiry = new Date(f.expiryDate);
    const diff = (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    return diff <= 3; // 3日以内に期限切れ
  });

  // 登録店舗を取得
  const storeList = await getStores(userId);

  // 過去の献立を取得（重複回避用）
  const recentPlans = await getRecentMenuPlans(userId, 7);
  const recentDishes = recentPlans
    .flatMap((p) => {
      try {
        const data = typeof p.menuData === "string" ? JSON.parse(p.menuData) : p.menuData;
        return [data?.breakfast, data?.lunch, data?.dinner].filter(Boolean);
      } catch {
        return [];
      }
    })
    .join("、");

  // 天気情報を取得（東京をデフォルト、将来的にユーザー地域を使用）
  const weather = await getWeatherInfo(35.68, 139.69, planDate);
  const weatherDesc = formatWeatherForPrompt(weather);

  // ─── プロンプト構築 ───────────────────────────────────────────────────────

  // 家族構成の詳細説明
  const familyDesc =
    familyMemberList.length > 0
      ? familyMemberList
          .map(
            (m) =>
              `・${m.name}（${m.ageGroup === "baby" ? "乳幼児" : m.ageGroup === "child" ? "子ども" : m.ageGroup === "teen" ? "10代" : m.ageGroup === "adult" ? "大人" : "高齢者"}、${m.gender === "male" ? "男性" : m.gender === "female" ? "女性" : ""}、アレルギー：${m.allergies ?? "なし"}、好み：${m.preferences ?? "特になし"}、食事量：${m.portionSize === "small" ? "少なめ" : m.portionSize === "large" ? "多め" : "普通"}）`
          )
          .join("\n")
      : "家族情報未登録（一般的な4人家族を想定）";

  // アレルギー情報を抽出（重要なので別途強調）
  const allergyList = familyMemberList
    .filter((m) => m.allergies && m.allergies.trim() !== "" && m.allergies !== "なし")
    .map((m) => `${m.name}：${m.allergies}`)
    .join("、");

  // 冷蔵庫在庫の説明（期限切れ間近を強調）
  const fridgeDesc =
    fridgeItemList.length > 0
      ? fridgeItemList
          .map((f) => {
            const isUrgent = soonExpiry.some((s) => s.id === f.id);
            return `${isUrgent ? "⚠️【要使用】" : ""}${f.name}（${f.quantity ?? "適量"}、期限：${f.expiryDate ?? "不明"}）`;
          })
          .join("、")
      : "在庫情報なし";

  const storeDesc =
    storeList.length > 0
      ? storeList.map((s) => `${s.name}${s.saleInfo ? `（特売：${s.saleInfo}）` : ""}`).join("、")
      : "店舗未登録";

  const recentDesc = recentDishes || "なし";

  // 季節・天気に合った料理の方向性
  const weatherGuidance = weather
    ? `${weather.season}らしい料理を意識し、${weather.weatherCode >= 61 ? "雨の日なので温かい料理" : weather.temperatureMax >= 28 ? "暑い日なので冷たい料理や食欲増進メニュー" : weather.temperatureMax <= 10 ? "寒い日なので体を温める料理" : "季節感のある料理"}を取り入れてください。`
    : "";

  const systemPrompt = `あなたは日本の主婦向け献立提案AIアシスタント「エプロン執事」です。
家族の情報、冷蔵庫の在庫、季節・天気、近隣スーパーの情報を考慮して、
バランスの良い日本の家庭料理を提案してください。

【重要ルール】
1. アレルギー食材は絶対に使用しないこと
2. ⚠️【要使用】マークの食材は必ず今日の献立に使うこと
3. 冷蔵庫にある食材をできるだけ使い切ること
4. 同じ料理を7日間繰り返さないこと
5. 季節・天気に合った料理を提案すること
6. 家族構成（年齢・食事量）に合った量と内容にすること

以下のJSON形式で返答してください：
{
  "breakfast": "朝食メニュー名",
  "lunch": "昼食メニュー名",
  "dinner": "夕食メニュー名",
  "dinnerRecipe": "夕食の簡単なレシピ（材料と手順を3-4行で）",
  "shoppingList": ["買い物リスト項目1（分量付き）", "買い物リスト項目2（分量付き）"],
  "tips": "今日の献立のポイント・季節のひとこと（1-2行）",
  "estimatedCost": 1500,
  "usedFridgeItems": ["使用した冷蔵庫の食材1", "使用した冷蔵庫の食材2"]
}`;

  const userPrompt = `【日付・季節・天気】
${planDate}（${weatherDesc}）
${weatherGuidance}

【家族構成】
${familyDesc}

${allergyList ? `【⚠️ アレルギー情報（絶対使用禁止）】\n${allergyList}\n` : ""}
【冷蔵庫の在庫】
${fridgeDesc}

【よく利用するスーパー】
${storeDesc}

【最近7日間の献立（重複を避けてください）】
${recentDesc}

上記の情報を踏まえて、今日の献立を提案してください。
特に⚠️【要使用】の食材は必ず今日の献立に組み込んでください。`;

  let menuData: {
    breakfast: string;
    lunch: string;
    dinner: string;
    dinnerRecipe: string;
    shoppingList: string[];
    tips: string;
    estimatedCost: number;
    usedFridgeItems: string[];
  };

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "menu_plan",
          strict: true,
          schema: {
            type: "object",
            properties: {
              breakfast: { type: "string" },
              lunch: { type: "string" },
              dinner: { type: "string" },
              dinnerRecipe: { type: "string" },
              shoppingList: { type: "array", items: { type: "string" } },
              tips: { type: "string" },
              estimatedCost: { type: "integer" },
              usedFridgeItems: { type: "array", items: { type: "string" } },
            },
            required: [
              "breakfast",
              "lunch",
              "dinner",
              "dinnerRecipe",
              "shoppingList",
              "tips",
              "estimatedCost",
              "usedFridgeItems",
            ],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    menuData = typeof content === "string" ? JSON.parse(content) : content;
  } catch (err) {
    console.error("[Menu] LLM generation failed:", err);
    throw new Error("献立の生成に失敗しました");
  }

  // LINEメッセージテキストを構築
  const weatherEmoji = weather
    ? weather.weatherCode === 0 ? "☀️"
      : weather.weatherCode <= 3 ? "🌤️"
      : weather.weatherCode <= 69 ? "🌧️"
      : weather.weatherCode <= 79 ? "❄️"
      : "⛈️"
    : "🌡️";

  const messageText = `🍽️ ${planDate} の献立

${weatherEmoji} 今日の天気：${weatherDesc}

🌅 朝食：${menuData.breakfast}
☀️ 昼食：${menuData.lunch}
🌙 夕食：${menuData.dinner}

📝 夕食レシピ：
${menuData.dinnerRecipe}

💡 ${menuData.tips}

🛒 買い物リスト：
${menuData.shoppingList.map((item) => `・${item}`).join("\n")}

${menuData.usedFridgeItems.length > 0 ? `🧊 冷蔵庫から使用：${menuData.usedFridgeItems.join("、")}\n\n` : ""}💰 目安費用：約${menuData.estimatedCost.toLocaleString()}円`;

  // DBに保存
  await insertMenuPlan({
    userId,
    planDate: planDate as any,
    menuData: JSON.stringify(menuData),
    messageText,
    isDelivered: false,
  });

  // 保存した献立を取得してIDを返す
  const saved = await getMenuPlanByDate(userId, planDate);

  // 買い物リストも保存
  if (menuData.shoppingList.length > 0 && saved) {
    await insertShoppingListItems(
      menuData.shoppingList.map((item) => ({
        userId,
        menuPlanId: saved.id,
        listDate: planDate as any,
        name: item,
        isChecked: false,
      }))
    );
  }

  return { message: messageText, menuPlanId: saved?.id };
}

// ─── tRPC router ──────────────────────────────────────────────────────────────

export const menuRouter = router({
  // 今日の献立を生成・取得
  getOrGenerate: protectedProcedure
    .input(z.object({ date: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const today =
        input.date ?? new Date().toISOString().split("T")[0];
      const result = await generateMenuPlan(ctx.user.id, today);
      return result;
    }),

  // 過去の献立一覧
  list: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(30).default(7) }))
    .query(async ({ ctx, input }) => {
      const plans = await getRecentMenuPlans(ctx.user.id, input.limit);
      return plans.map((p) => ({
        id: p.id,
        planDate: p.planDate,
        isDelivered: p.isDelivered,
        menuData: (() => {
          try {
            return typeof p.menuData === "string"
              ? JSON.parse(p.menuData)
              : p.menuData;
          } catch {
            return null;
          }
        })(),
        messageText: p.messageText,
      }));
    }),

  // 特定日の献立を取得
  getByDate: protectedProcedure
    .input(z.object({ date: z.string() }))
    .query(async ({ ctx, input }) => {
      const plan = await getMenuPlanByDate(ctx.user.id, input.date);
      if (!plan) return null;
      return {
        id: plan.id,
        planDate: plan.planDate,
        isDelivered: plan.isDelivered,
        menuData: (() => {
          try {
            return typeof plan.menuData === "string"
              ? JSON.parse(plan.menuData)
              : plan.menuData;
          } catch {
            return null;
          }
        })(),
        messageText: plan.messageText,
      };
    }),

  // LINEに手動送信
  sendToLine: protectedProcedure
    .input(z.object({ date: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const today =
        input.date ?? new Date().toISOString().split("T")[0];

      // 献立を生成または取得
      const { message, menuPlanId } = await generateMenuPlan(
        ctx.user.id,
        today
      );

      // LINE ユーザー情報を取得
      const lineUser = await getLineUserByUserId(ctx.user.id);
      if (!lineUser) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "LINE アカウントが連携されていません",
        });
      }

      // LINE に送信
      await sendLineMessage(lineUser.lineUserId, [
        { type: "text", text: message },
      ]);

      // 配信ログを記録
      await insertDeliveryLog({
        userId: ctx.user.id,
        lineUserId: lineUser.lineUserId,
        menuPlanId: menuPlanId ?? null,
        status: "success",
        deliveredAt: new Date(),
      });

      // 配信済みフラグを更新
      if (menuPlanId) {
        await markMenuPlanDelivered(menuPlanId);
      }

      return { success: true, message };
    }),
});
