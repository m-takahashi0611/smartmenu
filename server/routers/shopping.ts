import { z } from "zod";
import {
  deleteShoppingItem,
  deleteCheckedShoppingItems,
  getShoppingList,
  insertShoppingListItems,
  toggleShoppingItem,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";

export const shoppingRouter = router({
  // 買い物リスト取得
  list: protectedProcedure
    .input(z.object({ date: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const today = input.date ?? new Date().toISOString().split("T")[0];
      return getShoppingList(ctx.user.id, today);
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
});
