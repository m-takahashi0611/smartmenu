/**
 * LINE LIFF Authentication
 * LINEアプリ内ブラウザからのIDトークンを検証してセッションを発行する
 */
import * as https from "https";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { sdk } from "../_core/sdk";
import { upsertUser, getUserByOpenId, getLineUserByLineId, getDb } from "../db";
import { lineUsers } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { getSessionCookieOptions } from "../_core/cookies";
import { COOKIE_NAME } from "@shared/const";
import { ENV } from "../_core/env";
import { TRPCError } from "@trpc/server";

// LINE IDトークンを検証してプロフィールを取得する
async function verifyLineIdToken(idToken: string, nonce?: string): Promise<{
  sub: string;        // LINE user ID
  name: string;
  picture?: string;
  email?: string;
} | null> {
  const channelId = ENV.lineChannelId;
  if (!channelId) {
    console.error("[LINE Auth] LINE_CHANNEL_ID is not configured");
    return null;
  }

  const params = new URLSearchParams({
    id_token: idToken,
    client_id: channelId,
  });
  if (nonce) params.set("nonce", nonce);

  const body = params.toString();

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "api.line.me",
        path: "/oauth2/v2.1/verify",
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode === 200 && json.sub) {
              resolve({
                sub: json.sub,
                name: json.name ?? "LINEユーザー",
                picture: json.picture,
                email: json.email,
              });
            } else {
              console.error("[LINE Auth] Token verification failed:", json);
              resolve(null);
            }
          } catch (e) {
            console.error("[LINE Auth] Parse error:", e);
            resolve(null);
          }
        });
      }
    );
    req.on("error", (e) => {
      console.error("[LINE Auth] Request error:", e);
      resolve(null);
    });
    req.write(body);
    req.end();
  });
}

export const lineAuthRouter = router({
  /**
   * LINEのIDトークンを受け取り、セッションCookieを発行する
   */
  loginWithLine: publicProcedure
    .input(z.object({
      idToken: z.string(),
      nonce: z.string().optional(),
      lineUserId: z.string(),
      displayName: z.string().optional(),
      pictureUrl: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // 1. LINE IDトークンを検証
      const profile = await verifyLineIdToken(input.idToken, input.nonce);
      if (!profile) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "LINEトークンの検証に失敗しました",
        });
      }

      // 2. LINE user ID を openId として使用（"line:" プレフィックスで区別）
      const openId = `line:${profile.sub}`;

      // 3. usersテーブルにupsert
      await upsertUser({
        openId,
        name: profile.name ?? input.displayName ?? "LINEユーザー",
        email: profile.email ?? null,
        loginMethod: "line",
        lastSignedIn: new Date(),
      });

      const user = await getUserByOpenId(openId);
      if (!user) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "ユーザーの作成に失敗しました",
        });
      }

      // 4. line_usersテーブルにupsert（LINE UserIDとの紐付け）
      const db = await getDb();
      if (db) {
        const existingLineUser = await getLineUserByLineId(input.lineUserId);
        if (existingLineUser) {
          await db.update(lineUsers)
            .set({
              userId: user.id,
              displayName: profile.name ?? input.displayName ?? "LINEユーザー",
              pictureUrl: profile.picture ?? input.pictureUrl ?? null,
              updatedAt: new Date(),
            })
            .where(eq(lineUsers.lineUserId, input.lineUserId));
        } else {
          await db.insert(lineUsers).values({
            userId: user.id,
            lineUserId: input.lineUserId,
            displayName: profile.name ?? input.displayName ?? "LINEユーザー",
            pictureUrl: profile.picture ?? input.pictureUrl ?? null,
            isActive: true,
          });
        }
      }

      // 5. セッションCookieを発行
      const sessionToken = await sdk.createSessionToken(openId, {
        name: profile.name ?? input.displayName ?? "LINEユーザー",
      });

      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: 365 * 24 * 60 * 60 * 1000, // 1年
      });

      return {
        success: true,
        user: {
          id: user.id,
          name: user.name,
          openId: user.openId,
        },
      };
    }),
});
