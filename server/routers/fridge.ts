import { z } from "zod";
import { addFridgeItem, deleteFridgeItem, getFridgeItems } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const categoryEnum = z.enum([
  "vegetable",
  "meat",
  "fish",
  "dairy",
  "egg",
  "seasoning",
  "frozen",
  "other",
]);

export const fridgeRouter = router({
  // 冷蔵庫在庫一覧取得
  list: protectedProcedure.query(async ({ ctx }) => {
    return getFridgeItems(ctx.user.id);
  }),

  // 食材追加
  add: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        quantity: z.string().max(50).optional(),
        expiryDate: z.string().optional(), // YYYY-MM-DD
        category: categoryEnum.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await addFridgeItem({
        userId: ctx.user.id,
        name: input.name,
        quantity: input.quantity ?? null,
        expiryDate: input.expiryDate ? (input.expiryDate as any) : null,
        category: input.category ?? "other",
      });
      return { success: true };
    }),

  // 食材削除
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteFridgeItem(input.id, ctx.user.id);
      return { success: true };
    }),
});
