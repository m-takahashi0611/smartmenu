import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getFamilyMembers,
  getFamilyProfile,
  getFridgeItems,
  getMenuPlanByDate,
  getRecentMenuPlans,
  getStores,
  getUserBaseTheme,
  getUserIsPremium,
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

// ─── 時間帯判定ユーティリティ ─────────────────────────────────────────────────

export type MealType = "breakfast" | "lunch" | "dinner" | "tomorrow_breakfast";

export function getMealTypeByHour(hourJST: number): MealType {
  if (hourJST >= 5 && hourJST < 11) return "breakfast";
  if (hourJST >= 11 && hourJST < 15) return "lunch";
  if (hourJST >= 15 && hourJST < 22) return "dinner";
  return "tomorrow_breakfast"; // 22時〜翌5時は翌日の朝食
}

export function getMealLabel(mealType: MealType): string {
  switch (mealType) {
    case "breakfast": return "今日の朝食";
    case "lunch": return "今日の昼食";
    case "dinner": return "今夜の夕食";
    case "tomorrow_breakfast": return "明日の朝食";
  }
}

// ─── 献立生成コア関数 ─────────────────────────────────────────────────────────

export async function generateMenuPlan(
  userId: number,
  planDate: string,
  mealType?: MealType,
  willShop?: boolean,
  theme?: string,
  forceRegenerate?: boolean
): Promise<{ message: string; menuPlanId?: number; shoppingList?: string[]; options?: Array<{ name: string; mainIngredients: string[]; usedFridgeItems: string[] }> }> {

  // 時間帯を決定（引数がなければ現在時刻から判定）
  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const currentHour = nowJST.getUTCHours();
  const resolvedMealType: MealType = mealType ?? getMealTypeByHour(currentHour);
  const mealLabel = getMealLabel(resolvedMealType);

  // 課金状態とベーステーマを取得
  const [isPremium, baseTheme] = await Promise.all([
    getUserIsPremium(userId),
    getUserBaseTheme(userId),
  ]);

  // 既存の献立があればそれを返す（同じ日・同じ食事タイプ）—forceRegenerate時はスキップ
  if (!forceRegenerate) {
    const existing = await getMenuPlanByDate(userId, planDate);
    if (existing) {
      const existingData = (() => {
        try {
          return typeof existing.menuData === 'string' ? JSON.parse(existing.menuData) : existing.menuData;
        } catch { return null; }
      })();
      // 同じ食事タイプのデータがあればそのまま返す
      if (existingData?.mealType === resolvedMealType) {
        return {
          message: existing.messageText ?? "本日の献立は既に生成されています。",
          menuPlanId: existing.id,
          shoppingList: existingData?.shoppingList ?? [],
        };
      }
    }
  }

  // 家族情報を取得
  const familyProfile = await getFamilyProfile(userId);
  const familyMemberList = familyProfile
    ? await getFamilyMembers(familyProfile.id)
    : [];

  // 冷蔵庫在庫を取得
  const fridgeItemList = await getFridgeItems(userId);
  const today = new Date(planDate);
  const soonExpiry = fridgeItemList.filter((f) => {
    if (!f.expiryDate) return false;
    const expiry = new Date(f.expiryDate);
    const diff = (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    return diff <= 3;
  });

  // 過去の献立を取得（重複回避用）
  const recentPlans = await getRecentMenuPlans(userId, 7);
  const recentDishes = recentPlans
    .flatMap((p) => {
      try {
        const data = typeof p.menuData === "string" ? JSON.parse(p.menuData) : p.menuData;
        // 新形式（dinnerOptions）と旧形式（dinner）の両方に対応
        if (data?.dinnerOptions) return data.dinnerOptions.map((o: any) => o.name);
        return [data?.breakfast, data?.lunch, data?.dinner].filter(Boolean);
      } catch {
        return [];
      }
    })
    .join("、");

  // 天気情報を取得
  const weather = await getWeatherInfo(35.68, 139.69, planDate);
  const weatherDesc = formatWeatherForPrompt(weather);

  // ベーステーマの説明（課金ユーザーのみ有効）
  const baseThemeDesc = isPremium && baseTheme ? (() => {
    const parts: string[] = [];
    const healthMap: Record<string, string> = {
      diet: 'ダイエット重視（低カロリー・脂質控えめ）',
      muscle: '筋トレ・高タンパク重視',
      low_salt: '塩分控えめ',
      low_sugar: '糖質制限',
      gut: '腸活・発酵食品重視',
    };
    const lifestageMap: Record<string, string> = {
      baby_food: '離乳食対応（乳幼児がいる）',
      toddler: '幼児食対応',
      teen: 'ティーン（中高生）対応（成長期の高カロリー・高タンパク質・部活対応）',
      exam: '受験生応援（集中力・栄養バランス重視）',
      senior: 'シニア向け（やわらかく消化しやすい）',
    };
    const economyMap: Record<string, string> = {
      budget: '節約重視（コスパ優先）',
      month_end: '月末節約モード（特に安い食材で）',
      batch_cook: '作り置き対応（まとめて調理できる）',
    };
    const styleMap: Record<string, string> = {
      quick: '時短料理（30分以内）',
      elaborate: '本格・こだわり料理',
    };
    // healthThemes: カンマ区切り複数選択
    if (baseTheme.healthThemes) {
      baseTheme.healthThemes.split(',').filter(Boolean).forEach(t => { if (healthMap[t]) parts.push(healthMap[t]); });
    }
    // lifestageThemes: カンマ区切り複数選択
    if (baseTheme.lifestageThemes) {
      baseTheme.lifestageThemes.split(',').filter(Boolean).forEach(t => { if (lifestageMap[t]) parts.push(lifestageMap[t]); });
    }
    const dishCountMap: Record<string, string> = {
      ichiju_issai: '一汁一菜構成（汁物＋主菜のシンプル構成）',
      ichiju_nisai: '一汁二菜構成（汁物＋主菜＋副菜1品）',
      ichiju_sansai: '一汁三菜構成（汁物＋主菜＋副菜2品）',
      ichiju_yonsai: '一汁四菜以上の豪華な構成（汁物＋主菜＋副菜3品以上）',
    };
    if (baseTheme.economyTheme && economyMap[baseTheme.economyTheme]) parts.push(economyMap[baseTheme.economyTheme]);
    if (baseTheme.styleTheme && styleMap[baseTheme.styleTheme]) parts.push(styleMap[baseTheme.styleTheme]);
    if ((baseTheme as any).dishCountTheme && dishCountMap[(baseTheme as any).dishCountTheme]) parts.push(dishCountMap[(baseTheme as any).dishCountTheme]);
    return parts.length > 0 ? parts.join('、') : null;
  })() : null;

  // 課金ユーザー向けプロンプト強化フラグ
  const dishCountTheme = (baseTheme as any)?.dishCountTheme;
  const dishCountInstruction = isPremium && dishCountTheme ? (() => {
    const dishCountRuleMap: Record<string, string> = {
      ichiju_issai: '【食卓構成】一汁一菜（汁物1品＋主菜1品）で提案すること。副菜は不要。',
      ichiju_nisai: '【食卓構成】一汁二菜（汁物1品＋主菜1品＋副菜1品）で提案すること。各案に必ず汁物・主菜・副菜を含めること。',
      ichiju_sansai: '【食卓構成】一汁三菜（汁物1品＋主菜1品＋副菜2品）で提案すること。各案に必ず汁物・主菜・副菜2品を含めること。料理名は「主菜：〇〇、副菜：〇〇・〇〇、汁物：〇〇」の形式で返すこと。',
      ichiju_yonsai: '【食卓構成】一汁四菜以上（汁物1品＋主菜1品＋副菜3品以上）の豪華な構成で提案すること。各案に必ず汁物・主菜・副菜3品以上を含めること。',
    };
    return dishCountRuleMap[dishCountTheme] ?? null;
  })() : null;

  const premiumPromptExtra = isPremium
    ? `\n【プレミアム機能】栄養バランス（タンパク質・野菜・炭水化物）を考慮し、より詳細で質の高い提案を行うこと。${dishCountInstruction ? `\n${dishCountInstruction}` : ''}`
    : '';

  // 買い物・自炊プロフィール
  const shoppingFreq = familyProfile?.shoppingFrequency ?? 2;
  const cookingFreq = familyProfile?.cookingFrequency ?? 5;
  const shoppingProfileDesc = `週${shoppingFreq}回買い物、週${cookingFreq}回自炊`;
  // 買い物予定の説明（ユーザーがヒアリングで回答した場合に反映）
  const shoppingAvailabilityDesc = willShop === true
    ? '今日（または明日）買い物に行く予定あり→不足食材を買い足せる前提で提案可能'
    : willShop === false
    ? '買い物に行かない→必ず冷蔵庫の在庫食材のみで作れる献立を提案すること'
    : null;

  // 家族構成の説明
  const familyDesc =
    familyMemberList.length > 0
      ? familyMemberList
          .map(
            (m) =>
              `・${m.name}（${m.ageGroup === "baby" ? "乳幼児" : m.ageGroup === "child" ? "子ども" : m.ageGroup === "teen" ? "10代" : m.ageGroup === "adult" ? "大人" : "高齢者"}、${m.gender === "male" ? "男性" : m.gender === "female" ? "女性" : ""}、アレルギー：${m.allergies ?? "なし"}）`
          )
          .join("\n")
      : "家族情報未登録（一般的な4人家族を想定）";

  const allergyList = familyMemberList
    .filter((m) => m.allergies && m.allergies.trim() !== "" && m.allergies !== "なし")
    .map((m) => `${m.name}：${m.allergies}`)
    .join("、");

  // 冷蔵庫在庫の説明
  const fridgeDesc =
    fridgeItemList.length > 0
      ? fridgeItemList
          .map((f) => {
            const isUrgent = soonExpiry.some((s) => s.id === f.id);
            return `${isUrgent ? "⚠️【要使用】" : ""}${f.name}（${f.quantity ?? "適量"}）`;
          })
          .join("、")
      : "在庫情報なし";

  const recentDesc = recentDishes || "なし";

  // ─── 食事タイプ別プロンプト ───────────────────────────────────────────────

  let systemPrompt: string;
  let userPrompt: string;
  let responseSchema: any;

  if (resolvedMealType === "dinner" || resolvedMealType === "tomorrow_breakfast") {
    // 夕食・翌日朝食：3案提案
    const targetMeal = resolvedMealType === "dinner" ? "夕食" : "明日の朝食";

    systemPrompt = `あなたは日本の主婦向け献立提案AIアシスタントです。
冷蔵庫の食材を活かした${targetMeal}を3案提案してください。${premiumPromptExtra}

【重要ルール】
1. アレルギー食材は絶対に使用しないこと
2. ⚠️【要使用】マークの食材は必ずいずれかの案に使うこと
3. 冷蔵庫にある食材をできるだけ使い切ること
4. 同じ料理を7日間繰り返さないこと
5. 家族構成（年齢・食事量）に合った内容にすること
6. 各案は料理名と主な使用食材のみ（レシピは不要）

以下のJSON形式で返答してください：
{
  "options": [
    {"name": "料理名1", "mainIngredients": ["食材A", "食材B"], "usedFridgeItems": ["冷蔵庫食材"]},
    {"name": "料理名2", "mainIngredients": ["食材C", "食材D"], "usedFridgeItems": ["冷蔵庫食材"]},
    {"name": "料理名3", "mainIngredients": ["食材E", "食材F"], "usedFridgeItems": ["冷蔵庫食材"]}
  ],
  "shoppingList": ["不足食材1（分量）", "不足食材2（分量）"]
}`;

    userPrompt = `【日付・天気】${planDate}（${weatherDesc}）
【家族構成】${familyDesc}
【買い物・自炊プロフィール】${shoppingProfileDesc}
${shoppingAvailabilityDesc ? `【買い物予定】${shoppingAvailabilityDesc}\n` : ""}
${baseThemeDesc ? `【ベーステーマ（日常の方針・常時適用）】${baseThemeDesc}→この方針を全ての案に反映すること\n` : ""}
${theme ? `【今日のテーマ・気分（今回のみ優先）】${theme}→ベーステーマより優先してこのテーマに合った料理を提案すること\n` : ""}
${allergyList ? `【⚠️アレルギー（絶対使用禁止）】${allergyList}\n` : ""}【冷蔵庫の食材】${fridgeDesc}
【最近の献立（重複を避けて）】${recentDesc}

冷蔵庫の食材を活かした${targetMeal}を3案提案してください。`;

    responseSchema = {
      type: "json_schema",
      json_schema: {
        name: "dinner_options",
        strict: true,
        schema: {
          type: "object",
          properties: {
            options: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  mainIngredients: { type: "array", items: { type: "string" } },
                  usedFridgeItems: { type: "array", items: { type: "string" } },
                },
                required: ["name", "mainIngredients", "usedFridgeItems"],
                additionalProperties: false,
              },
            },
            shoppingList: { type: "array", items: { type: "string" } },
          },
          required: ["options", "shoppingList"],
          additionalProperties: false,
        },
      },
    };

  } else {
    // 朝食・昼食：1案提案
    const targetMeal = resolvedMealType === "breakfast" ? "朝食" : "昼食";

    systemPrompt = `あなたは日本の主婦向け献立提案AIアシスタントです。
冷蔵庫の食材を活かした${targetMeal}を1案提案してください。${premiumPromptExtra}

【重要ルール】
1. アレルギー食材は絶対に使用しないこと
2. 冷蔵庫にある食材をできるだけ使うこと
3. 家族構成に合った内容にすること
4. 料理名と主な使用食材のみ（レシピは不要）

以下のJSON形式で返答してください：
{
  "name": "料理名",
  "mainIngredients": ["食材A", "食材B"],
  "usedFridgeItems": ["冷蔵庫食材"],
  "shoppingList": ["不足食材1（分量）"]
}`;

    userPrompt = `【日付・天気】${planDate}（${weatherDesc}）
【家族構成】${familyDesc}
【買い物・自炊プロフィール】${shoppingProfileDesc}
${shoppingAvailabilityDesc ? `【買い物予定】${shoppingAvailabilityDesc}\n` : ""}
${baseThemeDesc ? `【ベーステーマ（日常の方針・常時適用）】${baseThemeDesc}→この方針を反映すること\n` : ""}
${theme ? `【今日のテーマ・気分（今回のみ優先）】${theme}→ベーステーマより優先してこのテーマに合った料理を提案すること\n` : ""}
${allergyList ? `【⚠️アレルギー（絶対使用禁止）】${allergyList}\n` : ""}【冷蔵庫の食材】${fridgeDesc}

冷蔵庫の食材を活かした${targetMeal}を1案提案してください。`;

    responseSchema = {
      type: "json_schema",
      json_schema: {
        name: "single_meal",
        strict: true,
        schema: {
          type: "object",
          properties: {
            name: { type: "string" },
            mainIngredients: { type: "array", items: { type: "string" } },
            usedFridgeItems: { type: "array", items: { type: "string" } },
            shoppingList: { type: "array", items: { type: "string" } },
          },
          required: ["name", "mainIngredients", "usedFridgeItems", "shoppingList"],
          additionalProperties: false,
        },
      },
    };
  }

  let menuData: any;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: responseSchema,
    });

    const content = response.choices[0]?.message?.content;
    menuData = typeof content === "string" ? JSON.parse(content) : content;
  } catch (err) {
    console.error("[Menu] LLM generation failed:", err);
    throw new Error("献立の生成に失敗しました");
  }

  // ─── LINEメッセージテキストを構築（短く・献立に集中）────────────────────────

  const weatherEmoji = weather
    ? weather.weatherCode === 0 ? "☀️"
      : weather.weatherCode <= 3 ? "🌤️"
      : weather.weatherCode <= 69 ? "🌧️"
      : weather.weatherCode <= 79 ? "❄️"
      : "⛈️"
    : "";

  let messageText: string;

  if (resolvedMealType === "dinner" || resolvedMealType === "tomorrow_breakfast") {
    const targetLabel = resolvedMealType === "dinner" ? "今夜の夕食" : "明日の朝食";
    const options = menuData.options as Array<{ name: string; mainIngredients: string[]; usedFridgeItems: string[] }>;

    const optionLines = options.map((o, i) => {
      const num = ["1️⃣", "2️⃣", "3️⃣"][i] ?? `${i + 1}.`;
      return `${num} ${o.name}`;
    }).join("\n");

    messageText = `🍽️ ${targetLabel}、こんなのはどうですか？${weatherEmoji ? ` ${weatherEmoji}` : ""}

${optionLines}

レシピは「1のレシピ教えて」と送ってください🍳
買い物リストはダッシュボードで確認できます`;

  } else {
    const targetLabel = resolvedMealType === "breakfast" ? "今日の朝食" : "今日の昼食";

    messageText = `🍽️ ${targetLabel}のご提案${weatherEmoji ? ` ${weatherEmoji}` : ""}

✨ ${menuData.name}

レシピは「レシピ教えて」と送ってください🍳
買い物リストはダッシュボードで確認できます`;
  }

  // ─── DBに保存（menuDataに食事タイプを含める）────────────────────────────────

  // ダッシュボード表示用に後方互換フィールドも含める
  const persistData = {
    mealType: resolvedMealType,
    ...(resolvedMealType === "dinner" || resolvedMealType === "tomorrow_breakfast"
      ? {
          dinnerOptions: menuData.options,
          // 後方互換: dashboardが参照するフィールド
          dinner: menuData.options?.[0]?.name ?? "",
          breakfast: "",
          lunch: "",
          shoppingList: menuData.shoppingList ?? [],
        }
      : {
          [resolvedMealType === "breakfast" ? "breakfast" : "lunch"]: menuData.name,
          breakfast: resolvedMealType === "breakfast" ? menuData.name : "",
          lunch: resolvedMealType === "lunch" ? menuData.name : "",
          dinner: "",
          shoppingList: menuData.shoppingList ?? [],
        }
    ),
  };

  await insertMenuPlan({
    userId,
    planDate: planDate as any,
    menuData: JSON.stringify(persistData),
    messageText,
    isDelivered: false,
  });

  const saved = await getMenuPlanByDate(userId, planDate);

  // ─── 買い物リストをshoppingListItemsテーブルに自動保存 ────────────────────────
  // 献立生成時に不足食材（shoppingList）をDBに保存し、「買い物リストを教えて」で正しく返答できるようにする
  const shoppingListRaw: string[] = menuData.shoppingList ?? [];
  if (shoppingListRaw.length > 0) {
    try {
      const { getDb } = await import("../db");
      const { shoppingListItems: shoppingTable } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const db = await getDb();
      if (db) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        // 既存の未チェックアイテムを取得して重複を避ける
        const existing = await db.select().from(shoppingTable)
          .where(and(eq(shoppingTable.userId, userId), eq(shoppingTable.isChecked, false)));
        const existingNames = new Set(existing.map(r => r.name));
        const newItems = shoppingListRaw
          .map(item => item.replace(/\s*\(.*?\)\s*/g, '').trim()) // 「牛乳（200ml）」→「牛乳」
          .filter(name => name && !existingNames.has(name))
          .map(name => ({
            userId,
            menuPlanId: saved?.id ?? undefined,
            name,
            quantity: null,
            isChecked: false as const,
            listDate: today as any,
          }));
        if (newItems.length > 0) {
          await db.insert(shoppingTable).values(newItems);
        }
      }
    } catch (err) {
      console.error('[menu] Failed to save shopping list to DB:', err);
    }
  }

  return {
    message: messageText,
    menuPlanId: saved?.id,
    shoppingList: menuData.shoppingList ?? [],
    options: (resolvedMealType === "dinner" || resolvedMealType === "tomorrow_breakfast")
      ? (menuData.options as Array<{ name: string; mainIngredients: string[]; usedFridgeItems: string[] }>)
      : undefined,
  };
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

      const { message, menuPlanId } = await generateMenuPlan(
        ctx.user.id,
        today
      );

      const lineUser = await getLineUserByUserId(ctx.user.id);
      if (!lineUser) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "LINE アカウントが連携されていません",
        });
      }

      await sendLineMessage(lineUser.lineUserId, [
        { type: "text", text: message },
      ]);

      await insertDeliveryLog({
        userId: ctx.user.id,
        lineUserId: lineUser.lineUserId,
        menuPlanId: menuPlanId ?? null,
        status: "success",
        deliveredAt: new Date(),
      });

      if (menuPlanId) {
        await markMenuPlanDelivered(menuPlanId);
      }

      return { success: true, message };
    }),
});
