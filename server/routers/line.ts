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
  moveCheckedShoppingItemsToFridge,
  getMenuPlanByDate,
  deleteFridgeItem,
  getProductNameCache,
  upsertProductNameCache,
  checkLineUserProcessing,
  setLineUserProcessing,
  getUserIsPremium,
  getUserIsTrial,
  clearAllFridgeItems,
  updateActualMeal,
  getMenuPlansByDateRange,
} from "../db";
import { lineUsers, fridgeItems as fridgeItemsTable, shoppingListItems } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { generateMenuPlan, getMealTypeByHour } from "./menu";
import { publicProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { getWeatherInfo, formatWeatherForPrompt } from "../weather";
import { transcribeAudio } from "../_core/voiceTranscription";
import { switchToPremiumMenu, switchToNormalMenu } from "./richMenu";
import { generateWeeklyMenuFlex } from "../weeklyMenuPng";
// ─── LINE API helper ───────────────────────────────────────────────────────────

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

export async function replyLineMessage(replyToken: string, messages: object[], lineUserIdForHistory?: string) {
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
  }).then(async () => {
    // lineUserIdForHistoryが渡された場合、テキストメッセージを履歴保存
    if (lineUserIdForHistory) {
      const textMessages = (messages as any[]).filter(m => m.type === 'text' && m.text);
      for (const m of textMessages) {
        await addConversationMessage({ lineUserId: lineUserIdForHistory, role: 'assistant', content: m.text }).catch(() => {});
      }
    }
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

// ─── LINEコンテンツダウンロード（音声・画像） ─────────────────────────────────────────────────────

async function downloadLineContent(messageId: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api-data.line.me",
        path: `/v2/bot/message/${messageId}/content`,
        method: "GET",
        headers: {
          Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`LINE content download failed: ${res.statusCode}`));
          } else {
            resolve(Buffer.concat(chunks));
          }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

// ─── レシート画像解析（LLM Vision） ─────────────────────────────────────────────────────

async function analyzeReceiptImage(
  imageUrl: string,
  userId: number | null
): Promise<{ success: boolean; items: Array<{ name: string; quantity?: string }> }> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `あなたはレシート画像解析のエキスパートです。画像から購入した食料品・食材を抽出してJSON形式で返してください。
形式: { "items": [ { "name": "食材名", "quantity": "数量" }, ... ] }
注意事項:
- 食料品・食材のみ抽出（洗剤剤、トイレットペーパーなどは除外）
- 数量は「1個」「300g」「1本」など単位付きで
- 商品名が不明な場合は除外
- レシートでない画像の場合は { "items": [] } を返す`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: "このレシートから購入した食料品・食材を抽出してください" },
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "receipt_items",
          strict: true,
          schema: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    quantity: { type: "string" },
                  },
                  required: ["name", "quantity"],
                  additionalProperties: false,
                },
              },
            },
            required: ["items"],
            additionalProperties: false,
          },
        },
      },
    });
    const content = response.choices[0]?.message?.content;
    const parsed = typeof content === "string" ? JSON.parse(content) : content;
    return { success: true, items: parsed?.items ?? [] };
  } catch (err) {
    console.error("[LINE] Receipt analysis failed:", err);
    return { success: false, items: [] };
  }
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
   // ─── 最優先：冷蔵庫・買い物リストクエリは直接返答（AIに渡さない）──────
  const isFridgeQuery = /冷蔵庫の中身|冷蔵庫.*教えて|冷蔵庫.*見せて|冷蔵庫.*確認|冷蔵庫.*一覧/.test(userMessage);
  const isShoppingQuery = /買い物リスト.*教えて|買い物リスト.*見せて|買い物リスト.*確認|買い物リスト.*一覧|買い物.*リスト/.test(userMessage);

  // ─── R-2修正：レシピ要求は専用フローに誘導（AIチャットに流さない）──────
  // 「〇〇のレシピ」パターンを検知した場合、レシピ処理関数へ誘導する
  const recipeMatchInChat = userMessage.match(/(.+?)のレシピ(?:を|が|は)?(?:教えて|見せて|知りたい|教えてください|見たい|ください)?$/);
  const isRecipeOnlyInChat = /^レシピ(?:教えて|見せて|知りたい|を教えて|を見せて)?$/.test(userMessage.trim());
  if (recipeMatchInChat || isRecipeOnlyInChat) {
    // レシピ要求を検知→当日献立とマッチングしてプレミアム判定へ
    const requestedDishInChat = recipeMatchInChat ? recipeMatchInChat[1].trim() : null;
    const todayStrForChat = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
    let todayDishNamesForChat: string[] = [];
    if (userId) {
      try {
        const { getMenuPlanByDate } = await import('../db');
        const todayPlanForChat = await getMenuPlanByDate(userId, todayStrForChat);
        if (todayPlanForChat?.menuData) {
          const planData = typeof todayPlanForChat.menuData === 'string' ? JSON.parse(todayPlanForChat.menuData) : todayPlanForChat.menuData;
          if (planData?.dinnerOptions) {
            todayDishNamesForChat = planData.dinnerOptions.map((o: any) => o.name as string);
          } else {
            todayDishNamesForChat = [planData?.breakfast, planData?.lunch, planData?.dinner].filter(Boolean) as string[];
          }
        }
      } catch { /* ignore */ }
    }

    // 料理名なし → 今日の献立候補を案内
    if (!requestedDishInChat || isRecipeOnlyInChat) {
      if (todayDishNamesForChat.length > 0) {
        const dishList = todayDishNamesForChat.map((n, i) => `${i + 1}️⃣ ${n}`).join('\n');
        return `今日の献立のレシピはこちらから見られます👇\n\n${dishList}\n\n料理名で「〇〇のレシピ教えて」と送ってください🍳`;
      } else {
        return '料理名を入れて送ってください😊\n例：「唐揚げのレシピ教えて」';
      }
    }

    // 数字指定（「1のレシピ」等）→ 当日献立N番目の料理名に変換
    const numMatchInChat = requestedDishInChat.match(/^([1-3１２３一二三])番?$/);
    let resolvedDishInChat = requestedDishInChat;
    if (numMatchInChat && todayDishNamesForChat.length > 0) {
      const numStr = numMatchInChat[1];
      const idx = '１一'.includes(numStr) ? 0 : '２二'.includes(numStr) ? 1 : '３三'.includes(numStr) ? 2 : parseInt(numStr, 10) - 1;
      if (idx >= 0 && idx < todayDishNamesForChat.length) {
        resolvedDishInChat = todayDishNamesForChat[idx];
      }
    }

    // 献立マッチング
    const normalizeChat = (s: string) => s.replace(/[\s　・·]/g, '').toLowerCase();
    const matchedDishInChat = todayDishNamesForChat.find(name =>
      normalizeChat(name).includes(normalizeChat(resolvedDishInChat)) ||
      normalizeChat(resolvedDishInChat).includes(normalizeChat(name))
    );

    if (matchedDishInChat) {
      // 献立にある → 無料・有料共通でレシピ生成
      try {
        const { invokeLLM } = await import('../_core/llm');
        const recipeResp = await invokeLLM({
          messages: [
            { role: 'system', content: 'あなたは日本の主婦向け料理レシピAIです。簡潔で分かりやすいレシピをLINEメッセージ形式で返してください。' },
            { role: 'user', content: `「${matchedDishInChat}」のレシピを教えてください。\n\n以下の形式で返してください：\n【材料】（4人分目安）\n・食材名 分量\n\n【作り方】\n1. 手順\n2. 手順\n（5〜7ステップ程度）\n\n【ポイント】\nコツや注意点を1〜2行で` },
          ],
        });
        const recipeText = recipeResp.choices[0]?.message?.content ?? 'レシピの取得に失敗しました。';
        return `🍳 ${matchedDishInChat} のレシピ\n\n${recipeText}`;
      } catch {
        return '申し訳ありません。レシピの取得に失敗しました。しばらくしてからお試しください。';
      }
    }

    // 献立にない → プレミアム判定
    const isPremiumInChat = userId ? await getUserIsPremium(userId) : false;
    if (isPremiumInChat) {
      try {
        const { invokeLLM } = await import('../_core/llm');
        const recipeResp = await invokeLLM({
          messages: [
            { role: 'system', content: 'あなたは日本の主婦向け料理レシピAIです。簡潔で分かりやすいレシピをLINEメッセージ形式で返してください。' },
            { role: 'user', content: `「${resolvedDishInChat}」のレシピを教えてください。\n\n以下の形式で返してください：\n【材料】（4人分目安）\n・食材名 分量\n\n【作り方】\n1. 手順\n2. 手順\n（5〜7ステップ程度）\n\n【ポイント】\nコツや注意点を1〜2行で` },
          ],
        });
        const recipeText = recipeResp.choices[0]?.message?.content ?? 'レシピの取得に失敗しました。';
        return `🍳 ${resolvedDishInChat} のレシピ\n\n${recipeText}\n\n―――――――――――――――――――\n✨ プレミアム会員特典でお届けしました！`;
      } catch {
        return '申し訳ありません。レシピの取得に失敗しました。しばらくしてからお試しください。';
      }
    } else {
      // 無料会員 → 今日の献立候補 + プレミアム案内
      const todayDishList = todayDishNamesForChat.length > 0
        ? `\n\n今日の献立のレシピはこちらから見られます👇\n${todayDishNamesForChat.map((n, i) => `${i + 1}️⃣ ${n}`).join('\n')}`
        : '';
      return `${resolvedDishInChat}は今日の献立にないので、レシピのご案内ができません😊${todayDishList}\n\n✨ プレミアム会員になると、献立に関係なくどんな料理のレシピでも聞けます！\nhttps://www.kondatebiyori.com/dashboard`;
    }
  }

  if (isFridgeQuery) {
    console.log(`[LINE] generateContextualReply: Intercepted fridge query: "${userMessage}"`);
    if (!userId) {
      return `まずはこちらからログインしてください😊\n👉 https://www.kondatebiyori.com\n\nログインが完了したら、冷蔵庫の前に立ちながら\n「卵10個、牛乳1本、キャベツ半玉…」と\n音声で話しかけるだけで食材を登録することもできますよ🎤`;
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
      return `まずはこちらからログインしてください😊\n👉 https://www.kondatebiyori.com\n\nログインが完了したら、冷蔵庫の前に立ちながら\n「卵10個、牛乳1本、キャベツ半玉…」と\n音声で話しかけるだけで食材を登録することもできますよ🎤`;
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
10. 【絶対禁止】返答の中で「冷蔵庫に○○があるので」「冷蔵庫の○○を使って」のように冷蔵庫の中身を列挙・言及してはいけない。冷蔵庫情報は内部参考用であり、返答には料理名・レシピのみを提案すること。
11. 【短い返事への対応】「はーい」「ありがとう」「わかった」「いいね」などユーザーからの短い返事の場合、必ず直前の会話文脈（献立提案済みなど）を踏まえた自然な短い返事を返す。再度献立を提案したり、質問を返したり、別の話題に切り替えてはいけない。例：献立提案後に「はーい」→「いいですね！どれか気になるものはありましたか？😊」のように、直前の流れを継続する返事をする。

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

// 商品名正規化ルール（語尾・キーワードベース）
const PRODUCT_NORMALIZE_RULES: Array<{ pattern: RegExp; normalized: string; category: string }> = [
  // 乳製品
  { pattern: /牛乳|ミルク/, normalized: '牛乳', category: '乳製品' },
  { pattern: /ヨーグルト/, normalized: 'ヨーグルト', category: '乳製品' },
  { pattern: /チーズ/, normalized: 'チーズ', category: '乳製品' },
  { pattern: /バター/, normalized: 'バター', category: '乳製品' },
  { pattern: /生クリーム/, normalized: '生クリーム', category: '乳製品' },
  // 肉類
  { pattern: /豚バラ|豚ロース|豚肉|ポーク/, normalized: '豚肉', category: '肉類' },
  { pattern: /鶏肉|チキン/, normalized: '鶏肉', category: '肉類' },
  { pattern: /牛肉|ビーフ/, normalized: '牛肉', category: '肉類' },
  { pattern: /ミンチ肉/, normalized: 'ミンチ肉', category: '肉類' },
  // 魚介類
  { pattern: /サーモン|鲑/, normalized: '鲑', category: '魚介類' },
  { pattern: /マグロ|鯪/, normalized: '鯪', category: '魚介類' },
  // 飲料
  { pattern: /コーラ|コカ・コーラ/, normalized: 'コーラ', category: '飲料' },
  { pattern: /オレンジジュース/, normalized: 'オレンジジュース', category: '飲料' },
  { pattern: /リンゴジュース/, normalized: 'リンゴジュース', category: '飲料' },
  { pattern: /コーヒー/, normalized: 'コーヒー', category: '飲料' },
  { pattern: /緑茶|緑茶ティー/, normalized: '緑茶', category: '飲料' },
  { pattern: /ムギメギ/, normalized: 'ムギメギ', category: '飲料' },
  // 主食
  { pattern: /米$|お米|白米/, normalized: '米', category: '主食' },
  { pattern: /パン$|食パン/, normalized: '食パン', category: '主食' },
  { pattern: /麺$|ラーメン|スパゲッティ|パスタ/, normalized: '麺類', category: '主食' },
  // 野菜
  { pattern: /キャベツ|キャベツ|cabbage/i, normalized: 'キャベツ', category: '野菜' },
  { pattern: /にんじん|ニンジン|人参|にんじん/, normalized: 'にんじん', category: '野菜' },
  { pattern: /じゃがいも|ジャガイモ|馬鈴薯|じゃが芋|ジャガ芋/, normalized: 'じゃがいも', category: '野菜' },
  { pattern: /玉ねぎ|タマネギ|玉葱|たまねぎ/, normalized: '玉ねぎ', category: '野菜' },
  { pattern: /大根|だいこん|ダイコン/, normalized: '大根', category: '野菜' },
  { pattern: /トマト/, normalized: 'トマト', category: '野菜' },
  { pattern: /ピーマン/, normalized: 'ピーマン', category: '野菜' },
  { pattern: /ブロッコリー/, normalized: 'ブロッコリー', category: '野菜' },
  { pattern: /ほうれん草|ホウレン草|ほうれんそう|菠薐草/, normalized: 'ほうれん草', category: '野菜' },
  { pattern: /なす|ナス|茄子/, normalized: 'なす', category: '野菜' },
  { pattern: /きゅうり|キュウリ|胡瓜/, normalized: 'きゅうり', category: '野菜' },
  { pattern: /ゴーヤ|ゴーヤー|苦瓜/, normalized: 'ゴーヤ', category: '野菜' },
  { pattern: /長ねぎ|長ネギ|ながねぎ|ネギ|ねぎ|葱/, normalized: 'ねぎ', category: '野菜' },
  { pattern: /もやし|モヤシ/, normalized: 'もやし', category: '野菜' },
  { pattern: /かぼちゃ|カボチャ|南瓜/, normalized: 'かぼちゃ', category: '野菜' },
  { pattern: /さつまいも|サツマイモ|薩摩芋/, normalized: 'さつまいも', category: '野菜' },
  { pattern: /れんこん|レンコン|蓮根/, normalized: 'れんこん', category: '野菜' },
  { pattern: /ごぼう|ゴボウ|牛蒡/, normalized: 'ごぼう', category: '野菜' },
  { pattern: /しいたけ|シイタケ|椎茸/, normalized: 'しいたけ', category: '野菜' },
  { pattern: /えのき|エノキ|榎茸/, normalized: 'えのき', category: '野菜' },
  // 卵
  { pattern: /卵|たまご|タマゴ|玉子/, normalized: '卵', category: 'その他' },
  // 冷凍食品
  { pattern: /アイス|モナ王/, normalized: 'アイス', category: '冷凍食品' },
  // 加工食品
  { pattern: /ウィンナー|ソーセージ/, normalized: 'ウィンナー', category: '加工食品' },
  { pattern: /ハム/, normalized: 'ハム', category: '加工食品' },
  { pattern: /ベーコン/, normalized: 'ベーコン', category: '加工食品' },
];

// 商品名を正規化する（キャッシュ→ルールベース→LLMの順で判定）
async function resolveProductName(originalName: string): Promise<string> {
  // 1. キャッシュ検索
  const cached = await getProductNameCache(originalName).catch(() => null);
  if (cached) return cached.normalizedName;

  // 2. ルールベース判定
  for (const rule of PRODUCT_NORMALIZE_RULES) {
    if (rule.pattern.test(originalName)) {
      await upsertProductNameCache({
        originalName,
        normalizedName: rule.normalized,
        category: rule.category,
        resolvedBy: 'rule',
      }).catch(() => {});
      return rule.normalized;
    }
  }

  // 3. LLMフォールバック（ルールで判定できなかった場合）
  try {
    const response = await invokeLLM({
      messages: [
        { role: 'system', content: '商品名を一般的な食材名に変換してください。答えは食材名のみを返してください。例:「北海道根釧牛乳」→「牛乳」、「コカ・コーラア70」→「コーラ」、「香薄あらびきポーク」→「ウィンナー」' },
        { role: 'user', content: originalName },
      ],
    });
    const normalized = (response.choices[0]?.message?.content as string ?? originalName).trim();
    await upsertProductNameCache({
      originalName,
      normalizedName: normalized,
      category: null,
      resolvedBy: 'llm',
    }).catch(() => {});
    return normalized;
  } catch {
    return originalName; // 失敗時は元の名前を使用
  }
}

// ひらがな/カタカナを正規化して食材名の表記ゆれを吸収するヘルパー
const INGREDIENT_SYNONYMS: Record<string, string> = {
  'たまご': '卵', 'えっぐ': '卵', 'egg': '卵',
  'ぶたにく': '豚肉', 'ぽーく': '豚肉',
  'とりにく': '鶏肉', 'ちきん': '鶏肉', 'chicken': '鶏肉',
  'ぎゅうにく': '牛肉', 'びーふ': '牛肉',
  'ねぎ': '長ねぎ', 'なが ねぎ': '長ねぎ',
  'にんじん': '人参',
  'じゃがいも': 'じゃがいも', 'ポテト': 'じゃがいも', 'ぽてと': 'じゃがいも',
  'きゅうり': 'きゅうり',
  'とまと': 'トマト',
  'もやし': 'もやし',
  'こまつな': '小松菜',
  'ほうれんそう': 'ほうれん草',
  'だいこん': '大根',
  'はくさい': '白菜',
  'きゃべつ': 'キャベツ',
  'なす': 'なす',
  'ぴーまん': 'ピーマン',
  'ぱぷりか': 'パプリカ',
  'ぶろっこりー': 'ブロッコリー',
  'あすぱらがす': 'アスパラガス',
  'ごぼう': 'ごぼう',
  'れんこん': 'れんこん',
  'さつまいも': 'さつまいも',
  'かぼちゃ': 'かぼちゃ',
  'とうふ': '豆腐',
  'あぶらあげ': '油揚げ',
  'みそ': '味噌',
  'しょうゆ': '醤油',
  'さけ': '鮭', 'さーもん': '鮭',
  'まぐろ': 'まぐろ',
  'えび': 'えび',
  'いか': 'いか',
  'ちくわ': 'ちくわ',
  'かまぼこ': 'かまぼこ',
  'ぎゅうにゅう': '牛乳', 'みるく': '牛乳',
  'ばたー': 'バター',
  'ちーず': 'チーズ',
  'まよねーず': 'マヨネーズ',
  'けちゃっぷ': 'ケチャップ',
};

function normalizeIngredientName(name: string): string {
  // 末尾の数量表現を除去（「白菜半分」→「白菜」、「じゃがいも3個」→「じゃがいも」）
  const withoutQty = name
    .replace(/[\d０-９]+[個本袋枚切れgGkgmlMLcc杯膳人前束缶本箱個]$/g, '')
    .replace(/(?:半分|少々|適量|少量|ひとつまみ|ひとかけ|少し|たっぷり)$/g, '')
    .trim();
  const base = (withoutQty || name)
    .normalize('NFKC')
    .replace(/[\u30A1-\u30F6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .toLowerCase()
    .trim();
  // 同義語マッピング
  return INGREDIENT_SYNONYMS[base] ? INGREDIENT_SYNONYMS[base].toLowerCase() : base;
}

// 冷蔵庫の既存食材と表記ゆれを考慮して部分一致検索
function findMatchingFridgeItem(
  items: Array<{ id: number; name: string; quantity: string | null }>,
  targetName: string
): { id: number; name: string; quantity: string | null } | undefined {
  const normalizedTarget = normalizeIngredientName(targetName);
  // 1. 完全一致（正規化後）
  let found = items.find(i => normalizeIngredientName(i.name) === normalizedTarget);
  if (found) return found;
  // 2. 部分一致：既存名が入力名を含む、または入力名が既存名を含む
  found = items.find(i => {
    const norm = normalizeIngredientName(i.name);
    return norm.includes(normalizedTarget) || normalizedTarget.includes(norm);
  });
  return found;
}

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

// ─── LLM意図判定（テキスト・音声共通）───────────────────────────────────────────────────────
type IntentType =
  | 'shopping_add'        // 買い物リストに追加（直接登録）
  | 'fridge_add'          // 冷蔵庫に追加（直接登録）
  | 'fridge_overwrite'    // 冷蔵庫の中身を全部書き換え（全削除→新規登録）
  | 'ingredients_only'    // 食材名のみ（追加/在庫確認/その他）
  | 'used_ingredient'     // 食材を使った（削除/数量を減らす/その他）
  | 'bought_item'         // 買い物してきた（冷蔵庫追加/買い物リストから削除/その他）
  | 'menu_vague'          // 献立曘昧（献立を提案/キャンセル/その他）
  | 'mood_theme'          // 気分・テーマ（今日の献立テーマに設定/キャンセル/その他）
  | 'family_preference'   // 家族の好み（好み嫌いに登録/キャンセル/その他）
  | 'quantity_update'     // 数量更新（数量を更新/在庫確認/その他）
  | 'other';              // その他（通常処理へ）

interface IntentResult {
  intent: IntentType;
  items: string[];        // 食材名・商品名リスト
  quantity: string | null; // 数量（数量更新パターン用）
  theme: string | null;   // テーマ（気分・テーマパターン用）
  memberName: string | null; // 家族メンバー名（好みパターン用）
  preference: string | null; // 好み内容（好みパターン用）
}

async function classifyUserIntent(text: string): Promise<IntentResult> {
  try {
    const resp = await invokeLLM({
      messages: [
        {
          role: 'system',
          content: `ユーザーの発言を以下のパターンに分類してください。

パターン定義：
- fridge_overwrite: 冷蔵庫の中身を全部書き換えたい（全削除して新しい食材を登録）。以下のような表現が含まれれば必ずこれ：「書き換えて」「書き換えてください」「入れ替えて」「入れ替えてください」「差し替えて」「置き換えて」「上書きして」「変更して」「だけにして」「全部消して〇〇にして」「リセットして〇〇を入れて」「〇〇に変えて（冷蔵庫文脈）」「〇〇に更新して（冷蔵庫文脈）」。例：「冷蔵庫を豚肉・卵に書き換えて」「・白菜・ピーマンに冷蔵庫の中身を書き換えてください」「冷蔵庫を白菜・卵だけにして」「冷蔵庫をリセットして豚肉と卵を入れて」
- shopping_add: 買い物リストに追加したい。「買い物リストに追加」「買い物リストへ追加」「買い物リストに入れて」「買い物リストに登録」という文言があれば必ずこれ。例：「牛乳を買い物リストに追加して」「もやし、きのこを買い物リストへ」
- fridge_add: 冷蔵庫に追加したい（書き換えではなく追加）。「冷蔵庫に追加」「冷蔵庫に入れて」「冷蔵庫に登録」という文言があれば必ずこれ。例：「豚肉を冷蔵庫に追加して」「冷蔵庫にとうもろこしを入れて」
- ingredients_only: 食材名・商品名だけが並んでいる（作業指示なし）。例：「大根、牛乳、塩」「じゃがいも3つ」「牛乳ある」
- used_ingredient: 食材を使った・食べた・消費した。例：「豚肉使った」「卵食べた」「牛乳飲んだ」
- bought_item: 買い物から帰ってきた・買ってきた（買い物リストへの追加ではない）。例：「牛乳買ってきた」「スーパーで豚肉買った」「買い物から帰った」
- menu_vague: 献立について曘昧に聴いている。例：「夕飯どうしよう」「今日何作ろう」「献立迷ってる」
- mood_theme: 今日の気分・食べたいもの・テーマを言っている。例：「今日は和食の気分」「さっぱりしたい」「カレーが食べたい」
- family_preference: 家族の好み嫌い・アレルギーを言っている。例：「子供が人参嫌い」「夫がピーマン食べられない」
- quantity_update: 残量・在庫数を教えている（書き換えではなく特定食材の数量だけ変更）。例：「じゃがいも残り2個」「牛乳あと半分」
- other: 上記に当てはまらない

重要：「書き換えて」「入れ替えて」「差し替えて」「置き換えて」「上書きして」「だけにして」などの表現が含まれる場合は必ず fridge_overwrite に分類する。fridge_addと混同しないこと。
重要：「買い物リストに追加」「買い物リストへ追加」「買い物リストに入れて」などの表現があれば必ず shopping_add に分類する。bought_itemと混同しないこと。
itemsは食材名・商品名のリスト（複数可）。
【重要】食材が複数ある場合は全件漏れなくitemsに含めること。省略・要約は絶対禁止。
【B10対応】食材名が連続して書かれている場合（例：「ナス3本牛乳バター」「もやしきゅうりほうれんそう」「じゃがいも人参玉ねぎ」）は食材ごとに必ず分割してitemsに入れること。
改行・スペース・読点・句点・「と」「や」「あと」などの区切り文字で分割し、数量は無視して食材名のみを抽出すること。
【B9対応】quantityは数量を単位付きで抽出すること（例：「300g」「2本」「半分」「1袋」）。単位なし数字のみの場合はnullとすること。複数食材がある場合はquantityはnull。。
themeは気分・テーマの内容（「和食」「さっぱり系」など）、なければnull。
memberNameは家族メンバー名（「子供」「夫」など）、なければnull。
preferenceは好み内容（「人参嫌い」「ピーマン食べられない」など）、なければnull。`,
        },
        { role: 'user', content: text },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'intent_result',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              intent: { type: 'string', enum: ['shopping_add','fridge_add','fridge_overwrite','ingredients_only','used_ingredient','bought_item','menu_vague','mood_theme','family_preference','quantity_update','other'] },
              items: { type: 'array', items: { type: 'string' } },
              quantity: { type: ['string', 'null'] },
              theme: { type: ['string', 'null'] },
              memberName: { type: ['string', 'null'] },
              preference: { type: ['string', 'null'] },
            },
            required: ['intent', 'items', 'quantity', 'theme', 'memberName', 'preference'],
            additionalProperties: false,
          },
        },
      },
    });
    const content = resp.choices[0]?.message?.content;
    const parsed = typeof content === 'string' ? JSON.parse(content) : content;
    return parsed as IntentResult;
  } catch {
    return { intent: 'other', items: [], quantity: null, theme: null, memberName: null, preference: null };
  }
}

// ─── 意図判定結果に応じた3択メッセージを送信し、pendingActionをセット ──────────────────────────
async function handleIntentAction(
  intentResult: IntentResult,
  text: string,
  lineUserId: string,
  userId: number | null,
  replyToken: string
): Promise<boolean> {
  const { intent, items, quantity, theme, memberName, preference } = intentResult;

  if (intent === 'other') return false; // 通常処理へ

  const itemDisplay = items.join('、') || text;

  switch (intent) {
    case 'shopping_add': {
      // 買い物リストに直接追加
      if (!userId) {
        await replyLineMessage(replyToken, [{ type: 'text', text: 'ユーザー登録が必要です。ダッシュボードからログインしてください。' }], lineUserId);
        return true;
      }
      // トライアルユーザーは買い物リスト機能不可
      const _isTrialForShopping = await getUserIsTrial(userId);
      if (_isTrialForShopping) {
        await replyLineMessage(replyToken, [{ type: 'text', text: '買い物リストはカード登録後にご利用いただけます。\n\nカード登録でプレミアム機能が使えるようになります！' }], lineUserId);
        return true;
      }
      try {
        const db = await getDb();
        if (db && items.length > 0) {
          const added: string[] = [];
          const today = new Date();
          for (const itemName of items) {
            if (!itemName.trim()) continue;
            const existing = await db.select().from(shoppingListItems).where(eq(shoppingListItems.userId, userId)).then(rows => rows.find(r => r.name === itemName.trim()));
            if (!existing) {
              await db.insert(shoppingListItems).values({ userId, name: itemName.trim(), quantity: null, isChecked: false, listDate: today });
              added.push(itemName.trim());
            }
          }
          if (added.length > 0) {
            await replyLineMessage(replyToken, [{ type: 'text', text: `✅ 買い物リストに「${added.join('、')}」を追加しました！` }], lineUserId);
          } else {
            await replyLineMessage(replyToken, [{ type: 'text', text: `「${itemDisplay}」はすでに買い物リストに登録済みです。` }], lineUserId);
          }
        } else {
          await replyLineMessage(replyToken, [{ type: 'text', text: '買い物リストに追加する食材が認識できませんでした。' }], lineUserId);
        }
      } catch (err) {
        console.error('[LINE] shopping_add error:', err);
        await replyLineMessage(replyToken, [{ type: 'text', text: '買い物リストへの追加に失敗しました。もう一度お試しください。' }], lineUserId);
      }
      return true;
    }
    case 'fridge_overwrite': {
      // 冷蔵庫の中身を全部書き換え
      if (!userId) {
        await replyLineMessage(replyToken, [{ type: 'text', text: 'ユーザー登録が必要です。ダッシュボードからログインしてください。' }], lineUserId);
        return true;
      }
      if (items.length === 0) {
        await replyLineMessage(replyToken, [{ type: 'text', text: '書き換える食材が認識できませんでした。例：「冷蔵庫を豚肉・卵・キャベツに書き換えて」' }], lineUserId);
        return true;
      }
      try {
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        // 全削除
        const deletedCount = await clearAllFridgeItems(userId);
        // 新しい食材を登録（同義語正規化・数量なし→1）
        const added: string[] = [];
        const noQtyItems: string[] = [];
        // 書き換え時は全件の数量をLLMから再抽出（classifyUserIntentのitemsには数量が含まれていないため）
        // 元のテキストから食材名と数量を再抽出する
        let itemsWithQty: Array<{ name: string; qty: string | null }> = [];
        try {
          const extractResp = await invokeLLM({
            messages: [
              { role: 'system', content: `ユーザーのメッセージから食材名と数量を抽出してJSON配列で返してください。
重要ルール：
- 数量は必ず単位付き文字列で返す（例："3個"、"300g"、"2本"、"半分"、"1袋"）
- 単位なし数字のみの場合：100未満は"個"を付ける、100以上は"g"を付ける
- 数量がない場合はnullを返す
- 食材名は必ず分割して全件返す（省略禁止）
例： [{"name":"豚肉","qty":"300g"},{"name":"卵","qty":null},{"name":"キャベツ","qty":null}]` },
              { role: 'user', content: text },
            ],
            response_format: { type: 'json_object' },
          });
          const extractContent = extractResp.choices[0]?.message?.content;
          const extractStr = typeof extractContent === 'string' ? extractContent : JSON.stringify(extractContent ?? '[]');
          const extractParsed = JSON.parse(extractStr);
          itemsWithQty = Array.isArray(extractParsed) ? extractParsed : (extractParsed.items ?? extractParsed.ingredients ?? []);
        } catch {
          // 抽出失敗時はitemsを数量なしで使用
          itemsWithQty = items.map(name => ({ name, qty: null }));
        }
        for (const { name, qty } of itemsWithQty) {
          if (!name?.trim()) continue;
          const normalizedName = await resolveProductName(name.trim());
          const finalQty = qty ?? null;
          if (!finalQty) noQtyItems.push(normalizedName);
          await db.insert(fridgeItemsTable).values({ userId, name: normalizedName, quantity: finalQty, category: 'other' });
          added.push(finalQty ? `${normalizedName}（${finalQty}）` : normalizedName);
        }
        let replyText = `🔄 冷蔵庫を書き換えました！

❌ 削除：${deletedCount}件
✅ 新しく登録：${added.join('・')}`;
        if (noQtyItems.length > 0) {
          replyText += `

⚠️ 数量の記載がなかった食材（${noQtyItems.join('、')}）は「1」で登録しました。正確な数量はダッシュボードの冷蔵庫画面から調整してください。`;
        }
        await replyLineMessage(replyToken, [{ type: 'text', text: replyText }], lineUserId);
      } catch (err) {
        console.error('[LINE] fridge_overwrite error:', err);
        await replyLineMessage(replyToken, [{ type: 'text', text: '冷蔵庫の書き換えに失敗しました。もう一度お試しください。' }], lineUserId);
      }
      return true;
    }
    case 'fridge_add': {
      // 冷蔵庫に直接追加
      if (!userId) {
        await replyLineMessage(replyToken, [{ type: 'text', text: 'ユーザー登録が必要です。ダッシュボードからログインしてください。' }], lineUserId);
        return true;
      }
      try {
        const db = await getDb();
        if (db && items.length > 0) {
          const added: string[] = [];
          // 食材が1つで数量がある場合はその数量を使う
          const itemQty = items.length === 1 && quantity ? quantity : null;
          // B6: 全冷蔵庫データを一括取得してfindMatchingFridgeItemで表記ゆれ対応マージ
          const allFridgeRows = await db.select().from(fridgeItemsTable).where(eq(fridgeItemsTable.userId, userId));
          for (const itemName of items) {
            if (!itemName.trim()) continue;
            const normalizedName = await resolveProductName(itemName.trim());
            const existing = findMatchingFridgeItem(allFridgeRows, normalizedName);
            if (existing) {
              // 既存あり：数量があれば更新、なければupdatedAtのみ更新（重複登録しない）
              const updateData: { updatedAt: Date; quantity?: string } = { updatedAt: new Date() };
              if (itemQty) updateData.quantity = itemQty;
              await db.update(fridgeItemsTable).set(updateData).where(eq(fridgeItemsTable.id, existing.id));
            } else {
              await db.insert(fridgeItemsTable).values({ userId, name: normalizedName, quantity: itemQty, category: 'other' });
            }
            added.push(itemQty ? `${normalizedName}（${itemQty}）` : normalizedName);
          }
          await replyLineMessage(replyToken, [{ type: 'text', text: `✅ 冷蔵庫に「${added.join('、')}」を登録しました！` }], lineUserId);
        } else {
          await replyLineMessage(replyToken, [{ type: 'text', text: '冷蔵庫に登録する食材が認識できませんでした。' }], lineUserId);
        }
      } catch (err) {
        console.error('[LINE] fridge_add error:', err);
        await replyLineMessage(replyToken, [{ type: 'text', text: '冷蔵庫への登録に失敗しました。もう一度お試しください。' }], lineUserId);
      }
      return true;
    }
    case 'ingredients_only': {
      // B10: itemsが1件かつ入力が長い場合（連続入力の可能性）はフォールバック分割を試みる
      let resolvedItems = items;
      if (items.length === 1 && text.length > 8) {
        // 読点・スペース・改行・「と」「や」「、」「・」で分割を試みる
        const splitResult = text
          .replace(/[\d０-９]+[個本袋枚切れgGkgmlML]/g, '') // 数量を除去
          .split(/[、。,\s・と や\n]+/)
          .map(s => s.trim())
          .filter(s => s.length > 0 && s.length <= 15);
        if (splitResult.length > 1) {
          resolvedItems = splitResult;
        }
      }
      const resolvedDisplay = resolvedItems.join('、') || text;
      await setLineUserPendingAction(lineUserId, { type: 'voice_ingredient_action', transcribedText: text, ingredients: resolvedItems });
      await replyLineMessage(replyToken, [{ type: 'text', text: `「${resolvedDisplay}」ですね！\n\nどうしますか？\n\n1️⃣ 冷蔵庫に追加\n2️⃣ 買い物リストに追加\n3️⃣ この食材で献立を提案\n\n`, quickReply: { items: [
        { type: 'action', action: { type: 'message', label: '🍱 冷蔵庫に追加', text: '1' } },
        { type: 'action', action: { type: 'message', label: '🛒 買い物リストに', text: '2' } },
        { type: 'action', action: { type: 'message', label: '🍽️ 献立を提案', text: '3' } },
      ] } }], lineUserId);
      return true;
    }
    case 'used_ingredient': {
      await setLineUserPendingAction(lineUserId, { type: 'used_ingredient_action', items, text });
      await replyLineMessage(replyToken, [{ type: 'text', text: `「${itemDisplay}」を使ったんですね！\n\nどうしますか？\n\n1️⃣ 冷蔵庫から削除\n2️⃣ 数量を減らす\n3️⃣ そのまま（何もしない）\n\n`, quickReply: { items: [
        { type: 'action', action: { type: 'message', label: '🗑️ 冷蔵庫から削除', text: '1' } },
        { type: 'action', action: { type: 'message', label: '➖ 数量を減らす', text: '2' } },
        { type: 'action', action: { type: 'message', label: '✅ そのまま', text: '3' } },
      ] } }], lineUserId);
      return true;
    }
    case 'bought_item': {
      await setLineUserPendingAction(lineUserId, { type: 'bought_item_action', items, text });
      await replyLineMessage(replyToken, [{ type: 'text', text: `「${itemDisplay}」を買ってきたんですね！\n\nどうしますか？\n\n1️⃣ 冷蔵庫に追加\n2️⃣ 買い物リストから削除\n3️⃣ 両方（冷蔵庫追加＋リスト削除）\n\n`, quickReply: { items: [
        { type: 'action', action: { type: 'message', label: '🍱 冷蔵庫に追加', text: '1' } },
        { type: 'action', action: { type: 'message', label: '🗑️ リストから削除', text: '2' } },
        { type: 'action', action: { type: 'message', label: '✨ 両方実行', text: '3' } },
      ] } }], lineUserId);
      return true;
    }
    case 'menu_vague': {
      // 献立提案フローへ直接誘導
      await handleLineWebhookEvent({
        type: 'message',
        source: { userId: lineUserId },
        replyToken,
        message: { type: 'text', text: '献立' },
      }, true);
      return true;
    }
    case 'mood_theme': {
      // トライアルユーザーは献立テーマ機能不可
      if (userId) {
        const _isTrialForTheme = await getUserIsTrial(userId);
        if (_isTrialForTheme) {
          await replyLineMessage(replyToken, [{ type: 'text', text: '献立テーマ設定はカード登録後にご利用いただけます。\n\nカード登録でプレミアム機能が使えるようになります！' }], lineUserId);
          return true;
        }
      }
      const themeText = theme || itemDisplay;
      await setLineUserPendingAction(lineUserId, { type: 'mood_theme_action', theme: themeText, text });
      await replyLineMessage(replyToken, [{ type: 'text', text: `「${themeText}」の気分ですね！\n\nどうしますか？\n\n1️⃣ 今日の献立テーマに設定して提案\n2️⃣ キャンセル\n\n`, quickReply: { items: [
        { type: 'action', action: { type: 'message', label: '🍽️ テーマに設定して提案', text: '1' } },
        { type: 'action', action: { type: 'message', label: '❌ キャンセル', text: '2' } },
      ] } }], lineUserId);
      return true;
    }
    case 'family_preference': {
      const member = memberName || '家族';
      const pref = preference || text;
      await setLineUserPendingAction(lineUserId, { type: 'family_preference_action', memberName: member, preference: pref, items, text });
      await replyLineMessage(replyToken, [{ type: 'text', text: `「${member}が${pref}」ですね！\n\nどうしますか？\n\n1️⃣ 好み・嫌いとして登録\n2️⃣ キャンセル\n\n`, quickReply: { items: [
        { type: 'action', action: { type: 'message', label: '✅ 好み・嫌いを登録', text: '1' } },
        { type: 'action', action: { type: 'message', label: '❌ キャンセル', text: '2' } },
      ] } }], lineUserId);
      return true;
    }
    case 'quantity_update': {
      const qty = quantity || '不明';
      await setLineUserPendingAction(lineUserId, { type: 'quantity_update_action', items, quantity: qty, text });
      await replyLineMessage(replyToken, [{ type: 'text', text: `「${itemDisplay}が${qty}」ですね！\n\nどうしますか？\n\n1️⃣ 冷蔵庫の数量を更新\n2️⃣ 在庫確認（現在の冷蔵庫を表示）\n3️⃣ キャンセル\n\n`, quickReply: { items: [
        { type: 'action', action: { type: 'message', label: '✏️ 数量を更新', text: '1' } },
        { type: 'action', action: { type: 'message', label: '🔍 在庫確認', text: '2' } },
        { type: 'action', action: { type: 'message', label: '❌ キャンセル', text: '3' } },
      ] } }], lineUserId);
      return true;
    }
  }
  return false;
}

async function handleFridgeRegistration(
  text: string,
  userId: number,
  lineUserId: string,
  replyToken: string
): Promise<boolean> {  // ─── Step 1: pendingActionがある場合（数量入力待ち・献立タイプ選択待ち）──────────────────────────────
  const pending = await getLineUserPendingAction(lineUserId);

  // ─── 買い物ヒアリング待ちの場合 ──────────────────────────────────────────────────
  if (pending?.type === 'shopping_hearing') {
    const { hourJST } = pending as { hourJST: number; askedAt: number };
    const trimmed = text.trim();

    // キャンセル判定
    if (/^(キャンセル|cancel|やめる|やめて|やっぱりやめる|やっぱりキャンセル)$/i.test(trimmed)) {
      await setLineUserPendingAction(lineUserId, null);
      await replyLineMessage(replyToken, [{ type: 'text', text: 'キャンセルしました。またいつでも「献立」と送ってください！' }], lineUserId);
      return true;
    }

    // ─── レシピ割り込み：フロー中でもレシピ要求が来たら優先処理 ──────────────────
    const recipeInterruptMatch = trimmed.match(/(.+?)のレシピ(?:を|が|は)?(?:教えて|見せて|知りたい|教えてください|見たい|ください)?$/);
    if (recipeInterruptMatch) {
      // pendingをクリアして上位のレシピ処理に委譲
      await setLineUserPendingAction(lineUserId, null);
      return false;
    }

    // 買い物あり（1）または買い物なし（2）の判定
    const willShop = /^[1１]$/.test(trimmed) || /はい|行く|あり|予定です/.test(trimmed);
    const willNotShop = /^[2２]$/.test(trimmed) || /いいえ|行かない|ない|今ある食材/.test(trimmed);

    if (!willShop && !willNotShop) {
      await replyLineMessage(replyToken, [{ type: 'text', text: `1または2の\n\n1️⃣ はい、行く予定です\n2️⃣ いいえ、今ある食材で作ります`, quickReply: { items: [
        { type: 'action', action: { type: 'message', label: '🛒 はい、行く予定', text: 'はい、行く予定です' } },
        { type: 'action', action: { type: 'message', label: '🏠 今ある食材で', text: 'いいえ、今ある食材で作ります' } },
        { type: 'action', action: { type: 'message', label: '❌ やっぱりやめる', text: 'キャンセル' } },
      ] } }], lineUserId);
      return true;
    }

    // 買い物予定を記録して献立タイプ選択へ進む
    let questionText: string;
    let pendingChoices: Record<string, string>;
    const shopNote = willShop ? '買い物を考慮した献立を提案します！' : '今ある食材で作れる献立を提案します！';

    if (hourJST >= 5 && hourJST < 15) {
      // 朝〜昼：朝食/昼食か夕飯か
      questionText = `${shopNote}

どの献立を考えましょうか？

1️⃣ 今日の朝食・昼食
2️⃣ 今夜の夕飯

番号か「朝食」「夕飯」などで教えてください😊`;
      pendingChoices = {
        '1': 'breakfast',
        '今日の朝食・昼食': 'breakfast',
        '朝食・昼食': 'breakfast',
        '朝食': 'breakfast',
        '朝': 'breakfast',
        '昼食': 'lunch',
        'ランチ': 'lunch',
        '2': 'dinner',
        '今夜の夕飯': 'dinner',
        '夕飯': 'dinner',
        '夕食': 'dinner',
        '今夜': 'dinner',
        '晩ごはん': 'dinner',
      };
    } else if (hourJST >= 15 && hourJST < 22) {
      // 夕方〜夜：今晩か明日分まとめてか
      questionText = `${shopNote}

今夜の献立ですか？それとも明日分まで考えますか？

1️⃣ 今夜の夕飯だけ
2️⃣ 今夜＋明日の朝食まで`;
      pendingChoices = {
        '1': 'dinner',
        '今夜': 'dinner',
        '今日': 'dinner',
        '夕飯': 'dinner',
        '夕食': 'dinner',
        '今夜の夕飯だけ': 'dinner',
        '2': 'dinner_and_tomorrow_breakfast',
        '明日も': 'dinner_and_tomorrow_breakfast',
        'まとめて': 'dinner_and_tomorrow_breakfast',
        '両方': 'dinner_and_tomorrow_breakfast',
        '今夜＋明日の朝食まで': 'dinner_and_tomorrow_breakfast',
        '今夜の夕飯＋明日の朝食': 'dinner_and_tomorrow_breakfast',
      };
    } else {
      // 深夜（22時以降）：明日の朝食か夕飯までまとめてか
      questionText = `${shopNote}

明日の献立を考えましょうか？

1️⃣ 明日の朝食
2️⃣ 明日の夕飯まで（朝・昼・夕）`;
      pendingChoices = {
        '1': 'tomorrow_breakfast',
        '朝食': 'tomorrow_breakfast',
        '朝': 'tomorrow_breakfast',
        '明日の朝食': 'tomorrow_breakfast',
        '2': 'tomorrow_dinner',
        '夕飯': 'tomorrow_dinner',
        '夕食': 'tomorrow_dinner',
        '全部': 'tomorrow_dinner',
        'まとめて': 'tomorrow_dinner',
        '明日の夕飯まで': 'tomorrow_dinner',
        '明日まとめて': 'tomorrow_dinner',
      };
    }

    // クイックリプライアイテムを時間帯に合わせて生成
    const cancelQR = { type: 'action' as const, action: { type: 'message' as const, label: '❌ やっぱりやめる', text: 'キャンセル' } };
    const qrItems = hourJST >= 5 && hourJST < 15
      ? [
          { type: 'action' as const, action: { type: 'message' as const, label: '🌅 朝食・昼食', text: '今日の朝食・昼食' } },
          { type: 'action' as const, action: { type: 'message' as const, label: '🌙 今夜の夕飯', text: '今夜の夕飯' } },
          cancelQR,
        ]
      : hourJST >= 15 && hourJST < 22
      ? [
          { type: 'action' as const, action: { type: 'message' as const, label: '🌙 今夜だけ', text: '今夜の夕飯だけ' } },
          { type: 'action' as const, action: { type: 'message' as const, label: '🌅 明日朝食も', text: '今夜＋明日の朝食まで' } },
          cancelQR,
        ]
      : [
          { type: 'action' as const, action: { type: 'message' as const, label: '🌅 明日の朝食', text: '明日の朝食' } },
          { type: 'action' as const, action: { type: 'message' as const, label: '🍽️ 明日まとめて', text: '明日の夕飯まで' } },
          cancelQR,
        ];
    await setLineUserPendingAction(lineUserId, {
      type: 'menu_type_selection',
      choices: pendingChoices,
      willShop,
      askedAt: Date.now(),
    });
    await replyLineMessage(replyToken, [{ type: 'text', text: questionText, quickReply: { items: qrItems } }], lineUserId);
    return true;
  }

  // 献立タイプ選択待ちの場合
  if (pending?.type === 'menu_type_selection') {
    const { choices, willShop: pendingWillShop } = pending as { choices: Record<string, string>; willShop?: boolean; askedAt: number };
    const trimmed = text.trim();

    // キャンセル判定を先に行う（selectedTypeチェックの前）
    if (/^(キャンセル|cancel|やめる|やめて|いいえ|no)$/i.test(trimmed)) {
      await setLineUserPendingAction(lineUserId, null);
      await replyLineMessage(replyToken, [{ type: 'text', text: 'キャンセルしました。またいつでも「献立」と送ってください！' }], lineUserId);
      return true;
    }

    // 週間献立・リッチメニューボタンなど特定キーワードは状態を無視して優先処理
    const weeklyMenuKeywords = ['週間献立', '献立予定表', '週間献立を見る', '週間献立を確認', '今週の献立を見せて', '今週の献立を確認'];
    if (weeklyMenuKeywords.some(kw => trimmed === kw || trimmed.includes(kw))) {
      await setLineUserPendingAction(lineUserId, null);
      return false; // 通常フローに戻して週間献立処理に委ねる
    }

    const selectedType = choices[trimmed];

    if (!selectedType) {
      // 不明な入力→再度聴く（クイックリプライ付き）
      const _nowJST2 = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const _hourJST2 = _nowJST2.getUTCHours();
      const _retryQR = _hourJST2 >= 5 && _hourJST2 < 15
        ? [
            { type: 'action' as const, action: { type: 'message' as const, label: '🌅 朝食・昼食', text: '今日の朝食・昼食' } },
            { type: 'action' as const, action: { type: 'message' as const, label: '🌙 今夜の夕飯', text: '今夜の夕飯' } },
            { type: 'action' as const, action: { type: 'message' as const, label: '❌ やっぱりやめる', text: 'キャンセル' } },
          ]
        : _hourJST2 >= 15 && _hourJST2 < 22
        ? [
            { type: 'action' as const, action: { type: 'message' as const, label: '🌙 今夜だけ', text: '今夜の夕飯だけ' } },
            { type: 'action' as const, action: { type: 'message' as const, label: '🌅 明日朝食も', text: '今夜＋明日の朝食まで' } },
            { type: 'action' as const, action: { type: 'message' as const, label: '❌ やっぱりやめる', text: 'キャンセル' } },
          ]
        : [
            { type: 'action' as const, action: { type: 'message' as const, label: '🌅 明日の朝食', text: '明日の朝食' } },
            { type: 'action' as const, action: { type: 'message' as const, label: '🍽️ 明日まとめて', text: '明日の夕飯まで' } },
            { type: 'action' as const, action: { type: 'message' as const, label: '❌ やっぱりやめる', text: 'キャンセル' } },
          ];
      await replyLineMessage(replyToken, [
        { type: 'text', text: '番号か「夕飯」「朝食」などで教えてください😊\n\nキャンセルする場合は「キャンセル」と送ってください', quickReply: { items: _retryQR } }
      ], lineUserId);
      return true;
    }

    await setLineUserPendingAction(lineUserId, null);

    try {
      const today = new Date().toISOString().split('T')[0];
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      if (selectedType === 'dinner_and_tomorrow_breakfast') {
        // 今夜の夕食＋明日の朝食を順に生成
        const dinnerResult = await generateMenuPlan(userId, today, 'dinner', pendingWillShop);
        const breakfastResult = await generateMenuPlan(userId, tomorrow, 'tomorrow_breakfast', pendingWillShop);
        const combinedMessage = `${dinnerResult.message}

―――――――――――――――――

${breakfastResult.message}`;
        await replyLineMessage(replyToken, [{ type: 'text', text: combinedMessage }], lineUserId);

        // 夕食＋朝食の両方の選択肢をpendingActionに保存
        const dinnerPlan = await getMenuPlanByDate(userId, today);
        const breakfastPlan = await getMenuPlanByDate(userId, tomorrow);
        const dinnerPlanData = dinnerPlan ? (typeof dinnerPlan.menuData === 'string' ? JSON.parse(dinnerPlan.menuData) : dinnerPlan.menuData) : null;
        const breakfastPlanData = breakfastPlan ? (typeof breakfastPlan.menuData === 'string' ? JSON.parse(breakfastPlan.menuData) : breakfastPlan.menuData) : null;
        if (dinnerPlanData?.dinnerOptions && breakfastPlanData?.dinnerOptions) {
          await setLineUserPendingAction(lineUserId, {
            type: 'menu_option_selection_dual',
            dinnerOptions: dinnerPlanData.dinnerOptions,
            breakfastOptions: breakfastPlanData.dinnerOptions,
            dinnerDate: today,
            breakfastDate: tomorrow,
            dinnerMenuPlanId: dinnerPlan!.id,
            breakfastMenuPlanId: breakfastPlan!.id,
            askedAt: Date.now(),
          });
        }
      } else if (selectedType === 'tomorrow_dinner') {
        // 明日の朝食＋昼食＋夕食を順に生成
        const bfResult = await generateMenuPlan(userId, tomorrow, 'tomorrow_breakfast', pendingWillShop);
        const lunchResult = await generateMenuPlan(userId, tomorrow, 'lunch', pendingWillShop);
        const dinnerResult = await generateMenuPlan(userId, tomorrow, 'dinner', pendingWillShop);
        const combinedMessage = `🌟 明日の献立をまとめて提案します！

${bfResult.message}

―――――――――――――――――

${lunchResult.message}

―――――――――――――――――

${dinnerResult.message}`;
        await replyLineMessage(replyToken, [{ type: 'text', text: combinedMessage }], lineUserId);
      } else {
        // 単一食事タイプ
        const mealType = selectedType as import('./menu').MealType;
        const targetDate = (selectedType === 'tomorrow_breakfast') ? tomorrow : today;
        const result = await generateMenuPlan(userId, targetDate, mealType, pendingWillShop);
        // 夕食・翌日朝食の場合は3案提示するのでクイックリプライを付ける
        if ((mealType === 'dinner' || mealType === 'tomorrow_breakfast') && result.options && result.options.length > 0) {
          const qrMenuItems = [
            ...result.options.slice(0, 3).map((o, i) => ({
              type: 'action' as const,
              action: { type: 'message' as const, label: `${i + 1}. ${o.name.slice(0, 16)}`, text: o.name },
            })),
            ...result.options.slice(0, 3).map((o) => ({
              type: 'action' as const,
              action: { type: 'message' as const, label: `📖 ${o.name.slice(0, 14)}のレシピ`, text: `${o.name}のレシピ教えて` },
            })),
            { type: 'action' as const, action: { type: 'message' as const, label: '🏒 献立をやり直す', text: '献立をやり直す' } },
            { type: 'action' as const, action: { type: 'message' as const, label: '❌ やっぱりやめる', text: 'キャンセル' } },
          ];
          await replyLineMessage(replyToken, [{ type: 'text', text: result.message + '\n\n👇 下のボタンから選んでね！', quickReply: { items: qrMenuItems } }], lineUserId);
          // DBからdinnerOptionsを取得してpendingActionに保存
          const savedPlan = await getMenuPlanByDate(userId, targetDate);
          if (savedPlan) {
            try {
              const planData = typeof savedPlan.menuData === 'string' ? JSON.parse(savedPlan.menuData) : savedPlan.menuData;
              if (planData?.dinnerOptions) {
                await setLineUserPendingAction(lineUserId, {
                  type: 'menu_option_selection',
                  options: planData.dinnerOptions,
                  mealType,
                  targetDate,
                  menuPlanId: savedPlan.id,
                  askedAt: Date.now(),
                });
              }
            } catch { /* ignore parse error */ }
          }
        } else {
          await replyLineMessage(replyToken, [{ type: 'text', text: result.message }], lineUserId);
        }

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
      await replyLineMessage(replyToken, [{ type: 'text', text: '申し訳ありません。献立の生成に失敗しました。しばらくしてからもう一度お試しください。' }], lineUserId);
    }
    return true;
  }

  // ─── 夕食＋朝食同時提案の選択待ち（数字のみ送信時に食事タイプを確認）─────────────────────────────────────────────────────
  if (pending?.type === 'menu_option_selection_dual') {
    const { dinnerOptions, breakfastOptions, dinnerDate, breakfastDate, dinnerMenuPlanId, breakfastMenuPlanId } = pending as {
      dinnerOptions: Array<{ name: string; mainIngredients: string[]; usedFridgeItems: string[] }>;
      breakfastOptions: Array<{ name: string; mainIngredients: string[]; usedFridgeItems: string[] }>;
      dinnerDate: string;
      breakfastDate: string;
      dinnerMenuPlanId: number;
      breakfastMenuPlanId: number;
    };
    const trimmed = text.trim();

    // キャンセル
    if (/^(キャンセル|やめる|やめて|cancel|いいえ)$/i.test(trimmed)) {
      await setLineUserPendingAction(lineUserId, null);
      await replyLineMessage(replyToken, [{ type: 'text', text: 'キャンセルしました。またいつでも「献立」と送ってください！' }], lineUserId);
      return true;
    }

    // 「夕食1」「朝食2」のように食事タイプ＋番号で直接指定
    const dinnerDirectMatch = trimmed.match(/^(夕食|夕飯|今夜|ディナー)([1-3１-３])/);
    const breakfastDirectMatch = trimmed.match(/^(朝食|朝ごはん|朝|モーニング)([1-3１-３])/);

    if (dinnerDirectMatch) {
      const numStr = dinnerDirectMatch[2].replace(/[１-３]/g, (c) => String(c.charCodeAt(0) - 0xFF10));
      const idx = parseInt(numStr, 10) - 1;
      const selected = dinnerOptions[idx];
      if (selected) {
        await setLineUserPendingAction(lineUserId, {
          type: 'menu_option_confirm',
          selectedIndex: idx,
          selectedName: selected.name,
          options: dinnerOptions,
          mealType: 'dinner',
          targetDate: dinnerDate,
          menuPlanId: dinnerMenuPlanId,
          askedAt: Date.now(),
        });
        await replyLineMessage(replyToken, [{
          type: 'text',
          text: `夕食${numStr}番（${selected.name}）ですね！\n\n1️⃣ レシピを表示する\n2️⃣ 違う献立を選び直す\n3️⃣ 案内を終了する\n4️⃣ 献立をやり直す（新しく生成）`,
          quickReply: { items: [
            { type: 'action', action: { type: 'message', label: '📖 レシピを見たい', text: 'レシピを見たい' } },
            { type: 'action', action: { type: 'message', label: '🔄 違う献立を選び直す', text: '選び直したい' } },
            { type: 'action', action: { type: 'message', label: '✅ 案内を終了する', text: '案内を終了する' } },
            { type: 'action', action: { type: 'message', label: '🎲 献立をやり直す', text: '献立をやり直す' } },
            { type: 'action', action: { type: 'message', label: '📝 今日の食事として記録', text: '今日の食事として記録する' } },
          ] },
        }], lineUserId);
        return true;
      }
    }

    if (breakfastDirectMatch) {
      const numStr = breakfastDirectMatch[2].replace(/[１-３]/g, (c) => String(c.charCodeAt(0) - 0xFF10));
      const idx = parseInt(numStr, 10) - 1;
      const selected = breakfastOptions[idx];
      if (selected) {
        await setLineUserPendingAction(lineUserId, {
          type: 'menu_option_confirm',
          selectedIndex: idx,
          selectedName: selected.name,
          options: breakfastOptions,
          mealType: 'tomorrow_breakfast',
          targetDate: breakfastDate,
          menuPlanId: breakfastMenuPlanId,
          askedAt: Date.now(),
        });
        await replyLineMessage(replyToken, [{
          type: 'text',
          text: `朝食${numStr}番（${selected.name}）ですね！\n\n1️⃣ レシピを表示する\n2️⃣ 違う献立を選び直す\n3️⃣ 案内を終了する\n4️⃣ 献立をやり直す（新しく生成）`,
          quickReply: { items: [
            { type: 'action', action: { type: 'message', label: '📖 レシピを見たい', text: 'レシピを見たい' } },
            { type: 'action', action: { type: 'message', label: '🔄 違う献立を選び直す', text: '選び直したい' } },
            { type: 'action', action: { type: 'message', label: '✅ 案内を終了する', text: '案内を終了する' } },
            { type: 'action', action: { type: 'message', label: '🎲 献立をやり直す', text: '献立をやり直す' } },
            { type: 'action', action: { type: 'message', label: '📝 今日の食事として記録', text: '今日の食事として記録する' } },
          ] },
        }], lineUserId);
        return true;
      }
    }

    // 数字のみ送信 → どちらの食事か確認する
    const numOnlyMatch = trimmed.match(/^([1-3１-３])$/);
    if (numOnlyMatch) {
      const numStr = numOnlyMatch[1].replace(/[１-３]/g, (c) => String(c.charCodeAt(0) - 0xFF10));
      const idx = parseInt(numStr, 10) - 1;
      const dinnerSelected = dinnerOptions[idx];
      const breakfastSelected = breakfastOptions[idx];
      const dinnerName = dinnerSelected?.name ?? `夕食${numStr}番`;
      const breakfastName = breakfastSelected?.name ?? `朝食${numStr}番`;
      // pendingActionはそのまま維持（次の返答でどちらか判断）
      await setLineUserPendingAction(lineUserId, {
        ...pending,
        type: 'menu_option_selection_dual',
        ambiguousNum: numStr,
        askedAt: Date.now(),
      });
      await replyLineMessage(replyToken, [{
        type: 'text',
        text: `「${numStr}」と認識しましたが、どちらの選択ですか？\n\n1️⃣ 夕食の${numStr}番（${dinnerName}）\n2️⃣ 朝食の${numStr}番（${breakfastName}）\n3️⃣ 出し直し（新しく提案）`,
      }], lineUserId);
      return true;
    }

    // 曖昧番号確認後の返答（1:夕食 2:朝食 3:出し直し）
    const { ambiguousNum } = pending as { ambiguousNum?: string };
    if (ambiguousNum) {
      const idx = parseInt(ambiguousNum, 10) - 1;
      if (/^[1１]$/.test(trimmed)) {
        // 夕食を選択
        const selected = dinnerOptions[idx];
        if (selected) {
          await setLineUserPendingAction(lineUserId, {
            type: 'menu_option_confirm',
            selectedIndex: idx,
            selectedName: selected.name,
            options: dinnerOptions,
            mealType: 'dinner',
            targetDate: dinnerDate,
            menuPlanId: dinnerMenuPlanId,
            pendingBreakfast: { options: breakfastOptions, targetDate: breakfastDate, menuPlanId: breakfastMenuPlanId },
            askedAt: Date.now(),
          });
          await replyLineMessage(replyToken, [{
            type: 'text',
            text: `夕食${ambiguousNum}番（${selected.name}）ですね！\n\n1️⃣ レシピを表示する\n2️⃣ 違う献立を選び直す\n3️⃣ 案内を終了する\n4️⃣ 献立をやり直す（新しく生成）`,
            quickReply: { items: [
              { type: 'action', action: { type: 'message', label: '📖 レシピを見たい', text: 'レシピを見たい' } },
              { type: 'action', action: { type: 'message', label: '🔄 違う献立を選び直す', text: '選び直したい' } },
              { type: 'action', action: { type: 'message', label: '✅ 案内を終了する', text: '案内を終了する' } },
              { type: 'action', action: { type: 'message', label: '🎲 献立をやり直す', text: '献立をやり直す' } },
            ] },
          }], lineUserId);
          return true;
        }
      } else if (/^[2２]$/.test(trimmed)) {
        // 朝食を選択
        const selected = breakfastOptions[idx];
        if (selected) {
          await setLineUserPendingAction(lineUserId, {
            type: 'menu_option_confirm',
            selectedIndex: idx,
            selectedName: selected.name,
            options: breakfastOptions,
            mealType: 'tomorrow_breakfast',
            targetDate: breakfastDate,
            menuPlanId: breakfastMenuPlanId,
            pendingDinner: { options: dinnerOptions, targetDate: dinnerDate, menuPlanId: dinnerMenuPlanId },
            askedAt: Date.now(),
          });
          await replyLineMessage(replyToken, [{
            type: 'text',
            text: `朝食${ambiguousNum}番（${selected.name}）ですね！\n\n1️⃣ レシピを表示する\n2️⃣ 違う献立を選び直す\n3️⃣ 案内を終了する\n4️⃣ 献立をやり直す（新しく生成）`,
            quickReply: { items: [
              { type: 'action', action: { type: 'message', label: '📖 レシピを見たい', text: 'レシピを見たい' } },
              { type: 'action', action: { type: 'message', label: '🔄 違う献立を選び直す', text: '選び直したい' } },
              { type: 'action', action: { type: 'message', label: '✅ 案内を終了する', text: '案内を終了する' } },
              { type: 'action', action: { type: 'message', label: '🎲 献立をやり直す', text: '献立をやり直す' } },
            ] },
          }], lineUserId);
          return true;
        }
      } else if (/^[3３]$/.test(trimmed)) {
        // 出し直し
        await setLineUserPendingAction(lineUserId, null);
        await replyLineMessage(replyToken, [{ type: 'text', text: '別の献立を提案しますね！\n\n「今日の献立」ともう一度送っていただくか、気分やテーマ（例：「和食がいい」「さっぱりしたもの」）を教えてください😊' }], lineUserId);
        return true;
      }
    }

    // それ以外 → pendingActionをクリアして通常処理へ
    await setLineUserPendingAction(lineUserId, null);
  }

  // ─── テーマ指定後の献立再生成待ちの場合 ─────────────────────────────────────────────────────────────────────────────
  if (pending?.type === 'menu_theme_regen') {
    const { mealType, targetDate, menuPlanId, regenerateCount } = pending as {
      mealType: string;
      targetDate: string;
      menuPlanId: number;
      regenerateCount: number;
    };
    const trimmed = text.trim();
    const theme = trimmed === 'なし' || trimmed === 'なし。' ? undefined : trimmed;

    // 課金限定テーマのチェック（無課金ユーザーが課金テーマを入力した場合は弾く）
    const premiumThemeKeywords = /ダイエット|カロリー|節約|コスパ|お祝い|記念日|低カロリー|ヘルシー|糖質|痩せ|減量/;
    if (theme && premiumThemeKeywords.test(theme)) {
      const isPremium = userId ? await getUserIsPremium(userId) : false;
      if (!isPremium) {
        // pendingActionは維持してテーマを再度聞く
        await setLineUserPendingAction(lineUserId, {
          type: 'menu_theme_regen',
          mealType,
          targetDate,
          menuPlanId,
          regenerateCount,
          askedAt: Date.now(),
        });
        await replyLineMessage(replyToken, [{
          type: 'text',
          text: `「${theme}」はプレミアム機能のテーマです✨\n\nhttps://kondatebiyori.com/plan からアップグレードすると利用できます！\n\n他のテーマを選んでください😊`,
          quickReply: { items: [
            { type: 'action', action: { type: 'message', label: '😌 さっぱり', text: 'さっぱり' } },
            { type: 'action', action: { type: 'message', label: '🍖 こってり', text: 'こってり' } },
            { type: 'action', action: { type: 'message', label: '🍱 和食', text: '和食' } },
            { type: 'action', action: { type: 'message', label: '🍝 洋食', text: '洋食' } },
            { type: 'action', action: { type: 'message', label: '🍜 麺類', text: '麺類' } },
            { type: 'action', action: { type: 'message', label: '➡️ テーマなし', text: 'なし' } },
          ] },
        }], lineUserId);
        return true;
      }
    }

    await setLineUserPendingAction(lineUserId, null);
    await sendLineMessage(lineUserId, [{ type: 'text', text: theme
      ? `「${theme}」のテーマで出し直しますね🍳\nちょっと待ってください...`
      : '新しい献立を出し直しますね🍳\nちょっと待ってください...' }]);

    const result = await generateMenuPlan(userId, targetDate, mealType as any, undefined, theme, true);

    // 出し直し後のクイックリプライを構築（夕食・明日の朝食は3択ボタン付き）
    const regenOptions = result.options ?? [];
    if (regenOptions.length > 0) {
      const regenQR = [
        ...regenOptions.slice(0, 3).map((o, i) => ({
          type: 'action' as const,
          action: { type: 'message' as const, label: `${['1️⃣','2️⃣','3️⃣'][i]} ${o.name}`.slice(0, 20), text: o.name },
        })),
        ...regenOptions.slice(0, 3).map((o) => ({
          type: 'action' as const,
          action: { type: 'message' as const, label: `📖 ${o.name.slice(0, 14)}のレシピ`, text: `${o.name}のレシピ教えて` },
        })),
        { type: 'action' as const, action: { type: 'message' as const, label: '🏒 もう一度出し直す', text: 'その他' } },
      ];
      await sendLineMessage(lineUserId, [{ type: 'text', text: result.message, quickReply: { items: regenQR } }]);
    } else {
      await sendLineMessage(lineUserId, [{ type: 'text', text: result.message }]);
    }

    if (result.menuPlanId) {
      await setLineUserPendingAction(lineUserId, {
        type: 'menu_option_selection',
        options: regenOptions,
        mealType,
        targetDate,
        menuPlanId: result.menuPlanId,
        regenerateCount: (regenerateCount ?? 0) + 1,
      });
    }
    return true; // ← AIチャットへ流れないようにフロー処理で終了
  }

  // ─── 献立候補選択待ちの場合（1/2/3の番号入力に対して復唱確認）─────────────────────────────────────────────────────
  if (pending?.type === 'menu_option_selection') {
    const { options, mealType, targetDate, menuPlanId } = pending as {
      options: Array<{ name: string; mainIngredients: string[]; usedFridgeItems: string[] }>;
      mealType: 'breakfast' | 'lunch' | 'dinner';
      targetDate: string;
      menuPlanId: number;
    };
    const trimmed = text.trim();

    // キャンセル
    if (/^(キャンセル|やめる|やめて|cancel|いいえ)$/i.test(trimmed)) {
      await setLineUserPendingAction(lineUserId, null);
      await replyLineMessage(replyToken, [{ type: 'text', text: 'キャンセルしました。またいつでも「献立」と送ってください！' }], lineUserId);
      return true;
    }

    // 「その他」ボタン → regenerateCountをチェックしてループ防止＋テーマ収集
    if (/^(その他|やり直し|やりなおし|献立をやり直す|別の|ほかの|other)$/i.test(trimmed)) {
      const regenerateCount = (pending as any).regenerateCount ?? 0;
      if (regenerateCount >= 3) {
        // 3回以上やり直しでループ強制終了
        await setLineUserPendingAction(lineUserId, null);
        await replyLineMessage(replyToken, [{ type: 'text', text: '何度も出し直しましたが、なかなか合うものがなくて申し訳ありません😓\n\n一度リセットします。「献立」と送ってもう一度最初から提案しましょうか？' }], lineUserId);
        return true;
      }
       // テーマ収集ステップへ
      await setLineUserPendingAction(lineUserId, {
        type: 'menu_theme_regen',
        mealType,
        targetDate,
        menuPlanId,
        regenerateCount: regenerateCount + 1,
        askedAt: Date.now(),
      });
      await replyLineMessage(replyToken, [{
        type: 'text',
        text: 'どんな気分ですか？テーマを選んでください😊\n\nボタン以外のテーマはそのままテキストで送ってもOKです！',
        quickReply: { items: [
          { type: 'action', action: { type: 'message', label: '😌 さっぱり', text: 'さっぱり' } },
          { type: 'action', action: { type: 'message', label: '🍖 こってり', text: 'こってり' } },
          { type: 'action', action: { type: 'message', label: '🍱 和食', text: '和食' } },
          { type: 'action', action: { type: 'message', label: '🍝 洋食', text: '洋食' } },
          { type: 'action', action: { type: 'message', label: '🍜 麵類', text: '麵類' } },
          { type: 'action', action: { type: 'message', label: '➡️ テーマなし', text: 'なし' } },
        ] },
      }], lineUserId);
      return true;
    }

    // 料理名で直接選択した場合 → 番号マッチと同様に処理
    const nameMatchIdx = options.findIndex(o => trimmed === o.name || trimmed.includes(o.name));
    if (nameMatchIdx >= 0) {
      const selected = options[nameMatchIdx];
      await setLineUserPendingAction(lineUserId, {
        type: 'menu_option_confirm',
        selectedIndex: nameMatchIdx,
        selectedName: selected.name,
        options,
        mealType,
        targetDate,
        menuPlanId,
        askedAt: Date.now(),
      });
      await replyLineMessage(replyToken, [{
        type: 'text',
        text: `「${selected.name}」ですね！

1️⃣ レシピを表示する
2️⃣ 違う献立を選び直す
3️⃣ 案内を終了する
4️⃣ 献立をやり直す（新しく生成）
5️⃣ 今日の食事として記録する

👇 下のボタンから選んでね！`,
        quickReply: { items: [
          { type: 'action', action: { type: 'message', label: '📖 レシピを表示', text: 'レシピを見たい' } },
          { type: 'action', action: { type: 'message', label: '🔄 違う献立を選び直す', text: '選び直したい' } },
          { type: 'action', action: { type: 'message', label: '✅ 案内を終了する', text: '案内を終了する' } },
          { type: 'action', action: { type: 'message', label: '🎲 献立をやり直す', text: '献立をやり直す' } },
          { type: 'action', action: { type: 'message', label: '📝 今日の食事として記録', text: '今日の食事として記録する' } },
        ] },
      }], lineUserId);
      return true;
    }
    // 「1」「2」「3」の番号入力 → 復唱確認
    const numMatch = trimmed.match(/^([1-3１-３])$/);
    if (numMatch) {
      const numStr = numMatch[1].replace(/[１-３]/g, (c) => String(c.charCodeAt(0) - 0xFF10));
      const idx = parseInt(numStr, 10) - 1;
      const selected = options[idx];
      if (selected) {
        await setLineUserPendingAction(lineUserId, {
          type: 'menu_option_confirm',
          selectedIndex: idx,
          selectedName: selected.name,
          options,
          mealType,
          targetDate,
          menuPlanId,
          askedAt: Date.now(),
        });
        await replyLineMessage(replyToken, [{
          type: 'text',
          text: `${numStr}番（${selected.name}）ですね！\n\n1️⃣ レシピを表示する\n2️⃣ 違う献立を選び直す\n3️⃣ 案内を終了する\n4️⃣ 献立をやり直す（新しく生成）`,
          quickReply: { items: [
            { type: 'action', action: { type: 'message', label: '📖 レシピを表示', text: 'レシピを見たい' } },
            { type: 'action', action: { type: 'message', label: '🔄 違う献立を選び直す', text: '選び直したい' } },
            { type: 'action', action: { type: 'message', label: '✅ 案内を終了する', text: '案内を終了する' } },
            { type: 'action', action: { type: 'message', label: '🎲 献立をやり直す', text: '献立をやり直す' } },
            { type: 'action', action: { type: 'message', label: '📝 今日の食事として記録', text: '今日の食事として記録する' } },
          ] },
        }], lineUserId);
        return true;
      } else {
        // 選択肢の範囲外の番号（例：2択なのに3を押した）
        const maxNum = options.length;
        const optionLines = options.map((o, i) => `${i + 1}. ${o.name}`).join('\n');
        await replyLineMessage(replyToken, [{ type: 'text', text: `今回の選択肢は${maxNum}つです😊\n\n${optionLines}\n\n${Array.from({length: maxNum}, (_, i) => i + 1).join('か')}で選んでください！` }], lineUserId);
        return true;
      }
    }

    // 「〇〇のレシピ教えて」（料理名付き）→ pendingを解除して通常のレシピフローに流す
    const recipeWithDishInSelection = trimmed.match(/(.+?)(?:の|の料理の)?レシピ(?:を|が|は)?(?:教えて|見せて|知りたい|教えてください|見たい|ください)?$/);
    if (recipeWithDishInSelection && recipeWithDishInSelection[1].trim().length > 0) {
      // pendingをクリアして通常処理（案Cのレシピフロー）に流す
      await setLineUserPendingAction(lineUserId, null);
      return false;
    }

    // 「レシピ」「教えて」などのキーワード → 全候補を再表示
    if (/レシピ|教えて|見せて/.test(trimmed)) {
      const optionLines = options.map((o, i) => `${['1️⃣','2️⃣','3️⃣'][i] ?? `${i+1}.`} ${o.name}`).join('\n');
      await replyLineMessage(replyToken, [{ type: 'text', text: `どの献立のレシピを見ますか？\n\n${optionLines}\n\n` }], lineUserId);
      return true;
    }

    // それ以外 → 候補を再表示して待機続行（通常処理に流さない）
    const optionLinesB2 = options.map((o, i) => `${['1️⃣','2️⃣','3️⃣'][i] ?? `${i+1}.`} ${o.name}`).join('\n');
    const quickReplyItemsB2 = [
      ...options.slice(0, 3).map((o, i) => ({
        type: 'action' as const,
        action: { type: 'message' as const, label: `${['1️⃣','2️⃣','3️⃣'][i]} ${o.name}`.slice(0, 20), text: o.name },
      })),
      { type: 'action' as const, action: { type: 'message' as const, label: 'キャンセル', text: 'キャンセル' } },
    ];
    await replyLineMessage(replyToken, [{ type: 'text', text: `番号（1〜${options.length}）で選んでください😊\n\n${optionLinesB2}\n\nキャンセルの場合は「キャンセル」と送ってください。`, quickReply: { items: quickReplyItemsB2 } }], lineUserId);
    return true;
  }

  // ─── 献立候補確認待ちの場合（復唱後の「はい」「レシピ」）─────────────────────────────────────────────────────
  if (pending?.type === 'menu_option_confirm') {
    const { selectedIndex, selectedName, options, mealType, targetDate, menuPlanId, pendingBreakfast, pendingDinner } = pending as {
      selectedIndex: number;
      selectedName: string;
      options: Array<{ name: string; mainIngredients: string[]; usedFridgeItems: string[] }>;
      mealType: string;
      targetDate: string;
      menuPlanId: number;
      pendingBreakfast?: { options: Array<{ name: string; mainIngredients: string[]; usedFridgeItems: string[] }>; targetDate: string; menuPlanId: number };
      pendingDinner?: { options: Array<{ name: string; mainIngredients: string[]; usedFridgeItems: string[] }>; targetDate: string; menuPlanId: number };
    };
    const trimmed = text.trim();

    // 「その他」→ regenerateCountを引き継いでテーマ収集へ
    if (/^(その他|やり直し|やりなおし|献立をやり直す|別の|ほかの|other)$/i.test(trimmed)) {
      const regenerateCount = (pending as any).regenerateCount ?? 0;
      if (regenerateCount >= 3) {
        await setLineUserPendingAction(lineUserId, null);
        await replyLineMessage(replyToken, [{ type: 'text', text: '何度も出し直しましたが、なかなか合うものがなくて申し訳ありません😓\n\n一度リセットします。「献立」と送ってもう一度最初から提案しましょうか？' }], lineUserId);
        return true;
      }
      await setLineUserPendingAction(lineUserId, {
        type: 'menu_theme_regen',
        mealType,
        targetDate,
        menuPlanId,
        regenerateCount: regenerateCount + 1,
        askedAt: Date.now(),
      });
      await replyLineMessage(replyToken, [{
        type: 'text',
        text: 'どんな気分ですか？テーマを選んでください😊\n\nボタン以外のテーマはそのままテキストで送ってもOKです！',
        quickReply: { items: [
          { type: 'action', action: { type: 'message', label: '😌 さっぱり', text: 'さっぱり' } },
          { type: 'action', action: { type: 'message', label: '🍖 こってり', text: 'こってり' } },
          { type: 'action', action: { type: 'message', label: '🍱 和食', text: '和食' } },
          { type: 'action', action: { type: 'message', label: '🍝 洋食', text: '洋食' } },
          { type: 'action', action: { type: 'message', label: '🍜 麵類', text: '麵類' } },
          { type: 'action', action: { type: 'message', label: '➡️ テーマなし', text: 'なし' } },
        ] },
      }], lineUserId);
      return true;
    }

    // 「3」または「案内を終了する」→ 終了メッセージのみ（実食記録を聞わない）
    if (/^[3３]$/.test(trimmed) || trimmed === '案内を終了する') {
      await setLineUserPendingAction(lineUserId, null);
      const encourageMessages = [
        '今日もお疲れさまでした！🌸',
        '毎日の献立、一緒に楽しみましょう！🥗',
        '今日も素敵な食卓になりますように！✨',
        '明日もまた一緒に考えましょう！🍱',
        '毎日の積み重ねが大切です！💪',
      ];
      const randomEncourage = encourageMessages[Math.floor(Math.random() * encourageMessages.length)];
      await replyLineMessage(replyToken, [{
        type: 'text',
        text: `お疲れさまでした！😊\n\n毎日の記録が積み重なると、よりあなた好みに合った献立を提案できるようになります！💪\n\n${randomEncourage}`,
      }], lineUserId);
      return true;
    }
    // 「5」または「今日の食事として記録する」→ selectedNameを「作った」として即記録して終了
    if (/^[5５]$/.test(trimmed) || trimmed === '今日の食事として記録する') {
      await setLineUserPendingAction(lineUserId, null);
      try {
        if (menuPlanId) {
          await updateActualMeal(menuPlanId, { mealType: mealType as 'breakfast' | 'lunch' | 'dinner', actualMeal: selectedName, actualStatus: 'cooked' });
        }
      } catch (err) {
        console.error('[LINE] Failed to record actual meal:', err);
      }
      const encourageMessages2 = [
        '今日もお疲れさまでした！🌸',
        '毎日の献立、一緒に楽しみましょう！🥗',
        '今日も素敵な食卓になりますように！✨',
        '明日もまた一緒に考えましょう！🍱',
        '毎日の積み重ねが大切です！💪',
      ];
      const randomEncourage2 = encourageMessages2[Math.floor(Math.random() * encourageMessages2.length)];
      await replyLineMessage(replyToken, [{
        type: 'text',
        text: `「${selectedName}」を今日の食事として記録しました！✅\n\nお疲れさまでした！😊\n毎日の記録が積み重なると、よりあなた好みに合った献立を提案できるようになります！💪\n\n${randomEncourage2}\n\n※記録の修正はダッシュボードの「履歴」からできます`,
      }], lineUserId);
      return true;
    }

    // 「2」または「選び直したい」→ 違う献立を選び直す（候補に戻る）
    if (/^[2２]$/.test(trimmed) || trimmed === '選び直したい') {
      const optionLines = options.map((o, i) => `${['1️⃣','2️⃣','3️⃣'][i] ?? `${i+1}.`} ${o.name}`).join('\n');
      await setLineUserPendingAction(lineUserId, {
        type: 'menu_option_selection',
        options,
        mealType,
        targetDate,
        askedAt: Date.now(),
      });
      const reselectQR = options.map((o, i) => ({
        type: 'action' as const,
        action: { type: 'message' as const, label: `${['1️⃣','2️⃣','3️⃣'][i] ?? `${i+1}`} ${o.name}`.slice(0, 20), text: o.name }
      }));
      await replyLineMessage(replyToken, [{ type: 'text', text: `わかりました！どれにしますか？\n\n${optionLines}\n\n👇 下のボタンから選んでね！`, quickReply: { items: reselectQR } }], lineUserId);
      return true;
    }

    // 「1」またはテキスト系 → レシピを生成して返す
    if (/^[1１]$/.test(trimmed) || /^(はい|yes|ok|おねがい|そうして|大丈夫|だいじょうぶ|レシピ|教えて|見せて|詳しく|レシピを見たい)/.test(trimmed)) {
      try {
        const selected = options[selectedIndex];
        const ingredientList = selected.mainIngredients.join('・');
        const recipeResponse = await invokeLLM({
          messages: [
            { role: 'system', content: 'あなたは日本の主婦向け料理レシピAIです。簡潔で分かりやすいレシピをLINEメッセージ形式で返してください。' },
            { role: 'user', content: `「${selected.name}」のレシピを教えてください。\n主な食材：${ingredientList}\n\n以下の形式で返してください：\n【材料】（4人分目安）\n・食材名 分量\n\n【作り方】\n1. 手順\n2. 手順\n（5〜7ステップ程度）\n\n【ポイント】\nコツや注意点を1〜2行で` },
          ],
        });
        const recipeText = recipeResponse.choices[0]?.message?.content ?? 'レシピの取得に失敗しました。';

        // 夕食＋朝食セットで、もう一方が未選択の場合はリマインドを追加
        if (pendingBreakfast) {
          // 夕食を選んだ後 → 朝食の選択を促す
          const bfOptionLines = pendingBreakfast.options.map((o, i) => `${['1️⃣','2️⃣','3️⃣'][i] ?? `${i+1}.`} ${o.name}`).join('\n');
          await setLineUserPendingAction(lineUserId, {
            type: 'menu_option_selection',
            options: pendingBreakfast.options,
            mealType: 'tomorrow_breakfast',
            targetDate: pendingBreakfast.targetDate,
            menuPlanId: pendingBreakfast.menuPlanId,
            askedAt: Date.now(),
          });
          const bfQR = pendingBreakfast.options.map((o, i) => ({
            type: 'action' as const,
            action: { type: 'message' as const, label: `${['1️⃣','2️⃣','3️⃣'][i]} ${o.name}`.slice(0, 20), text: o.name }
          }));
          await replyLineMessage(replyToken, [{ type: 'text', text: `🍳 ${selected.name} のレシピ\n\n${recipeText}\n\n―――――――――――――――――\n\n🌅 朝食はどうしますか？\n\n${bfOptionLines}\n\n👇 下のボタンから選んでね！`, quickReply: { items: bfQR } }], lineUserId);
        } else if (pendingDinner) {
          // 朝食を選んだ後 → 夕食の選択を促す
          const dinnerOptionLines = pendingDinner.options.map((o, i) => `${['1️⃣','2️⃣','3️⃣'][i] ?? `${i+1}.`} ${o.name}`).join('\n');
          await setLineUserPendingAction(lineUserId, {
            type: 'menu_option_selection',
            options: pendingDinner.options,
            mealType: 'dinner',
            targetDate: pendingDinner.targetDate,
            menuPlanId: pendingDinner.menuPlanId,
            askedAt: Date.now(),
          });
          const dinnerQR = pendingDinner.options.map((o, i) => ({
            type: 'action' as const,
            action: { type: 'message' as const, label: `${['1️⃣','2️⃣','3️⃣'][i]} ${o.name}`.slice(0, 20), text: o.name }
          }));
          await replyLineMessage(replyToken, [{ type: 'text', text: `🍳 ${selected.name} のレシピ\n\n${recipeText}\n\n―――――――――――――――――\n\n🍽️ 夕食はどうしますか？\n\n${dinnerOptionLines}\n\n👇 下のボタンから選んでね！`, quickReply: { items: dinnerQR } }], lineUserId);
        } else {
          await setLineUserPendingAction(lineUserId, null);
          await replyLineMessage(replyToken, [{ type: 'text', text: `🍳 ${selected.name} のレシピ\n\n${recipeText}` }], lineUserId);
        }
      } catch (err) {
        console.error('[LINE] Recipe generation failed:', err);
        await setLineUserPendingAction(lineUserId, null);
        await replyLineMessage(replyToken, [{ type: 'text', text: '申し訳ありません。レシピの取得に失敗しました。しばらくしてからもう一度お試しください。' }], lineUserId);
      }
      return true;
    }

    // それ以外 → 案内を再表示
    await replyLineMessage(replyToken, [{ type: 'text', text: `1か2か3で選んでください😊\n\n1️⃣ レシピを表示する\n2️⃣ 違う献立を選び直す\n3️⃣ 案内を終了する\n4️⃣ 献立をやり直す（新しく生成）`, quickReply: { items: [
      { type: 'action', action: { type: 'message', label: '📖 レシピを見たい', text: 'レシピを見たい' } },
      { type: 'action', action: { type: 'message', label: '🔄 違う献立を選び直す', text: '選び直したい' } },
      { type: 'action', action: { type: 'message', label: '✅ 案内を終了する', text: '案内を終了する' } },
      { type: 'action', action: { type: 'message', label: '🎲 献立をやり直す', text: '献立をやり直す' } },
      { type: 'action', action: { type: 'message', label: '📝 今日の食事として記録', text: '今日の食事として記録する' } },
      { type: 'action', action: { type: 'message', label: '❌ やっぱりやめる', text: 'キャンセル' } },
    ] } }], lineUserId);
    return true;
  }

  // ─── 実食記録ヒアリング待ちの場合 ─────────────────────────────────────────────────
  if (pending?.type === 'actual_meal_hearing') {
    const { options, mealType, targetDate, menuPlanId } = pending as {
      options: Array<{ name: string; mainIngredients: string[]; usedFridgeItems: string[] }>;
      mealType: 'breakfast' | 'lunch' | 'dinner';
      targetDate: string;
      menuPlanId: number;
    };
    const trimmed = text.trim();
    const mealLabel = mealType === 'dinner' ? '夕食' : mealType === 'lunch' ? '昼食' : '朝食';

    if (trimmed === 'あとで教える') {
      await setLineUserPendingAction(lineUserId, null);
      await replyLineMessage(replyToken, [{ type: 'text', text: 'わかりました！また教えてくださいね😊\n「献立」と送るといつでも提案します！' }], lineUserId);
      return true;
    }
    if (trimmed === '外食した') {
      await updateActualMeal(menuPlanId, { mealType, actualMeal: '外食', actualStatus: 'eating_out' });
      await setLineUserPendingAction(lineUserId, null);
       await replyLineMessage(replyToken, [{ type: 'text', text: '外食ですね！記録しました😊\n次回の献立提案に活かしていきます！' }], lineUserId);
      return true;
    }
    if (trimmed === '食べてない') {
      await updateActualMeal(menuPlanId, { mealType, actualMeal: null, actualStatus: 'not_eaten' });
      await setLineUserPendingAction(lineUserId, null);
      await replyLineMessage(replyToken, [{ type: 'text', text: '了解しました！記録しました😊' }], lineUserId);
      return true;
    }
    if (trimmed === '別の料理にした') {
      await setLineUserPendingAction(lineUserId, {
        type: 'actual_meal_free_input',
        mealType,
        targetDate,
        menuPlanId,
        askedAt: Date.now(),
      });
      await replyLineMessage(replyToken, [{ type: 'text', text: '何を作りましたか？料理名を送ってください😊' }], lineUserId);
      return true;
    }
    if (trimmed === '入力し直す') {
      const actualQR = [
        ...options.slice(0, 3).map((o) => ({
          type: 'action' as const,
          action: { type: 'message' as const, label: o.name.slice(0, 20), text: `作った：${o.name}` },
        })),
        { type: 'action' as const, action: { type: 'message' as const, label: '🍽️ 別の料理にした', text: '別の料理にした' } },
        { type: 'action' as const, action: { type: 'message' as const, label: '🏢 外食した', text: '外食した' } },
        { type: 'action' as const, action: { type: 'message' as const, label: '🚫 食べてない', text: '食べてない' } },
        { type: 'action' as const, action: { type: 'message' as const, label: '⏭️ あとで教える', text: 'あとで教える' } },
      ];
      await replyLineMessage(replyToken, [{
        type: 'text',
        text: `もう一度教えてください😊\n\n${mealLabel}は何を作りましたか？`,
        quickReply: { items: actualQR },
      }], lineUserId);
      return true;
    }
    // 「作った：〇〇」形式（クイックリプライから）
    const cookedMatch = trimmed.match(/^作った：(.+)$/);
    if (cookedMatch) {
      const mealName = cookedMatch[1].trim();
      await updateActualMeal(menuPlanId, { mealType, actualMeal: mealName, actualStatus: 'cooked' });
      await setLineUserPendingAction(lineUserId, null);
      const recipeQR = [
        { type: 'action' as const, action: { type: 'message' as const, label: '📖 レシピを見る', text: `${mealName}のレシピ教えて` } },
        { type: 'action' as const, action: { type: 'message' as const, label: '✅ 大丈夫です', text: '大丈夫です' } },
        { type: 'action' as const, action: { type: 'message' as const, label: '✏️ 入力し直す', text: '入力し直す' } },
      ];
      await replyLineMessage(replyToken, [{
        type: 'text',
        text: `いいですね！😊 「${mealName}」を記録しました。\n\nレシピも見ますか？`,
        quickReply: { items: recipeQR },
      }], lineUserId);
      return true;
    }
    // その他テキスト → 自由入力として記録
    await updateActualMeal(menuPlanId, { mealType, actualMeal: trimmed, actualStatus: 'other' });
    await setLineUserPendingAction(lineUserId, null);
    await replyLineMessage(replyToken, [{
      type: 'text',
      text: `「${trimmed}」を記録しました！😊\n\nレシピも見ますか？`,
      quickReply: { items: [
        { type: 'action' as const, action: { type: 'message' as const, label: '📖 レシピを見る', text: `${trimmed}のレシピ教えて` } },
        { type: 'action' as const, action: { type: 'message' as const, label: '✅ 大丈夫です', text: '大丈夫です' } },
      ] },
    }], lineUserId);
    return true;
  }

  // ─── 実食自由入力待ちの場合 ─────────────────────────────────────────────────────
  if (pending?.type === 'actual_meal_free_input') {
    const { mealType, menuPlanId } = pending as { mealType: 'breakfast' | 'lunch' | 'dinner'; menuPlanId: number; targetDate: string };
    const trimmed = text.trim();
    await updateActualMeal(menuPlanId, { mealType, actualMeal: trimmed, actualStatus: 'other' });
    await setLineUserPendingAction(lineUserId, null);
    await replyLineMessage(replyToken, [{
      type: 'text',
      text: `「${trimmed}」を記録しました！😊\n\nレシピも見ますか？`,
      quickReply: { items: [
        { type: 'action' as const, action: { type: 'message' as const, label: '📖 レシピを見る', text: `${trimmed}のレシピ教えて` } },
        { type: 'action' as const, action: { type: 'message' as const, label: '✅ 大丈夫です', text: '大丈夫です' } },
      ] },
    }], lineUserId);
    return true;
  }

  // ─── 音声復唱確認待ちの場合 ─────────────────────────────────────────────────────
  if (pending?.type === 'voice_confirm') {
    const { transcribedText } = pending as { transcribedText: string };
    const trimmed = text.trim();

    // 「いいえ」「キャンセル」→キャンセル
    if (/^(いいえ|no|キャンセル|やめる|やめて|cancel)$/i.test(trimmed)) {
      await setLineUserPendingAction(lineUserId, null);
      await replyLineMessage(replyToken, [{ type: 'text', text: 'キャンセルしました。もう一度音声を送ってください。' }], lineUserId);
      return true;
    }

    // 「はい」→認識されたテキストをそのまま通常のメッセージ処理に再投入
    if (/^(はい|yes|ok|おねがい|そうして|大丈夫|だいじょうぶ|大丈夫です|その通り|それでおねがい)$/i.test(trimmed)) {
      await setLineUserPendingAction(lineUserId, null);
      // transcribedText を通常テキスト処理に再投入するため、疑似イベントで再帰呼び出し
      await handleLineWebhookEvent({
        type: 'message',
        source: { userId: lineUserId },
        replyToken,
        message: { type: 'text', text: transcribedText },
      }, true);
      return true;
    }

    // その他の入力→新しいテキストとして上書きして再確認
    // 例：音声復唱中に「献立！」と返してきた場合、「献立！」を新しいtranscribedTextとして再確認
    await setLineUserPendingAction(lineUserId, {
      type: 'voice_confirm',
      transcribedText: trimmed,
    });
    await replyLineMessage(replyToken, [{
      type: 'text',
      text: `「${trimmed}」でよろしいでしょうか？

「はい」→ そのまま処理します
「いいえ」→ キャンセルします`,
    }], lineUserId);
    return true;
  }

  // ─── 食材名のみ音声入力後の3択選択待ち ─────────────────────────────────────────────────────
  if (pending?.type === 'voice_ingredient_action') {
    const { ingredients } = pending as { ingredients: string[]; transcribedText: string };
    const trimmed = text.trim();

    // キャンセル
    if (/^(キャンセル|やめる|やめて|cancel|いいえ)$/i.test(trimmed)) {
      await setLineUserPendingAction(lineUserId, null);
      await replyLineMessage(replyToken, [{ type: 'text', text: 'キャンセルしました。' }], lineUserId);
      return true;
    }

    // 1 → 冷蔵庫に追加
    if (/^[1１]$/.test(trimmed) || /冷蔵庫/.test(trimmed)) {
      await setLineUserPendingAction(lineUserId, null);
      const db = await getDb();
      if (!db) return false;
      const addedNames: string[] = [];
      for (const name of ingredients) {
        // 表記ゆれ正規化（漢字/カタカナ/ひらがなを統一）
        const normalizedName = await resolveProductName(name);
        const existing = await db.select().from(fridgeItemsTable)
          .where(eq(fridgeItemsTable.userId, userId)).then(rows => findMatchingFridgeItem(rows, normalizedName));
        if (existing) {
          // 既存あり：数量なしの場合はそのまま保持（重複登録しない）
        } else {
          await db.insert(fridgeItemsTable).values({ userId, name: normalizedName, quantity: null, category: 'other' });
        }
        addedNames.push(normalizedName);
      }
      const itemList = addedNames.join('、');
      await replyLineMessage(replyToken, [{ type: 'text', text: `✅ 冷蔵庫に「${itemList}」を登録しました！

献立を提案しましょうか？「献立」と送ってください` }], lineUserId);
      return true;
    }

    // 2 → 買い物リストに追加
    if (/^[2２]$/.test(trimmed) || /買い物/.test(trimmed)) {
      await setLineUserPendingAction(lineUserId, null);
      const db = await getDb();
      if (!db) return false;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const addedItems: string[] = [];
      for (const name of ingredients) {
        const existing = await db.select().from(shoppingListItems)
          .where(and(eq(shoppingListItems.userId, userId), eq(shoppingListItems.name, name), eq(shoppingListItems.isChecked, false)))
          .limit(1);
        if (existing.length === 0) {
          await db.insert(shoppingListItems).values({ userId, name, quantity: null, isChecked: false, listDate: today });
        }
        addedItems.push(name);
      }
      const itemList = addedItems.map(i => `・${i}`).join('\n');
      await replyLineMessage(replyToken, [{ type: 'text', text: `✅ 買い物リストに追加しました！\n${itemList}\n\nダッシュボードで確認・チェックできます🛒` }], lineUserId);
      return true;
    }

    // 3 → 献立を提案
    if (/^[3３]$/.test(trimmed) || /献立/.test(trimmed)) {
      await setLineUserPendingAction(lineUserId, null);
      // 疑似イベントで献立処理に再投入
      await handleLineWebhookEvent({
        type: 'message',
        source: { userId: lineUserId },
        replyToken,
        message: { type: 'text', text: '献立' },
      }, true);
      return true;
    }

    // それ以外 → 再度選択を促す
    const ingredientDisplay = ingredients.join('、');
    await replyLineMessage(replyToken, [{
      type: 'text',
      text: `「${ingredientDisplay}」をどうしますか？\n\n1️⃣ 冷蔵庫に追加\n2️⃣ 買い物リストに追加\n3️⃣ この食材で献立を提案\n\n`,
    }], lineUserId);
    return true;
  }

  // ─── 食材を使った後の3択 (削除/数量を減らす/そのまま) ─────────────────────────────────────────────────────
  if (pending?.type === 'used_ingredient_action') {
    const { items: usedItems } = pending as { items: string[]; text: string };
    const trimmed = text.trim();
    if (/^(\u30ad\u30e3\u30f3\u30bb\u30eb|\u3084\u3081\u308b|\u3084\u3081\u3066|cancel|\u3044\u3044\u3048)$/i.test(trimmed)) {
      await setLineUserPendingAction(lineUserId, null);
      await replyLineMessage(replyToken, [{ type: 'text', text: '\u30ad\u30e3\u30f3\u30bb\u30eb\u3057\u307e\u3057\u305f\u3002' }], lineUserId);
      return true;
    }
    if (/^[1\uff11]$/.test(trimmed) || /\u524a\u9664/.test(trimmed)) {
      await setLineUserPendingAction(lineUserId, null);
      const db = await getDb();
      if (!db) return false;
      const deleted: string[] = [];
      for (const name of usedItems) {
        const existing = await db.select().from(fridgeItemsTable).where(eq(fridgeItemsTable.userId, userId)).then(rows => findMatchingFridgeItem(rows, name));
        if (existing) {
          await db.delete(fridgeItemsTable).where(eq(fridgeItemsTable.id, existing.id));
          deleted.push(name);
        }
      }
      const msg = deleted.length > 0 ? `\u2705 \u51b7\u8535\u5eab\u304b\u3089\u300c${deleted.join('\u3001')}\u300d\u3092\u524a\u9664\u3057\u307e\u3057\u305f\uff01` : '\u51b7\u8535\u5eab\u306b\u8a72\u5f53\u3059\u308b\u98df\u6750\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3067\u3057\u305f\u3002';
      await replyLineMessage(replyToken, [{ type: 'text', text: msg }], lineUserId);
      return true;
    }
    if (/^[2\uff12]$/.test(trimmed) || /\u6e1b/.test(trimmed)) {
      await setLineUserPendingAction(lineUserId, null);
      const db = await getDb();
      if (!db) return false;
      const updated: string[] = [];
      for (const name of usedItems) {
        const existing = await db.select().from(fridgeItemsTable).where(eq(fridgeItemsTable.userId, userId)).then(rows => findMatchingFridgeItem(rows, name));
        if (existing) {
          const currentQty = parseQuantityNumber(existing.quantity ?? '1') ?? 1;
          const newQty = Math.max(0, currentQty - 1);
          if (newQty <= 0) {
            await db.delete(fridgeItemsTable).where(eq(fridgeItemsTable.id, existing.id));
          } else {
            await db.update(fridgeItemsTable).set({ quantity: String(newQty) + '\u500b', updatedAt: new Date() }).where(eq(fridgeItemsTable.id, existing.id));
          }
          updated.push(name);
        }
      }
      const msg = updated.length > 0 ? `\u2705 \u300c${updated.join('\u3001')}\u300d\u306e\u6570\u91cf\u30921\u6e1b\u3089\u3057\u307e\u3057\u305f\uff01` : '\u51b7\u8535\u5eab\u306b\u8a72\u5f53\u3059\u308b\u98df\u6750\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3067\u3057\u305f\u3002';
      await replyLineMessage(replyToken, [{ type: 'text', text: msg }], lineUserId);
      return true;
    }
    // 3 or \u305d\u306e\u307e\u307e
    await setLineUserPendingAction(lineUserId, null);
    await replyLineMessage(replyToken, [{ type: 'text', text: '\u4f55\u3082\u3057\u307e\u305b\u3093\u3067\u3057\u305f\u3002\u307e\u305f\u3044\u3064\u3067\u3082\u8a18\u9332\u3057\u3066\u304f\u3060\u3055\u3044\uff01' }], lineUserId);
    return true;
  }

  // ─── 買い物してきた後の3択 (冷蔵庫追加/リスト削除/両方) ─────────────────────────────────────────────────────
  if (pending?.type === 'bought_item_action') {
    const { items: boughtItems } = pending as { items: string[]; text: string };
    const trimmed = text.trim();
    if (/^(\u30ad\u30e3\u30f3\u30bb\u30eb|\u3084\u3081\u308b|\u3084\u3081\u3066|cancel|\u3044\u3044\u3048)$/i.test(trimmed)) {
      await setLineUserPendingAction(lineUserId, null);
      await replyLineMessage(replyToken, [{ type: 'text', text: '\u30ad\u30e3\u30f3\u30bb\u30eb\u3057\u307e\u3057\u305f\u3002' }], lineUserId);
      return true;
    }
    const addToFridge = /^[1\uff11]$/.test(trimmed) || /^[3\uff13]$/.test(trimmed) || /\u51b7\u8535\u5eab/.test(trimmed) || /\u4e21\u65b9/.test(trimmed);
    const removeFromList = /^[2\uff12]$/.test(trimmed) || /^[3\uff13]$/.test(trimmed) || /\u30ea\u30b9\u30c8/.test(trimmed) || /\u4e21\u65b9/.test(trimmed);
    const db = await getDb();
    if (!db) return false;
    const msgs: string[] = [];
    if (addToFridge) {
      for (const name of boughtItems) {
        const existing = await db.select().from(fridgeItemsTable).where(eq(fridgeItemsTable.userId, userId)).then(rows => findMatchingFridgeItem(rows, name));
        if (!existing) await db.insert(fridgeItemsTable).values({ userId, name, quantity: null, category: 'other' });
      }
      msgs.push(`\u51b7\u8535\u5eab\u306b\u300c${boughtItems.join('\u3001')}\u300d\u3092\u8ffd\u52a0\u3057\u307e\u3057\u305f\uff01`);
    }
    if (removeFromList) {
      for (const name of boughtItems) {
        await db.delete(shoppingListItems).where(and(eq(shoppingListItems.userId, userId), eq(shoppingListItems.name, name)));
      }
      msgs.push(`\u8cb7\u3044\u7269\u30ea\u30b9\u30c8\u304b\u3089\u300c${boughtItems.join('\u3001')}\u300d\u3092\u524a\u9664\u3057\u307e\u3057\u305f\uff01`);
    }
    await setLineUserPendingAction(lineUserId, null);
    await replyLineMessage(replyToken, [{ type: 'text', text: msgs.length > 0 ? '\u2705 ' + msgs.join('\n') : '\u4f55\u3082\u3057\u307e\u305b\u3093\u3067\u3057\u305f\u3002' }], lineUserId);
    return true;
  }

  // ─── 気分・テーマ後の2択 (献立テーマに設定/キャンセル) ─────────────────────────────────────────────────────
  if (pending?.type === 'mood_theme_action') {
    const { theme: moodTheme } = pending as { theme: string; text: string };
    const trimmed = text.trim();
    if (/^(\u30ad\u30e3\u30f3\u30bb\u30eb|\u3084\u3081\u308b|\u3084\u3081\u3066|cancel|\u3044\u3044\u3048|^[2\uff12]$)$/i.test(trimmed)) {
      await setLineUserPendingAction(lineUserId, null);
      await replyLineMessage(replyToken, [{ type: 'text', text: '\u30ad\u30e3\u30f3\u30bb\u30eb\u3057\u307e\u3057\u305f\u3002' }], lineUserId);
      return true;
    }
    // 1 or \u8a2d\u5b9a\u3057\u3066 → \u732e\u7acb\u30c6\u30fc\u30de\u306b\u8a2d\u5b9a\u3057\u3066\u751f\u6210
    await setLineUserPendingAction(lineUserId, null);
    if (!userId) {
      await replyLineMessage(replyToken, [{ type: 'text', text: '\u30ed\u30b0\u30a4\u30f3\u304c\u5fc5\u8981\u3067\u3059\u3002https://www.kondatebiyori.com' }], lineUserId);
      return true;
    }
    try {
      const today = new Date().toISOString().split('T')[0];
      const result = await generateMenuPlan(userId, today, 'dinner', undefined, moodTheme);
      await replyLineMessage(replyToken, [{ type: 'text', text: result.message }], lineUserId);
    } catch (err) {
      console.error('[LINE] mood_theme menu generation failed:', err);
      await replyLineMessage(replyToken, [{ type: 'text', text: '献立の生成に失敗しました。しばらくしてから再度お試しください。' }], lineUserId);
    }
    return true;
  }

  // ─── 家族の好み登録後の2択 (登録/キャンセル) ─────────────────────────────────────────────────────
  if (pending?.type === 'family_preference_action') {
    const { memberName: prefMember, preference: prefContent, items: prefItems } = pending as { memberName: string; preference: string; items: string[]; text: string };
    const trimmed = text.trim();
    if (/^(\u30ad\u30e3\u30f3\u30bb\u30eb|\u3084\u3081\u308b|\u3084\u3081\u3066|cancel|\u3044\u3044\u3048|^[2\uff12]$)$/i.test(trimmed)) {
      await setLineUserPendingAction(lineUserId, null);
      await replyLineMessage(replyToken, [{ type: 'text', text: '\u30ad\u30e3\u30f3\u30bb\u30eb\u3057\u307e\u3057\u305f\u3002' }], lineUserId);
      return true;
    }
    // 1 or \u767b\u9332 → user_preferences\u306b\u4fdd\u5b58
    await setLineUserPendingAction(lineUserId, null);
    try {
      const db = await getDb();
      if (db) {
        const { userPreferences } = await import('../../drizzle/schema');
        for (const ingredient of (prefItems.length > 0 ? prefItems : [prefContent])) {
          await db.insert(userPreferences).values({
            lineUserId,
            memberName: prefMember !== '\u5bb6\u65cf' ? prefMember : null,
            preferenceType: 'dislike',
            ingredient,
            note: prefContent,
            active: true,
          });
        }
      }
      await replyLineMessage(replyToken, [{ type: 'text', text: `\u2705 \u300c${prefMember}\u304c${prefContent}\u300d\u3092\u597d\u307f\u30fb\u5acc\u3044\u3068\u3057\u3066\u767b\u9332\u3057\u307e\u3057\u305f\uff01\n\n\u732e\u7acb\u63d0\u6848\u6642\u306b\u8003\u616e\u3057\u307e\u3059\ud83d\ude0a` }], lineUserId);
    } catch (err) {
      console.error('[LINE] family_preference save failed:', err);
      await replyLineMessage(replyToken, [{ type: 'text', text: '\u767b\u9332\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002\u3082\u3046\u4e00\u5ea6\u304a\u8a66\u3057\u304f\u3060\u3055\u3044\u3002' }], lineUserId);
    }
    return true;
  }

  // ─── 数量更新後の3択 (更新/在庫確認/キャンセル) ─────────────────────────────────────────────────────
  if (pending?.type === 'quantity_update_action') {
    const { items: qtyItems, quantity: qtyVal } = pending as { items: string[]; quantity: string; text: string };
    const trimmed = text.trim();
    if (/^(\u30ad\u30e3\u30f3\u30bb\u30eb|\u3084\u3081\u308b|\u3084\u3081\u3066|cancel|\u3044\u3044\u3048|^[3\uff13]$)$/i.test(trimmed)) {
      await setLineUserPendingAction(lineUserId, null);
      await replyLineMessage(replyToken, [{ type: 'text', text: '\u30ad\u30e3\u30f3\u30bb\u30eb\u3057\u307e\u3057\u305f\u3002' }], lineUserId);
      return true;
    }
    if (/^[2\uff12]$/.test(trimmed) || /\u5728\u5eab/.test(trimmed) || /\u78ba\u8a8d/.test(trimmed)) {
      // \u5728\u5eab\u78ba\u8a8d → \u51b7\u8535\u5eab\u4e00\u89a7\u3092\u8fd4\u4fe1
      await setLineUserPendingAction(lineUserId, null);
      const items = await getFridgeItems(userId);
      if (items.length === 0) {
        await replyLineMessage(replyToken, [{ type: 'text', text: '\u51b7\u8535\u5eab\u306f\u7a7a\u3067\u3059\u3002\u98df\u6750\u3092\u767b\u9332\u3057\u3066\u307f\u307e\u3057\u3087\u3046\uff01' }], lineUserId);
      } else {
        const list = items.map(i => `\u30fb${i.name}${i.quantity ? '\uff08' + i.quantity + '\uff09' : ''}`).join('\n');
        await replyLineMessage(replyToken, [{ type: 'text', text: `\ud83d\udce6 \u73fe\u5728\u306e\u51b7\u8535\u5eab\n\n${list}` }], lineUserId);
      }
      return true;
    }
    // 1 or \u66f4\u65b0 → \u6570\u91cf\u3092\u66f4\u65b0
    await setLineUserPendingAction(lineUserId, null);
    const db = await getDb();
    if (!db) return false;
    const updated: string[] = [];
    for (const name of qtyItems) {
      const existing = await db.select().from(fridgeItemsTable).where(eq(fridgeItemsTable.userId, userId)).then(rows => findMatchingFridgeItem(rows, name));
      if (existing) {
        await db.update(fridgeItemsTable).set({ quantity: qtyVal, updatedAt: new Date() }).where(eq(fridgeItemsTable.id, existing.id));
        updated.push(name);
      } else {
        await db.insert(fridgeItemsTable).values({ userId, name, quantity: qtyVal, category: 'other' });
        updated.push(name);
      }
    }
    await replyLineMessage(replyToken, [{ type: 'text', text: `\u2705 \u300c${updated.join('\u3001')}\u300d\u306e\u6570\u91cf\u3092\u300c${qtyVal}\u300d\u306b\u66f4\u65b0\u3057\u307e\u3057\u305f\uff01` }], lineUserId);
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
      await replyLineMessage(replyToken, [{ type: 'text', text: `✅ ${itemName}を${addQty}個追加しました！（合計${newQty}個）` }], lineUserId);
      return true;
    }

    // 「いいえ」「キャンセル」→ キャンセル
    if (/^(いいえ|no|キャンセル|やめる|やめて|cancel)$/i.test(text.trim())) {
      await setLineUserPendingAction(lineUserId, null);
      await replyLineMessage(replyToken, [{ type: 'text', text: `${itemName}の追加をキャンセルしました。` }], lineUserId);
      return true;
    }

    // 数量が入力された場合（単位付き「300g」「2枚」なども正しく処理）
    // まず単位付きの数量表現を検出（g, ml, kg, L, 枚, 本, 個, 袋, パック, 缶, 切れ, 匹, 尾, 頭, 羽, 束, 房, 玉, 串, 瓶, 箱, 丁, 合, カップ）
    // B9修正: 単位付き数量表現をより幅広く検出（「300g」「2枚」など）
    const unitMatch = text.trim().match(/^([0-9０-９]+(?:[.,][0-9０-９]+)?)\s*(g|ml|kg|L|l|cc|枚|本|個|袋|パック|缶|切れ|魚|尾|頭|羽|束|房|玉|串|瓶|筱|丁|合|カップ|グラム|キロ|リットル|ミリ|ミリリットル)$/);
    if (unitMatch) {
      // 単位付きの場合はそのまま文字列として保存
      const quantityStr = unitMatch[1] + unitMatch[2];
      const db = await getDb();
      if (db && existingId) {
        await db.update(fridgeItemsTable)
          .set({ quantity: quantityStr, updatedAt: new Date() })
          .where(eq(fridgeItemsTable.id, existingId));
      } else if (db) {
        await db.insert(fridgeItemsTable).values({ userId, name: itemName, quantity: quantityStr, category: 'other' });
      }
      await setLineUserPendingAction(lineUserId, null);
      const msg = `✅ ${itemName}を${quantityStr}追加しました！`;
      await replyLineMessage(replyToken, [{ type: 'text', text: msg }], lineUserId);
      return true;
    }

    const qty = parseQuantityNumber(text);
    if (qty !== null && qty > 0) {
      // 単位なし数字の場合は「個」を付ける
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
      await replyLineMessage(replyToken, [{ type: 'text', text: msg }], lineUserId);
      return true;
    }

    // F7修正: 曘昧な数量表現をより幅広く受け付ける（「半分くらい」「少し」「適量」「1本」など）
    const vagueQuantityPatterns = [
      /^(半分|上半分|下半分|半分くらい|半分ほど|半分以上|半分以下|半分まで|半分残ってる)$/,
      /^(少し|少々|少しだけ|少しだけある|少し残ってる|少しある|少しのこる|少しだけ残ってる)$/,
      /^(適量|適当|適当量|少量|少量だけ|少量ある|少しだけある)$/,
      /^(残り少|残りわずか|残り少し|残りくらい|もう少し|あと少し|あとわずか|残り少々)$/,
      /^(たくさん|いっぱい|まあまあある|そこそこある|まあまあ|そこそこ|たくさんある|いっぱいある)$/,
      /^(新品|ひとつある|まだある|あります|あるよ|ある|まだあるよ|まだあるから)$/,
      /^([1-9１-９]本|一本|二本|三本|四本|五本|六本|七本|八本|九本|十本)$/,
      /^([1-9１-９]枚|一枚|二枚|三枚|四枚|五枚)$/,
      /^([1-9１-９]袋|一袋|二袋|三袋)$/,
    ];
    const trimmedText = text.trim();
    const isVagueQty = vagueQuantityPatterns.some(p => p.test(trimmedText));
    if (isVagueQty) {
      const db = await getDb();
      if (db && existingId) {
        await db.update(fridgeItemsTable)
          .set({ quantity: trimmedText, updatedAt: new Date() })
          .where(eq(fridgeItemsTable.id, existingId));
      } else if (db) {
        await db.insert(fridgeItemsTable).values({ userId, name: itemName, quantity: trimmedText, category: 'other' });
      }
      await setLineUserPendingAction(lineUserId, null);
      await replyLineMessage(replyToken, [{ type: 'text', text: `✅ ${itemName}（${trimmedText}）を登録しました！` }], lineUserId);
      return true;
    }

    // 数量として解釈できない入力 → 再度聴く
    await replyLineMessage(replyToken, [{ type: 'text', text: `数量を教えてください。\n例：「3個」「300g」「半分くらい」「少し」\n\nキャンセルする場合は「キャンセル」と送ってください。` }], lineUserId);
    return true;
  }

  // ─── Step 1.5: 数量訂正パターン（AIで一括処理）─────────────────────────────
  // 「変更」「訂正」「修正」「直して」などのキーワードを含む場合はAIで解析
  // 注意: 1文字の数字（「1」「2」「3」など）は選択肢の番号なので除外する
  // 注意: pendingActionが存在する場合は選択肢の番号として処理されるべきなのでスキップ
  // 書き換えコマンド（「〇〇に書き換えて」「冷蔵庫の中身を書き換えて」）は数量訂正に横取りさせない
  const isFridgeOverwriteCmd = /書き換えて|入れ替えて/.test(text) || /冷蔵庫(?:の中身)?(?:を|に)(?:書き換え|変え|入れ替え|更新)/.test(text);
  const correctionKeywords = /[変更訂正修正直して]|だよ|だった|です|ある|しかない/;
  const isShortNumber = /^[1-9１-９一二三四五六七八九]$/.test(text.trim()); // 1文字の数字は選択肢番号として除外
  if (!pending && !isShortNumber && !isFridgeOverwriteCmd && (correctionKeywords.test(text) || /[\d０-９][個本枚袋]?[にへ]/.test(text) || /[\d０-９]$/.test(text.replace(/[に変更訂正修正直して]+$/, '')))) {
    try {
      const db = await getDb();
      if (!db) return false;
      const allItems = await db.select().from(fridgeItemsTable).where(eq(fridgeItemsTable.userId, userId));
      const itemNames = allItems.map(r => r.name).join('、');
      const corrResp = await invokeLLM({
        messages: [
          { role: 'system', content: `冷蔵庫の食材数量を更新するアシスタントです。ユーザーのメッセージから「食材名」と「新しい数量（単位付き文字列）」のペアを抽出してJSON配列で返してください。
現在の冷蔵庫の食材: ${itemNames || 'なし'}
重要: qtyは必ず単位付き文字列で返すこと（例: "3個", "300g", "2本", "半分"）。単位なし数字のみの場合は"個"を付ける。
例: [{"name":"玉ねぎ","qty":"3個"},{"name":"鹶もも肉","qty":"300g"},{"name":"牛乳","qty":"1本"}]
数量訂正の意図がない場合は空配列 [] を返してください。` },
          { role: 'user', content: text },
        ],
        response_format: { type: 'json_object' },
      });
      const content = corrResp.choices[0]?.message?.content;
      const contentStr = typeof content === 'string' ? content : JSON.stringify(content ?? '[]');
      const parsed = JSON.parse(contentStr);
      const updates: Array<{ name: string; qty: string | number }> = Array.isArray(parsed) ? parsed : (parsed.items ?? parsed.updates ?? []);
      if (updates.length > 0) {
        const results: string[] = [];
        for (const { name, qty } of updates) {
          if (!name || qty === null || qty === undefined || qty === '') continue;
          // qtyが数値の場合は「個」を付ける、文字列の場合はそのまま使う
          const qtyStr = typeof qty === 'number' ? String(qty) + '個' : String(qty);
          const existing = allItems.find(r => r.name.includes(name) || name.includes(r.name));
          if (existing) {
            await db.update(fridgeItemsTable)
              .set({ quantity: qtyStr, updatedAt: new Date() })
              .where(eq(fridgeItemsTable.id, existing.id));
            results.push(`${existing.name}: ${qtyStr}`);
          } else {
            await db.insert(fridgeItemsTable).values({ userId, name, quantity: qtyStr, category: 'other' });
            results.push(`${name}: ${qtyStr}（新規追加）`);
          }
        }
        if (results.length > 0) {
          await replyLineMessage(replyToken, [{ type: 'text', text: `✅ 冷蔵庫を更新しました！\n${results.join('\n')}` }], lineUserId);
          return true;
        }
      }
    } catch (_) {
      // AI解析失敗時はフォールスルー
    }
  }

  // ─── Step 1.6: fridge_input_wait pendingActionがある場合（「冷蔵庫に」単独送信の続き）──────
  if (pending?.type === 'fridge_input_wait') {
    await setLineUserPendingAction(lineUserId, null);
    // 次のメッセージを食材リストとして処理（再帰的にhandleFridgeRegistrationを呼ぶ）
    // 「を追加して」「追加して」が付いていない場合も食材リストとして扱う
    const fridgeText = text.trim();
    if (/^(キャンセル|やめる|やめて|cancel|いいえ)$/i.test(fridgeText)) {
      await replyLineMessage(replyToken, [{ type: 'text', text: 'キャンセルしました。' }], lineUserId);
      return true;
    }
    // 「を追加して」が付いていない場合は付けて再処理
    const normalizedText = fridgeText.endsWith('追加して') || fridgeText.endsWith('追加') || fridgeText.endsWith('登録して')
      ? fridgeText
      : `冷蔵庫に${fridgeText}を追加して`;
    return handleFridgeRegistration(normalizedText, userId, lineUserId, replyToken);
  }

  // ――― Step 2: 「。。。追加して」「。。。を追加」などの自然な表現を検出 ―――――――――――
  // 「冷蔵庫の中身を教えて」「買い物リストを教えて」「買い物リストに登録して」は除外
  const skipPatterns = [
    /冷蔵庫の中身を教えて/,
    /買い物リストを教えて/,
    /冷蔵庫(を見せて|の中身$|の食材$|確認$|一覧$)/,
    // 買い物リスト関連の文は冷蔵庫登録と誤認しないよう除外
    /買い物リスト/,
    /買い物.*登録/,
    /登録.*買い物/,
    /買い物.*追加/,
    /追加.*買い物/,
  ];
  if (skipPatterns.some(p => p.test(text))) return false;

  // 追加パターン（自然な表現を広くカバー）
  const addPatterns: Array<{ regex: RegExp; itemGroup: number }> = [
    { regex: /冷蔵庫に(.+)を(追加|入れ|登録)/, itemGroup: 1 },   // 最大マッチで全食材を取得
    { regex: /冷蔵庫に(.+?)(追加|入れ|登録)して/, itemGroup: 1 },
    { regex: /(.+)を冷蔵庫に(追加|入れ|登録)/, itemGroup: 1 },
    { regex: /冷蔵庫[:：](.+)/, itemGroup: 1 },
    { regex: /^(.+)を追加して$/, itemGroup: 1 },
    { regex: /^(.+)追加して$/, itemGroup: 1 },
    { regex: /^(.+)を追加$/, itemGroup: 1 },
    { regex: /^(.+)を?(買って|買ってきた|買った|もらった|仕入れた)$/, itemGroup: 1 },
  ];

  for (const { regex, itemGroup } of addPatterns) {
    const match = text.match(regex);
    if (match) {
      const itemsText = match[itemGroup];
      // ── 常にLLMで食材抽出（正規表現分割は「と」「や」等が食材名に含まれるため使用しない）
      let finalItems: Array<{ name: string; quantity: string | null }> = [];
      try {
        const splitResp = await invokeLLM({
          messages: [
            {
              role: 'system',
              content: `あなたは食材名抽出AIです。入力テキストから食材名と数量を抽出してJSON形式で返してください。
# ルール
- 食材を個別に分割する（「万能ネギブロッコリー」→[万能ネギ,ブロッコリー]）
- 数量がある場合は quantity に入れる（「白菜半分」→name:白菜,quantity:半分、「卵300g」→name:卵,quantity:300g、「牛乳1本」→name:牛乳,quantity:1本）
- 数量がない場合は quantity を null にする
- 「を追加して」「冷蔵庫に」などの指示語は除く
- 食材名は簡潔に（形容詞・調理法は除く）
# 出力形式
{"items": [{"name": "豚肉", "quantity": "300g"}, {"name": "玉ねぎ", "quantity": null}]}`,
            },
            { role: 'user', content: itemsText },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'ingredient_list',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        quantity: { type: ['string', 'null'] },
                      },
                      required: ['name', 'quantity'],
                      additionalProperties: false,
                    },
                  },
                },
                required: ['items'],
                additionalProperties: false,
              },
            },
          } as any,
        });
        const content = splitResp.choices[0]?.message?.content;
        const contentStr = typeof content === 'string' ? content : JSON.stringify(content ?? {});
        const parsed = JSON.parse(contentStr);
        const extracted = parsed.items ?? [];
        if (extracted.length > 0) {
          finalItems = extracted
            .map((s: { name: string; quantity: string | null }) => ({ name: String(s.name).trim(), quantity: s.quantity ? String(s.quantity).trim() : null }))
            .filter((s: { name: string; quantity: string | null }) => s.name.length > 0 && s.name.length <= 20);
        }
      } catch (_) {
        // LLM失敗時は読点・スペース・改行のみで粗く分割
        const rawItems = itemsText.split(/[、,，・\n\r\s\u3000]+/).map((s: string) => s.trim()).filter((s: string) => s.length > 0 && s.length <= 20);
        finalItems = rawItems.map((raw: string) => {
          const qtyMatch = raw.match(/^(.+?)([0-9０-９]+(?:[.,][0-9０-９]+)?\s*(?:g|ml|kg|L|l|cc|枚|本|個|袋|パック|缶|切れ|匹|尾|頭|羽|束|房|玉|串|瓶|箱|丁|合|カップ|半分|少し|適量))$/);
          return { name: qtyMatch ? qtyMatch[1].trim() : raw, quantity: qtyMatch?.[2]?.trim() || null };
        });
      }

      const db = await getDb();
      if (!db || finalItems.length === 0) return false;

      // 複数食材に分割できた場合はまとめて登録（既存あり→数量更新、なし→新規追加）
      if (finalItems.length > 1) {
        const existingFridgeRows = await db.select().from(fridgeItemsTable).where(eq(fridgeItemsTable.userId, userId));
        for (const item of finalItems) {
          const existingRow = existingFridgeRows.find(r => r.name === item.name);
          if (existingRow) {
            if (item.quantity) {
              await db.update(fridgeItemsTable).set({ quantity: item.quantity, updatedAt: new Date() }).where(eq(fridgeItemsTable.id, existingRow.id));
            }
            // 数量なし＆既存ありの場合はそのまま（既存データを保持）
          } else {
            await db.insert(fridgeItemsTable).values({ userId, name: item.name, quantity: item.quantity, category: 'other' });
          }
        }
        const itemList = finalItems.map(i => i.quantity ? `${i.name}（${i.quantity}）` : i.name).join('、');
        await replyLineMessage(replyToken, [{ type: 'text', text: `✅ 冷蔵庫に「${itemList}」を登録しました！\n\n献立を提案しましょうか？「献立」と送ってください` }], lineUserId);
        return true;
      }
      const itemName = finalItems[0].name;
      const itemQuantity = finalItems[0].quantity;
      const existing = await db.select().from(fridgeItemsTable)
        .where(eq(fridgeItemsTable.userId, userId))
        .then(rows => rows.find(r => r.name === itemName));

      // 数量が既に指定されている場合はそのまま登録（質問スキップ）
      if (itemQuantity) {
        if (existing) {
          await db.update(fridgeItemsTable).set({ quantity: itemQuantity, updatedAt: new Date() }).where(eq(fridgeItemsTable.id, existing.id));
        } else {
          await db.insert(fridgeItemsTable).values({ userId, name: itemName, quantity: itemQuantity, category: 'other' });
        }
        await replyLineMessage(replyToken, [{ type: 'text', text: `✅ 冷蔵庫に「${itemName}（${itemQuantity}）」を登録しました！\n\n献立を提案しましょうか？「献立」と送ってください` }], lineUserId);
      } else if (existing && existing.quantity) {
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
        }], lineUserId);
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
        }], lineUserId);
      } else {
        // 新規追加（数量なし→質問する）
        await setLineUserPendingAction(lineUserId, {
          type: 'fridge_add_qty',
          itemName,
          existingId: null,
          existingQty: 0,
        });
        await replyLineMessage(replyToken, [{
          type: 'text',
          text: `${itemName}を追加します。\n何個ありますか？\n\n（数字で入力してください。例：「3個」「300g」「1本」）`,
        }], lineUserId);
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
        await replyLineMessage(replyToken, [{ type: 'text', text: '冷蔵庫に食材が登録されていません。\n\n「玉ねぎ追加して」のように送ると登録できます！' }], lineUserId);
      } else {
        const itemList = items.map((f) => `・${f.name}${f.quantity ? '（' + f.quantity + '）' : ''}`).join('\n');
        await replyLineMessage(replyToken, [{ type: 'text', text: `❄️ 現在の冷蔵庫の食材：\n${itemList}\n\nこれらを使った献立を提案しましょうか？「献立」と送ってください` }], lineUserId);
      }
      return true;
    }
  }

  // ─── Step 4: 「〇〇を削除して」「〇〇消して」などの削除パターン ──────────────────
  const deletePatterns: Array<{ regex: RegExp; itemGroup: number }> = [
    { regex: /(.+?)を?(削除して|消して|取り除いて|なくして|除いて|捨てて|使い切った|使った|なくなった|切れた|なくなりました|使い切りました)/, itemGroup: 1 },
    { regex: /(.+?)が?(なくなった|切れた|なくなりました|なくなっちゃった)/, itemGroup: 1 },
  ];

  for (const { regex, itemGroup } of deletePatterns) {
    const match = text.match(regex);
    if (match) {
      const itemsText = match[itemGroup];
      // 読点・スペース・改行のみで分割（「と」「や」等は食材名に含まれるため使用しない）
      const rawItems = itemsText.split(/[、,，・\n\r\s\u3000]+/).map((s) => s.trim()).filter((s) => s.length > 0 && s.length <= 20);
      const db = await getDb();
      if (!db || rawItems.length === 0) return false;

      const allItems = await getFridgeItems(userId);
      const deleted: string[] = [];
      const notFound: string[] = [];

      for (const rawItem of rawItems) {
        // 表記ゆれ対応：ひらがな/カタカナ正規化 + 部分一致で検索
        const matched = findMatchingFridgeItem(allItems, rawItem);
        if (matched) {
          await deleteFridgeItem(matched.id, userId);
          deleted.push(matched.name);
        } else {
          notFound.push(rawItem);
        }
      }

      let replyText = '';
      if (deleted.length > 0) {
        replyText += `✅ 冷蔵庫から「${deleted.join('」「')}」を削除しました！`;
      }
      if (notFound.length > 0) {
        replyText += `\n\n⚠️ 「${notFound.join('」「')}」は冷蔵庫に見つかりませんでした。`;
      }
      if (replyText) {
        await replyLineMessage(replyToken, [{ type: 'text', text: replyText.trim() }], lineUserId);
        return true;
      }
    }
  }

  // ─── Step 5: 「冷蔵庫に」単独送信時→次のメッセージを食材リストとして受け取る─────────────────
  if (/^冷蔵庫に$/.test(text.trim())) {
    await setLineUserPendingAction(lineUserId, { type: 'fridge_input_wait' });
    await replyLineMessage(replyToken, [{ type: 'text', text: '冷蔵庫に登録する食材を教えてください😊\n\n例：「白菜、にんじん、卵」' }], lineUserId);
    return true;
  }

  return false;
}

// ─── 「今日だけ特別」テーマの説明文生成 ───────────────────────────────────────────
function getSpecialThemeDesc(theme: string): string {
  const themeMap: Record<string, string> = {
    'おもてなし': 'おもてなし・ホームパーティー。ゲストを迎える特別感あふれる献立を提案してください。条件：「メインディッシュ（肉または魚料理）＋副菜2品以上＋スープまたは前菜」の構成で、テーブルを華やかに飾れる内容にしてください。平日の家族食と明らかに異なる、少し手間はかかるが訪客が喜ぶ料理を優先してください。過去の会話から家族の好物を最大限活かしてください。',
    '記念日': '記念日。お祝いにふさわしい特別感のある献立を提案してください。',
    'チートデー': 'チートデー（がんばった日のご行美）。カロリー制限なしで、家族の好物や食べたいものを優先した献立を提案してください。過去の会話から家族の好物を最大限活かしてください。',
    '季節の行事': '季節の行事・イベント（お正月・花見・夏祭り・クリスマスなど）。季節感のある特別な献立を提案してください。',
    '体調回復': '体調回復・疲れ気味。消化によく、栄養補給になるやさしい献立を提案してください。',
  };
  return themeMap[theme] ?? `${theme}。このテーマにふさわしい特別感のある献立を提案してください。`;
}

// ─── Webhook event handler ────────────────────────────────────────────

export async function handleLineWebhookEvent(event: any, _skipHistory = false) {
  const { type, source, replyToken } = event;
  const lineUserId: string = source?.userId;

  if (!lineUserId) return;

  // ─── BOT返信を自動的に履歴保存するラッパー ──────────────────────────────────
  // replyLineMessageを呼ぶと同時に、テキストメッセージをassistantとして履歴保存する
  const replyAndSave = async (token: string, messages: object[]) => {
    await replyLineMessage(token, messages);
    if (!_skipHistory) {
      const textMessages = (messages as any[]).filter(m => m.type === 'text' && m.text);
      for (const m of textMessages) {
        await addConversationMessage({ lineUserId, role: 'assistant', content: m.text }).catch(() => {});
      }
    }
  };

  if (type === "follow") {
    const profile = await getLineUserProfile(lineUserId);
    // LINEのref=パラメータ（キャンペーンコード・YouTuber紹介 or 友達紹介コード）を取得
    // LINE Messaging APIのfollowイベントは event.source に referralInfo を含む場合がある
    const referralInfo = (event as any)?.referralInfo ?? null;
    const refCode: string | null = referralInfo?.ref ?? null;
    const db = await getDb();
    if (db) {
      const existing = await getLineUserByLineId(lineUserId);
      if (!existing) {
        console.log(`[LINE] New follower: ${lineUserId} - inserting into line_users with userId=null, refCode=${refCode}`);
        try {
          await db.insert(lineUsers).values({
            userId: null as unknown as number, // LIFFログイン前は null
            lineUserId,
            displayName: profile?.displayName ?? "ユーザー",
            pictureUrl: profile?.pictureUrl ?? null,
            isActive: true,
            referralCode: refCode,
          });
        } catch (insertErr) {
          console.error('[LINE] Failed to insert new follower:', insertErr);
        }
      } else {
        // 再フォロー時もrefCodeが新たにあれば保存
        const updateData: Record<string, unknown> = {
          displayName: profile?.displayName ?? "ユーザー",
          pictureUrl: profile?.pictureUrl ?? null,
          isActive: true,
          updatedAt: new Date(),
        };
        if (refCode && !existing.referralCode) {
          updateData.referralCode = refCode;
        }
        await db
          .update(lineUsers)
          .set(updateData)
          .where(eq(lineUsers.lineUserId, lineUserId));
      }
    }

        // replyTokenで挨拶テキストのみ送信（3ステップは画像で伝えるため不要）
    await replyAndSave(replyToken, [
      {
        type: "text",
        text: `🍽️ こんにちは、${profile?.displayName ?? "ゲスト"}さん！
献立日和～coto coto～へようこそ！

毎日の献立をAIがご提案します。
「今日何作ろう…」のお悩みから解放されましょう♪

⚠️ AIの応答には30秒～1分ほどかかる場合があります。返信が来るまで少々お待ちください🙏`,
      },
    ]);

    // replyTokenは使い切ったのでsendLineMessage（push）で画像ガイドを送信
    // LINE push APIは1回5件まで制限があるため2回に分けて送信
    try {
      // 0回目: 「はじめましょう！」テキスト＋キャラクター画像を別々に送信（被り防止）
      await sendLineMessage(lineUserId, [
        {
          type: "text",
          text: "🎉 はじめましょう！",
        },
        {
          type: "image",
          originalContentUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/mori_kitchen_colorful_b246d0d3.jpg",
          previewImageUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/mori_kitchen_colorful_b246d0d3.jpg",
        },
      ]);
      // 1回目: 使い方画像（3ステップ・冷蔵庫・AIコマンド）
      await sendLineMessage(lineUserId, [
        {
          type: "image",
          originalContentUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/welcome_B_steps_v2-9A8LjBpnEDhAuoDHCav52d.png",
          previewImageUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/welcome_B_steps_v2-9A8LjBpnEDhAuoDHCav52d.png",
        },
        {
          type: "image",
          originalContentUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/new_welcome_02_fridge-d3bkgkRcZQTBCDuaN6bSye.png",
          previewImageUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/new_welcome_02_fridge-d3bkgkRcZQTBCDuaN6bSye.png",
        },
        {
          type: "image",
          originalContentUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/new_welcome_03_commands-By9oD4t2reaRVJFbjRnUSq.png",
          previewImageUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/new_welcome_03_commands-By9oD4t2reaRVJFbjRnUSq.png",
        },
      ]);
      // 2回目: 設定ボタン
      await sendLineMessage(lineUserId, [
        {
          type: "template",
          altText: "設定を始めましょう！",
          template: {
            type: "buttons",
            text: "ガイドを読み終わったら、さっそく設定を始めましょう！",
            actions: [
              {
                type: "uri",
                label: "⚙️ 設定を始める →",
                uri: "https://www.kondatebiyori.com",
              },
            ],
          },
        },
      ]);
      // 3回目: カード登録促進 Flex Message
      await sendLineMessage(lineUserId, [
        {
          type: "flex",
          altText: "🎁 20日間 全機能無料体験のご案内",
          contents: {
            type: "bubble",
            size: "mega",
            header: {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  text: "🎁 20日間 全機能無料体験",
                  weight: "bold",
                  size: "lg",
                  color: "#ffffff",
                  align: "center",
                },
              ],
              backgroundColor: "#FF6B35",
              paddingAll: "16px",
            },
            body: {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  text: "カード登録するだけで\nプレミアム機能が20日間タダ！",
                  wrap: true,
                  size: "sm",
                  color: "#555555",
                  align: "center",
                },
                {
                  type: "separator",
                  margin: "md",
                },
                {
                  type: "box",
                  layout: "vertical",
                  margin: "md",
                  spacing: "sm",
                  contents: [
                    { type: "text", text: "✓ AI高精度献立（天気・栄養考慮）", size: "sm", color: "#333333" },
                    { type: "text", text: "✓ 買い物リスト自動生成", size: "sm", color: "#333333" },
                    { type: "text", text: "✓ チラシ・レシート解析", size: "sm", color: "#333333" },
                    { type: "text", text: "✓ 献立テーマ（ダイエットなど）", size: "sm", color: "#333333" },
                    { type: "text", text: "✓ お弁当モード", size: "sm", color: "#333333" },
                  ],
                },
                {
                  type: "separator",
                  margin: "md",
                },
                {
                  type: "text",
                  text: "20日後は月額480円 ／ いつでも解約OK",
                  size: "xs",
                  color: "#aaaaaa",
                  align: "center",
                  margin: "md",
                },
              ],
              paddingAll: "16px",
            },
            footer: {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "button",
                  action: {
                    type: "uri",
                    label: "✨ 今すぐ無料で始める →",
                    uri: "https://www.kondatebiyori.com/dashboard",
                  },
                  style: "primary",
                  color: "#FF6B35",
                  height: "sm",
                },
              ],
              paddingAll: "12px",
            },
          },
        },
      ]);
    } catch (pushErr) {
      console.error('[LINE] Failed to send welcome push messages:', pushErr);
    }
    // 友達追加時は必ず標準リッチメニューをセット（トライアルユーザーにプレミアムメニューが表示されないよう）
    try {
      await switchToNormalMenu(lineUserId);
      console.log(`[LINE] follow: switchToNormalMenu applied for ${lineUserId}`);
    } catch (menuErr) {
      console.error('[LINE] Failed to switch to normal menu on follow:', menuErr);
    }
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
    // ─── processingフラグを確実にリセットするためのラッパー ──────────────────────
    // 以降の処理はすべてこのtry/finallyブロック内で行い、どのreturnパスでもフラグをリセットする
    let _processingStarted = false;
    const _originalSetProcessing = setLineUserProcessing;
    try {

    // ─── 処理中フラグチェック（重複メッセージ防止） ────────────────────────────────────────────
    // テキストメッセージのみ処理中フラグをチェック（画像・音声・位置情報はフラグ対象外）
    if (event.message?.type === "text" && !_skipHistory) {
      const incomingText = (event.message.text ?? "").normalize('NFC').replace(/[\u0000-\u001F\u007F\u3000\u00a0\ufeff\u200b-\u200f\u2028\u2029]/g, '').trim();
      // 冷蔵庫・買い物リスト確認などの単純クエリは処理中フラグをチェックしない（高速処理のため不要）
      const isSimpleQuery = /冷蔵庫の中身|買い物リストを教えて|買い物リスト.*見せて/.test(incomingText);
      if (!isSimpleQuery) {
        const { isProcessing, isTimedOut } = await checkLineUserProcessing(lineUserId);
        if (isProcessing) {
          if (isTimedOut) {
            // 30秒タイムアウト：フラグを強制リセットして処理を続行
            await setLineUserProcessing(lineUserId, false);
            console.log(`[LINE] Processing flag timed out for ${lineUserId}, resetting and continuing`);
            // タイムアウト時は続行（エラーを返さない）
          } else {
            // 処理中の場合：待機案内してスキップ
            await replyAndSave(replyToken, [{
              type: "text",
              text: "処理中です。しばらくすると自動で返信します⏳\n1分待っても返答がなかったら、申し訳ありませんが再度指示を送ってください",
            }]);
            return;
          }
        }
      }
    }

    // ─── 位置情報メッセージの処理 ────────────────────────────────────────────
    if (event.message?.type === "location") {
      const { latitude, longitude, address } = event.message;
      const region = address ?? "不明";

      await updateLineUserLocation(lineUserId, latitude, longitude, region);

      // 位置情報に基づいた天気を取得
      const today = new Date().toISOString().split("T")[0];
      const weather = await getWeatherInfo(latitude, longitude, today);
      const weatherDesc = formatWeatherForPrompt(weather);

      await replyAndSave(replyToken, [
        {
          type: "text",
          text: `位置情報を登録しました！\n場所：${region}\n\n現在の天気：${weatherDesc}\n\nこれからはあなたの地域の天気に合った献立を提案します！`,
        },
      ]);
      return;
    }
    // ─── 音声メッセージの処理 ────────────────────────────────────────────────────────────────────────────────────
    if (event.message?.type === "audio") {
      const messageId = event.message.id;
      console.log(`[LINE] Audio message received: ${messageId}`);
      // トライアルユーザーは音声機能不可
      const isTrial = await getUserIsTrial(userId ?? 0);
      if (isTrial) {
        await replyAndSave(replyToken, [{ type: "text", text: "音声メッセージは無料プラン以上でご利用いただけます。\n\nカード登録で今すぐ使えるようになります！\n→ プラン管理ページから登録できます" }]);
        return;
      }
      try {
        // LINEの音声コンテンツをダウンロードしてS3にアップロード
        const audioBuffer = await downloadLineContent(messageId);
        const { storagePut } = await import("../storage");
        const fileKey = `line-audio/${lineUserId}-${messageId}.m4a`;
        const { url: audioUrl } = await storagePut(fileKey, audioBuffer, "audio/mp4");
        // Whisper APIで文字起こし
        const transcription = await transcribeAudio({ audioUrl, language: "ja", prompt: "食材や料理、買い物に関する音声を文字起こししてください" });
        if ("error" in transcription) {
          console.error("[LINE] Transcription failed:", transcription.error);
          await replyAndSave(replyToken, [{ type: "text", text: "音声の認識に失敗しました。もう一度お試しください。" }]);
          return;
        }
        const transcribedText = transcription.text.trim();
        console.log(`[LINE] Transcribed: "${transcribedText}"`);

        // 共通のLLM意図判定でパターン分類して復唱＋3択提示
        const voiceIntentResult = await classifyUserIntent(transcribedText);
        if (voiceIntentResult.intent !== 'other') {
          // パターン別の3択メッセージを送信（復唱プレフィックスを付ける）
          // handleIntentActionは内部でreplyLineMessageを呼ぶので、復唱トークンを渡す
          await handleIntentAction(voiceIntentResult, transcribedText, lineUserId, userId, replyToken);
        } else {
          // 分類不能→復唱して確認（復唱後に通常処理に投入）
          await setLineUserPendingAction(lineUserId, {
            type: "voice_confirm",
            transcribedText,
          });
          await replyAndSave(replyToken, [{
            type: "text",
            text: `🎤 「${transcribedText}」

この内容でよろしいですか？
「はい」→ そのまま処理します
「いいえ」→ キャンセルします`,
          }]);
        }
      } catch (err) {
        console.error("[LINE] Audio processing failed:", err);
        await replyAndSave(replyToken, [{ type: "text", text: "音声の処理中にエラーが発生しました。もう一度お試しください。" }]);
      }
      return;
    }

    // ─── 画像メッセージの処理（レシート解析） ───────────────────────────────────────
    if (event.message?.type === "image") {
      // トライアルユーザーはレシート・チラシ解析不可
      if (userId) {
        const _isTrialForImage = await getUserIsTrial(userId);
        if (_isTrialForImage) {
          await replyAndSave(replyToken, [{ type: "text", text: "画像解析（レシート・チラシ）はカード登録後にご利用いただけます。\n\nカード登録でプレミアム機能が使えるようになります！" }]);
          return;
        }
      }
      const messageId = event.message.id;
      console.log(`[LINE] Image message received: ${messageId}`);
      try {
        // LINEの画像コンテンツをダウンロードしてS3にアップロード
        const imageBuffer = await downloadLineContent(messageId);
        const { storagePut } = await import("../storage");
        const fileKey = `line-images/${lineUserId}-${messageId}.jpg`;
        const { url: imageUrl } = await storagePut(fileKey, imageBuffer, "image/jpeg");
        // LLMでレシート解析
        await replyAndSave(replyToken, [{ type: "text", text: "🧳 レシートを解析中です……" }]);
        const analysisResult = await analyzeReceiptImage(imageUrl, userId);
        if (!analysisResult.success || analysisResult.items.length === 0) {
          await sendLineMessage(lineUserId, [{ type: "text", text: "レシートから商品を読み取れませんでした。レシートを正面から撑して撑して再度お試しください。" }]);
          return;
        }
        // 冷蔵庫に登録（商品名正規化キャッシュを使って表記ゆれを統合）
        if (userId) {
          const db = await getDb();
          if (db) {
            // 各商品を正規化してから登録
            const normalizedItems = await Promise.all(
              analysisResult.items.map(async (item: any) => {
                const normalizedName = await resolveProductName(item.name);
                return {
                  userId,
                  name: normalizedName,
                  quantity: item.quantity ?? "1個",
                  category: "other" as const,
                };
              })
            );
            // 既存食材と重複しないものだけ登録
            const existingItems = await getFridgeItems(userId);
            const toInsert = normalizedItems.filter(ni =>
              !findMatchingFridgeItem(existingItems, ni.name)
            );
            if (toInsert.length > 0) {
              await db.insert(fridgeItemsTable).values(toInsert);
            }
            // 重複分は数量を更新
            for (const ni of normalizedItems) {
              const existing = findMatchingFridgeItem(existingItems, ni.name);
              if (existing) {
                await db.update(fridgeItemsTable)
                  .set({ quantity: ni.quantity, updatedAt: new Date() })
                  .where(and(eq(fridgeItemsTable.id, existing.id), eq(fridgeItemsTable.userId, userId)));
              }
            }
            // analysisResult.itemsの表示名を正規化後の名前に更新
            analysisResult.items = normalizedItems.map((ni, i) => ({
              name: ni.name,
              quantity: ni.quantity,
            }));
          }
        }
        const itemList = analysisResult.items.map((item: any) => `・${item.name}${item.quantity ? "（" + item.quantity + "）" : ""}`).join("\n");
        await sendLineMessage(lineUserId, [{
          type: "text",
          text: `✅ レシートから${analysisResult.items.length}品を冷蔵庫に登録しました！

${itemList}

献立を提案しましょうか？「献立」と送ってください`,
        }]);
      } catch (err) {
        console.error("[LINE] Image processing failed:", err);
        await sendLineMessage(lineUserId, [{ type: "text", text: "画像の処理中にエラーが発生しました。もう一度お試しください。" }]);
      }
      return;
    }

    // ─── スタンプへの反応 ─────────────────────────────────────────────────────────────
    if (event.message?.type === "sticker") {
      const stickerReplies = [
        '😄',
        'ありがとうございます！',
        '😊✨',
        'いつでも話しかけてくださいね！',
        '👍',
      ];
      const reply = stickerReplies[Math.floor(Math.random() * stickerReplies.length)];
      await replyLineMessage(replyToken, [{ type: 'text', text: reply }], lineUserId);
      return;
    }

    // ─── テキストメッセージの処理 ─────────────────────────────────────────────────────
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

    // ─── ユーザー発言を履歴に保存（全メッセージ对象）──────────────────────────────────────────────
    // 管理者がトーク履歴を確認できるよう、全てのテキストメッセージを履歴に保存する
    // 再帰呼び出し（疑似イベント）時はスキップして重複保存を防ぐ
    if (!_skipHistory) {
      await addConversationMessage({ lineUserId, role: 'user', content: text }).catch(() => {});
    }

    // ─── 処理開始フラグをセット ──────────────────────────────────────────────────────────
    // 再帰呼び出し（疑似イベント）時はスキップ
    if (!_skipHistory) {
      await setLineUserProcessing(lineUserId, true);
    }

    // ─── ダッシュボード未ログインチェック（献立・冷蔵庫メッセージ時は毎回案内）

    // userId が null（ダッシュボード未ログイン）の場合、登録を促す案内を冒頭に追加（処理は続行）
    let familyGuidePrefix = "";
    if (!userId) {
      const isMenuRequest = /献立|今日何(作|つく)ろ|ご飯(何|なに)(作|つく)/.test(text);
      const isFridgeRequest = /冷蔵庫/.test(text);
      if (isMenuRequest) {
        familyGuidePrefix = `💡 ダッシュボードで家族構成を登録すると、より精度の高い献立をご提案できます！\n👉 https://www.kondatebiyori.com\n\n`;
      } else if (isFridgeRequest) {
        familyGuidePrefix = `💡 ダッシュボードで冷蔵庫の中身を登録すると、在庫を活かした献立を自動で提案できます！\n👉 https://www.kondatebiyori.com\n\n`;
      }
    }

    // ─── LLM意図判定（pendingActionなしの場合のみ）─────────────────────────────────────────────────────
    // キーワードマッチする前に、テキストをLLMで分類してパターン別アクションを実行する
    // 「other」の場合は後続のキーワードマッチングへ進む
    // ※「献立」「冷蔵庫」等のキーワードに直接マッチする場合はLLM判定をスキップ（無限ループ防止）
    {
      // 「献立」「冷蔵庫」等のキーワードマッチするテキストは後続のキーワードマッチングで処理するためLLM判定をスキップ
      // 書き換えコマンドはLLMで分類するため、冷蔵庫・買い物リストをisDirectKeywordから除外
      // ただし「冷蔵庫の中身を教えて」「冷蔵庫に追加して」等の直接コマンドはhandleFridgeRegistrationで処理
      const isDirectKeyword =
        /^献立$|^今日の献立$|^今夜の献立$|^明日の献立$|^献立を$|^献立お願い$|^献立提案$/.test(text.trim()) ||
        /今日何(作|つく)ろ/.test(text) ||
        /ご飯(何|なに)(作|つく)/.test(text);
      const pendingNow = await getLineUserPendingAction(lineUserId);
      if (!pendingNow && !isDirectKeyword) {
        const intentResult = await classifyUserIntent(text);
        if (intentResult.intent !== 'other') {
          const handled = await handleIntentAction(intentResult, text, lineUserId, userId, replyToken);
          if (handled) {
            if (!_skipHistory) await setLineUserProcessing(lineUserId, false).catch(() => {});
            return;
          }
        }
      }
    }

    // ─── 週間予定表キーワードを優先処理（献立提案フローより前に分岐） ──────────────────────────────────────────────
    {
      const _weeklyKw = ['週間献立', '週間予定表', '献立予定表', '週間献立を見る', '週間献立を確認', '今週の献立を見せて', '今週の献立を確認', '予定表を確認', '予定表確認', '週間予定表を確認', '今週の予定表を確認', '新しく生成'];
      const _isWeeklyKw = _weeklyKw.some(kw => text === kw || text.includes(kw));
      if (_isWeeklyKw) {
        // 週間予定表フロー
        const _isPremiumW = userId ? await getUserIsPremium(userId) : false;
        const _isTrialW = userId ? await getUserIsTrial(userId) : false;
        if (!userId || _isTrialW) {
          await replyAndSave(replyToken, [{ type: 'text', text: '📅 週間予定表はプレミアムプランの機能です\n\nプレミアムプランにアップグレードすると、今週の献立表をPNG画像で確認できます😊' }]);
          return;
        }
        if (!_isPremiumW) {
          await replyAndSave(replyToken, [{ type: 'text', text: '📅 今週の予定表はダッシュボードで確認できます！\nhttps://app.kondatebiyori.com' }]);
          return;
        }
        // 「予定表を確認」→ PNG表示、「新しく生成」→ PNG生成、それ以外 → 選択肢を提示
        const _isViewReq = ['予定表を確認', '予定表確認', '週間予定表を確認', '今週の予定表を確認'].some(kw => text === kw || text.includes(kw));
        const _isGenReq = ['新しく生成', '生成する', '週間献立を生成', '献立を生成'].some(kw => text === kw || text.includes(kw));
        if (_isViewReq || _isGenReq) {
          await replyAndSave(replyToken, [{ type: 'text', text: '📅 今週の献立表を取得中です...少々お待ちください🍽' }]);
          try {
            const _flexMsg = await generateWeeklyMenuFlex(userId!);
            await sendLineMessage(lineUserId, [_flexMsg]);
          } catch (_err) {
            console.error('[LINE] Weekly menu PNG generation failed:', _err);
            await sendLineMessage(lineUserId, [{ type: 'text', text: '献立表の取得に失敗しました。しばらくしてからお試しください。' }]);
          }
          return;
        }
        // 「週間献立」「週間予定表」単体 → 生成 or 確認の選択肢を提示
        await replyAndSave(replyToken, [{
          type: 'text',
          text: '📅 週間予定表について何をしますか？',
          quickReply: { items: [
            { type: 'action' as const, action: { type: 'message' as const, label: '📋 今週の予定表を確認', text: '予定表を確認' } },
            { type: 'action' as const, action: { type: 'message' as const, label: '🔄 新しく生成する', text: '新しく生成' } },
          ]},
        }]);
        return;
      }
    }

    // ─── キーワードマッチング（優先） ───────────────────────────────────────────────────────────────────────────────────────
    // 献立提案フロー：明示的に献立提案を意図したキーワードのみマッチ（週間予定表・予定確認系は除外）
    const _isMenuProposalKw =
      /^(献立|今日の献立|今夜の献立|明日の献立|献立を|献立お願い|献立提案|献立して|献立考えて|献立作って|ご飯作って|ご飯提案|おすすめ献立)$/.test(text.trim()) ||
      /今日何(作|つく)ろ/.test(text) ||
      /ご飯(何|なに)(作|つく)/.test(text) ||
      /今夜何(作|つく)ろ/.test(text) ||
      /今日のご飯/.test(text);
    if (_isMenuProposalKw) {
      // 週間献立キーワードは後続の週間献立処理に委ねる（献立提案フローをスキップ）
      const _weeklyKwCheck = ['週間献立', '献立予定表', '週間献立を見る', '週間献立を確認', '今週の献立を見せて', '今週の献立を確認'];
      if (_weeklyKwCheck.some(kw => text === kw || text.includes(kw))) {
        // 週間献立処理へ（このifブロックをスキップして後続の週間献立処理に流す）
      } else {
      const pendingBeforeKeyword = await getLineUserPendingAction(lineUserId);
      if (pendingBeforeKeyword) {
        // pendingAction処理へ委譲
        const handled = await handleFridgeRegistration(text, userId ?? 0, lineUserId, replyToken);
        if (handled) {
          if (!_skipHistory) await setLineUserProcessing(lineUserId, false).catch(() => {});
          return;
        }
      }
      if (!userId) {
        await replyAndSave(replyToken, [
          {
            type: "text",
            text: `${displayName}さん、まずはこちらからログインしてください😊\n👉 https://www.kondatebiyori.com\n\nログインが完了したら、冷蔵庫の前に立ちながら\n「卵10個、牛乳1本、キャベツ半玉…」と\n音声で話しかけるだけで食材を登録することもできますよ🎤`,
          },
        ]);
        return;
      }
      // ─── 時間帯に応じた確認質問を返す ──────────────────────────────────────────────
      const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const currentHourJST = nowJST.getUTCHours();
      // ─── トライアルユーザーの献立提案回数制限（日3回） ──────────────────────────────────────────
      const _isTrialForMenu = await getUserIsTrial(userId);
      if (_isTrialForMenu) {
        const todayStr = nowJST.toISOString().slice(0, 10);
        const todayPlans = await getMenuPlansByDateRange(userId, todayStr, todayStr);
        if (todayPlans.length >= 3) {
          await replyAndSave(replyToken, [{ type: "text", text: "今日の献立提案は3回まで利用できます。\n\nカード登録で無制限に提案できるようになります！" }]);
          return;
        }
      }

      // ─── 前日夕食未記録チェック（パターンB） ──────────────────────────────────────────
      {
        const yesterdayJST = new Date(nowJST);
        yesterdayJST.setUTCDate(yesterdayJST.getUTCDate() - 1);
        const yesterdayStr = yesterdayJST.toISOString().slice(0, 10);
        const yesterdayPlan = userId ? await getMenuPlanByDate(userId, yesterdayStr) : null;
        if (yesterdayPlan && (yesterdayPlan.menuData) && !yesterdayPlan.actualStatusDinner) {
          // 前日夕食未記録 → 先に聴く
          let dinnerOptions: Array<{ name: string; mainIngredients: string[]; usedFridgeItems: string[] }> = [];
          try {
            const menuData = typeof yesterdayPlan.menuData === 'string' ? JSON.parse(yesterdayPlan.menuData) : yesterdayPlan.menuData;
            if (menuData?.dinner) {
              dinnerOptions = Array.isArray(menuData.dinner) ? menuData.dinner : [menuData.dinner];
            } else if (menuData?.options) {
              dinnerOptions = menuData.options;
            }
          } catch { /* ignore */ }
          await setLineUserPendingAction(lineUserId, {
            type: 'actual_meal_hearing',
            options: dinnerOptions,
            mealType: 'dinner',
            targetDate: yesterdayStr,
            menuPlanId: yesterdayPlan.id,
            askedAt: Date.now(),
          });
          const actualQR = [
            ...dinnerOptions.slice(0, 3).map((o) => ({
              type: 'action' as const,
              action: { type: 'message' as const, label: o.name.slice(0, 20), text: `作った：${o.name}` },
            })),
            { type: 'action' as const, action: { type: 'message' as const, label: '🍽️ 別の料理にした', text: '別の料理にした' } },
            { type: 'action' as const, action: { type: 'message' as const, label: '🏢 外食した', text: '外食した' } },
            { type: 'action' as const, action: { type: 'message' as const, label: '🚫 食べてない', text: '食べてない' } },
            { type: 'action' as const, action: { type: 'message' as const, label: '⏭️ あとで教える', text: 'あとで教える' } },
          ];
          await replyAndSave(replyToken, [{
            type: 'text',
            text: `昨日の夕食、何を作りましたか？😊\n毎日の記録が積み重なると、よりあなた好みに合った献立を提案できるようになります！💪`,
            quickReply: { items: actualQR },
          }]);
          return;
        }
      }


      let questionText: string;
      let pendingChoices: Record<string, string>;

      if (currentHourJST >= 5 && currentHourJST < 15) {
        // 朝〜昼：朝食/昼食の提案か夕飯か
        questionText = `どの献立を考えましょうか？\n\n1️⃣ 今日の朝食・昼食\n2️⃣ 今夜の夕飯\n\n番号か「朝食」「夕飯」などで教えてください😊`;
        pendingChoices = {
          "1": "breakfast",
          "朝食": "breakfast",
          "今日の朝食・昼食": "breakfast",
          "朝食・昼食": "breakfast",
          "昼食": "lunch",
          "ランチ": "lunch",
          "2": "dinner",
          "夕飯": "dinner",
          "夕食": "dinner",
          "晩ごはん": "dinner",
          "ディナー": "dinner",
          "今夜の夕飯": "dinner",
        };
      } else if (currentHourJST >= 15 && currentHourJST < 22) {
        // 夕方〜夜：今晩か明日分まとめてか
        questionText = `今夜の献立ですか？それとも明日分まで考えますか？\n\n1️⃣ 今夜の夕飯だけ\n2️⃣ 今夜＋明日の朝食まで\n\n`;
        pendingChoices = {
          "1": "dinner",
          "今夜": "dinner",
          "今日": "dinner",
          "夕飯": "dinner",
          "夕食": "dinner",
          "今夜の夕飯だけ": "dinner",
          "2": "dinner_and_tomorrow_breakfast",
          "明日も": "dinner_and_tomorrow_breakfast",
          "まとめて": "dinner_and_tomorrow_breakfast",
          "両方": "dinner_and_tomorrow_breakfast",
          "今夜＋明日の朝食まで": "dinner_and_tomorrow_breakfast",
        };
      } else {
        // 夜（22時〜）：明日の朝食か夕飯まで考えるか
        questionText = `明日の献立を考えましょうか？\n\n1️⃣ 明日の朝食\n2️⃣ 明日の夕飯まで（朝・昼・夕）\n\n`;
        pendingChoices = {
          "1": "tomorrow_breakfast",
          "朝食": "tomorrow_breakfast",
          "朝": "tomorrow_breakfast",
          "明日の朝食": "tomorrow_breakfast",
          "2": "tomorrow_dinner",
          "夕飯": "tomorrow_dinner",
          "夕食": "tomorrow_dinner",
          "全部": "tomorrow_dinner",
          "まとめて": "tomorrow_dinner",
          "明日の夕飯まで": "tomorrow_dinner",
          "明日まとめて": "tomorrow_dinner",
        };
      }

      // pendingActionに選択待ち状態をセット
      await setLineUserPendingAction(lineUserId, {
        type: 'menu_type_selection',
        choices: pendingChoices,
        askedAt: Date.now(),
      });

      // クイックリプライアイテムを時間帯に合わせて生成
      const qrItemsAfterShopping = currentHourJST >= 5 && currentHourJST < 15
        ? [
            { type: 'action' as const, action: { type: 'message' as const, label: '🌅 朝食・昼食', text: '今日の朝食・昼食' } },
            { type: 'action' as const, action: { type: 'message' as const, label: '🌙 今夜の夕飯', text: '今夜の夕飯' } },
          ]
        : currentHourJST >= 15 && currentHourJST < 22
        ? [
            { type: 'action' as const, action: { type: 'message' as const, label: '🌙 今夜だけ', text: '今夜の夕飯だけ' } },
            { type: 'action' as const, action: { type: 'message' as const, label: '🌅 明日朝食も', text: '今夜＋明日の朝食まで' } },
          ]
        : [
            { type: 'action' as const, action: { type: 'message' as const, label: '🌅 明日の朝食', text: '明日の朝食' } },
            { type: 'action' as const, action: { type: 'message' as const, label: '🍽️ 明日まとめて', text: '明日の夕飯まで' } },
          ];
      await replyAndSave(replyToken, [{ type: "text", text: questionText, quickReply: { items: qrItemsAfterShopping } }]);
      return;
      } // end else (non-weekly menu)
    }

    if (text === "ヘルプ" || text === "help") {
      await replyAndSave(replyToken, [
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
        await replyAndSave(replyToken, [{
          type: "text",
          text: `${displayName}さん、まずはこちらからログインしてください😊
👉 https://www.kondatebiyori.com

ログインが完了したら、冷蔵庫の前に立ちながら
「卵10個、牛乳1本、キャベツ半玉…」と
音声で話しかけるだけで食材を登録することもできますよ🎤`,
        }]);
        return;
      }
      const items = await getFridgeItems(userId);
      if (items.length === 0) {
        await replyAndSave(replyToken, [{
          type: "text",
          text: "冷蔵庫に食材が登録されていません。\n\n「冷蔵庫に　を追加」と送ると登録できます！\n例：「冷蔵庫に豚肉、キャベツ、卵を追加」",
          quickReply: { items: [
            { type: 'action', action: { type: 'message', label: '➕ 食材を追加する', text: '冷蔵庫に追加' } },
            { type: 'action', action: { type: 'message', label: '🍽️ 献立を提案', text: '献立' } },
          ]},
        }]);
      } else {
        const itemList = items.map((f) => `・${f.name}${f.quantity ? "（" + f.quantity + "）" : ""}`).join("\n");
        await replyAndSave(replyToken, [{
          type: "text",
          text: `${familyGuidePrefix}❄️ 現在の冷蔵庫の食材：\n${itemList}\n\nこれらを使った献立を提案しましょうか？「献立」と送ってください`,
          quickReply: { items: [
            { type: 'action', action: { type: 'message', label: '🍽️ 献立を提案', text: '献立' } },
            { type: 'action', action: { type: 'message', label: '➕ 食材を追加', text: '冷蔵庫に追加' } },
          ]},
        }]);
      }
      return;
    }

    // ─── 冷蔵庫の一括上書き（「冷蔵庫を〇〇に書き換えて」「〇〇に冷蔵庫の中身を書き換えてください」）──────────────
    // 例: 「冷蔵庫を豚肉・キャベツ・卵に書き換えて」「・白菜・卵に冷蔵庫の中身を書き換えてください」
    // パターン1: 「冷蔵庫を/の中身を〇〇に書き換えて」（冷蔵庫が先）
    const fridgeOverwritePattern1 = text.match(/冷蔵庫(?:の中身)?(?:を全部消して|を全消しして|を全部削除して|を空にして|をリセットして)?(?:(.+?)(?:に書き換えて|に変えて|に入れ替えて|を入れて|を登録して|に更新して|に書き換えてください|に変えてください|に入れ替えてください|を入れてください|を登録してください|に更新してください))/);
    // パターン2: 「〇〇に冷蔵庫の中身を書き換えてください」（食材リストが先）
    const fridgeOverwritePattern2 = text.match(/^(.+?)(?:に|で)冷蔵庫(?:の中身)?(?:を|に)(?:書き換えて|変えて|入れ替えて|更新して|書き換えてください|変えてください|入れ替えてください|更新してください)/);
    const fridgeOverwriteMatch = fridgeOverwritePattern1 || fridgeOverwritePattern2;
    if (fridgeOverwriteMatch && userId) {
      const newItemsText = fridgeOverwriteMatch[1]?.trim();
      if (newItemsText) {
        // LLMで食材リストを抽出
        let newItems: Array<{ name: string; quantity: string | null }> = [];
        try {
          const splitResp = await invokeLLM({
            messages: [
              {
                role: 'system',
                content: `あなたは食材名抽出AIです。入力テキストから食材名と数量を抽出してJSON形式で返してください。
{"items": [{"name": "豚肉", "quantity": "300g"}, {"name": "玉ねぎ", "quantity": null}]}`,
              },
              { role: 'user', content: newItemsText },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'ingredient_list',
                strict: true,
                schema: {
                  type: 'object',
                  properties: {
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                          quantity: { type: ['string', 'null'] },
                        },
                        required: ['name', 'quantity'],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ['items'],
                  additionalProperties: false,
                },
              },
            } as any,
          });
          const content = splitResp.choices[0]?.message?.content;
          const contentStr = typeof content === 'string' ? content : JSON.stringify(content ?? {});
          newItems = JSON.parse(contentStr).items ?? [];
        } catch (err) {
          console.error('[LINE] fridge overwrite LLM error:', err);
        }
        if (newItems.length > 0) {
          // 既存の冷蔵庫を全削除
          const deletedCount = await clearAllFridgeItems(userId);
          // 新しい食材を登録
          const db2 = await getDb();
          if (db2) {
            for (const item of newItems) {
              await db2.insert(fridgeItemsTable).values({ userId, name: item.name, quantity: item.quantity ?? null, category: 'other' });
            }
          }
          const addedNames = newItems.map(i => i.name).join('・');
          await replyAndSave(replyToken, [{
            type: 'text',
            text: `🔄 冷蔵庫を書き換えました！

❌ 削除：${deletedCount}件
✅ 新しく登録：${addedNames}

「冷蔵庫の中身を教えて」で確認できます`,
          }]);
          return;
        }
      }
    }

    // ─── 冷蔵庫を全部消す（食材なし）──────────────────────────────────────────────────────
    if (/冷蔵庫(?:の中身)?(?:を全部消して|を全消しして|を全部削除して|を空にして|をリセットして)$/.test(text.trim())) {
      if (!userId) {
        await replyAndSave(replyToken, [{ type: 'text', text: `${displayName}さん、まずはこちらからログインしてください😊
👉 https://www.kondatebiyori.com

ログインが完了したら、冷蔵庫の前に立ちながら
「卵10個、牛乳1本、キャベツ半玉…」と
音声で話しかけるだけで食材を登録することもできますよ🎤` }]);
        return;
      }
      const deletedCount = await clearAllFridgeItems(userId);
      await replyAndSave(replyToken, [{
        type: 'text',
        text: deletedCount > 0
          ? `🗑️ 冷蔵庫の食材を全部削除しました（${deletedCount}件）

新しく食材を登録するには「冷蔵庫に〇〇を追加」と送ってください`
          : '冷蔵庫にはすでに食材が登録されていません',
      }]);
      return;
    }

        // ─── 買い物リスト全部冷蔵庫へ移動 ──────────────────────────────────────────────────────
    if (/買い物リストを全部冷蔵庫に移動して|買い物リストを冷蔵庫に移動して|買い物リスト.*全部.*冷蔵庫/.test(text)) {
      if (!userId) {
        await replyAndSave(replyToken, [{ type: "text", text: `${displayName}さん、まずはこちらからログインしてください😊\n👉 https://www.kondatebiyori.com\n\nログインが完了したら、冷蔵庫の前に立ちながら\n「卵10個、牛乳1本、キャベツ半玉…」と\n音声で話しかけるだけで食材を登録することもできますよ🎤` }]);
        return;
      }
      const db = await getDb();
      if (!db) {
        await replyAndSave(replyToken, [{ type: "text", text: "エラーが発生しました。しばらくしてから再度お試しください。" }]);
        return;
      }
      const pendingShoppingItems = await db.select().from(shoppingListItems)
        .where(and(eq(shoppingListItems.userId, userId), eq(shoppingListItems.isChecked, false)));
      if (pendingShoppingItems.length === 0) {
        await replyAndSave(replyToken, [{ type: "text", text: "買い物リストは空です！" }]);
        return;
      }
       // 冷蔵庫に追加（同義語正規化・重複チェック・数量なし→1）
      const existingFridgeItems = await db.select().from(fridgeItemsTable).where(eq(fridgeItemsTable.userId, userId));
      let addedCount = 0;
      const noQtyMovedItems: string[] = [];
      for (const item of pendingShoppingItems) {
        // 同義語正規化
        const normalizedName = await resolveProductName(item.name);
        const existing = findMatchingFridgeItem(existingFridgeItems, normalizedName);
        if (existing) {
          // 既存あり：数量があれば更新、なければupdatedAtのみ更新
          const updateData: { updatedAt: Date; quantity?: string } = { updatedAt: new Date() };
          if (item.quantity) updateData.quantity = item.quantity;
          await db.update(fridgeItemsTable).set(updateData).where(eq(fridgeItemsTable.id, existing.id));
        } else {
          await db.insert(fridgeItemsTable).values({ userId, name: normalizedName, quantity: item.quantity, category: 'other' });
        }
        if (!item.quantity) noQtyMovedItems.push(normalizedName);
        addedCount++;
      }
      // 買い物リストを全て購入済みにする
      await db.update(shoppingListItems).set({ isChecked: true, updatedAt: new Date() })
        .where(and(eq(shoppingListItems.userId, userId), eq(shoppingListItems.isChecked, false)));
      let moveReplyText = `✅ ${addedCount}件を冷蔵庫に移動しました！`;
      if (noQtyMovedItems.length > 0) {
        moveReplyText += `

⚠️ 数量の記載がなかった食材（${noQtyMovedItems.join('、')}）は「1」で登録しました。正確な数量はダッシュボードの冷蔵庫画面から調整してください。`;
      }
      moveReplyText += `

献立を提案しましょうか？「献立」と送ってください😊`;
      await replyAndSave(replyToken, [{ type: "text", text: moveReplyText }]);;
      return;
    }

    // ─── 買い物リスト全部削除 ──────────────────────────────────────────────────────────────
    if (/買い物リストを全部削除して|買い物リストを削除して|買い物リスト.*全部.*削除/.test(text)) {
      if (!userId) {
        await replyAndSave(replyToken, [{ type: "text", text: `${displayName}さん、まずはこちらからログインしてください😊\n👉 https://www.kondatebiyori.com\n\nログインが完了したら、冷蔵庫の前に立ちながら\n「卵10個、牛乳1本、キャベツ半玉…」と\n音声で話しかけるだけで食材を登録することもできますよ🎤` }]);
        return;
      }
      const db = await getDb();
      if (!db) {
        await replyAndSave(replyToken, [{ type: "text", text: "エラーが発生しました。しばらくしてから再度お試しください。" }]);
        return;
      }
      const result = await db.delete(shoppingListItems)
        .where(and(eq(shoppingListItems.userId, userId), eq(shoppingListItems.isChecked, false)));
      const deletedCount = result[0]?.affectedRows ?? 0;
      if (deletedCount === 0) {
        await replyAndSave(replyToken, [{ type: "text", text: "買い物リストはすでに空です！" }]);
      } else {
        await replyAndSave(replyToken, [{ type: "text", text: `🗑️ 買い物リスト（${deletedCount}件）を削除しました。` }]);
      }
      return;
    }

    // ─── 買い物完了（購入済み）キーワード：買い物リストを全チェック完了にする ──────────────────────
    const isShoppingDone = /買い物リスト購入済み|買い物完了|買い物した|買い物おわった|買い物終わった|買い物終了|購入完了|全部買った|買い物全部完了/.test(text);
    if (isShoppingDone) {
      if (!userId) {
        await replyAndSave(replyToken, [{ type: "text", text: `${displayName}さん、まずはこちらからログインしてください😊
👉 https://www.kondatebiyori.com

ログインが完了したら、冷蔵庫の前に立ちながら
「卵10個、牛乳1本、キャベツ半玉…」と
音声で話しかけるだけで食材を登録することもできますよ🎤` }]);
        return;
      }
      const db = await getDb();
      if (!db) {
        await replyAndSave(replyToken, [{ type: "text", text: "エラーが発生しました。しばらくしてから再度お試しください。" }]);
        return;
      }
      // 未チェックの買い物リストを全て完了に更新
      const result = await db
        .update(shoppingListItems)
        .set({ isChecked: true, updatedAt: new Date() })
        .where(and(eq(shoppingListItems.userId, userId), eq(shoppingListItems.isChecked, false)));
      const updatedCount = result[0]?.affectedRows ?? 0;
      if (updatedCount === 0) {
        await replyAndSave(replyToken, [{ type: "text", text: "買い物リストはすでに空です！\n\n次回の献立は「献立」と送ってください😊" }]);
      } else {
        await replyAndSave(replyToken, [{ type: "text", text: `✅ 買い物お疲れさまでした！\n${updatedCount}件のアイテムを購入済みにしました👍\n\n冷蔵庫の中身も更新しましたか？\n「冷蔵庫に追加」と送ると登録できます🥬` }]);
      }
      return;
    }

    // ─── リッチメニュー「買い物リスト」ボタンからのトーク返信 ──────────────────────
    if (normalizedText === "買い物リストを教えて" || text.includes("買い物リストを教えて")) {
      if (!userId) {
        await replyAndSave(replyToken, [{
          type: "text",
          text: `${displayName}さん、まずはこちらからログインしてください😊
👉 https://www.kondatebiyori.com

ログインが完了したら、冷蔵庫の前に立ちながら
「卵10個、牛乳1本、キャベツ半玉…」と
音声で話しかけるだけで食材を登録することもできますよ🎤`,
        }]);
        return;
      }
      const db = await getDb();
      if (!db) {
        await replyAndSave(replyToken, [{ type: "text", text: "エラーが発生しました。しばらくしてから再度お試しください。" }]);
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
        await replyAndSave(replyToken, [{
          type: "text",
          text: "買い物リストは空です。\n\n献立を生成すると買い物リスト候補がダッシュボードに表示されます。\n必要なものだけ選んで追加できます！\nhttps://www.kondatebiyori.com/dashboard",
        }]);
      } else {
        const itemList = pendingItems.map((s) => `・${s.name}${s.quantity ? " " + s.quantity : ""}`).join("\n");
        await replyAndSave(replyToken, [{
          type: "text",
          text: `🛒 買い物リスト（${pendingItems.length}件）：\n${itemList}\n\n買い物は完了しましたか？`,
          quickReply: {
            items: [
              {
                type: "action",
                action: {
                  type: "message",
                  label: "✅ 全部購入→冷蔵庫へ",
                  text: "買い物リストを全部冷蔵庫に移動して",
                },
              },
              {
                type: "action",
                action: {
                  type: "message",
                  label: "🗑️ 全部削除",
                  text: "買い物リストを全部削除して",
                },
              },
              {
                type: "action",
                action: {
                  type: "uri",
                  label: "📋 個別に選ぶ",
                  uri: "https://www.kondatebiyori.com/dashboard",
                },
              },
            ],
          },
        }]);
      }
      return;
    }

    // ─── リッチメニュー「今日だけ特別」ボタン（課金ユーザー専用）────────────────────────────────
    // ※「今日だけ特別：〇〇」（コロン付き）はこのifより前の specialTodayMatch で処理済み
    if (normalizedText === "今日だけ特別") {
      if (!userId) {
        await replyAndSave(replyToken, [{ type: "text", text: `${displayName}さん、まずはこちらからログインしてください😊\n👉 https://www.kondatebiyori.com\n\nログインが完了したら、冷蔵庫の前に立ちながら\n「卵10個、牛乳1本、キャベツ半玉…」と\n音声で話しかけるだけで食材を登録することもできますよ🎤` }]);
        return;
      }
      const isPremium = await getUserIsPremium(userId);
      if (!isPremium) {
        await replyAndSave(replyToken, [{
          type: "text",
          text: "⭐ 「今日だけ特別」はプレミアム会員限定の機能です\n\nダッシュボードからプレミアムプランにアップグレードすると、特別な日の献立提案が使えるようになります！\nhttps://www.kondatebiyori.com/dashboard",
        }]);
        return;
      }
      await replyAndSave(replyToken, [{
        type: "text",
        text: "✨ 今日はどんな特別な日ですか？\n\n下から選ぶか、自由に入力してください😊",
        quickReply: {
          items: [
            { type: "action", action: { type: "message", label: "🥂 おもてなし", text: "今日だけ特別：おもてなし" } },
            { type: "action", action: { type: "message", label: "🎂 記念日", text: "今日だけ特別：記念日" } },
            { type: "action", action: { type: "message", label: "🍰 チートデー", text: "今日だけ特別：チートデー" } },
            { type: "action", action: { type: "message", label: "🎌 季節の行事", text: "今日だけ特別：季節の行事" } },
            { type: "action", action: { type: "message", label: "🏥 体調回復", text: "今日だけ特別：体調回復" } },
          ],
        },
      }]);
      return;
    }

    // ─── 「今日だけ特別：〇〇」テーマ選択後の処理 ──────────────────────────────────────────
    const specialTodayMatch = text.match(/^今日だけ特別[：::](.+)$/);
    if (specialTodayMatch && userId) {
      const specialTheme = specialTodayMatch[1].trim();
      // 「記念日」の場合は誰の記念日か確認する
      if (specialTheme.includes("記念日")) {
        await setLineUserPendingAction(lineUserId, { type: 'special_today_anniversary', theme: specialTheme });
        await replyAndSave(replyToken, [{
          type: "text",
          text: "🎂 素敵な記念日ですね！\n\n誰の記念日ですか？",
          quickReply: {
            items: [
              { type: "action", action: { type: "message", label: "👶 子どもの誕生日", text: "子どもの誕生日" } },
              { type: "action", action: { type: "message", label: "💑 パートナーの誕生日", text: "パートナーの誕生日" } },
              { type: "action", action: { type: "message", label: "🎉 自分の誕生日", text: "自分の誕生日" } },
              { type: "action", action: { type: "message", label: "💍 結婚記念日", text: "結婚記念日" } },
              { type: "action", action: { type: "message", label: "🎊 その他の記念日", text: "その他の記念日" } },
            ],
          },
        }]);
        return;
      }
      // 記念日以外はすぐに献立生成
      const nowJSTSpecial = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const todaySpecial = nowJSTSpecial.toISOString().split('T')[0];
      const specialThemeDesc = getSpecialThemeDesc(specialTheme);
      const menuPlan = await generateMenuPlan(userId, todaySpecial, 'dinner', undefined, specialThemeDesc, true);
      await replyAndSave(replyToken, [{ type: "text", text: menuPlan.message }]);
      return;
    }

    // ─── 「今日だけ特別：記念日」→ 誰の記念日か回答後の処理 ─────────────────────────────────
    {
      const pendingAnniversary = await getLineUserPendingAction(lineUserId);
      if (pendingAnniversary?.type === 'special_today_anniversary' && userId) {
        const anniversaryFor = text.trim();
        const specialTheme = (pendingAnniversary as any).theme ?? '記念日';
        await setLineUserPendingAction(lineUserId, null);
        const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
        const today = nowJST.toISOString().split('T')[0];
        const specialThemeDesc = `${specialTheme}（${anniversaryFor}）。家族の好みや記録を最大限活かして、お祝いにふさわしい特別感のある献立を提案してください。`;
        const menuPlan = await generateMenuPlan(userId, today, 'dinner', undefined, specialThemeDesc, true);
        await replyAndSave(replyToken, [{ type: "text", text: menuPlan.message }]);
        return;
      }
    }

    // ─── リッチメニュー「週間献立確認」ボタン（プレミアムユーザー専用）──────────────────────────
    const isWeeklyMenuRequest = normalizedText === "週間献立" || normalizedText === "献立予定表" ||
      text.includes("週間献立を見る") || text.includes("週間献立を確認") || text.includes("今週の献立を見せて") ||
      text.includes("今週の献立を確認");
    const isWeeklyMenuAmbiguous = !isWeeklyMenuRequest && (
      text.includes("週間献立") || text.includes("週の献立") || text.includes("献立予定") ||
      (text.includes("週") && text.includes("献立"))
    );
    if (isWeeklyMenuRequest) {
      const isPremium = userId ? await getUserIsPremium(userId) : false;
      const isTrial = userId ? await getUserIsTrial(userId) : false;
      if (!userId || isTrial) {
        await replyAndSave(replyToken, [{
          type: "text",
          text: "📅 週間献立確認はプレミアムプランの機能です\n\nプレミアムプランにアップグレードすると、今週の献立をPNG画像で確認できます😊",
        }]);
        return;
      }
      if (!isPremium) {
        // 無課金ユーザー → ダッシュボードリンクを返す
        await replyAndSave(replyToken, [{
          type: "text",
          text: "📅 今週の献立はダッシュボードで確認できます！\n\nhttps://app.kondatebiyori.com",
        }]);
        return;
      }
      // プレミアムユーザー → PNG画像を生成して返す
      await replyAndSave(replyToken, [{ type: "text", text: "📅 今週の献立表を作成中です...少々お待ちください🍽" }]);
      try {
        const flexMsg = await generateWeeklyMenuFlex(userId);
        await sendLineMessage(lineUserId, [flexMsg]);
      } catch (err) {
        console.error("[LINE] Weekly menu PNG generation failed:", err);
        await sendLineMessage(lineUserId, [{ type: "text", text: "献立表の生成に失敗しました。しばらくしてからお試しください。" }]);
      }
      return;
    }
    if (isWeeklyMenuAmbiguous) {
      // 曖昧なキーワード → 3択クイックリプライで確認
      await replyAndSave(replyToken, [{
        type: "text",
        text: "週間献立について何をしますか？",
        quickReply: {
          items: [
            {
              type: "action",
              action: { type: "message", label: "📅 今週の献立を確認", text: "週間献立" },
            },
            {
              type: "action",
              action: { type: "message", label: "🤖 今週の献立を生成", text: "今週の献立をまとめて生成して" },
            },
            {
              type: "action",
              action: { type: "message", label: "❌ キャンセル", text: "キャンセル" },
            },
          ],
        },
      }]);
      return;
    }

    // ─── 買い物リストに追加コマンド ─────────────────────────────────────────────────────
    // 「買い物リストに〇〇を追加して」「〇〇を買い物リストに入れて」などを検出
    const shoppingAddPatterns = [
      /買い物リストに(.+?)を?[追加入れ登録]/,
      /(.+?)を?買い物リストに[追加入れ登録]/,
      /(.+?)を?買い物リストに/,
      /買い物リストに(.+)/,
    ];
    const shoppingAddMatch = shoppingAddPatterns.reduce<RegExpMatchArray | null>((acc, p) => acc ?? text.match(p), null);
    if (shoppingAddMatch && userId) {
      // AIで食材リストを分割・解析（「ナス3本牛乳バター」のような連続入力に対応）
      const rawInput = text;
      let parsedItems: Array<{ name: string; quantity: string | null }> = [];
      try {
        const aiResponse = await invokeLLM({
          messages: [
            {
              role: 'system',
              content: `あなたは買い物リストの食材解析AIです。
ユーザーの入力から食材名と数量を抽出してJSON配列で返してください。

# ルール
- 食材ごとに分割する（スペース・句読点・「と」「や」などで区切られていなくても分割する）
- 数量がある場合は quantity に入れる（例: "3本", "2個", "1パック"）
- 数量がない場合は quantity を null にする
- 食材名は簡潔に（「新鮮な」などの形容詞は除く）

# 出力形式（JSON配列のみ）
[{"name": "ナス", "quantity": "3本"}, {"name": "牛乳", "quantity": null}, {"name": "バター", "quantity": null}]`,
            },
            { role: 'user', content: rawInput },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'shopping_items',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        quantity: { type: ['string', 'null'] },
                      },
                      required: ['name', 'quantity'],
                      additionalProperties: false,
                    },
                  },
                },
                required: ['items'],
                additionalProperties: false,
              },
            },
          },
        });
        const rawContent = aiResponse.choices?.[0]?.message?.content;
        const content = typeof rawContent === 'string' ? rawContent : null;
        if (content) {
          const parsed = JSON.parse(content);
          parsedItems = (parsed.items || []).filter((i: { name: string; quantity: string | null }) => i.name && i.name.length > 0 && i.name.length <= 30);
        }
      } catch {
        // AIが失敗した場合は正規表現フォールバック
        const rawText = (shoppingAddMatch[1] || '').replace(/[をを]?[追加入れ登録して]+$/, '').trim()
          || text.replace(/買い物リストに[をを]?[追加入れ登録して]*/, '').trim();
        const rawItems = rawText.split(/[、,，・\n\r\s\u3000]+/).map((s: string) => s.trim()).filter((s: string) => s.length > 0 && s.length <= 30);
        parsedItems = rawItems.map((raw: string) => {
          const qtyMatch = raw.match(/^(.+?)([0-9０-９]+[個本枚袋箱パック缶切れ匹尾頭羽束房玉串缶瓶]?)$/);
          return { name: qtyMatch ? qtyMatch[1].trim() : raw, quantity: qtyMatch?.[2]?.trim() || null };
        });
      }

      const db = await getDb();
      if (!db || parsedItems.length === 0) {
        await replyAndSave(replyToken, [{ type: 'text', text: '買い物リストに追加する商品が分かりませんでした。例：「玉ねぎを買い物リストに追加して」' }]);
        return;
      }
      const addedItems: string[] = [];
      for (const item of parsedItems) {
        const { name, quantity } = item;
        if (!name) continue;
        const existing = await db.select().from(shoppingListItems)
          .where(and(eq(shoppingListItems.userId, userId), eq(shoppingListItems.name, name), eq(shoppingListItems.isChecked, false)))
          .limit(1);
        if (existing.length === 0) {
          const today = new Date(); today.setHours(0, 0, 0, 0);
          await db.insert(shoppingListItems).values({ userId, name, quantity, isChecked: false, listDate: today });
        }
        addedItems.push(name + (quantity ? ` ${quantity}` : ''));
      }
      if (addedItems.length > 0) {
        const itemList = addedItems.map((i: string) => `・${i}`).join('\n');
        await replyAndSave(replyToken, [{ type: 'text', text: `✅ 買い物リストに追加しました！\n${itemList}\n\nダッシュボードで確認・チェックできます🛒` }]);
      } else {
        await replyAndSave(replyToken, [{ type: 'text', text: '追加できる商品が見つかりませんでした。例：「玉ねぎを買い物リストに追加して」' }]);
      }
      return;
    }

    // ─── 冷蔵庫登録・確認コマンド ─────────────────────────────────────────────────────
    if (userId) {
      const handled = await handleFridgeRegistration(text, userId, lineUserId, replyToken);
      if (handled) {
        if (!_skipHistory) await setLineUserProcessing(lineUserId, false).catch(() => {});
        return;
      }
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
        await replyAndSave(replyToken, [{
          type: "text",
          text: `${displayName}さん、まずはこちらからログインしてください😊\n👉 https://www.kondatebiyori.com\n\nログインが完了したら、冷蔵庫の前に立ちながら\n「卵10個、牛乳1本、キャベツ半玉…」と\n音声で話しかけるだけで食材を登録することもできますよ🎤`,
        }]);
        return;
      }
      const items = await getFridgeItems(userId);
      if (items.length === 0) {
        await replyAndSave(replyToken, [{
          type: "text",
          text: "冷蔵庫に食材が登録されていません。\n\n「冷蔵庫に　を追加」と送ると登録できます！\n例：「冷蔵庫に豚肉、キャベツ、卵を追加」",
          quickReply: { items: [
            { type: 'action', action: { type: 'message', label: '➕ 食材を追加する', text: '冷蔵庫に追加' } },
            { type: 'action', action: { type: 'message', label: '🍽️ 献立を提案', text: '献立' } },
          ]},
        }]);
      } else {
        const itemList = items.map((f) => `・${f.name}${f.quantity ? "（" + f.quantity + "）" : ""}`).join("\n");
        await replyAndSave(replyToken, [{
          type: "text",
          text: `${familyGuidePrefix}❄️ 現在の冷蔵庫の食材：\n${itemList}\n\nこれらを使った献立を提案しましょうか？「献立」と送ってください`,
          quickReply: { items: [
            { type: 'action', action: { type: 'message', label: '🍽️ 献立を提案', text: '献立' } },
            { type: 'action', action: { type: 'message', label: '➕ 食材を追加', text: '冷蔵庫に追加' } },
          ]},
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
        await replyAndSave(replyToken, [{
          type: "text",
          text: `${displayName}さん、まずはこちらからログインしてください😊\n👉 https://www.kondatebiyori.com\n\nログインが完了したら、冷蔵庫の前に立ちながら\n「卵10個、牛乳1本、キャベツ半玉…」と\n音声で話しかけるだけで食材を登録することもできますよ🎤`,
        }]);
        return;
      }
      const db = await getDb();
      if (!db) {
        await replyAndSave(replyToken, [{ type: "text", text: "エラーが発生しました。しばらくしてから再度お試しください。" }]);
        return;
      }
      const shoppingItems = await db
        .select()
        .from(shoppingListItems)
        .where(eq(shoppingListItems.userId, userId))
        .orderBy(shoppingListItems.createdAt);
      const pendingItems = shoppingItems.filter((s) => !s.isChecked);
      if (pendingItems.length === 0) {
        await replyAndSave(replyToken, [{
          type: "text",
          text: "買い物リストは空です。\n\n献立を生成すると買い物リスト候補がダッシュボードに表示されます。\n必要なものだけ選んで追加できます！\nhttps://www.kondatebiyori.com/dashboard",
        }]);
      } else {
        const itemList = pendingItems.map((s) => `・${s.name}${s.quantity ? " " + s.quantity : ""}`).join("\n");
        await replyAndSave(replyToken, [{
          type: "text",
          text: `🛒 買い物リスト（${pendingItems.length}件）：\n${itemList}\n\n買い物は完了しましたか？`,
          quickReply: {
            items: [
              {
                type: "action",
                action: {
                  type: "message",
                  label: "✅ 全部購入→冷蔵庫へ",
                  text: "買い物リストを全部冷蔵庫に移動して",
                },
              },
              {
                type: "action",
                action: {
                  type: "message",
                  label: "🗑️ 全部削除",
                  text: "買い物リストを全部削除して",
                },
              },
              {
                type: "action",
                action: {
                  type: "uri",
                  label: "📋 個別に選ぶ",
                  uri: "https://www.kondatebiyori.com/dashboard",
                },
              },
            ],
          },
        }]);
      }
      return;
    }

    // ─── 自由レシピ要求（案C）：「〇〇のレシピ教えて」→ 献立マッチング＋プレミアム判定 ──────────────────
    // 「レシピ」キーワードを含む場合に処理（pendingAction処理後のフォールスルーをここで捕捉）
    const recipeRequestMatch = text.match(/(.+?)(?:の|の料理の)?レシピ(?:を|が|は)?(?:教えて|見せて|知りたい|教えてください|見たい|ください)?$/);
    const isRecipeKeywordOnly = /^レシピ(?:教えて|見せて|知りたい|を教えて|を見せて)?$/.test(text.trim());

    if (recipeRequestMatch || isRecipeKeywordOnly) {
      const requestedDish = recipeRequestMatch ? recipeRequestMatch[1].trim() : null;

      // 当日の献立を取得
      const todayStr = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
      let todayDishNames: string[] = [];
      if (userId) {
        try {
          const todayPlan = await getMenuPlanByDate(userId, todayStr);
          if (todayPlan?.menuData) {
            const planData = typeof todayPlan.menuData === 'string' ? JSON.parse(todayPlan.menuData) : todayPlan.menuData;
            if (planData?.dinnerOptions) {
              todayDishNames = planData.dinnerOptions.map((o: any) => o.name as string);
            } else {
              todayDishNames = [planData?.breakfast, planData?.lunch, planData?.dinner].filter(Boolean) as string[];
            }
          }
        } catch { /* ignore */ }
      }

      // 料理名なし → 今日の献立候補をクイックリプライで提示
      if (!requestedDish || isRecipeKeywordOnly) {
        if (todayDishNames.length > 0) {
          const qrItems = todayDishNames.slice(0, 13).map(name => ({
            type: 'action' as const,
            action: { type: 'message' as const, label: `📖 ${name}`, text: `${name}のレシピ教えて` },
          }));
          await replyAndSave(replyToken, [{
            type: 'text',
            text: 'どの料理のレシピを知りたいですか？😊\n\n今日の献立から選ぶ場合はボタンをタップ👇',
            quickReply: { items: qrItems },
          }]);
        } else {
          await replyAndSave(replyToken, [{
            type: 'text',
            text: 'どの料理のレシピを知りたいですか？\n料理名を入力してください😊\n例：「唐揚げのレシピ教えて」',
          }]);
        }
        return;
      }

      // R-1修正：数字指定（「1のレシピ」等）→ 当日献立N番目の料理名に変換
      const numMatchForDish = requestedDish.match(/^([1-3１２３一二三])番?$/);
      let resolvedRequestedDish = requestedDish;
      if (numMatchForDish && todayDishNames.length > 0) {
        const numStr = numMatchForDish[1];
        const idx = '１一'.includes(numStr) ? 0 : '２二'.includes(numStr) ? 1 : '３三'.includes(numStr) ? 2 : parseInt(numStr, 10) - 1;
        if (idx >= 0 && idx < todayDishNames.length) {
          resolvedRequestedDish = todayDishNames[idx];
        }
      }

      // 料理名あり → 今日の献立に含まれるか部分一致チェック
      const normalize = (s: string) => s.replace(/[\s　・·]/g, '').toLowerCase();
      const matchedDish = todayDishNames.find(name =>
        normalize(name).includes(normalize(resolvedRequestedDish)) ||
        normalize(resolvedRequestedDish).includes(normalize(name))
      );

      if (matchedDish) {
        // 献立にある → 通常レシピ生成（無料・有料共通）
        try {
          const recipeResponse = await invokeLLM({
            messages: [
              { role: 'system', content: 'あなたは日本の主婦向け料理レシピAIです。簡潔で分かりやすいレシピをLINEメッセージ形式で返してください。' },
              { role: 'user', content: `「${matchedDish}」のレシピを教えてください。\n\n以下の形式で返してください：\n【材料】（4人分目安）\n・食材名 分量\n\n【作り方】\n1. 手順\n2. 手順\n（5〜7ステップ程度）\n\n【ポイント】\nコツや注意点を1〜2行で` },
            ],
          });
          const recipeText = recipeResponse.choices[0]?.message?.content ?? 'レシピの取得に失敗しました。';
          await replyAndSave(replyToken, [{ type: 'text', text: `🍳 ${matchedDish} のレシピ\n\n${recipeText}` }]);
        } catch {
          await replyAndSave(replyToken, [{ type: 'text', text: '申し訳ありません。レシピの取得に失敗しました。しばらくしてからお試しください。' }]);
        }
        return;
      }

      // 献立にない → プレミアム判定
      const isPremiumForRecipe = userId ? await getUserIsPremium(userId) : false;

      if (isPremiumForRecipe) {
        // 有料会員 → 自由レシピ生成
        try {
          const recipeResponse = await invokeLLM({
            messages: [
              { role: 'system', content: 'あなたは日本の主婦向け料理レシピAIです。簡潔で分かりやすいレシピをLINEメッセージ形式で返してください。' },
              { role: 'user', content: `「${resolvedRequestedDish}」のレシピを教えてください。\n\n以下の形式で返してください：\n【材料】（4人分目安）\n・食材名 分量\n\n【作り方】\n1. 手順\n2. 手順\n（5〜7ステップ程度）\n\n【ポイント】\nコツや注意点を1〜2行で` },
            ],
          });
          const recipeText = recipeResponse.choices[0]?.message?.content ?? 'レシピの取得に失敗しました。';
          await replyAndSave(replyToken, [{ type: 'text', text: `🍳 ${resolvedRequestedDish} のレシピ\n\n${recipeText}\n\n―――――――――――――――――――\n✨ プレミアム会員特典でお届けしました！` }]);       } catch {
          await replyAndSave(replyToken, [{ type: 'text', text: '申し訳ありません。レシピの取得に失敗しました。しばらくしてからお試しください。' }]);
        }
        return;
      }

      // 無料会員 → 今日の献立候補 + プレミアム案内
      const todayQR = todayDishNames.slice(0, 10).map(name => ({
        type: 'action' as const,
        action: { type: 'message' as const, label: `📖 ${name}`, text: `${name}のレシピ教えて` },
      }));
      todayQR.push({
        type: 'action' as const,
        action: { type: 'uri' as const, label: '⭐ プレミアムを見る', uri: 'https://www.kondatebiyori.com/dashboard' } as any,
      });
      const todayDishList = todayDishNames.length > 0
        ? `\n\n今日の献立のレシピはこちらから見られます👇\n${todayDishNames.map((n, i) => `${i + 1}️⃣ ${n}`).join('\n')}`
        : '';
      await replyAndSave(replyToken, [{
        type: 'text',
        text: `${resolvedRequestedDish}は今日の献立にないので、レシピのご案内ができません😊${todayDishList}\n\n✨ プレミアム会員になると、献立に関係なくどんな料理のレシピでも聞けます！\nhttps://www.kondatebiyori.com/dashboard`,
        quickReply: todayQR.length > 1 ? { items: todayQR } : undefined,
      }]);
      return;
    }

    // ─── AI文脈理解型応答（会話履歴・位置情報対応） ──────────────────────────────────────────────
    // generateContextualReply内で履歴保存されるので、ここでは保存不要
    try {
      const reply = await generateContextualReply(
        text,
        lineUserId,
        userId,
        displayName,
        lineUser?.latitude,
        lineUser?.longitude
      );
      await replyAndSave(replyToken, [{ type: "text", text: reply }]);
    } catch (err) {
      console.error("[LINE] Contextual reply failed:", err);
      const fallbackMsg = "「献立」と送ると今日の献立を提案します";
      await replyAndSave(replyToken, [{ type: "text", text: fallbackMsg }]);
      await addConversationMessage({ lineUserId, role: 'assistant', content: fallbackMsg }).catch(() => {});
    }
    }
    catch (_outerErr) {
    console.error('[LINE] Unhandled error in message handler:', _outerErr);
    } finally {
    // 外側のtry/finally: どのreturnパスでもprocessingフラグを確実にリセット
    if (!_skipHistory) {
      await setLineUserProcessing(lineUserId, false).catch(() => {});
    }
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
