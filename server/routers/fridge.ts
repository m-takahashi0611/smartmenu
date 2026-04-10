import { z } from "zod";
import { addFridgeItem, deleteFridgeItem, getFridgeItems, getDb, bulkDeleteFridgeItems, bulkMoveFridgeToShopping } from "../db";
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

  // 複数食材を一括削除
  bulkDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      await bulkDeleteFridgeItems(input.ids, ctx.user.id);
      return { success: true, deletedCount: input.ids.length };
    }),

  // 複数食材を買い物リストへ移動
  bulkMoveToShopping: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const movedCount = await bulkMoveFridgeToShopping(input.ids, ctx.user.id);
      return { success: true, movedCount };
    }),

  // 数量増減（＋1または−1、数量が0になったら削除）
  adjustQuantity: protectedProcedure
    .input(z.object({ id: z.number(), delta: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const [item] = await db
        .select()
        .from(fridgeItems)
        .where(and(eq(fridgeItems.id, input.id), eq(fridgeItems.userId, ctx.user.id)))
        .limit(1);
      if (!item) throw new Error("Item not found");

      // 数量文字列から数値を抽出（例: "3個" → 3、"2本" → 2、null → 1）
      const qtyStr = item.quantity ?? "1";
      const numMatch = qtyStr.match(/([0-9０-９9]+)/);
      const currentNum = numMatch ? parseInt(numMatch[1].replace(/[０-９9]/g, (c) => String(c.charCodeAt(0) - 0xff10))) : 1;
      const unitMatch = qtyStr.match(/([^0-9０-９9]+)$/);
      const unit = unitMatch ? unitMatch[1] : "個";

      const newNum = currentNum + input.delta;
      if (newNum <= 0) {
        // 0以下になったら削除
        await deleteFridgeItem(input.id, ctx.user.id);
        return { success: true, deleted: true, newQuantity: null };
      }
      const newQuantity = String(newNum) + unit;
      await db
        .update(fridgeItems)
        .set({ quantity: newQuantity, updatedAt: new Date() })
        .where(and(eq(fridgeItems.id, input.id), eq(fridgeItems.userId, ctx.user.id)));
      return { success: true, deleted: false, newQuantity };
    }),
});
