import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { errorLogs } from "../../drizzle/schema";
import { desc, eq } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";

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
