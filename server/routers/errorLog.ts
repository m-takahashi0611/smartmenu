import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { errorLogs } from "../../drizzle/schema";
import { desc, eq } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";
import { ENV } from "../_core/env";
import nodemailer from "nodemailer";

async function sendErrorReportMail(opts: {
  type: string;
  message: string;
  userAgent?: string;
  lineUserId?: string;
  userId?: number | null;
}): Promise<void> {
  try {
    const transporter = nodemailer.createTransport({
      host: ENV.smtpHost,
      port: ENV.smtpPort,
      secure: ENV.smtpPort === 465,
      auth: { user: ENV.smtpUser, pass: ENV.smtpPass },
    });
    const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #c0392b; border-bottom: 2px solid #c0392b; padding-bottom: 8px;">⚠️ エラー発生通知 - 献立日和</h2>
        <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
          <tr><td style="padding: 8px 12px; background: #fdf2f2; font-weight: bold; width: 140px; border: 1px solid #f5c6cb;">エラー種別</td><td style="padding: 8px 12px; border: 1px solid #f5c6cb;">${opts.type}</td></tr>
          <tr><td style="padding: 8px 12px; background: #fdf2f2; font-weight: bold; border: 1px solid #f5c6cb;">エラー内容</td><td style="padding: 8px 12px; border: 1px solid #f5c6cb; white-space: pre-wrap;">${opts.message}</td></tr>
          <tr><td style="padding: 8px 12px; background: #fdf2f2; font-weight: bold; border: 1px solid #f5c6cb;">発生時刻</td><td style="padding: 8px 12px; border: 1px solid #f5c6cb;">${now}</td></tr>
          ${opts.userId ? `<tr><td style="padding: 8px 12px; background: #fdf2f2; font-weight: bold; border: 1px solid #f5c6cb;">ユーザーID</td><td style="padding: 8px 12px; border: 1px solid #f5c6cb;">${opts.userId}</td></tr>` : ''}
          ${opts.lineUserId ? `<tr><td style="padding: 8px 12px; background: #fdf2f2; font-weight: bold; border: 1px solid #f5c6cb;">LINE ID</td><td style="padding: 8px 12px; border: 1px solid #f5c6cb;">${opts.lineUserId}</td></tr>` : ''}
          ${opts.userAgent ? `<tr><td style="padding: 8px 12px; background: #fdf2f2; font-weight: bold; border: 1px solid #f5c6cb;">UA</td><td style="padding: 8px 12px; border: 1px solid #f5c6cb; font-size: 11px;">${opts.userAgent.slice(0, 300)}</td></tr>` : ''}
        </table>
        <p style="color: #666; font-size: 12px; margin-top: 24px;">このメールは献立日和のエラー報告機能から自動送信されました。</p>
      </div>
    `;
    await transporter.sendMail({
      from: `"献立日和 エラー通知" <${ENV.smtpFrom}>`,
      to: ENV.smtpFrom, // info@self-consulting.co.jp
      bcc: ENV.contactBcc || undefined,
      subject: `【献立日和 エラー通知】${opts.type} - ${now}`,
      html,
    });
  } catch {
    // メール送信失敗は握りつぶす
  }
}

export const errorLogRouter = router({
  /**
   * フロントエンドからエラーを受け取り、DBに保存してオーナーに通知する
   * publicProcedure: ログイン前のエラーも受け付けるため認証不要
   */
  report: publicProcedure
    .input(
      z.object({
        type: z.string().max(100),
        message: z.string().max(2000),
        userAgent: z.string().max(1000).optional(),
        lineUserId: z.string().max(64).optional(),
        extra: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user?.id ?? null;

      // DBに保存
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const [result] = await db.insert(errorLogs).values({
        type: input.type,
        message: input.message,
        userAgent: input.userAgent ?? null,
        userId: userId,
        lineUserId: input.lineUserId ?? null,
        extra: input.extra ?? null,
        notifiedOwner: false,
      });

      const insertId = result.insertId;

      // メール通知（非同期・失敗しても握りつぶす）
      sendErrorReportMail({
        type: input.type,
        message: input.message,
        userAgent: input.userAgent,
        lineUserId: input.lineUserId,
        userId,
      }).catch(() => {});

      // オーナーに通知（非同期・失敗しても握りつぶす）
      notifyOwner({
        title: `⚠️ エラー発生: ${input.type}`,
        content: [
          `**種別:** ${input.type}`,
          `**メッセージ:** ${input.message}`,
          userId ? `**ユーザーID:** ${userId}` : "",
          input.lineUserId ? `**LINE ID:** ${input.lineUserId}` : "",
          input.userAgent ? `**UA:** ${input.userAgent.slice(0, 200)}` : "",
          `**発生時刻:** ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`,
        ]
          .filter(Boolean)
          .join("\n"),
      })
        .then(async (success) => {
          if (success) {
            const db2 = await getDb();
            if (db2) {
              await db2
                .update(errorLogs)
                .set({ notifiedOwner: true })
                .where(eq(errorLogs.id, insertId));
            }
          }
        })
        .catch(() => {
          // 通知失敗は無視
        });

      return { success: true, id: insertId };
    }),

  /**
   * 管理者向け：エラーログ一覧取得
   */
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(200).default(100),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new Error("管理者のみアクセス可能です");
      }

      const db = await getDb();
      if (!db) throw new Error("DB not available");

      const logs = await db
        .select()
        .from(errorLogs)
        .orderBy(desc(errorLogs.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return logs;
    }),
});
