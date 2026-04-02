import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getAllActiveLineUsers, getAllUsers, getDeliveryLogs, getDb } from "../db";
import { lineConversationHistory, fridgeItems, shoppingListItems, menuPlans } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { broadcastMenus } from "../batch/deliverMenus";

// 管理者専用プロシージャ
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "管理者権限が必要です" });
  }
  return next({ ctx });
});

export const adminRouter = router({
  // ユーザー一覧
  listUsers: adminProcedure.query(async () => {
    return getAllUsers();
  }),

  // アクティブなLINEユーザー一覧
  listLineUsers: adminProcedure.query(async () => {
    return getAllActiveLineUsers();
  }),

  // 配信ログ一覧
  listDeliveryLogs: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(50) }))
    .query(async ({ input }) => {
      return getDeliveryLogs(input.limit);
    }),

  // 全ユーザーへ一括配信
  broadcastMenus: adminProcedure
    .input(z.object({ date: z.string().optional() }))
    .mutation(async ({ input }) => {
      return broadcastMenus(input.date);
    }),

  // 会話履歴クリア（特定ユーザーまたは全ユーザー）
  clearConversationHistory: adminProcedure
    .input(z.object({ lineUserId: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
      if (input.lineUserId) {
        await db.delete(lineConversationHistory).where(eq(lineConversationHistory.lineUserId, input.lineUserId));
        return { success: true, message: `${input.lineUserId}の会話履歴を削除しました` };
      } else {
        await db.delete(lineConversationHistory);
        return { success: true, message: "全ユーザーの会話履歴を削除しました" };
      }
    }),

  // 冷蔵庫データクリア（特定ユーザーまたは全ユーザー）
  clearFridgeItems: adminProcedure
    .input(z.object({ userId: z.number().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
      if (input.userId) {
        await db.delete(fridgeItems).where(eq(fridgeItems.userId, input.userId));
        return { success: true, message: `userId=${input.userId}の冷蔵庫データを削除しました` };
      } else {
        await db.delete(fridgeItems);
        return { success: true, message: "全ユーザーの冷蔵庫データを削除しました" };
      }
    }),

  // 全テストデータクリア（会話履歴 + 冷蔵庫 + 買い物リスト + 献立）
  clearAllTestData: adminProcedure
    .mutation(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
      await db.delete(lineConversationHistory);
      await db.delete(fridgeItems);
      await db.delete(shoppingListItems);
      await db.delete(menuPlans);
      return {
        success: true,
        message: "全テストデータをクリアしました（会話履歴・冷蔵庫・買い物リスト・献立）",
      };
    }),
});
