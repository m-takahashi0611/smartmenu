import * as crypto from "crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, lt } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { sendLineMessage } from "./line";
import { sdk } from "../_core/sdk";
import { getSessionCookieOptions } from "../_core/cookies";
import { COOKIE_NAME } from "@shared/const";

// ─── パスワードハッシュ ───────────────────────────────────────────────────────

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "smartmenu-admin-salt").digest("hex");
}

// ─── OTP生成 ─────────────────────────────────────────────────────────────────

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const adminAuthRouter = router({
  // 管理者パスワードを設定（既存adminのみ実行可能）
  setAdminPassword: protectedProcedure
    .input(z.object({ password: z.string().min(8) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "管理者権限が必要です" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const hash = hashPassword(input.password);
      await db
        .update(users)
        .set({ adminPasswordHash: hash })
        .where(eq(users.id, ctx.user.id));

      return { success: true };
    }),

  // Step1: ID・パスワードで認証 → OTPをLINEに送信
  loginStep1: publicProcedure
    .input(z.object({ adminId: z.string(), password: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // 全adminユーザーからIDマッチを確認
      const allAdmins = await db
        .select()
        .from(users)
        .where(eq(users.role, "admin"));

      const matchedAdmin = allAdmins.find(
        (u) =>
          u.openId === input.adminId ||
          u.email === input.adminId ||
          u.name === input.adminId
      );

      if (!matchedAdmin) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "IDまたはパスワードが正しくありません" });
      }

      const passwordHash = (matchedAdmin as any).adminPasswordHash;
      if (!passwordHash) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "管理者パスワードが設定されていません。先にダッシュボードからパスワードを設定してください",
        });
      }

      const inputHash = hashPassword(input.password);
      if (inputHash !== passwordHash) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "IDまたはパスワードが正しくありません" });
      }

      // OTPを生成してDBに保存
      const otp = generateOtp();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10分後

      await db.execute(
        sql`INSERT INTO admin_otp_sessions (userId, otpCode, expiresAt) VALUES (${matchedAdmin.id}, ${otp}, ${expiresAt})`
      );

      // LINEにOTPを送信
      const lineUserId = matchedAdmin.openId?.startsWith("line:")
        ? matchedAdmin.openId.replace("line:", "")
        : null;

      if (lineUserId) {
        try {
          await sendLineMessage(lineUserId, [
            {
              type: "text",
              text: `【献立日和 管理者ログイン認証】\n\n認証コード：${otp}\n\nこのコードは10分間有効です。\n心当たりのない場合は無視してください。`,
            },
          ]);
        } catch (err) {
          console.error("[AdminAuth] Failed to send OTP via LINE:", err);
        }
      }

      const maskedInfo = lineUserId
        ? `LINE（${matchedAdmin.name ?? "管理者"}）`
        : "登録済みの連絡先";

      return {
        success: true,
        userId: matchedAdmin.id,
        sentTo: maskedInfo,
      };
    }),

  // Step2: OTPを確認して管理者セッションを発行
  loginStep2: publicProcedure
    .input(z.object({ userId: z.number(), otpCode: z.string().length(6) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const now = new Date();

      // OTPを検証
      const result = await db.execute(
        sql`SELECT * FROM admin_otp_sessions WHERE userId = ${input.userId} AND otpCode = ${input.otpCode} AND used = 0 AND expiresAt > ${now} ORDER BY createdAt DESC LIMIT 1`
      );

      const rows = (result as any)[0] as any[];
      const otpRecord = rows?.[0] ?? null;

      if (!otpRecord) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "認証コードが正しくないか、有効期限が切れています",
        });
      }

      // OTPを使用済みにする
      await db.execute(
        sql`UPDATE admin_otp_sessions SET used = 1 WHERE id = ${otpRecord.id}`
      );

      // 管理者ユーザー情報を取得
      const [adminUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      if (!adminUser || adminUser.role !== "admin") {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      // セッションを発行
      const sessionToken = await sdk.createSessionToken(adminUser.openId, {
        name: adminUser.name ?? "",
      });

      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: 8 * 60 * 60 * 1000, // 8時間
      });

      return { success: true, redirectTo: "/admin" };
    }),

  // 管理者パスワード設定状態を確認
  checkPasswordSet: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .limit(1);

    return { passwordSet: !!(user as any)?.adminPasswordHash };
  }),
});
