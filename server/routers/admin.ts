import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getAllActiveLineUsers, getAllUsers, getDeliveryLogs } from "../db";
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
});
