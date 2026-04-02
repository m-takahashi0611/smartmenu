import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";

// ビルドバージョン（デプロイ確認用）
const BUILD_VERSION = "v20260402-fridge-fix";

export const systemRouter = router({
  version: publicProcedure.query(() => ({
    version: BUILD_VERSION,
    timestamp: new Date().toISOString(),
  })),

  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
