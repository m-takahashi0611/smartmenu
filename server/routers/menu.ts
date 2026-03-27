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

  // 冷蔵庫在庫を取得
  const fridgeItemList = await getFridgeItems(userId);

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

  // プロンプト構築
  const familyDesc =
    familyMemberList.length > 0
      ? familyMemberList
          .map(
            (m) =>
              `${m.name}（${m.ageGroup}、${m.gender ?? ""}、アレルギー：${m.allergies ?? "なし"}、嗜好：${m.preferences ?? "なし"}、食事量：${m.portionSize}）`
          )
          .join("\n")
      : "家族情報未登録";

  const fridgeDesc =
    fridgeItemList.length > 0
      ? fridgeItemList
          .map(
            (f) =>
              `${f.name}（${f.quantity ?? ""}、期限：${f.expiryDate ?? "不明"}）`
          )
          .join("、")
      : "在庫情報なし";

  const storeDesc =
    storeList.length > 0
      ? storeList.map((s) => s.name).join("、")
      : "店舗未登録";

  const recentDesc = recentDishes || "なし";

  const systemPrompt = `あなたは日本の主婦向け献立提案AIアシスタントです。
家族の情報、冷蔵庫の在庫、近隣スーパーの情報を考慮して、
バランスの良い献立を提案してください。

以下のJSON形式で返答してください：
{
  "breakfast": "朝食メニュー名",
  "lunch": "昼食メニュー名",
  "dinner": "夕食メニュー名",
  "dinnerRecipe": "夕食の簡単なレシピ（2-3行）",
  "shoppingList": ["買い物リスト項目1", "買い物リスト項目2"],
  "tips": "今日の献立のポイント（1-2行）",
  "estimatedCost": 1500
}`;

  const userPrompt = `【家族構成】
${familyDesc}

【冷蔵庫の在庫】
${fridgeDesc}

【よく利用するスーパー】
${storeDesc}

【最近の献立（重複を避けてください）】
${recentDesc}

【日付】
${planDate}

上記の情報を踏まえて、今日の献立を提案してください。
冷蔵庫の食材をできるだけ使い切るよう工夫してください。`;

  let menuData: {
    breakfast: string;
    lunch: string;
    dinner: string;
    dinnerRecipe: string;
    shoppingList: string[];
    tips: string;
    estimatedCost: number;
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
            },
            required: [
              "breakfast",
              "lunch",
              "dinner",
              "dinnerRecipe",
              "shoppingList",
              "tips",
              "estimatedCost",
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
  const messageText = `🍽️ ${planDate} の献立

🌅 朝食：${menuData.breakfast}
☀️ 昼食：${menuData.lunch}
🌙 夕食：${menuData.dinner}

📝 夕食レシピ：
${menuData.dinnerRecipe}

💡 ${menuData.tips}

🛒 買い物リスト：
${menuData.shoppingList.map((item) => `・${item}`).join("\n")}

💰 目安費用：約${menuData.estimatedCost.toLocaleString()}円`;

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
