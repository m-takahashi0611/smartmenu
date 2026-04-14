import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getUserBaseTheme, upsertUserBaseTheme, getUserIsPremium } from "../db";

export const menuThemeRouter = router({
  // ベーステーマを取得
  get: protectedProcedure.query(async ({ ctx }) => {
    const theme = await getUserBaseTheme(ctx.user.id);
    return {
      // 複数選択：カンマ区切り文字列 → 配列に変換
      healthThemes: theme?.healthThemes ? theme.healthThemes.split(",").filter(Boolean) : [],
      lifestageThemes: theme?.lifestageThemes ? theme.lifestageThemes.split(",").filter(Boolean) : [],
      // 1択
      economyTheme: theme?.economyTheme ?? null,
      styleTheme: theme?.styleTheme ?? null,
      dishCountTheme: theme?.dishCountTheme ?? null,
    };
  }),

  // ベーステーマを保存（課金ユーザーのみ）
  save: protectedProcedure
    .input(
      z.object({
        healthThemes: z.array(z.string()).optional(), // 複数選択
        lifestageThemes: z.array(z.string()).optional(), // 複数選択
        economyTheme: z.string().nullable().optional(), // 1択
        styleTheme: z.string().nullable().optional(), // 1択
        dishCountTheme: z.string().nullable().optional(), // 1択
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
        // 配列 → カンマ区切り文字列に変換して保存
        healthThemes: input.healthThemes?.join(",") ?? null,
        lifestageThemes: input.lifestageThemes?.join(",") ?? null,
        economyTheme: input.economyTheme ?? null,
        styleTheme: input.styleTheme ?? null,
        dishCountTheme: input.dishCountTheme ?? null,
      });

      return { success: true };
    }),
});
