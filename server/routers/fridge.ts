import { z } from "zod";
import { addFridgeItem, deleteFridgeItem, getFridgeItems, getDb } from "../db";
import { fridgeItems } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
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

  // 食材更新（数量・名前）
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(100).optional(),
        quantity: z.string().max(50).nullable().optional(),
        category: categoryEnum.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const updateData: Record<string, any> = { updatedAt: new Date() };
      if (input.name !== undefined) updateData.name = input.name;
      if (input.quantity !== undefined) updateData.quantity = input.quantity;
      if (input.category !== undefined) updateData.category = input.category;
      await db
        .update(fridgeItems)
        .set(updateData)
        .where(and(eq(fridgeItems.id, input.id), eq(fridgeItems.userId, ctx.user.id)));
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
