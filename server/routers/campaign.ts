import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, desc, and, sql } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { ENV } from "../_core/env";
import {
  campaignCodes,
  referralCodes,
  referralUsages,
  subscriptions,
  users,
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
    const basicId = ENV.lineBasicId || ENV.lineChannelId;
    return {
      lineAddFriendUrl: `https://line.me/R/ti/p/${basicId}`,
      channelId: basicId,
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
        discountPercent: z.number().min(0).max(100),
        feePercent: z.number().min(0).max(100).default(0),
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
        feePercent: input.feePercent.toString(),
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
        discountPercent: z.number().min(0).max(100).optional(),
        feePercent: z.number().min(0).max(100).optional(),
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
      if (input.feePercent !== undefined) updateData.feePercent = input.feePercent.toString();
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

  /**
   * キャンペーンコードの課金実績を取得（管理者用）
   * コードを使って課金したユーザー一覧＋サマリーを返す
   */
  getCampaignCodeStats: adminProcedure
    .input(z.object({ code: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });

      // キャンペーンコード情報を取得
      const [campaign] = await db
        .select()
        .from(campaignCodes)
        .where(eq(campaignCodes.code, input.code))
        .limit(1);
      if (!campaign) {
        throw new TRPCError({ code: "NOT_FOUND", message: "コードが見つかりません" });
      }

      // そのコードを使って課金したユーザーのsubscriptionを取得
      const subs = await db
        .select({
          userId: subscriptions.userId,
          plan: subscriptions.plan,
          status: subscriptions.status,
          campaignCode: subscriptions.campaignCode,
          currentPeriodEnd: subscriptions.currentPeriodEnd,
          createdAt: subscriptions.createdAt,
          updatedAt: subscriptions.updatedAt,
          stripeSubscriptionId: subscriptions.stripeSubscriptionId,
        })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.campaignCode, input.code),
            eq(subscriptions.plan, "premium")
          )
        )
        .orderBy(desc(subscriptions.createdAt));

      // ユーザー情報をJOINして取得
      const userIds = subs.map((s) => s.userId);
      let userMap: Record<number, { name: string | null; email: string | null }> = {};
      if (userIds.length > 0) {
        const userRows = await db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(sql`${users.id} IN (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)})`);
        for (const u of userRows) {
          userMap[u.id] = { name: u.name, email: u.email };
        }
      }

      // 課金額は現状DBに保存していないため、割引後の月額を計算
      // 標準月額: ¥480（税込）
      const BASE_MONTHLY_PRICE = 480;
      const discountPct = parseFloat(campaign.discountPercent as string) || 0;
      const feePct = parseFloat(campaign.feePercent as string) || 0;
      const discountedPrice = Math.round(BASE_MONTHLY_PRICE * (1 - discountPct / 100));

      const userList = subs.map((s) => {
        const user = userMap[s.userId] ?? { name: null, email: null };
        return {
          userId: s.userId,
          userName: user.name ?? `ユーザー#${s.userId}`,
          email: user.email,
          chargedAt: s.createdAt, // 課金開始日（subscription作成日）
          nextChargeAt: s.currentPeriodEnd, // 次回課金予定日
          chargeAmount: discountedPrice, // 課金額（割引後）
          discountPercent: discountPct, // 適用割引%
          status: s.status, // active / cancelled / expired / trial
        };
      });

      // サマリー計算
      const totalUsers = userList.length;
      const totalCharged = userList.reduce((sum, u) => sum + u.chargeAmount, 0);
      const totalFee = Math.round(totalCharged * (feePct / 100));

      return {
        campaign: {
          id: campaign.id,
          code: campaign.code,
          label: campaign.label,
          discountPercent: discountPct,
          feePercent: feePct,
          isActive: campaign.isActive,
          expiresAt: campaign.expiresAt,
        },
        users: userList,
        summary: {
          totalUsers,
          totalCharged,
          feePercent: feePct,
          totalFee,
        },
      };
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
