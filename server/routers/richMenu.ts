/**
 * LINE リッチメニュー管理
 * LINE Messaging API を使ってリッチメニューを作成・設定する
 */
import * as https from "https";
import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";

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

// ─── リッチメニュー定義 ───────────────────────────────────────────────────────

function buildRichMenuBody() {
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

// ─── リッチメニュー操作関数 ──────────────────────────────────────────────────

export async function createAndSetRichMenu(imageUrl?: string): Promise<{
  richMenuId: string;
  message: string;
}> {
  // 1. リッチメニューを作成
  const createRes = await lineApiRequest("POST", "/v2/bot/richmenu", buildRichMenuBody());
  if (createRes.status !== 200) {
    throw new Error(`リッチメニュー作成失敗: ${JSON.stringify(createRes.data)}`);
  }
  const richMenuId: string = createRes.data.richMenuId;

  // 2. 画像をアップロード（URLから取得してアップロード）
  const imgUrl = imageUrl ?? "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/rich_menu_dashboard_2500x1686_42be9ca0.jpg";

  // URLから画像を取得
  const imageBuffer = await new Promise<Buffer>((resolve, reject) => {
    const protocol = imgUrl.startsWith("https") ? https : require("http");
    protocol.get(imgUrl, (res: any) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });

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

// ─── tRPC router ──────────────────────────────────────────────────────────────

export const richMenuRouter = router({
  // リッチメニュー一覧取得
  list: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ操作できます" });
    }
    const menus = await listRichMenus();
    const defaultId = await getDefaultRichMenu();
    return { menus, defaultId };
  }),

  // リッチメニューを作成してデフォルト設定
  create: protectedProcedure
    .input(z.object({ imageUrl: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ操作できます" });
      }
      return createAndSetRichMenu(input.imageUrl);
    }),

  // リッチメニューを削除
  delete: protectedProcedure
    .input(z.object({ richMenuId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ操作できます" });
      }
      await deleteRichMenu(input.richMenuId);
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
});
