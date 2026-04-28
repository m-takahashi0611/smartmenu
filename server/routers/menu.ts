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
  getUserIsTrial,
  insertDeliveryLog,
  insertMenuPlan,
  insertShoppingListItems,
  markMenuPlanDelivered,
  updateMenuPlanProtect,
  updateMenuPlanProtectBulk,
  upsertMenuPlanForDate,
  getMenuPlansByDateRange,
  deleteMenuPlan,
  getWeeklySpecialDays,
  upsertWeeklySpecialDay,
  deleteWeeklySpecialDay,
} from "../db";
import { menuPlans } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
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
  forceRegenerate?: boolean,
  excludeIngredients?: string[] // 週間生成時に前日までに使用した食材を除外
): Promise<{ message: string; menuPlanId?: number; shoppingList?: string[]; options?: Array<{ name: string; mainIngredients: string[]; usedFridgeItems: string[] }> }> {

  // 時間帯を決定（引数がなければ現在時刻から判定）
  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const currentHour = nowJST.getUTCHours();
  const resolvedMealType: MealType = mealType ?? getMealTypeByHour(currentHour);
  const mealLabel = getMealLabel(resolvedMealType);

  // 課金状態とベーステーマを取得
  const [isPremium, isTrial, baseTheme] = await Promise.all([
    getUserIsPremium(userId),
    getUserIsTrial(userId),
    getUserBaseTheme(userId),
  ]);
  // トライアルはシンプルモード（ベーステーマ・高精度AI無効）
  const effectiveIsPremium = isPremium && !isTrial;

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
  const baseThemeDesc = effectiveIsPremium && baseTheme ? (() => {
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
  const dishCountInstruction = effectiveIsPremium && dishCountTheme ? (() => {
    const dishCountRuleMap: Record<string, string> = {
      ichiju_issai: '【食卓構成】一汁一菜（汁物1品＋主菜1品）で提案すること。副菜は不要。',
      ichiju_nisai: '【食卓構成】一汁二菜（汁物1品＋主菜1品＋副菜1品）で提案すること。各案に必ず汁物・主菜・副菜を含めること。',
      ichiju_sansai: '【食卓構成】一汁三菜（汁物1品＋主菜1品＋副菜2品）で提案すること。各案に必ず汁物・主菜・副菜2品を含めること。料理名は「主菜：〇〇、副菜：〇〇・〇〇、汁物：〇〇」の形式で返すこと。',
      ichiju_yonsai: '【食卓構成】一汁四菜以上（汁物1品＋主菜1品＋副菜3品以上）の豪華な構成で提案すること。各案に必ず汁物・主菜・副菜3品以上を含めること。',
    };
    return dishCountRuleMap[dishCountTheme] ?? null;
  })() : null;

  const premiumPromptExtra = effectiveIsPremium
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

  // 冷蔵庫在庫の説明（週間生成時は使用済み食材を除外）
  const effectiveFridgeItems = excludeIngredients && excludeIngredients.length > 0
    ? fridgeItemList.filter(f => !excludeIngredients.some(ex => f.name.includes(ex) || ex.includes(f.name)))
    : fridgeItemList;
  const fridgeDesc =
    effectiveFridgeItems.length > 0
      ? effectiveFridgeItems
          .map((f) => {
            const isUrgent = soonExpiry.some((s) => s.id === f.id);
            return `${isUrgent ? "⚠️【要使用】" : ""}${f.name}（${f.quantity ?? "適量"}）`;
          })
          .join("、")
      : fridgeItemList.length > 0 ? "冷蔵庫の食材は前日までに使用済み。新たな食材で提案してください" : "在庫情報なし";

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
4. 同じ料理を７日間繰り返さないこと
5. 家族構成（年齢・食事量）に合った内容にすること
6. 各案は料理名と主な使用食材のみ（レシピは不要）${theme ? `
7. 【絶対厳守・最優先ルール】${theme}。このテーマに合わない案は絶対不可。全て3案ともこのテーマに従うこと。` : ''}
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
4. 料理名と主な使用食材のみ（レシピは不要）${theme ? `
5. 【絶対厳守・最優先ルール】${theme}。このスタイルに合わない料理の提案は絶対不可。` : ''}

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

レシピを見たい場合は下のボタンをタップ、または料理名で「〇〇のレシピ教えて」と送ってください🍳
買い物リストはダッシュボードで確認できます`;

  } else {
    const targetLabel = resolvedMealType === "breakfast" ? "今日の朝食" : "今日の昼食";

    messageText = `🍽️ ${targetLabel}のご提案${weatherEmoji ? ` ${weatherEmoji}` : ""}

✨ ${menuData.name}

レシピを見たい場合は「${menuData.name}のレシピ教えて」と送ってください🍳
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
      // トライアルユーザーは献立履歴不可
      const isTrial = await getUserIsTrial(ctx.user.id);
      if (isTrial) {
        throw new TRPCError({ code: "FORBIDDEN", message: "献立履歴はカード登録後にご利用いただけます" });
      }
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
        // 実食記録フィールド
        actualStatusBreakfast: p.actualStatusBreakfast,
        actualStatusLunch: p.actualStatusLunch,
        actualStatusDinner: p.actualStatusDinner,
        actualMealBreakfast: p.actualMealBreakfast,
        actualMealLunch: p.actualMealLunch,
        actualMealDinner: p.actualMealDinner,
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

  // 日付範囲の献立を取得（週ビュー用）
  getByDateRange: protectedProcedure
    .input(z.object({ startDate: z.string(), endDate: z.string() }))
    .query(async ({ ctx, input }) => {
      const plans = await getMenuPlansByDateRange(ctx.user.id, input.startDate, input.endDate);
      // 同じplanDateの複数レコード（朝・昼・夜が別々に保存されている場合）を1日1件に統合する
      const byDate = new Map<string, {
        id: number; planDate: string; isDelivered: boolean; isProtected: boolean; isEatOut: boolean;
        menuData: any; messageText: string | null;
        actualStatusBreakfast: any; actualStatusLunch: any; actualStatusDinner: any;
        actualMealBreakfast: string | null; actualMealLunch: string | null; actualMealDinner: string | null;
        ids: number[];
      }>();
      for (const p of plans) {
        const dateStr = p.planDate instanceof Date ? p.planDate.toISOString().split('T')[0] : String(p.planDate);
        const md = (() => { try { return typeof p.menuData === 'string' ? JSON.parse(p.menuData) : p.menuData; } catch { return null; } })();
        const mealType: string = md?.mealType ?? 'dinner';
        if (!byDate.has(dateStr)) {
          byDate.set(dateStr, {
            id: p.id, planDate: dateStr,
            isDelivered: p.isDelivered, isProtected: p.isProtected ?? false, isEatOut: (p as any).isEatOut ?? false,
            menuData: {}, messageText: p.messageText,
            actualStatusBreakfast: p.actualStatusBreakfast, actualStatusLunch: p.actualStatusLunch, actualStatusDinner: p.actualStatusDinner,
            actualMealBreakfast: p.actualMealBreakfast ?? null, actualMealLunch: p.actualMealLunch ?? null, actualMealDinner: p.actualMealDinner ?? null,
            ids: [],
          });
        }
        const entry = byDate.get(dateStr)!;
        entry.ids.push(p.id);
        // 食事タイプ別にmenuDataを統合
        if (mealType === 'breakfast') {
          entry.menuData.breakfast = md?.breakfast || md?.name || '';
          entry.menuData.breakfastShoppingList = md?.shoppingList ?? [];
        } else if (mealType === 'lunch') {
          entry.menuData.lunch = md?.lunch || md?.name || '';
          entry.menuData.lunchShoppingList = md?.shoppingList ?? [];
        } else if (mealType === 'dinner' || mealType === 'tomorrow_breakfast') {
          entry.menuData.dinnerOptions = md?.dinnerOptions ?? [];
          entry.menuData.dinner = md?.dinner || (md?.dinnerOptions?.[0]?.name ?? '');
          // selectedDinnerIndexを必ず含める（選択済み候補のUI表示に必要）
          entry.menuData.selectedDinnerIndex = md?.selectedDinnerIndex != null ? Number(md.selectedDinnerIndex) : null;
          entry.menuData.dinnerShoppingList = md?.shoppingList ?? [];
          entry.menuData.tips = md?.tips;
          entry.menuData.estimatedCost = md?.estimatedCost;
          entry.id = p.id; // 夕食レコードのIDをメインIDとして使用
        }
        // isProtectedは1つでもtrueならtrue
        if (p.isProtected) entry.isProtected = true;
      }
      return Array.from(byDate.values()).map(e => ({
        id: e.id, planDate: e.planDate,
        isDelivered: e.isDelivered, isProtected: e.isProtected,
        menuData: e.menuData,
        messageText: e.messageText,
        actualStatusBreakfast: e.actualStatusBreakfast, actualStatusLunch: e.actualStatusLunch, actualStatusDinner: e.actualStatusDinner,
        actualMealBreakfast: e.actualMealBreakfast, actualMealLunch: e.actualMealLunch, actualMealDinner: e.actualMealDinner,
        ids: e.ids,
      }));
    }),

  // 献立のプロテクト状態を切り替え（1日に複数レコードある場合は全て一括更新）
  toggleProtect: protectedProcedure
    .input(z.object({
      menuPlanId: z.number().optional(),   // 単一ID（互換性のため残存）
      menuPlanIds: z.array(z.number()).optional(), // 複数ID（1日に複数レコードある場合）
      isProtected: z.boolean()
    }))
    .mutation(async ({ ctx, input }) => {
      const ids = input.menuPlanIds ?? (input.menuPlanId ? [input.menuPlanId] : []);
      if (ids.length === 0) return { success: false };
      await updateMenuPlanProtectBulk(ids, ctx.user.id, input.isProtected);
      return { success: true };
    }),

  // 週間献立を一括生成（プレミアム・課金無料期間のみ）
  generateWeekly: protectedProcedure
    .input(z.object({
      startDate: z.string(),
      days: z.number().min(2).max(7).default(7),
      // 週間設定（ポップアップで今週限り上書き）
      shoppingDays: z.array(z.string()).optional(), // 買い物に行く曜日（例: ["thu", "sun"]）
      eatOutDays: z.array(z.string()).optional(),   // 外食の曜日（例: ["wed"]）
      specialDays: z.array(z.object({ date: z.string(), type: z.enum(["anniversary", "cheatday"]) })).optional(), // 特別な日
      breakfastStyle: z.string().nullable().optional(), // 朝食スタイル
      lunchStyle: z.string().nullable().optional(),     // 昼食スタイル
      cookingAhead: z.string().nullable().optional(),   // 作り置き
    }))
    .mutation(async ({ ctx, input }) => {
      console.log('[generateWeekly] input.breakfastStyle:', input.breakfastStyle, '| input.specialDays:', JSON.stringify(input.specialDays));
      const [isPremium, isTrial] = await Promise.all([
        getUserIsPremium(ctx.user.id),
        getUserIsTrial(ctx.user.id),
      ]);
      if (!isPremium || isTrial) {
        throw new TRPCError({ code: "FORBIDDEN", message: "週間献立生成はプレミアムプラン限定の機能です" });
      }

      const results: Array<{ date: string; skipped: boolean; success: boolean }> = [];
      // JST基準で日付を計算（T12:00:00+09:00でUTCズレを防ぐ）
      const start = new Date(input.startDate + "T12:00:00+09:00");

      // 曜日名マッピング（英語短縮→日本語）
      const dayNameMap: Record<string, string> = {
        sun: "日", mon: "月", tue: "火", wed: "水", thu: "木", fri: "金", sat: "土"
      };
      const dayIndexToKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

      // 朝食スタイル・昼食スタイル・作り置きのテーマ文字列を構築
      const breakfastStyleMap: Record<string, string> = {
        bread: "パン派（トースト・サンドイッチ等）",
        rice: "ご飯派（和食・おにぎり等）",
        noodle: "麺派（うどん・そうめん等）",
        light: "軽食派（ヨーグルト・フルーツ等の軽めの朝食）",
      };
      const lunchStyleMap: Record<string, string> = {
        bread: "パン派（サンドイッチ・パンラ等）",
        rice: "ご飯派（定食・弁当等）",
        noodle: "麺派（ラーメン・パスタ等）",
        eating_out: "外食・テイクアウト多め",
      };
      const cookingAheadMap: Record<string, string> = {
        once: "週１回まとめ調理（作り置きを活用し、翁日はアレンジ料理も提案）",
        twice: "週２回まとめ調理（作り置きを活用し、翁日はアレンジ料理も提案）",
      };
      const weeklyThemeParts: string[] = [];
      if (input.breakfastStyle && input.breakfastStyle !== "none" && breakfastStyleMap[input.breakfastStyle]) {
        weeklyThemeParts.push(`朝食スタイル：${breakfastStyleMap[input.breakfastStyle]}`);
      }
      if (input.lunchStyle && input.lunchStyle !== "none" && lunchStyleMap[input.lunchStyle]) {
        weeklyThemeParts.push(`昼食スタイル：${lunchStyleMap[input.lunchStyle]}`);
      }
      if (input.cookingAhead && input.cookingAhead !== "none" && cookingAheadMap[input.cookingAhead]) {
        weeklyThemeParts.push(`作り置き：${cookingAheadMap[input.cookingAhead]}`);
      }
      const weeklyThemeDesc = weeklyThemeParts.length > 0 ? weeklyThemeParts.join("、") : null;

      // 対象期間の既存メニューを一括取得（プロテクト判定用）
      const endDate = new Date(start);
      endDate.setDate(endDate.getDate() + input.days - 1);
      const endDateStr = endDate.toISOString().split("T")[0];
      const startDateStr = start.toISOString().split("T")[0];
      const existingMenus = await getMenuPlansByDateRange(ctx.user.id, startDateStr, endDateStr);
      // 日付→isProtectedのマップ（1つでもtrueならprotected）
      const protectedDates = new Set<string>();
      for (const m of existingMenus) {
        if (m.isProtected) {
          // planDateはDate型の場合もあるので文字列に変換
          const pd = m.planDate instanceof Date
            ? m.planDate.toISOString().split("T")[0]
            : String(m.planDate);
          protectedDates.add(pd);
        }
      }

      // 使用済み食材を累積（毎日異なる食材を使うため）
      const usedIngredientsAccum: string[] = [];

      for (let i = 0; i < input.days; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split("T")[0];
        const dayKey = dayIndexToKey[d.getDay()];

        // プロテクト済みの日はスキップ
        if (protectedDates.has(dateStr)) {
          results.push({ date: dateStr, skipped: true, success: true });
          continue;
        }

        // 外食の日はスキップ（DBに外食フラグ付きで保存）
        if (input.eatOutDays?.includes(dayKey)) {
          try {
            const { getDb } = await import("../db");
            const { menuPlans: menuPlansTable } = await import("../../drizzle/schema");
            const { eq, and } = await import("drizzle-orm");
            const db = await getDb();
            if (db) {
              const existing = await getMenuPlanByDate(ctx.user.id, dateStr);
              if (existing) {
                await db.update(menuPlansTable)
                  .set({ isEatOut: true, updatedAt: new Date() })
                  .where(eq(menuPlansTable.id, existing.id));
              } else {
                await db.insert(menuPlansTable).values({
                  userId: ctx.user.id,
                  planDate: new Date(dateStr + 'T00:00:00') as any,
                  menuData: JSON.stringify({ eatOut: true }),
                  messageText: '外食の日',
                  isDelivered: false,
                  isProtected: false,
                  isEatOut: true,
                });
              }
            }
          } catch (err) {
            console.error('[generateWeekly] Failed to save eatOut flag:', err);
          }
          results.push({ date: dateStr, skipped: true, success: true });
          continue;
        }

        // 特別な日のテーマを決定（食事タイプ別に個別設定）
        const specialDay = input.specialDays?.find(s => s.date === dateStr);
        // 朝食テーマ：朝食スタイル設定を優先（記念日・チートデイは朝食には適用しない）
        const breakfastTheme = (input.breakfastStyle && input.breakfastStyle !== "none" && breakfastStyleMap[input.breakfastStyle])
          ? `朝食スタイル：${breakfastStyleMap[input.breakfastStyle]}。必ずこのスタイルに合った朝食を提案すること` : undefined;
        // 昼食テーマ：昼食スタイル設定を優先（記念日・チートデイは昼食には適用しない）
        const lunchTheme = (input.lunchStyle && input.lunchStyle !== "none" && lunchStyleMap[input.lunchStyle])
          ? `昼食スタイル：${lunchStyleMap[input.lunchStyle]}。必ずこのスタイルに合った昼食を提案すること` : undefined;
        // 夕食テーマ：記念日・チートデイ > weeklyThemeDesc（作り置き等）
        let dinnerTheme: string | undefined;
        if (specialDay?.type === "anniversary") {
          dinnerTheme = "記念日・おもてなし向けの豪華な夕食（ステーキ・シーフード・ケーキなど）。普段と全く違う特別感のある夕食を提案してください";
        } else if (specialDay?.type === "cheatday") {
          dinnerTheme = "チートデイ（好きなものを食べる日）。カロリー制限なしで大好きな夕食（ラーメン・ピザ・揚げ物・スイーツなど）を提案してください";
        } else if (weeklyThemeDesc) {
          dinnerTheme = weeklyThemeDesc;
        }

        // 買い物日の判定（買い物日当日・翁日は自由献立、それ以外は冷蔵庫参照）
        let willShopOverride: boolean | undefined;
        if (input.shoppingDays && input.shoppingDays.length > 0) {
          // 買い物日当日または翁日は自由献立（買い物で補充できる）
          const prevDayKey = dayIndexToKey[(d.getDay() + 6) % 7];
          if (input.shoppingDays.includes(dayKey) || input.shoppingDays.includes(prevDayKey)) {
            willShopOverride = true; // 買い物日当日・翁日：自由献立
          } else {
            willShopOverride = false; // それ以外：冷蔵庫の残り食材を使い切る
          }
        }

        try {
          // 朝・昼・夜それぞれ生成
          const mealTypes: MealType[] = ["breakfast", "lunch", "dinner"];
          let combinedMenuData: Record<string, any> = {};
          let combinedMessage = "";

          for (const mealType of mealTypes) {
            // 食事タイプ別に適切なテーマを選択
            const mealTheme = mealType === "breakfast" ? breakfastTheme
              : mealType === "lunch" ? lunchTheme
              : dinnerTheme;
            const result = await generateMenuPlan(
              ctx.user.id, dateStr, mealType, willShopOverride, mealTheme, false,
              usedIngredientsAccum.length > 0 ? [...usedIngredientsAccum] : undefined
            );
            combinedMenuData[mealType] = { message: result.message, menuPlanId: result.menuPlanId };
            if (!combinedMessage) combinedMessage = result.message;
            // 使用済み食材を累積（小語化して重複を防ぐ）
            if (result.options) {
              for (const opt of result.options) {
                for (const ing of opt.mainIngredients ?? []) {
                  const normalized = ing.replace(/（.*?）|（.*?）/g, '').trim();
                  if (normalized && !usedIngredientsAccum.includes(normalized)) {
                    usedIngredientsAccum.push(normalized);
                  }
                }
              }
            }
          }

          results.push({ date: dateStr, skipped: false, success: true });
        } catch (err) {
          results.push({ date: dateStr, skipped: false, success: false });
        }
      }

      return { results, totalDays: input.days, successCount: results.filter(r => r.success).length };
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

  // 夕食候補を選択して確定する
  selectDinnerOption: protectedProcedure
    .input(z.object({ menuPlanId: z.number(), optionIndex: z.number().min(0).max(2) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB接続エラー' });
      const rows = await db.select().from(menuPlans)
        .where(and(eq(menuPlans.id, input.menuPlanId), eq(menuPlans.userId, ctx.user.id)))
        .limit(1);
      const plan = rows[0];
      if (!plan) throw new TRPCError({ code: 'NOT_FOUND', message: '献立が見つかりません' });
      const menuData = plan.menuData ? JSON.parse(plan.menuData as string) : {};
      const dinnerOptions = menuData.dinnerOptions as Array<{ name: string; mainIngredients: string[]; usedFridgeItems: string[] }> | undefined;
      if (!dinnerOptions || dinnerOptions.length <= input.optionIndex) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '選択肢が見つかりません' });
      }
      const selected = dinnerOptions[input.optionIndex];
      // 選択した候補をdinnerフィールドに保存し、menuDataにも反映
      const updatedMenuData = { ...menuData, dinner: selected.name, selectedDinnerIndex: input.optionIndex };
      await db.update(menuPlans)
        .set({ dinner: selected.name, menuData: JSON.stringify(updatedMenuData), isProtected: true, updatedAt: new Date() })
        .where(and(eq(menuPlans.id, input.menuPlanId), eq(menuPlans.userId, ctx.user.id)));
      return { success: true, dinner: selected.name };
    }),

  // 献立削除（外食・作らない日用）
  deleteMenuPlan: protectedProcedure
    .input(z.object({ menuPlanId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteMenuPlan(input.menuPlanId, ctx.user.id);
      return { success: true };
    }),

  // 週間特別日設定（記念日・チートデイ）の永続化
  getWeeklySpecialDays: protectedProcedure
    .input(z.object({ startDate: z.string(), endDate: z.string() }))
    .query(async ({ ctx, input }) => {
      const days = await getWeeklySpecialDays(ctx.user.id, input.startDate, input.endDate);
      return days.map(d => ({ date: d.date, type: d.type as 'anniversary' | 'cheatday' }));
    }),

  upsertWeeklySpecialDay: protectedProcedure
    .input(z.object({ date: z.string(), type: z.enum(['anniversary', 'cheatday']) }))
    .mutation(async ({ ctx, input }) => {
      await upsertWeeklySpecialDay(ctx.user.id, input.date, input.type);
      return { success: true };
    }),

  deleteWeeklySpecialDay: protectedProcedure
    .input(z.object({ date: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await deleteWeeklySpecialDay(ctx.user.id, input.date);
      return { success: true };
    }),
});
