import * as crypto from "crypto";
import * as https from "https";
import { z } from "zod";
import {
  getLineUserByLineId,
  getDb,
  insertDeliveryLog,
  getFridgeItems,
  getFamilyProfile,
  getFamilyMembers,
  getRecentMenuPlans,
  getConversationHistory,
  addConversationMessage,
  updateLineUserLocation,
  setLineUserPendingAction,
  getLineUserPendingAction,
} from "../db";
import { lineUsers, fridgeItems as fridgeItemsTable, shoppingListItems } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { generateMenuPlan, getMealTypeByHour } from "./menu";
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

// ─── 地名から緯度経度を取得（Open-Meteo Geocoding API） ──────────────────────

async function geocodeRegion(regionName: string): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    const encoded = encodeURIComponent(regionName);
    const req = https.request(
      {
        hostname: "geocoding-api.open-meteo.com",
        path: `/v1/search?name=${encoded}&count=1&language=ja&format=json`,
        method: "GET",
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (json.results && json.results.length > 0) {
              resolve({ lat: json.results[0].latitude, lon: json.results[0].longitude });
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.end();
  });
}

// ─── AI文脈理解型チャット応答（会話履歴・位置情報対応） ──────────────────────

async function generateContextualReply(
  userMessage: string,
  lineUserId: string,
  userId: number | null,
  displayName: string,
  userLat?: number | null,
  userLon?: number | null
): Promise<string> {
  // ─── 最優先：冷蔵庫・買い物リストクエリは直接返答（AIに渡さない）──────────────
  const isFridgeQuery = /冷蔵庫の中身|冷蔵庫.*教えて|冷蔵庫.*見せて|冷蔵庫.*確認|冷蔵庫.*一覧/.test(userMessage);
  const isShoppingQuery = /買い物リスト.*教えて|買い物リスト.*見せて|買い物リスト.*確認|買い物リスト.*一覧|買い物.*リスト/.test(userMessage);

  if (isFridgeQuery) {
    console.log(`[LINE] generateContextualReply: Intercepted fridge query: "${userMessage}"`);
    if (!userId) {
      return `まずはダッシュボードから家族情報を登録してください\nhttps://www.kondatebiyori.com`;
    }
    const items = await getFridgeItems(userId);
    if (items.length === 0) {
      return '冷蔵庫に食材が登録されていません。\n\n「冷蔵庫に　を追加」と送ると登録できます！\n例：「冷蔵庫に豚肉、キャベツ、卵を追加」';
    } else {
      const itemList = items.map((f) => `・${f.name}${f.quantity ? '（' + f.quantity + '）' : ''}`).join('\n');
      return `❄️ 現在の冷蔵庫の食材：\n${itemList}\n\nこれらを使った献立を提案しましょうか？「献立」と送ってください`;
    }
  }

  if (isShoppingQuery) {
    console.log(`[LINE] generateContextualReply: Intercepted shopping query: "${userMessage}"`);
    if (!userId) {
      return `まずはダッシュボードから家族情報を登録してください\nhttps://www.kondatebiyori.com`;
    }
    const db = await getDb();
    if (!db) return 'エラーが発生しました。しばらくしてから再度お試しください。';
    const shoppingItems = await db
      .select()
      .from(shoppingListItems)
      .where(eq(shoppingListItems.userId, userId))
      .orderBy(shoppingListItems.createdAt);
    const pendingItems = shoppingItems.filter((s) => !s.isChecked);
    if (pendingItems.length === 0) {
      return '買い物リストは空です。\n\n献立を生成すると買い物リスト候補がダッシュボードに表示されます。\n必要なものだけ選んで追加できます！\nhttps://www.kondatebiyori.com/dashboard';
    } else {
      const itemList = pendingItems.map((s) => `・${s.name}${s.quantity ? ' ' + s.quantity : ''}`).join('\n');
      return `🛒 買い物リスト（${pendingItems.length}件）：\n${itemList}\n\n買い物が完了したらダッシュボードからチェックできます！`;
    }
  }

  // 位置情報から天気を取得（ユーザー登録位置 or デフォルト東京）
  const lat = userLat ?? 35.68;
  const lon = userLon ?? 139.69;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];
  const today = new Date().toISOString().split("T")[0];

  const [todayWeather, tomorrowWeather] = await Promise.all([
    getWeatherInfo(lat, lon, today),
    getWeatherInfo(lat, lon, tomorrowStr),
  ]);

  const todayWeatherDesc = formatWeatherForPrompt(todayWeather);
  const tomorrowWeatherDesc = formatWeatherForPrompt(tomorrowWeather);

  // ユーザー情報を取得
  let fridgeDesc = "冷蔵庫情報なし（ダッシュボードで登録してください）";
  let familyDesc = "家族情報なし（ダッシュボードで登録してください）";
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
        familyDesc = members
          .map((m) => {
            const allergyStr = m.allergies ? `アレルギー:${m.allergies}` : "";
            return `${m.name}（${m.ageGroup}${allergyStr ? " " + allergyStr : ""}）`;
          })
          .join("、");
      }
    }

    if (recentPlans.length > 0) {
      recentMenuDesc = recentPlans
        .flatMap((p) => {
          try {
            const data = typeof p.menuData === "string" ? JSON.parse(p.menuData) : p.menuData;
            return [data?.dinner].filter(Boolean);
          } catch {
            return [];
          }
        })
        .join("、");
    }
  }

  // 天気条件の判定
  const isTomorrowRainy = tomorrowWeather && tomorrowWeather.weatherCode >= 51;
  const isTodayRainy = todayWeather && todayWeather.weatherCode >= 51;
  const isTodayHot = todayWeather && todayWeather.temperatureMax >= 28;
  const isTodayCold = todayWeather && todayWeather.temperatureMax <= 10;

  // 現在時刻と時間帯の判定（JST = UTC+9）
  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const currentHour = nowJST.getUTCHours();
  let timeOfDay: string;
  let mealSuggestion: string;
  if (currentHour >= 5 && currentHour < 10) {
    timeOfDay = "朝";
    mealSuggestion = "今日の朝食";
  } else if (currentHour >= 10 && currentHour < 14) {
    timeOfDay = "昼";
    mealSuggestion = "今日の昼食";
  } else if (currentHour >= 14 && currentHour < 21) {
    timeOfDay = "夕方";
    mealSuggestion = "今日の夕食";
  } else {
    // 21時以降は翌日の朝食を提案
    timeOfDay = "夜";
    mealSuggestion = "明日の朝食";
  }

  // 会話履歴を取得（直近10ターン）
  const history = await getConversationHistory(lineUserId, 10);
  const historyMessages = history.map((h) => ({
    role: h.role as "user" | "assistant",
    content: h.content,
  }));

  const systemPrompt = `あなたは「エプロン執事」という名前の、日本の家庭向け献立アシスタントです。
LINEでユーザーと会話しており、どんな質問も必ず食事・献立・料理に結びつけて答えることが最大の特徴です。

【絶対ルール】
1. 「どんな風に過ごす予定なの？」のような献立に関係のない質問を返してはいけない
2. 天気の質問には天気情報と料理提案をセットで答える
3. 雨・悪天候の場合は「買い物が面倒ですよね、冷蔵庫の食材で作れるものを提案しましょうか？」と提案する
4. 暑い日はさっぱりした料理、寒い日は体を温める料理を提案する
5. 常に親しみやすく、主婦に寄り添うトーンで話す（執事らしく丁寧だが温かい）
6. 返答は3〜5行程度に収める（長すぎない）
7. ユーザーの名前「${displayName}さん」を適度に使う
8. 冷蔵庫の食材が登録されていれば、それを使った具体的な料理名を提案する
9. 【重要】現在の時間帯に合った食事を提案する。今は${timeOfDay}（${currentHour}時）なので、${mealSuggestion}を提案すること。夕食の提案なのに朝食を提案したり、その逆をしてはいけない。

【現在の情報】
現在時刻：${currentHour}時（${timeOfDay}）
提案すべき食事：${mealSuggestion}
今日の天気：${todayWeatherDesc}
明日の天気：${tomorrowWeatherDesc}
冷蔵庫の食材：${fridgeDesc}
家族構成：${familyDesc}
最近の夕食：${recentMenuDesc}
${isTomorrowRainy ? "【明日は雨】買い物が面倒な可能性あり。冷蔵庫の食材を優先した提案を心がける。" : ""}
${isTodayHot ? "【今日は暑い】さっぱりした料理を優先して提案する。" : ""}
${isTodayCold ? "【今日は寒い】体を温める料理を優先して提案する。" : ""}`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        ...historyMessages,
        { role: "user", content: userMessage },
      ],
    });

    const reply =
      (response.choices[0]?.message?.content as string) ??
      "申し訳ありません、うまく答えられませんでした。「献立」と送ると今日の献立を提案します";

    // 会話履歴を保存
    await addConversationMessage({ lineUserId, role: "user", content: userMessage });
    await addConversationMessage({ lineUserId, role: "assistant", content: reply });

    return reply;
  } catch (err) {
    console.error("[LINE] AI reply generation failed:", err);
    return "申し訳ありません、少し混み合っています。「献立」と送ると今日の献立を提案します";
  }
}

// ─── LINE上での冷蔵庫食材登録処理（会話フロー対応版） ─────────────────────────

// 数量を表す文字列から数値を抽出するヘルパー
function parseQuantityNumber(text: string): number | null {
  // 「3個」「3」「三個」「みっつ」などに対応
  const kanjiMap: Record<string, number> = {
    '一': 1, 'ひとつ': 1, '二': 2, 'ふたつ': 2, '三': 3, 'みっつ': 3,
    '四': 4, 'よっつ': 4, '五': 5, 'いつつ': 5, '六': 6, 'むっつ': 6,
    '七': 7, 'ななつ': 7, '八': 8, 'やっつ': 8, '九': 9, 'ここのつ': 9,
    '十': 10, 'じゅう': 10,
  };
  const numMatch = text.match(/(\d+)/);
  if (numMatch) return parseInt(numMatch[1]);
  for (const [kanji, num] of Object.entries(kanjiMap)) {
    if (text.includes(kanji)) return num;
  }
  return null;
}

async function handleFridgeRegistration(
  text: string,
  userId: number,
  lineUserId: string,
  replyToken: string
): Promise<boolean> {  // ─── Step 1: pendingActionがある場合（数量入力待ち・献立タイプ選択待ち）──────────────────────────────
  const pending = await getLineUserPendingAction(lineUserId);

  // 献立タイプ選択待ちの場合
  if (pending?.type === 'menu_type_selection') {
    const { choices } = pending as { choices: Record<string, string>; askedAt: number };
    const trimmed = text.trim();
    const selectedType = choices[trimmed];

    if (!selectedType) {
      // 不明な入力→再度聴く
      await replyLineMessage(replyToken, [
        { type: 'text', text: '番号か「夕飯」「朝食」などで教えてください😊\n\nキャンセルする場合は「キャンセル」と送ってください' }
      ]);
      return true;
    }

    if (trimmed === 'キャンセル' || trimmed === 'cancel' || trimmed === 'やめる') {
      await setLineUserPendingAction(lineUserId, null);
      await replyLineMessage(replyToken, [{ type: 'text', text: 'キャンセルしました。またいつでも「献立」と送ってください！' }]);
      return true;
    }

    await setLineUserPendingAction(lineUserId, null);

    try {
      const today = new Date().toISOString().split('T')[0];
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      if (selectedType === 'dinner_and_tomorrow_breakfast') {
        // 今夜の夕飯＋明日の朝食を順に生成
        const dinnerResult = await generateMenuPlan(userId, today, 'dinner');
        const breakfastResult = await generateMenuPlan(userId, tomorrow, 'tomorrow_breakfast');
        const combinedMessage = `${dinnerResult.message}

―――――――――――――――

${breakfastResult.message}`;
        await replyLineMessage(replyToken, [{ type: 'text', text: combinedMessage }]);
      } else if (selectedType === 'tomorrow_dinner') {
        // 明日の朝食＋昼食＋夕食を順に生成
        const bfResult = await generateMenuPlan(userId, tomorrow, 'tomorrow_breakfast');
        const lunchResult = await generateMenuPlan(userId, tomorrow, 'lunch');
        const dinnerResult = await generateMenuPlan(userId, tomorrow, 'dinner');
        const combinedMessage = `🌟 明日の献立をまとめて提案します！

${bfResult.message}

―――――――――――――――

${lunchResult.message}

―――――――――――――――

${dinnerResult.message}`;
        await replyLineMessage(replyToken, [{ type: 'text', text: combinedMessage }]);
      } else {
        // 単一食事タイプ
        const mealType = selectedType as import('./menu').MealType;
        const targetDate = (selectedType === 'tomorrow_breakfast') ? tomorrow : today;
        const result = await generateMenuPlan(userId, targetDate, mealType);
        await replyLineMessage(replyToken, [{ type: 'text', text: result.message }]);

        await insertDeliveryLog({
          userId,
          lineUserId,
          menuPlanId: result.menuPlanId ?? null,
          status: 'success',
          deliveredAt: new Date(),
        });
      }
    } catch (err) {
      console.error('[LINE] Menu generation failed:', err);
      await replyLineMessage(replyToken, [{ type: 'text', text: '申し訳ありません。献立の生成に失敗しました。しばらくしてからもう一度お試しください。' }]);
    }
    return true;
  }

  if (pending?.type === 'fridge_add_qty') {
    const { itemName, existingId, existingQty } = pending;

    // 「はい」「そのまま」「追加で」などの確認応答
    if (/^(はい|yes|そのまま|ok|ＯＫ|追加で|そうして|お願い|おねがい)$/i.test(text.trim())) {
      // 数量未入力のまま「はい」→ 1個追加
      const addQty = 1;
      const newQty = (existingQty ?? 0) + addQty;
      const db = await getDb();
      if (db && existingId) {
        await db.update(fridgeItemsTable)
          .set({ quantity: String(newQty) + '個', updatedAt: new Date() })
          .where(eq(fridgeItemsTable.id, existingId));
      } else if (db) {
        await db.insert(fridgeItemsTable).values({ userId, name: itemName, quantity: String(addQty) + '個', category: 'other' });
      }
      await setLineUserPendingAction(lineUserId, null);
      await replyLineMessage(replyToken, [{ type: 'text', text: `✅ ${itemName}を${addQty}個追加しました！（合計${newQty}個）` }]);
      return true;
    }

    // 「いいえ」「キャンセル」→ キャンセル
    if (/^(いいえ|no|キャンセル|やめる|やめて|cancel)$/i.test(text.trim())) {
      await setLineUserPendingAction(lineUserId, null);
      await replyLineMessage(replyToken, [{ type: 'text', text: `${itemName}の追加をキャンセルしました。` }]);
      return true;
    }

    // 数量が入力された場合
    const qty = parseQuantityNumber(text);
    if (qty !== null && qty > 0) {
      const newQty = (existingQty ?? 0) + qty;
      const db = await getDb();
      if (db && existingId) {
        await db.update(fridgeItemsTable)
          .set({ quantity: String(newQty) + '個', updatedAt: new Date() })
          .where(eq(fridgeItemsTable.id, existingId));
      } else if (db) {
        await db.insert(fridgeItemsTable).values({ userId, name: itemName, quantity: String(qty) + '個', category: 'other' });
      }
      await setLineUserPendingAction(lineUserId, null);
      const msg = existingQty
        ? `✅ ${itemName}を${qty}個追加しました！（今まで${existingQty}個 → 合計${newQty}個）`
        : `✅ ${itemName}を${qty}個追加しました！`;
      await replyLineMessage(replyToken, [{ type: 'text', text: msg }]);
      return true;
    }

    // 数量として解釈できない入力 → 再度聞く
    await replyLineMessage(replyToken, [{ type: 'text', text: `何個追加しますか？数字で教えてください。\n例：「3個」「5」\n\nキャンセルする場合は「キャンセル」と送ってください。` }]);
    return true;
  }

  // ─── Step 1.5: 数量訂正パターン（AIで一括処理）─────────────────────────────
  // 「変更」「訂正」「修正」「直して」などのキーワードを含む場合はAIで解析
  const correctionKeywords = /[変更訂正修正直して]|に変えて|にして|だよ|だった|です|ある|しかない/;
  if (correctionKeywords.test(text) || /[\d０-９][個本枚袋]?[にへ]/.test(text) || /[\d０-９]$/.test(text.replace(/[に変更訂正修正直して]+$/, ''))) {
    try {
      const db = await getDb();
      if (!db) return false;
      const allItems = await db.select().from(fridgeItemsTable).where(eq(fridgeItemsTable.userId, userId));
      const itemNames = allItems.map(r => r.name).join('、');
      const corrResp = await invokeLLM({
        messages: [
          { role: 'system', content: `冷蔵庫の食材数量を更新するアシスタントです。ユーザーのメッセージから「食材名」と「新しい数量（数字のみ）」のペアを抽出してJSON配列で返してください。
現在の冷蔵庫の食材: ${itemNames || 'なし'}
例: [{"name":"玉ねぎ","qty":3},{"name":"にんじん","qty":2}]
数量訂正の意図がない場合は空配列 [] を返してください。` },
          { role: 'user', content: text },
        ],
        response_format: { type: 'json_object' },
      });
      const content = corrResp.choices[0]?.message?.content;
      const contentStr = typeof content === 'string' ? content : JSON.stringify(content ?? '[]');
      const parsed = JSON.parse(contentStr);
      const updates: Array<{ name: string; qty: number }> = Array.isArray(parsed) ? parsed : (parsed.items ?? parsed.updates ?? []);
      if (updates.length > 0) {
        const results: string[] = [];
        for (const { name, qty } of updates) {
          if (!name || isNaN(qty) || qty <= 0) continue;
          const existing = allItems.find(r => r.name.includes(name) || name.includes(r.name));
          if (existing) {
            await db.update(fridgeItemsTable)
              .set({ quantity: String(qty) + '個', updatedAt: new Date() })
              .where(eq(fridgeItemsTable.id, existing.id));
            results.push(`${existing.name}: ${qty}個`);
          } else {
            await db.insert(fridgeItemsTable).values({ userId, name, quantity: String(qty) + '個', category: 'other' });
            results.push(`${name}: ${qty}個（新規追加）`);
          }
        }
        if (results.length > 0) {
          await replyLineMessage(replyToken, [{ type: 'text', text: `✅ 冷蔵庫を更新しました！\n${results.join('\n')}` }]);
          return true;
        }
      }
    } catch (_) {
      // AI解析失敗時はフォールスルー
    }
  }

  // ─── Step 2: 「〇〇追加して」「〇〇を追加」などの自然な表現を検出 ─────────────
  // 「冷蔵庫の中身を教えて」「買い物リストを教えて」は除外
  const skipPatterns = [
    /冷蔵庫の中身を教えて/,
    /買い物リストを教えて/,
    /冷蔵庫(を見せて|の中身$|の食材$|確認$|一覧$)/,
  ];
  if (skipPatterns.some(p => p.test(text))) return false;

  // 追加パターン（自然な表現を広くカバー）
  const addPatterns: Array<{ regex: RegExp; itemGroup: number }> = [
    { regex: /冷蔵庫に(.+?)を?(追加|入れ|登録)/, itemGroup: 1 },
    { regex: /(.+?)を冷蔵庫に(追加|入れ|登録)/, itemGroup: 1 },
    { regex: /冷蔵庫[:：](.+)/, itemGroup: 1 },
    { regex: /^(.+?)を?追加して$/, itemGroup: 1 },
    { regex: /^(.+?)追加して$/, itemGroup: 1 },
    { regex: /^(.+?)を?追加$/, itemGroup: 1 },
    { regex: /^(.+?)を?(買って|買ってきた|買った|もらった|仕入れた)$/, itemGroup: 1 },
  ];

  for (const { regex, itemGroup } of addPatterns) {
    const match = text.match(regex);
    if (match) {
      const itemsText = match[itemGroup];
      // カンマ・読点・スペース・「と」「や」「及び」で分割して複数食材に対応
      const rawItems = itemsText.split(/[、,，・\s　とやおよび及び]+/).map((s) => s.trim()).filter((s) => s.length > 0 && s.length <= 20);
      // 数量表現（「2個」「3本」など）を含む場合は食材名と数量を分離
      const items = rawItems.flatMap((s) => {
        // 「玉ねぎ2個」「にんじん1本」のような形式を分離
        const qtyMatch = s.match(/^(.+?)([0-9０-９一二三四五六七八九十百]+[個本枚袋箱パック缶本切れ匹尾頭羽束房玉串缶瓶])$/);
        if (qtyMatch) return [qtyMatch[1].trim()];
        return [s];
      }).filter((s) => s.length > 0 && s.length <= 20);

      const db = await getDb();
      if (!db || items.length === 0) return false;

      // 複数食材の場合はまとめて登録
      if (items.length > 1) {
        for (const item of items) {
          await db.insert(fridgeItemsTable).values({ userId, name: item, quantity: null, category: 'other' });
        }
        const itemList = items.join('、');
        await replyLineMessage(replyToken, [{ type: 'text', text: `✅ 冷蔵庫に「${itemList}」を登録しました！\n\n献立を提案しましょうか？「献立」と送ってください` }]);
        return true;
      }

      // 1品だが食材名が長い場合（10文字以上）はAIで複数食材に分割を試みる
      let finalItems = items;
      if (items.length === 1 && items[0].length >= 6) {
        try {
          const splitResp = await invokeLLM({
            messages: [
              { role: 'system', content: '食材名のリストを抽出するアシスタントです。入力テキストから食材名のみをJSON配列で返してください。例: ["豚肉","玉ねぎ","にんじん"]' },
              { role: 'user', content: `次のテキストから食材名を個別に抽出してください: "${items[0]}"` },
            ],
            response_format: { type: 'json_object' },
          });
          const content = splitResp.choices[0]?.message?.content;
          const contentStr = typeof content === 'string' ? content : JSON.stringify(content ?? {});
          const parsed = JSON.parse(contentStr);
          const extracted: string[] = Array.isArray(parsed) ? parsed : (parsed.items ?? parsed.foods ?? parsed.ingredients ?? []);
          if (extracted.length > 1) {
            finalItems = extracted.map((s: string) => String(s).trim()).filter((s: string) => s.length > 0 && s.length <= 20);
          }
        } catch (_) {
          // AI分割失敗時はそのまま
        }
      }

      // 複数食材に分割できた場合はまとめて登録
      if (finalItems.length > 1) {
        for (const item of finalItems) {
          await db.insert(fridgeItemsTable).values({ userId, name: item, quantity: null, category: 'other' });
        }
        const itemList = finalItems.join('、');
        await replyLineMessage(replyToken, [{ type: 'text', text: `✅ 冷蔵庫に「${itemList}」を登録しました！\n\n献立を提案しましょうか？「献立」と送ってください` }]);
        return true;
      }

      const itemName = finalItems[0] ?? items[0];
      const existing = await db.select().from(fridgeItemsTable)
        .where(eq(fridgeItemsTable.userId, userId))
        .then(rows => rows.find(r => r.name === itemName));

      if (existing && existing.quantity) {
        const existingQtyNum = parseQuantityNumber(existing.quantity) ?? 0;
        // pendingActionをセット
        await setLineUserPendingAction(lineUserId, {
          type: 'fridge_add_qty',
          itemName,
          existingId: existing.id,
          existingQty: existingQtyNum,
        });
        await replyLineMessage(replyToken, [{
          type: 'text',
          text: `${itemName}は今${existing.quantity}残っています。\n何個追加しますか？\n\n（数字で入力してください。例：「3個」）`,
        }]);
      } else if (existing) {
        // 既存だが数量未設定
        await setLineUserPendingAction(lineUserId, {
          type: 'fridge_add_qty',
          itemName,
          existingId: existing.id,
          existingQty: 0,
        });
        await replyLineMessage(replyToken, [{
          type: 'text',
          text: `${itemName}は既に冷蔵庫にあります。\n何個追加しますか？\n\n（数字で入力してください。例：「3個」）`,
        }]);
      } else {
        // 新規追加
        await setLineUserPendingAction(lineUserId, {
          type: 'fridge_add_qty',
          itemName,
          existingId: null,
          existingQty: 0,
        });
        await replyLineMessage(replyToken, [{
          type: 'text',
          text: `${itemName}を追加します。\n何個ありますか？\n\n（数字で入力してください。例：「3個」）`,
        }]);
      }
      return true;
    }
  }

  // ─── Step 3: 「冷蔵庫を見せて」「冷蔵庫の中身」などの確認パターン ─────────────
  const viewPatterns = [/^冷蔵庫(を見せ|の食材$|確認$|一覧$)/];
  for (const pattern of viewPatterns) {
    if (pattern.test(text)) {
      const items = await getFridgeItems(userId);
      if (items.length === 0) {
        await replyLineMessage(replyToken, [{ type: 'text', text: '冷蔵庫に食材が登録されていません。\n\n「玉ねぎ追加して」のように送ると登録できます！' }]);
      } else {
        const itemList = items.map((f) => `・${f.name}${f.quantity ? '（' + f.quantity + '）' : ''}`).join('\n');
        await replyLineMessage(replyToken, [{ type: 'text', text: `❄️ 現在の冷蔵庫の食材：\n${itemList}\n\nこれらを使った献立を提案しましょうか？「献立」と送ってください` }]);
      }
      return true;
    }
  }

  return false;
}

// ─── Webhook event handler ────────────────────────────────────────────────────

export async function handleLineWebhookEvent(event: any) {
  const { type, source, replyToken } = event;
  const lineUserId: string = source?.userId;

  if (!lineUserId) return;

  if (type === "follow") {
    const profile = await getLineUserProfile(lineUserId);
    const db = await getDb();
    if (db) {
      const existing = await getLineUserByLineId(lineUserId);
      if (!existing) {
        console.log(`[LINE] New follower: ${lineUserId}`);
      } else {
        await db
          .update(lineUsers)
          .set({
            displayName: profile?.displayName ?? "ユーザー",
            pictureUrl: profile?.pictureUrl ?? null,
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(lineUsers.lineUserId, lineUserId));
      }
    }

    await replyLineMessage(replyToken, [
      {
        type: "text",
        text: `こんにちは、${profile?.displayName ?? "ゲスト"}さん！\n献立日和～coto coto～へようこそ\n\n毎日の献立をAIがご提案します！\n\nまずはダッシュボードから家族構成や冷蔵庫の食材を登録してください\n\n設定はこちらから\nhttps://www.kondatebiyori.com`,
      },
    ]);
  } else if (type === "unfollow") {
    const db = await getDb();
    if (db) {
      await db
        .update(lineUsers)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(lineUsers.lineUserId, lineUserId));
    }
  } else if (type === "message") {
    const lineUser = await getLineUserByLineId(lineUserId);
    const userId = lineUser?.userId ?? null;
    const displayName = lineUser?.displayName ?? "ゲスト";

    // ─── 位置情報メッセージの処理 ────────────────────────────────────────────
    if (event.message?.type === "location") {
      const { latitude, longitude, address } = event.message;
      const region = address ?? "不明";

      await updateLineUserLocation(lineUserId, latitude, longitude, region);

      // 位置情報に基づいた天気を取得
      const today = new Date().toISOString().split("T")[0];
      const weather = await getWeatherInfo(latitude, longitude, today);
      const weatherDesc = formatWeatherForPrompt(weather);

      await replyLineMessage(replyToken, [
        {
          type: "text",
          text: `位置情報を登録しました！\n場所：${region}\n\n現在の天気：${weatherDesc}\n\nこれからはあなたの地域の天気に合った献立を提案します！`,
        },
      ]);
      return;
    }

    // ─── テキストメッセージの処理 ─────────────────────────────────────────────
    if (event.message?.type !== "text") return;

    // 全角スペース・不可視文字・制御文字を除去して正規化
    const rawText: string = event.message.text;
    // NFC正規化 → 全角スペース/NBSP/BOM/制御文字を除去 → trim
    const text: string = rawText
      .normalize('NFC')
      .replace(/[\u0000-\u001F\u007F\u3000\u00a0\ufeff\u200b-\u200f\u2028\u2029]/g, '')
      .trim();
    console.log(`[LINE] RAW hex: ${Buffer.from(rawText).toString('hex').slice(0, 80)}`);
    console.log(`[LINE] Normalized text: "${text}" (len=${text.length})`);

    // ─── 初回メッセージ時：家族未登録チェック ──────────────────────────────────
    // userId がある（ログイン済み）が家族情報が未登録の場合、登録を促す
    // ただし pendingAction 中・位置情報・特定コマンドは除く
    if (userId) {
      const familyProfile = await getFamilyProfile(userId);
      const familyMembers = await getFamilyMembers(userId);
      const hasFamilySetup = familyProfile && familyMembers.length > 0;
      // createdAt と updatedAt がほぼ同じ（5分以内）なら初回メッセージとみなす
      const isFirstMessage = lineUser && (lineUser.updatedAt.getTime() - lineUser.createdAt.getTime()) < 5 * 60 * 1000;
      if (!hasFamilySetup && isFirstMessage) {
        // 初回メッセージ時のみ家族登録を促す
        await replyLineMessage(replyToken, [
          {
            type: "text",
            text: `${displayName}さん、はじめまして！\n\nAIが献立を提案するために、まず家族情報を登録しましょう👨‍👩‍👧\n\n家族の人数・アレルギー・買い物回数などを登録すると、より精度の高い献立を提案できます！\n\n📝 ダッシュボードで登録\nhttps://www.kondatebiyori.com/family\n\n登録後に「献立」と送ってください😊`,
          },
        ]);
        return;
      }
    }

    // ─── キーワードマッチング（優先） ───────────────────────────────────────
    if (text === "献立" || text === "今日の献立" || text === "献立を教えて" || text === "献立提案") {
      if (!userId) {
        await replyLineMessage(replyToken, [
          {
            type: "text",
            text: `${displayName}さん、まずはアプリにログインして家族情報を登録してください\n\nこちらから\nhttps://www.kondatebiyori.com`,
          },
        ]);
        return;
      }

      // ─── 時間帯に応じた確認質問を返す ────────────────────────────────────────
      const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const currentHourJST = nowJST.getUTCHours();

      let questionText: string;
      let pendingChoices: Record<string, string>;

      if (currentHourJST >= 5 && currentHourJST < 15) {
        // 朝〜昼：朝食/昼食の提案か夕飯か
        questionText = `どの献立を考えましょうか？\n\n1️⃣ 今日の朝食・昼食\n2️⃣ 今夜の夕飯\n\n番号か「朝食」「夕飯」などで教えてください😊`;
        pendingChoices = {
          "1": "breakfast",
          "朝食": "breakfast",
          "昼食": "lunch",
          "ランチ": "lunch",
          "2": "dinner",
          "夕飯": "dinner",
          "夕食": "dinner",
          "晩ごはん": "dinner",
          "ディナー": "dinner",
        };
      } else if (currentHourJST >= 15 && currentHourJST < 22) {
        // 夕方〜夜：今晩か明日分まとめてか
        questionText = `今夜の献立ですか？それとも明日分まで考えますか？\n\n1️⃣ 今夜の夕飯だけ\n2️⃣ 今夜＋明日の朝食まで\n\n番号で教えてください😊`;
        pendingChoices = {
          "1": "dinner",
          "今夜": "dinner",
          "今日": "dinner",
          "夕飯": "dinner",
          "夕食": "dinner",
          "2": "dinner_and_tomorrow_breakfast",
          "明日も": "dinner_and_tomorrow_breakfast",
          "まとめて": "dinner_and_tomorrow_breakfast",
          "両方": "dinner_and_tomorrow_breakfast",
        };
      } else {
        // 夜（22時〜）：明日の朝食か夕飯まで考えるか
        questionText = `明日の献立を考えましょうか？\n\n1️⃣ 明日の朝食\n2️⃣ 明日の夕飯まで（朝・昼・夕）\n\n番号で教えてください😊`;
        pendingChoices = {
          "1": "tomorrow_breakfast",
          "朝食": "tomorrow_breakfast",
          "朝": "tomorrow_breakfast",
          "2": "tomorrow_dinner",
          "夕飯": "tomorrow_dinner",
          "夕食": "tomorrow_dinner",
          "全部": "tomorrow_dinner",
          "まとめて": "tomorrow_dinner",
        };
      }

      // pendingActionに選択待ち状態をセット
      await setLineUserPendingAction(lineUserId, {
        type: 'menu_type_selection',
        choices: pendingChoices,
        askedAt: Date.now(),
      });

      await replyLineMessage(replyToken, [{ type: "text", text: questionText }]);
      return;
    }

    if (text === "ヘルプ" || text === "help") {
      await replyLineMessage(replyToken, [
        {
          type: "text",
          text: "【献立日和 coto coto の使い方】\n\n献立 → 今日の献立を提案\n天気 → 天気に合った料理を提案\n冷蔵庫 → 在庫で作れる料理を提案\n\n位置情報を送ると地域の天気に合わせた提案ができます！\n\n設定（家族構成・冷蔵庫・店舗）はアプリから\nhttps://www.kondatebiyori.com",
        },
      ]);
      return;
    }

    // ─── リッチメニュー「冷蔵庫管理」ボタンからのトーク返信 ───────────────────────────────────────────────
    console.log(`[LINE] Received text: "${text}" (len=${text.length}) from userId=${userId} (lineUserId=${lineUserId})`);
    console.log(`[LINE] text===冷蔵庫の中身を教えて: ${text === '冷蔵庫の中身を教えて'}, text===買い物リストを教えて: ${text === '買い物リストを教えて'}`);
    // 正規化テキストで比較
    const normalizedText = text.normalize('NFC');
    if (normalizedText === "冷蔵庫の中身を教えて" || text.includes("冷蔵庫の中身を教えて")) {
      if (!userId) {
        await replyLineMessage(replyToken, [{
          type: "text",
          text: `${displayName}さん、まずはダッシュボードから家族情報を登録してください
https://www.kondatebiyori.com`,
        }]);
        return;
      }
      const items = await getFridgeItems(userId);
      if (items.length === 0) {
        await replyLineMessage(replyToken, [{
          type: "text",
          text: "冷蔵庫に食材が登録されていません。\n\n「冷蔵庫に　を追加」と送ると登録できます！\n例：「冷蔵庫に豚肉、キャベツ、卵を追加」",
        }]);
      } else {
        const itemList = items.map((f) => `・${f.name}${f.quantity ? "（" + f.quantity + "）" : ""}`).join("\n");
        await replyLineMessage(replyToken, [{
          type: "text",
          text: `❄️ 現在の冷蔵庫の食材：\n${itemList}\n\nこれらを使った献立を提案しましょうか？「献立」と送ってください`,
        }]);
      }
      return;
    }

    // ─── リッチメニュー「買い物リスト」ボタンからのトーク返信 ──────────────────────────
    if (normalizedText === "買い物リストを教えて" || text.includes("買い物リストを教えて")) {
      if (!userId) {
        await replyLineMessage(replyToken, [{
          type: "text",
          text: `${displayName}さん、まずはダッシュボードから家族情報を登録してください
https://www.kondatebiyori.com`,
        }]);
        return;
      }
      const db = await getDb();
      if (!db) {
        await replyLineMessage(replyToken, [{ type: "text", text: "エラーが発生しました。しばらくしてから再度お試しください。" }]);
        return;
      }
      const shoppingItems = await db
        .select()
        .from(shoppingListItems)
        .where(eq(shoppingListItems.userId, userId))
        .orderBy(shoppingListItems.createdAt);
      const pendingItems = shoppingItems.filter((s) => !s.isChecked);
      console.log(`[LINE] Shopping list for userId=${userId}: ${shoppingItems.length} total, ${pendingItems.length} pending`);
      if (pendingItems.length === 0) {
        await replyLineMessage(replyToken, [{
          type: "text",
          text: "買い物リストは空です。\n\n献立を生成すると買い物リスト候補がダッシュボードに表示されます。\n必要なものだけ選んで追加できます！\nhttps://www.kondatebiyori.com/dashboard",
        }]);
      } else {
        const itemList = pendingItems.map((s) => `・${s.name}${s.quantity ? " " + s.quantity : ""}`).join("\n");
        await replyLineMessage(replyToken, [{
          type: "text",
          text: `🛒 買い物リスト（${pendingItems.length}件）：\n${itemList}\n\n買い物が完了したらダッシュボードからチェックできます！`,
        }]);
      }
      return;
    }

    // ─── 冷蔵庫登録・確認コマンド ─────────────────────────────────────────────────────
    if (userId) {
      const handled = await handleFridgeRegistration(text, userId, lineUserId, replyToken);
      if (handled) return;
    }

    // ─── 最終フォールバック：冷蔵庫・買い物リストクエリのキャッチ ──────────────────────
    // （649行目のマッチングが何らかの理由で失敗した場合の安全網）
    const fridgeQueryPatterns = [
      /冷蔵庫の中身/,
      /冷蔵庫.*教えて/,
      /冷蔵庫.*見せて/,
      /冷蔵庫.*確認/,
      /冷蔵庫.*一覧/,
    ];
    if (fridgeQueryPatterns.some(p => p.test(text))) {
      console.log(`[LINE] FALLBACK: Caught fridge query: "${text}"`);
      if (!userId) {
        await replyLineMessage(replyToken, [{
          type: "text",
          text: `${displayName}さん、まずはダッシュボードから家族情報を登録してください\nhttps://www.kondatebiyori.com`,
        }]);
        return;
      }
      const items = await getFridgeItems(userId);
      if (items.length === 0) {
        await replyLineMessage(replyToken, [{
          type: "text",
          text: "冷蔵庫に食材が登録されていません。\n\n「冷蔵庫に　を追加」と送ると登録できます！\n例：「冷蔵庫に豚肉、キャベツ、卵を追加」",
        }]);
      } else {
        const itemList = items.map((f) => `・${f.name}${f.quantity ? "（" + f.quantity + "）" : ""}`).join("\n");
        await replyLineMessage(replyToken, [{
          type: "text",
          text: `❄️ 現在の冷蔵庫の食材：\n${itemList}\n\nこれらを使った献立を提案しましょうか？「献立」と送ってください`,
        }]);
      }
      return;
    }

    const shoppingQueryPatterns = [
      /買い物リスト.*教えて/,
      /買い物リスト.*見せて/,
      /買い物リスト.*確認/,
      /買い物リスト.*一覧/,
      /買い物.*リスト/,
    ];
    if (shoppingQueryPatterns.some(p => p.test(text))) {
      console.log(`[LINE] FALLBACK: Caught shopping list query: "${text}"`);
      if (!userId) {
        await replyLineMessage(replyToken, [{
          type: "text",
          text: `${displayName}さん、まずはダッシュボードから家族情報を登録してください\nhttps://www.kondatebiyori.com`,
        }]);
        return;
      }
      const db = await getDb();
      if (!db) {
        await replyLineMessage(replyToken, [{ type: "text", text: "エラーが発生しました。しばらくしてから再度お試しください。" }]);
        return;
      }
      const shoppingItems = await db
        .select()
        .from(shoppingListItems)
        .where(eq(shoppingListItems.userId, userId))
        .orderBy(shoppingListItems.createdAt);
      const pendingItems = shoppingItems.filter((s) => !s.isChecked);
      if (pendingItems.length === 0) {
        await replyLineMessage(replyToken, [{
          type: "text",
          text: "買い物リストは空です。\n\n献立を生成すると買い物リスト候補がダッシュボードに表示されます。\n必要なものだけ選んで追加できます！\nhttps://www.kondatebiyori.com/dashboard",
        }]);
      } else {
        const itemList = pendingItems.map((s) => `・${s.name}${s.quantity ? " " + s.quantity : ""}`).join("\n");
        await replyLineMessage(replyToken, [{
          type: "text",
          text: `🛒 買い物リスト（${pendingItems.length}件）：\n${itemList}\n\n買い物が完了したらダッシュボードからチェックできます！`,
        }]);
      }
      return;
    }

    // ─── AI文脈理解型応答（会話履歴・位置情報対応） ──────────────────────────
    try {
      const reply = await generateContextualReply(
        text,
        lineUserId,
        userId,
        displayName,
        lineUser?.latitude,
        lineUser?.longitude
      );
      await replyLineMessage(replyToken, [{ type: "text", text: reply }]);
    } catch (err) {
      console.error("[LINE] Contextual reply failed:", err);
      await replyLineMessage(replyToken, [
        { type: "text", text: "「献立」と送ると今日の献立を提案します" },
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
