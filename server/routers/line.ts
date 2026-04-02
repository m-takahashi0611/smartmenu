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
): Promise<boolean> {

  // ─── Step 1: pendingActionがある場合（数量入力待ち）─────────────────────────
  const pending = await getLineUserPendingAction(lineUserId);
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
      // カンマや読点で分割して複数食材に対応
      const items = itemsText.split(/[、,，・]/).map((s) => s.trim()).filter((s) => s.length > 0 && s.length <= 20);

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

      // 1品の場合は既存在庫を確認して数量を聞く
      const itemName = items[0];
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

    // 全角スペース・不可視文字を除去して正規化
    const rawText: string = event.message.text;
    const text: string = rawText.replace(/[\u3000\u00a0\ufeff]/g, ' ').trim();
    console.log(`[LINE] RAW text bytes: ${Buffer.from(rawText).toString('hex').slice(0, 60)}`);

    // ─── キーワードマッチング（優先） ───────────────────────────────────────
    if (text === "献立" || text === "今日の献立" || text === "献立を教えて") {
      if (!userId) {
        await replyLineMessage(replyToken, [
          {
            type: "text",
            text: `${displayName}さん、まずはアプリにログインして家族情報を登録してください\n\nこちらから\nhttps://www.kondatebiyori.com`,
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
          {
            type: "text",
            text: "申し訳ありません。献立の生成に失敗しました。しばらくしてからもう一度お試しください。",
          },
        ]);
      }
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
          text: "買い物リストは空です。\n\nダッシュボードから献立を生成すると自動で買い物リストが作成されます！\nhttps://www.kondatebiyori.com",
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
    }    // ─── AI文脈理解型応答（会話履歴・位置情報対応） ──────────────────────────
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
