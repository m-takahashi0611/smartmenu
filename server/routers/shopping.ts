import { z } from "zod";
import {
  deleteShoppingItem,
  deleteCheckedShoppingItems,
  getShoppingList,
  getShoppingListDates,
  getUserIsPremium,
  insertShoppingListItems,
  toggleShoppingItem,
  moveShoppingItemToFridge,
  moveCheckedShoppingItemsToFridge,
  bulkDeleteShoppingItems,
  bulkMoveShoppingToFridge,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";

export const shoppingRouter = router({
  // 買い物リスト取得（プラン別保存期間制限付き）
  list: protectedProcedure
    .input(z.object({ date: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const today = new Date().toISOString().split("T")[0];
      const requestedDate = input.date ?? today;
      const isPremium = await getUserIsPremium(ctx.user.id);
      // 保存期間チェック
      const maxDays = isPremium ? 30 : 3;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - (maxDays - 1));
      const cutoffStr = cutoff.toISOString().split("T")[0];
      if (requestedDate < cutoffStr) {
        // 保存期間外のデータは空配列を返す（エラーではなく）
        return [];
      }
      return getShoppingList(ctx.user.id, requestedDate);
    }),

  // 利用可能な買い物リスト日付一覧（プラン別）
  dates: protectedProcedure
    .query(async ({ ctx }) => {
      const isPremium = await getUserIsPremium(ctx.user.id);
      const dates = await getShoppingListDates(ctx.user.id, isPremium);
      return { dates, isPremium, maxDays: isPremium ? 30 : 3 };
    }),

  // アイテム追加
  add: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        quantity: z.string().max(50).optional(),
        category: z.string().max(50).optional(),
        date: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const today = input.date ?? new Date().toISOString().split("T")[0];
      await insertShoppingListItems([
        {
          userId: ctx.user.id,
          name: input.name,
          quantity: input.quantity ?? null,
          category: input.category ?? null,
          listDate: today as any,
          isChecked: false,
        },
      ]);
      return { success: true };
    }),

  // チェック状態の切り替え
  toggle: protectedProcedure
    .input(z.object({ id: z.number(), isChecked: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await toggleShoppingItem(input.id, ctx.user.id, input.isChecked);
      return { success: true };
    }),

  // アイテム削除
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteShoppingItem(input.id, ctx.user.id);
      return { success: true };
    }),

  // 購入済みアイテムを一括削除
  deleteChecked: protectedProcedure
    .mutation(async ({ ctx }) => {
      const count = await deleteCheckedShoppingItems(ctx.user.id);
      return { success: true, deletedCount: count };
    }),

  // アイテムを冷蔵庫に移行して削除
  moveToFridge: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const moved = await moveShoppingItemToFridge(input.id, ctx.user.id);
      return { success: moved };
    }),

  // チェック済みアイテムを全て冷蔵庫に移行して削除
  moveCheckedToFridge: protectedProcedure
    .mutation(async ({ ctx }) => {
      const count = await moveCheckedShoppingItemsToFridge(ctx.user.id);
      return { success: true, movedCount: count };
    }),

  // 複数アイテムを一括削除
  bulkDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      await bulkDeleteShoppingItems(input.ids, ctx.user.id);
      return { success: true, deletedCount: input.ids.length };
    }),

  // 複数アイテムを冷蔵庫へ移動
  bulkMoveToFridge: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const movedCount = await bulkMoveShoppingToFridge(input.ids, ctx.user.id);
      return { success: true, movedCount };
    }),
});
