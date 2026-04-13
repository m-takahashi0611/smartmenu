import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getAllActiveLineUsers, getAllUsers, getDeliveryLogs, getDb } from "../db";
import { lineConversationHistory, fridgeItems, shoppingListItems, menuPlans, lineUsers, subscriptions } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { broadcastMenus, broadcastToSelected } from "../batch/deliverMenus";

// 管理者専用プロシージャ
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "管理者権限が必要です" });
  }
  return next({ ctx });
});

export const adminRouter = router({
  // ユーザーのLINE会話履歴を取得
  getUserConversationHistory: adminProcedure
    .input(z.object({ lineUserId: z.string(), limit: z.number().min(1).max(500).default(200) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
      const history = await db
        .select()
        .from(lineConversationHistory)
        .where(eq(lineConversationHistory.lineUserId, input.lineUserId))
        .orderBy(desc(lineConversationHistory.createdAt))
        .limit(input.limit);
      return history.reverse(); // 古い順に並べ直す
    }),

  // LINEユーザー情報を取得（lineUserId → displayName等）
  getLineUserInfo: adminProcedure
    .input(z.object({ lineUserId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
      const result = await db
        .select()
        .from(lineUsers)
        .where(eq(lineUsers.lineUserId, input.lineUserId))
        .limit(1);
      return result[0] ?? null;
    }),

  // ユーザー一覧
  listUsers: adminProcedure.query(async () => {
    return getAllUsers();
  }),

  // アクティブなLINEユーザー一覧（課金情報付き）
  listLineUsers: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    // line_users と subscriptions を LEFT JOIN して課金情報を付与
    const rows = await db
      .select({
        id: lineUsers.id,
        userId: lineUsers.userId,
        lineUserId: lineUsers.lineUserId,
        displayName: lineUsers.displayName,
        pictureUrl: lineUsers.pictureUrl,
        deliveryHour: lineUsers.deliveryHour,
        deliveryMinute: lineUsers.deliveryMinute,
        isActive: lineUsers.isActive,
        isBlocked: lineUsers.isBlocked,
        blockedAt: lineUsers.blockedAt,
        region: lineUsers.region,
        createdAt: lineUsers.createdAt,
        // 課金情報
        subscriptionPlan: subscriptions.plan,
        subscriptionStatus: subscriptions.status,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
      })
      .from(lineUsers)
      .leftJoin(subscriptions, eq(lineUsers.userId, subscriptions.userId))
      .where(eq(lineUsers.isActive, true));
    return rows;
  }),

  // ユーザーブロック
  blockUser: adminProcedure
    .input(z.object({ lineUserId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
      await db
        .update(lineUsers)
        .set({ isBlocked: true, blockedAt: new Date(), updatedAt: new Date() })
        .where(eq(lineUsers.lineUserId, input.lineUserId));
      return { success: true };
    }),

  // ユーザーブロック解除
  unblockUser: adminProcedure
    .input(z.object({ lineUserId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
      await db
        .update(lineUsers)
        .set({ isBlocked: false, blockedAt: null, updatedAt: new Date() })
        .where(eq(lineUsers.lineUserId, input.lineUserId));
      return { success: true };
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

  // 選択ユーザーへ個別配信
  broadcastToSelected: adminProcedure
    .input(z.object({
      lineUserIds: z.array(z.string()).min(1),
      date: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return broadcastToSelected(input.lineUserIds, input.date);
    }),

  // ユーザーの配信時間を管理者が変更
  updateDeliveryTime: adminProcedure
    .input(z.object({
      lineUserId: z.string(),
      hour: z.number().min(0).max(23),
      minute: z.number().min(0).max(59),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
      await db
        .update(lineUsers)
        .set({ deliveryHour: input.hour, deliveryMinute: input.minute, updatedAt: new Date() })
        .where(eq(lineUsers.lineUserId, input.lineUserId));
      return { success: true };
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
