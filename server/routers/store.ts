import { z } from "zod";
import { addStore, deleteStore, getStores, updateStore } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

export const storeRouter = router({
  // 店舗一覧取得
  list: protectedProcedure.query(async ({ ctx }) => {
    return getStores(ctx.user.id);
  }),

  // 店舗追加
  add: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        area: z.string().max(100).optional(),
        saleInfo: z.string().optional(),
        isMain: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await addStore({
        userId: ctx.user.id,
        name: input.name,
        area: input.area ?? null,
        saleInfo: input.saleInfo ?? null,
        isMain: input.isMain ?? false,
      });
      return { success: true };
    }),

  // 店舗更新（特売情報など）
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(100).optional(),
        area: z.string().max(100).optional().nullable(),
        saleInfo: z.string().optional().nullable(),
        isMain: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await updateStore(id, ctx.user.id, data);
      return { success: true };
    }),

  // 店舗削除
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteStore(input.id, ctx.user.id);
      return { success: true };
    }),
});
