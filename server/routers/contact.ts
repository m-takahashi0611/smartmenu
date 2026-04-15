import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { sendContactMail } from "../mailer";
import { TRPCError } from "@trpc/server";

export const CONTACT_CATEGORIES = [
  "エラー報告",
  "プラン・支払いについて",
  "機能について",
  "取材・広告について",
  "法人・業務提携について",
  "その他",
] as const;

export const contactRouter = router({
  send: publicProcedure
    .input(
      z.object({
        name: z.string().min(1, "お名前を入力してください").max(100),
        email: z.string().email("有効なメールアドレスを入力してください"),
        category: z.enum(CONTACT_CATEGORIES),
        message: z.string().min(10, "10文字以上入力してください").max(2000),
      })
    )
    .mutation(async ({ input }) => {
      try {
        await sendContactMail({
          name: input.name,
          email: input.email,
          category: input.category,
          message: input.message,
        });
        return { success: true };
      } catch (error) {
        console.error("[Contact] Failed to send email:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "メールの送信に失敗しました。しばらく時間をおいて再度お試しください。",
        });
      }
    }),
});
