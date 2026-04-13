import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getUserBaseTheme, upsertUserBaseTheme, getUserIsPremium } from "../db";

export const menuThemeRouter = router({
  // ベーステーマを取得
  get: protectedProcedure.query(async ({ ctx }) => {
    const theme = await getUserBaseTheme(ctx.user.id);
    return {
      healthTheme: theme?.healthTheme ?? null,
      lifestageTheme: theme?.lifestageTheme ?? null,
      economyTheme: theme?.economyTheme ?? null,
      styleTheme: theme?.styleTheme ?? null,
    };
  }),

  // ベーステーマを保存（課金ユーザーのみ）
  save: protectedProcedure
    .input(
      z.object({
        healthTheme: z.string().nullable().optional(),
        lifestageTheme: z.string().nullable().optional(),
        economyTheme: z.string().nullable().optional(),
        styleTheme: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const isPremium = await getUserIsPremium(ctx.user.id);
      if (!isPremium) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "この機能はプレミアムプランのみ利用できます",
        });
      }

      await upsertUserBaseTheme({
        userId: ctx.user.id,
        healthTheme: input.healthTheme ?? null,
        lifestageTheme: input.lifestageTheme ?? null,
        economyTheme: input.economyTheme ?? null,
        styleTheme: input.styleTheme ?? null,
      });

      return { success: true };
    }),
});
