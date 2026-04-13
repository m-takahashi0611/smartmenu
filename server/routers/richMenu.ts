/**
 * LINE リッチメニュー管理
 * LINE Messaging API を使ってリッチメニューを作成・設定する
 *
 * 2種類のリッチメニューを管理:
 * 1. 通常メニュー: 今日の献立・冷蔵庫管理・ダッシュボードへ・買い物リスト
 * 2. 数字選択メニュー: １・２・３・その他 （pendingAction中に表示）
 */
import * as https from "https";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { systemSettings } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";

// ─── 数字メニューIDのキャッシュ（メモリ + DB永続化） ──────────────────────────
const DB_KEY_NUMBER_MENU = "number_rich_menu_id";
let cachedNumberMenuId: string | null = null;

export function getCachedNumberMenuId(): string | null {
  return cachedNumberMenuId;
}

export function setCachedNumberMenuId(id: string | null) {
  cachedNumberMenuId = id;
}

/** サーバー起動時にDBから数字メニューIDを復元する */
export async function loadNumberMenuIdFromDb(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const rows = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, DB_KEY_NUMBER_MENU))
      .limit(1);
    if (rows.length > 0 && rows[0].value) {
      cachedNumberMenuId = rows[0].value;
      console.log("[RichMenu] DBから数字メニューID復元:", cachedNumberMenuId);
    }
  } catch (e) {
    console.error("[RichMenu] DBからの数字メニューID読み込み失敗:", e);
  }
}

/** 数字メニューIDをDBに保存する */
async function saveNumberMenuIdToDb(id: string): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db
      .insert(systemSettings)
      .values({ key: DB_KEY_NUMBER_MENU, value: id })
      .onDuplicateKeyUpdate({ set: { value: id } });
  } catch (e) {
    console.error("[RichMenu] DBへの数字メニューID保存失敗:", e);
  }
}

// ─── LINE API ヘルパー ────────────────────────────────────────────────────────

async function lineApiRequest(
  method: string,
  apiPath: string,
  body?: object
): Promise<any> {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const req = https.request(
      {
        hostname: "api.line.me",
        path: apiPath,
        method,
        headers: {
          Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
          ...(bodyStr ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(bodyStr) } : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, data: data ? JSON.parse(data) : {} });
          } catch {
            resolve({ status: res.statusCode, data });
          }
        });
      }
    );
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function uploadRichMenuImage(richMenuId: string, imageBuffer: Buffer, contentType: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api-data.line.me",
        path: `/v2/bot/richmenu/${richMenuId}/content`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
          "Content-Type": contentType,
          "Content-Length": imageBuffer.length,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Image upload failed: ${res.statusCode} ${data}`));
          } else {
            resolve();
          }
        });
      }
    );
    req.on("error", reject);
    req.write(imageBuffer);
    req.end();
  });
}

// // ─── リッチメニュー定義 ───────────────────────────────────────────────

/** 通常メニュー（機能ショートカット4ボタン） */
function buildNormalRichMenuBody() {
  return {
    size: { width: 2500, height: 1686 },
    selected: true,
    name: "献立日和メニュー",
    chatBarText: "メニューを開く",
    areas: [
      // 今日の献立（左上）
      {
        bounds: { x: 0, y: 0, width: 1250, height: 843 },
        action: {
          type: "message",
          label: "今日の献立",
          text: "今日の献立",
        },
      },
      // 冷蔵庫管理（右上）→ LINEトーク返信
      {
        bounds: { x: 1250, y: 0, width: 1250, height: 843 },
        action: {
          type: "message",
          label: "冷蔵庫管理",
          text: "冷蔵庫の中身を教えて",
        },
      },
      // ダッシュボードへ（左下）→ LIFF遷移
      {
        bounds: { x: 0, y: 843, width: 1250, height: 843 },
        action: {
          type: "uri",
          label: "ダッシュボードへ",
          uri: "https://liff.line.me/2009630713-AotlJytF",
        },
      },
      // 買い物リスト（右下）→ LINEトーク返信
      {
        bounds: { x: 1250, y: 843, width: 1250, height: 843 },
        action: {
          type: "message",
          label: "買い物リスト",
          text: "買い物リストを教えて",
        },
      },
    ],
  };
}

// 後方互换のためエイリアスを残す
function buildRichMenuBody() {
  return buildNormalRichMenuBody();
}

/** 課金ユーザー向ゑ6コマメニュー（今日の献立・冷蔵庫・ダッシュボード・買い物リスト・今日だけ特別・家計簿） */
function buildPremiumRichMenuBody(){
  return {
    size: { width: 2500, height: 1686 },
    selected: true,
    name: "献立日和 プレミアムメニュー",
    chatBarText: "メニューを開く",
    areas: [
      // 今日の献立（左上）
      {
        bounds: { x: 0, y: 0, width: 833, height: 843 },
        action: { type: "message", label: "今日の献立", text: "今日の献立" },
      },
      // 冷蔵庫管理（中上）
      {
        bounds: { x: 833, y: 0, width: 834, height: 843 },
        action: { type: "message", label: "冷蔵庫管理", text: "冷蔵庫の中身を教えて" },
      },
      // ダッシュボードへ（右上）
      {
        bounds: { x: 1667, y: 0, width: 833, height: 843 },
        action: { type: "uri", label: "ダッシュボードへ", uri: "https://liff.line.me/2009630713-AotlJytF" },
      },
      // 買い物リスト（左下）
      {
        bounds: { x: 0, y: 843, width: 833, height: 843 },
        action: { type: "message", label: "買い物リスト", text: "買い物リストを教えて" },
      },
      // 今日だけ特別（中下）
      {
        bounds: { x: 833, y: 843, width: 834, height: 843 },
        action: { type: "message", label: "今日だけ特別", text: "今日だけ特別" },
      },
      // 家計簿（右下）
      {
        bounds: { x: 1667, y: 843, width: 833, height: 843 },
        action: { type: "message", label: "家計簿", text: "家計簿" },
      },
    ],
  };
}

// ─── 課金メニューIDのキャッシュ（メモリ + DB永続化） ────────────────────────────────────
const DB_KEY_PREMIUM_MENU = "premium_rich_menu_id";
let cachedPremiumMenuId: string | null = null;

export function getCachedPremiumMenuId(): string | null {
  return cachedPremiumMenuId;
}

export function setCachedPremiumMenuId(id: string | null) {
  cachedPremiumMenuId = id;
}

/** サーバー起動時にDBから課金メニューIDを復元する */
export async function loadPremiumMenuIdFromDb(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const rows = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, DB_KEY_PREMIUM_MENU))
      .limit(1);
    if (rows.length > 0 && rows[0].value) {
      cachedPremiumMenuId = rows[0].value;
      console.log("[RichMenu] DBから課金メニューID復元:", cachedPremiumMenuId);
    }
  } catch (e) {
    console.error("[RichMenu] DBからの課金メニューID読み込み失敗:", e);
  }
}

async function savePremiumMenuIdToDb(id: string): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db
      .insert(systemSettings)
      .values({ key: DB_KEY_PREMIUM_MENU, value: id })
      .onDuplicateKeyUpdate({ set: { value: id } });
  } catch (e) {
    console.error("[RichMenu] DBへの課金メニューID保存失敗:", e);
  }
}

/** 課金ユーザー向〔6コマリッチメニューを作成してIDを返す */
export async function createPremiumRichMenu(imageUrl?: string): Promise<string> {
  console.log("[RichMenu] createPremiumRichMenu 開始");
  const createRes = await lineApiRequest("POST", "/v2/bot/richmenu", buildPremiumRichMenuBody());
  if (createRes.status !== 200) {
    throw new Error(`課金メニュー作成失敗: ${JSON.stringify(createRes.data)}`);
  }
  const richMenuId: string = createRes.data.richMenuId;

  // 画像をアップロード（URLから取得）
  const imgUrl = imageUrl ?? "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/rich_menu_dashboard_2500x1686_42be9ca0.jpg";
  const imageBuffer = await fetchImageBuffer(imgUrl);
  const contentType = imgUrl.endsWith(".jpg") || imgUrl.endsWith(".jpeg") ? "image/jpeg" : "image/png";
  await uploadRichMenuImage(richMenuId, imageBuffer, contentType);

  setCachedPremiumMenuId(richMenuId);
  await savePremiumMenuIdToDb(richMenuId);

  console.log("[RichMenu] 課金メニュー作成完了:", richMenuId);
  return richMenuId;
}

/**
 * 特定ユーザーに課金メニューを表示する
 * 課金サブスク等のタイミングで呼び出す
 */
export async function switchToPremiumMenu(lineUserId: string): Promise<void> {
  if (!cachedPremiumMenuId) {
    await loadPremiumMenuIdFromDb();
  }
  const menuId = getCachedPremiumMenuId();
  if (!menuId) {
    console.warn("[RichMenu] 課金メニューIDが未設定。ダッシュボードから登録してください。");
    return;
  }
  try {
    await lineApiRequest("POST", `/v2/bot/user/${lineUserId}/richmenu/${menuId}`);
    console.log("[RichMenu] 課金メニューに切り替え:", lineUserId);
  } catch (e) {
    console.error("[RichMenu] 課金メニュー切り替え失敗:", e);
  }
}

/** 数字選択メニュー（pendingAction中に表示: １・２・３・その他） */
function buildNumberRichMenuBody() {
  return {
    size: { width: 2500, height: 1686 },
    selected: true,
    name: "献立日和 数字選択メニュー",
    chatBarText: "選択してください",
    areas: [
      // １（左上）
      {
        bounds: { x: 0, y: 0, width: 1250, height: 843 },
        action: {
          type: "message",
          label: "１",
          text: "1",
        },
      },
      // ２（右上）
      {
        bounds: { x: 1250, y: 0, width: 1250, height: 843 },
        action: {
          type: "message",
          label: "２",
          text: "2",
        },
      },
      // ３（左下）
      {
        bounds: { x: 0, y: 843, width: 1250, height: 843 },
        action: {
          type: "message",
          label: "３",
          text: "3",
        },
      },
      // その他（右下）
      {
        bounds: { x: 1250, y: 843, width: 1250, height: 843 },
        action: {
          type: "message",
          label: "その他",
          text: "その他",
        },
      },
    ],
  };
}

// ─── リッチメニュー操作関数 ──────────────────────────────────────────────────

/** 画像URLからBufferを取得するヘルパー */
async function fetchImageBuffer(imgUrl: string): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const protocol = imgUrl.startsWith("https") ? https : require("http");
    protocol.get(imgUrl, (res: any) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

export async function createAndSetRichMenu(imageUrl?: string): Promise<{
  richMenuId: string;
  message: string;
}> {
  // 1. リッチメニューを作成
  const createRes = await lineApiRequest("POST", "/v2/bot/richmenu", buildNormalRichMenuBody());
  if (createRes.status !== 200) {
    throw new Error(`リッチメニュー作成失敗: ${JSON.stringify(createRes.data)}`);
  }
  const richMenuId: string = createRes.data.richMenuId;

  // 2. 画像をアップロード（URLから取得してアップロード）
  const imgUrl = imageUrl ?? "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/rich_menu_dashboard_2500x1686_42be9ca0.jpg";
  const imageBuffer = await fetchImageBuffer(imgUrl);

  // Content-Typeを画像URLの拡張子から判定
  const contentType = imgUrl.endsWith(".jpg") || imgUrl.endsWith(".jpeg") ? "image/jpeg" : "image/png";
  await uploadRichMenuImage(richMenuId, imageBuffer, contentType);

  // 3. デフォルトリッチメニューとして設定
  const setDefaultRes = await lineApiRequest("POST", `/v2/bot/user/all/richmenu/${richMenuId}`);
  if (setDefaultRes.status !== 200) {
    throw new Error(`デフォルト設定失敗: ${JSON.stringify(setDefaultRes.data)}`);
  }

  return {
    richMenuId,
    message: `リッチメニューを作成・設定しました（ID: ${richMenuId}）`,
  };
}

/** 数字選択メニューを作成してIDを返す（デフォルト設定はしない） */
export async function createNumberRichMenu(): Promise<string> {
  console.log("[RichMenu] createNumberRichMenu 開始");
  const createRes = await lineApiRequest("POST", "/v2/bot/richmenu", buildNumberRichMenuBody());
  console.log("[RichMenu] メニュー作成ステータス:", createRes.status, JSON.stringify(createRes.data));
  if (createRes.status !== 200) {
    throw new Error(`数字メニュー作成失敗: ${JSON.stringify(createRes.data)}`);
  }
  const richMenuId: string = createRes.data.richMenuId;

  // CDN URLから画像を取得してLINE APIにアップロード
  const NUMBER_MENU_IMAGE_URL = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663223584738/yOhkPqIzBzRwypfw.jpg";
  console.log("[RichMenu] CDN URLから画像取得:", NUMBER_MENU_IMAGE_URL);
  const imageBuffer = await fetchImageBuffer(NUMBER_MENU_IMAGE_URL);
  console.log("[RichMenu] 画像取得完了 サイズ:", imageBuffer.length, "bytes");
  await uploadRichMenuImage(richMenuId, imageBuffer, "image/jpeg");
  console.log("[RichMenu] 画像アップロード完了");

  // メモリキャッシュとDBに保存
  setCachedNumberMenuId(richMenuId);
  await saveNumberMenuIdToDb(richMenuId);

  return richMenuId;
}

export async function listRichMenus(): Promise<any[]> {
  const res = await lineApiRequest("GET", "/v2/bot/richmenu/list");
  return res.data?.richmenus ?? [];
}

export async function deleteRichMenu(richMenuId: string): Promise<void> {
  await lineApiRequest("DELETE", `/v2/bot/richmenu/${richMenuId}`);
}

export async function getDefaultRichMenu(): Promise<string | null> {
  const res = await lineApiRequest("GET", "/v2/bot/user/all/richmenu");
  return res.data?.richMenuId ?? null;
}

// ─── ユーザー別リッチメニュー切り替え ────────────────────────────────────────

/**
 * 特定ユーザーに数字選択メニューを表示する
 * pendingActionがセットされるタイミングで呼び出す
 */
export async function switchToNumberMenu(lineUserId: string): Promise<void> {
  // メモリキャッシュがなければDBから復元を試みる
  if (!cachedNumberMenuId) {
    await loadNumberMenuIdFromDb();
  }
  const menuId = getCachedNumberMenuId();
  if (!menuId) {
    console.warn("[RichMenu] 数字メニューIDが未設定。ダッシュボードから登録してください。");
    return;
  }
  try {
    await lineApiRequest("POST", `/v2/bot/user/${lineUserId}/richmenu/${menuId}`);
  } catch (e) {
    console.error("[RichMenu] 数字メニュー切り替え失敗:", e);
  }
}

/**
 * 特定ユーザーを通常メニュー（デフォルト）に戻す
 * pendingActionが解除されるタイミングで呼び出す
 */
export async function switchToNormalMenu(lineUserId: string): Promise<void> {
  try {
    await lineApiRequest("DELETE", `/v2/bot/user/${lineUserId}/richmenu`);
  } catch (e) {
    console.error("[RichMenu] 通常メニューへの戻し失敗:", e);
  }
}

// ─── tRPC router ──────────────────────────────────────────────────────────────

export const richMenuRouter = router({
  // リッチメニュー一覧取得
  list: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ操作できます" });
    }
    // DBから最新のIDを取得してキャッシュを更新
    if (!cachedNumberMenuId) {
      await loadNumberMenuIdFromDb();
    }
    if (!cachedPremiumMenuId) {
      await loadPremiumMenuIdFromDb();
    }
    const menus = await listRichMenus();
    const defaultId = await getDefaultRichMenu();
    return { menus, defaultId, cachedNumberMenuId: getCachedNumberMenuId(), cachedPremiumMenuId: getCachedPremiumMenuId() };
  }),

  // 通常リッチメニューを作成してデフォルト設定
  create: protectedProcedure
    .input(z.object({ imageUrl: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ操作できます" });
      }
      return createAndSetRichMenu(input.imageUrl);
    }),

  // 数字選択メニューを作成（IDをキャッシュ）
  createNumberMenu: protectedProcedure
    .mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ操作できます" });
      }
      try {
        console.log("[tRPC] createNumberMenu 呼び出し開始");
        const richMenuId = await createNumberRichMenu();
        console.log("[tRPC] createNumberMenu 成功:", richMenuId);
        return {
          richMenuId,
          message: `数字選択メニューを作成しました（ID: ${richMenuId}）`,
        };
      } catch (e: any) {
        console.error("[tRPC] createNumberMenu エラー:", e?.message, e?.stack);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `エラー詳細: ${e?.message ?? String(e)}`,
        });
      }
    }),

  // 数字メニューIDを手動でキャッシュに設定（既存メニューを再利用する場合）
  setNumberMenuId: protectedProcedure
    .input(z.object({ richMenuId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ操作できます" });
      }
      setCachedNumberMenuId(input.richMenuId);
      await saveNumberMenuIdToDb(input.richMenuId);
      return { success: true, richMenuId: input.richMenuId };
    }),

  // リッチメニューを削除
  delete: protectedProcedure
    .input(z.object({ richMenuId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ操作できます" });
      }
      await deleteRichMenu(input.richMenuId);
      if (getCachedNumberMenuId() === input.richMenuId) {
        setCachedNumberMenuId(null);
        // DBからも削除
        try {
          const db = await getDb();
          if (db) await db.delete(systemSettings).where(eq(systemSettings.key, DB_KEY_NUMBER_MENU));
        } catch {}
      }
      return { success: true };
    }),

  // デフォルトリッチメニューを設定
  setDefault: protectedProcedure
    .input(z.object({ richMenuId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ操作できます" });
      }
      await lineApiRequest("POST", `/v2/bot/user/all/richmenu/${input.richMenuId}`);
      return { success: true };
    }),

  // 課金ユーザー向け6コマメニューを作成
  createPremiumMenu: protectedProcedure
    .input(z.object({ imageUrl: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ操作できます" });
      }
      try {
        const richMenuId = await createPremiumRichMenu(input.imageUrl);
        return { richMenuId, message: `課金メニューを作成しました（ID: ${richMenuId}）` };
      } catch (e: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `エラー: ${e?.message ?? String(e)}` });
      }
    }),

  // 課金メニューIDを手動でキャッシュに設定
  setPremiumMenuId: protectedProcedure
    .input(z.object({ richMenuId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ操作できます" });
      }
      setCachedPremiumMenuId(input.richMenuId);
      await savePremiumMenuIdToDb(input.richMenuId);
      return { success: true, richMenuId: input.richMenuId };
    }),

  // 特定ユーザーに課金メニューを適用
  applyPremiumMenuToUser: protectedProcedure
    .input(z.object({ lineUserId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ操作できます" });
      }
      await switchToPremiumMenu(input.lineUserId);
      return { success: true };
    }),
});
