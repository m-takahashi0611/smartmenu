import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { ENV } from "../_core/env";
import {
  campaignCodes,
  referralCodes,
  referralUsages,
  subscriptions,
} from "../../drizzle/schema";

// 管理者専用プロシージャ
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "管理者権限が必要です" });
  }
  return next({ ctx });
});

/**
 * ランダムな友達紹介コードを生成する
 * 例: USR_a1b2c3d4
 */
function generateReferralCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let code = "USR_";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export const campaignRouter = router({
  // ─── 管理者: キャンペーンコード CRUD ─────────────────────────────────────

  /**
   * LINE友だち追加URLのベースを返す（管理者用）
   */
  getLineAddFriendBaseUrl: adminProcedure.query(() => {
    const channelId = ENV.lineChannelId;
    return {
      lineAddFriendUrl: `https://line.me/R/ti/p/${channelId}`,
      channelId,
    };
  }),

  listCampaignCodes: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
    return await db
      .select()
      .from(campaignCodes)
      .orderBy(desc(campaignCodes.createdAt));
  }),

  /**
   * キャンペーンコード作成（管理者用）
   */
  createCampaignCode: adminProcedure
    .input(
      z.object({
        code: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/, "英数字・アンダースコア・ハイフンのみ使用可"),
        label: z.string().max(200).optional(),
        discountPercent: z.number().min(1).max(100),
        expiresAt: z.string().optional(), // ISO 8601 date string
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
      // コードの重複チェック
      const [existing] = await db
        .select({ id: campaignCodes.id })
        .from(campaignCodes)
        .where(eq(campaignCodes.code, input.code))
        .limit(1);
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "このコードはすでに存在します" });
      }
      await db.insert(campaignCodes).values({
        code: input.code,
        label: input.label ?? null,
        discountPercent: input.discountPercent.toString(),
        isActive: true,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      });
      return { success: true };
    }),

  /**
   * キャンペーンコード更新（管理者用）
   */
  updateCampaignCode: adminProcedure
    .input(
      z.object({
        id: z.number(),
        label: z.string().max(200).optional(),
        discountPercent: z.number().min(1).max(100).optional(),
        isActive: z.boolean().optional(),
        expiresAt: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (input.label !== undefined) updateData.label = input.label;
      if (input.discountPercent !== undefined) updateData.discountPercent = input.discountPercent.toString();
      if (input.isActive !== undefined) updateData.isActive = input.isActive;
      if (input.expiresAt !== undefined) updateData.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
      await db.update(campaignCodes).set(updateData).where(eq(campaignCodes.id, input.id));
      return { success: true };
    }),

  /**
   * キャンペーンコード削除（管理者用）
   */
  deleteCampaignCode: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
      await db.delete(campaignCodes).where(eq(campaignCodes.id, input.id));
      return { success: true };
    }),

  // ─── ユーザー: 友達紹介コード ─────────────────────────────────────────────

  /**
   * 自分の友達紹介コードを取得（なければ自動発行）
   */
  getMyReferralCode: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
    // 既存コードを検索
    const [existing] = await db
      .select()
      .from(referralCodes)
      .where(eq(referralCodes.userId, userId))
      .limit(1);
    if (existing) return existing;
    // なければ新規発行（重複しないまで試行）
    let code = generateReferralCode();
    let attempts = 0;
    while (attempts < 10) {
      const [dup] = await db
        .select({ id: referralCodes.id })
        .from(referralCodes)
        .where(eq(referralCodes.code, code))
        .limit(1);
      if (!dup) break;
      code = generateReferralCode();
      attempts++;
    }
    await db.insert(referralCodes).values({ userId, code, usageCount: 0 });
    const [created] = await db
      .select()
      .from(referralCodes)
      .where(eq(referralCodes.userId, userId))
      .limit(1);
    return created;
  }),

  /**
   * 友達紹介コードの使用履歴を取得（自分が紹介した人数など）
   */
  getMyReferralStats: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
    const [code] = await db
      .select()
      .from(referralCodes)
      .where(eq(referralCodes.userId, userId))
      .limit(1);
    if (!code) return { usageCount: 0, referrals: [] };
    const usages = await db
      .select()
      .from(referralUsages)
      .where(eq(referralUsages.referrerId, userId))
      .orderBy(desc(referralUsages.createdAt));
    return { usageCount: code.usageCount, referrals: usages };
  }),

  // ─── 内部: コード検証（Checkout時に使用）─────────────────────────────────

  /**
   * キャンペーンコードを検証して割引率を返す（内部使用）
   */
  validateCampaignCode: protectedProcedure
    .input(z.object({ code: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
      const [campaign] = await db
        .select()
        .from(campaignCodes)
        .where(eq(campaignCodes.code, input.code))
        .limit(1);
      if (!campaign || !campaign.isActive) {
        return { valid: false, discountPercent: 0, label: null };
      }
      if (campaign.expiresAt && new Date(campaign.expiresAt) < new Date()) {
        return { valid: false, discountPercent: 0, label: null };
      }
      return {
        valid: true,
        discountPercent: parseFloat(campaign.discountPercent as string),
        label: campaign.label,
      };
    }),
});
