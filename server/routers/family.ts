import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  addFamilyMember,
  deleteFamilyMember,
  getFamilyMembers,
  getFamilyProfile,
  updateFamilyMember,
  upsertFamilyProfile,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const ageGroupEnum = z.enum(["baby", "child", "teen", "adult", "senior"]);
const genderEnum = z.enum(["male", "female", "other"]);
const portionSizeEnum = z.enum(["small", "normal", "large"]);

export const familyRouter = router({
  // 家族プロフィール取得
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const profile = await getFamilyProfile(ctx.user.id);
    if (!profile) return null;
    const members = await getFamilyMembers(profile.id);
    return { profile, members };
  }),

  // 家族プロフィール作成・更新
  upsertProfile: protectedProcedure
    .input(
      z.object({
        familyName: z.string().max(100).optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await upsertFamilyProfile({
        userId: ctx.user.id,
        familyName: input.familyName ?? null,
        notes: input.notes ?? null,
      });
      return { success: true };
    }),

  // 家族メンバー追加
  addMember: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(50),
        ageGroup: ageGroupEnum,
        gender: genderEnum.optional(),
        allergies: z.string().optional(),
        preferences: z.string().optional(),
        portionSize: portionSizeEnum.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 家族プロフィールが存在しない場合は作成
      let profile = await getFamilyProfile(ctx.user.id);
      if (!profile) {
        await upsertFamilyProfile({ userId: ctx.user.id });
        profile = await getFamilyProfile(ctx.user.id);
      }
      if (!profile) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "家族プロフィールの作成に失敗しました",
        });
      }

      await addFamilyMember({
        familyProfileId: profile.id,
        name: input.name,
        ageGroup: input.ageGroup,
        gender: input.gender ?? "other",
        allergies: input.allergies ?? null,
        preferences: input.preferences ?? null,
        portionSize: input.portionSize ?? "normal",
      });
      return { success: true };
    }),

  // 家族メンバー更新
  updateMember: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(50).optional(),
        ageGroup: ageGroupEnum.optional(),
        gender: genderEnum.optional(),
        allergies: z.string().optional().nullable(),
        preferences: z.string().optional().nullable(),
        portionSize: portionSizeEnum.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await updateFamilyMember(id, data);
      return { success: true };
    }),

  // 家族メンバー削除
  deleteMember: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteFamilyMember(input.id);
      return { success: true };
    }),
});
