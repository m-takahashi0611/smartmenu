import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { bentoSettings } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const bentoRouter = router({
  // お弁当モード設定を取得
  getSettings: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return {
      enabled: false,
      dayMode: "weekday" as const,
      customDays: [] as string[],
      prepEvening: true,
      selectedMembers: [] as number[],
      boxSizes: {} as Record<string, string>,
    };

    const [row] = await db
      .select()
      .from(bentoSettings)
      .where(eq(bentoSettings.userId, ctx.user.id));

    if (!row) {
      return {
        enabled: false,
        dayMode: "weekday" as const,
        customDays: [] as string[],
        prepEvening: true,
        selectedMembers: [] as number[],
        boxSizes: {} as Record<string, string>,
      };
    }

    return {
      enabled: row.enabled,
      dayMode: row.dayMode,
      customDays: row.customDays ? (JSON.parse(row.customDays) as string[]) : [],
      prepEvening: row.prepEvening,
      selectedMembers: row.selectedMembers
        ? (JSON.parse(row.selectedMembers) as number[])
        : [],
      boxSizes: row.boxSizes
        ? (JSON.parse(row.boxSizes) as Record<string, string>)
        : {},
    };
  }),

  // お弁当モード設定を保存（upsert）
  saveSettings: protectedProcedure
    .input(
      z.object({
        enabled: z.boolean(),
        dayMode: z.enum(["everyday", "weekday", "custom"]),
        customDays: z.array(z.string()),
        prepEvening: z.boolean(),
        selectedMembers: z.array(z.number()),
        boxSizes: z.record(z.string(), z.string()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { success: false };

      const values = {
        userId: ctx.user.id,
        enabled: input.enabled,
        dayMode: input.dayMode,
        customDays: JSON.stringify(input.customDays),
        prepEvening: input.prepEvening,
        selectedMembers: JSON.stringify(input.selectedMembers),
        boxSizes: JSON.stringify(input.boxSizes),
      };

      await db
        .insert(bentoSettings)
        .values(values)
        .onDuplicateKeyUpdate({
          set: {
            enabled: values.enabled,
            dayMode: values.dayMode,
            customDays: values.customDays,
            prepEvening: values.prepEvening,
            selectedMembers: values.selectedMembers,
            boxSizes: values.boxSizes,
          },
        });

      return { success: true };
    }),
});
