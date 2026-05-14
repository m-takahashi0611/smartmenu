import { and, eq, desc, gte, sql, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  deliveryLogs,
  familyMembers,
  familyProfiles,
  fridgeItems,
  lineUsers,
  lineConversationHistory,
  menuPlans,
  shoppingListItems,
  stores,
  users,
  type InsertDeliveryLog,
  type InsertFamilyMember,
  type InsertFamilyProfile,
  type InsertFridgeItem,
  type InsertLineUser,
  type InsertLineConversationHistory,
  type InsertMenuPlan,
  type InsertShoppingListItem,
  type InsertStore,
  productNameCache,
  type InsertProductNameCache,
  subscriptions,
  userBaseThemes,
  type UserBaseTheme,
  type InsertUserBaseTheme,
  broadcastMessages,
  type BroadcastMessage,
  type InsertBroadcastMessage,
  weeklySpecialDays,
  type WeeklySpecialDay,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    // TiDBではINSERT ... ON DUPLICATE KEY UPDATEが正しく動作しない場合があるため
    // SELECT→存在確認→INSERT or UPDATEパターンを使用
    const existing = await db.select().from(users).where(eq(users.openId, user.openId)).limit(1);

    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      updateSet[field] = value ?? null;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      updateSet.lastSignedIn = user.lastSignedIn;
    } else {
      updateSet.lastSignedIn = new Date();
    }

    if (user.role !== undefined) {
      updateSet.role = user.role;
    }

    if (existing.length > 0) {
      // 既存ユーザーを更新（roleは既存値を保持、明示的に指定された場合のみ上書き）
      const safeUpdateSet: Record<string, unknown> = { ...updateSet };
      if (user.role === undefined) {
        delete safeUpdateSet.role; // roleを明示指定していない場合は既存値を保持
      }
      await db.update(users).set(safeUpdateSet).where(eq(users.openId, user.openId));
    } else {
      // 新規ユーザーを作成
      const values: InsertUser = {
        openId: user.openId,
        lastSignedIn: (updateSet.lastSignedIn as Date) ?? new Date(),
      };

      if (updateSet.name !== undefined) values.name = updateSet.name as string | null;
      if (updateSet.email !== undefined) values.email = updateSet.email as string | null;
      if (updateSet.loginMethod !== undefined) values.loginMethod = updateSet.loginMethod as string | null;

      // ownerOpenIdの場合はadmin権限を付与
      if (user.openId === ENV.ownerOpenId) {
        values.role = 'admin';
      } else if (user.role !== undefined) {
        values.role = user.role;
      }

      await db.insert(users).values(values);
    }
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users);
}

// ─── LINE Users ───────────────────────────────────────────────────────────────

export async function upsertLineUser(data: InsertLineUser) {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(lineUsers)
    .values(data)
    .onDuplicateKeyUpdate({
      set: { displayName: data.displayName, pictureUrl: data.pictureUrl, updatedAt: new Date() },
    });
}

export async function getLineUserByLineId(lineUserId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(lineUsers).where(eq(lineUsers.lineUserId, lineUserId)).limit(1);
  return result[0];
}

export async function getLineUserByUserId(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(lineUsers).where(eq(lineUsers.userId, userId)).limit(1);
  return result[0];
}

export async function getAllActiveLineUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(lineUsers).where(and(eq(lineUsers.isActive, true), eq(lineUsers.isBlocked, false)));
}

export async function updateLineUserDeliveryTime(userId: number, hour: number, minute: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(lineUsers).set({ deliveryHour: hour, deliveryMinute: minute, updatedAt: new Date() }).where(eq(lineUsers.userId, userId));
}

// ─── Family Profile ───────────────────────────────────────────────────────────

export async function getFamilyProfile(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(familyProfiles).where(eq(familyProfiles.userId, userId)).orderBy(desc(familyProfiles.id)).limit(1);
  return result[0];
}

export async function upsertFamilyProfile(data: InsertFamilyProfile) {
  const db = await getDb();
  if (!db) return;
  await db.insert(familyProfiles).values(data).onDuplicateKeyUpdate({
    set: {
      familyName: data.familyName,
      notes: data.notes,
      shoppingFrequency: data.shoppingFrequency,
      shoppingDays: data.shoppingDays,
      cookingFrequency: data.cookingFrequency,
      breakfastCookCount: data.breakfastCookCount,
      lunchCookCount: data.lunchCookCount,
      dinnerCookCount: data.dinnerCookCount,
      breakfastAttendees: data.breakfastAttendees,
      lunchAttendees: data.lunchAttendees,
      dinnerAttendees: data.dinnerAttendees,
      menuPriorityOrder: data.menuPriorityOrder,
      childMenuPrefs: data.childMenuPrefs,
      updatedAt: new Date(),
    },
  });
}

export async function getFamilyMembers(familyProfileId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(familyMembers).where(eq(familyMembers.familyProfileId, familyProfileId));
}

export async function addFamilyMember(data: InsertFamilyMember) {
  const db = await getDb();
  if (!db) return;
  await db.insert(familyMembers).values(data);
}

export async function updateFamilyMember(id: number, data: Partial<InsertFamilyMember>) {
  const db = await getDb();
  if (!db) return;
  await db.update(familyMembers).set({ ...data, updatedAt: new Date() }).where(eq(familyMembers.id, id));
}

export async function deleteFamilyMember(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(familyMembers).where(eq(familyMembers.id, id));
}

// ─── Fridge Items ─────────────────────────────────────────────────────────────

export async function getFridgeItems(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(fridgeItems).where(eq(fridgeItems.userId, userId));
}

export async function addFridgeItem(data: InsertFridgeItem) {
  const db = await getDb();
  if (!db) return;
  await db.insert(fridgeItems).values(data);
}

export async function deleteFridgeItem(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(fridgeItems).where(and(eq(fridgeItems.id, id), eq(fridgeItems.userId, userId)));
}

export async function bulkDeleteFridgeItems(ids: number[], userId: number) {
  const db = await getDb();
  if (!db || ids.length === 0) return;
  await db.delete(fridgeItems).where(and(inArray(fridgeItems.id, ids), eq(fridgeItems.userId, userId)));
}

export async function clearAllFridgeItems(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const existing = await db.select().from(fridgeItems).where(eq(fridgeItems.userId, userId));
  if (existing.length === 0) return 0;
  await db.delete(fridgeItems).where(eq(fridgeItems.userId, userId));
  return existing.length;
}

export async function bulkMoveFridgeToShopping(ids: number[], userId: number): Promise<number> {
  const db = await getDb();
  if (!db || ids.length === 0) return 0;
  const items = await db.select().from(fridgeItems).where(and(inArray(fridgeItems.id, ids), eq(fridgeItems.userId, userId)));
  const today = new Date().toISOString().split('T')[0];
  let moved = 0;
  for (const item of items) {
    await db.insert(shoppingListItems).values({ userId, name: item.name, quantity: item.quantity ?? null, listDate: new Date(today + 'T00:00:00') });
    await db.delete(fridgeItems).where(and(eq(fridgeItems.id, item.id), eq(fridgeItems.userId, userId)));
    moved++;
  }
  return moved;
}

// ─── Stores ───────────────────────────────────────────────────────────────────

export async function getStores(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(stores).where(eq(stores.userId, userId));
}

export async function addStore(data: InsertStore) {
  const db = await getDb();
  if (!db) return;
  await db.insert(stores).values(data);
}

export async function updateStore(id: number, userId: number, data: Partial<InsertStore>) {
  const db = await getDb();
  if (!db) return;
  await db.update(stores).set({ ...data, updatedAt: new Date() }).where(and(eq(stores.id, id), eq(stores.userId, userId)));
}

export async function deleteStore(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(stores).where(and(eq(stores.id, id), eq(stores.userId, userId)));
}

// ─── Menu Plans ───────────────────────────────────────────────────────────────

export async function getMenuPlanByDate(userId: number, planDate: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(menuPlans).where(and(eq(menuPlans.userId, userId), eq(menuPlans.planDate, planDate as any))).limit(1);
  return result[0];
}

export async function getRecentMenuPlans(userId: number, limit = 7) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(menuPlans).where(eq(menuPlans.userId, userId)).limit(limit);
}

export async function insertMenuPlan(data: InsertMenuPlan) {
  const db = await getDb();
  if (!db) return;
  await db.insert(menuPlans).values(data);
}

export async function markMenuPlanDelivered(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(menuPlans).set({ isDelivered: true, updatedAt: new Date() }).where(eq(menuPlans.id, id));
}

/**
 * 実食記録を更新する
 */
export async function updateActualMeal(id: number, data: {
  mealType: 'breakfast' | 'lunch' | 'dinner';
  actualMeal: string | null;
  actualStatus: 'cooked' | 'other' | 'eating_out' | 'not_eaten' | 'skipped';
}) {
  const db = await getDb();
  if (!db) return;
  if (data.mealType === 'breakfast') {
    await db.update(menuPlans).set({ actualMealBreakfast: data.actualMeal, actualStatusBreakfast: data.actualStatus, updatedAt: new Date() }).where(eq(menuPlans.id, id));
  } else if (data.mealType === 'lunch') {
    await db.update(menuPlans).set({ actualMealLunch: data.actualMeal, actualStatusLunch: data.actualStatus, updatedAt: new Date() }).where(eq(menuPlans.id, id));
  } else {
    await db.update(menuPlans).set({ actualMealDinner: data.actualMeal, actualStatusDinner: data.actualStatus, updatedAt: new Date() }).where(eq(menuPlans.id, id));
  }
}

/**
 * 指定日範囲の履歴を取得（実食記録確認用）
 */
export async function getMenuPlansByDateRange(userId: number, fromDate: string, toDate: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(menuPlans)
    .where(and(
      eq(menuPlans.userId, userId),
      sql`${menuPlans.planDate} >= ${fromDate}`,
      sql`${menuPlans.planDate} <= ${toDate}`,
    ))
    .orderBy(menuPlans.planDate);
}

// ─── Subscription helpers ─────────────────────────────────────────────────────
/**
 * ユーザーがプレミアム（②課金無料期間中 or ③自動課金継続中）かどうかを返す
 *
 * ユーザータイプ定義（設計書準拠）:
 *   ① トライアル  : plan=free,    status=trial     → isPremium=false, isTrial=true
 *   ② 課金無料期間: plan=premium, status=trial     → isPremium=true,  isTrial=false
 *   ③ プレミアム  : plan=premium, status=active    → isPremium=true,  isTrial=false
 *   ④ 無課金解約済: plan=free,    status=cancelled → isPremium=false, isTrial=false
 */
export async function getUserIsPremium(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  if (!sub) return false;
  // ③ プレミアム（自動課金継続中）
  if (sub.status === "active") return true;
  // ② 課金無料期間中（plan=premium かつ status=trial）
  if (sub.plan === "premium" && sub.status === "trial") return true;
  // ④ 解約済みだが currentPeriodEnd（期日）を過ぎていない場合のみプレミアム扱い
  if (sub.status === "cancelled" && sub.currentPeriodEnd != null && new Date(sub.currentPeriodEnd) > new Date()) return true;
  return false;
}

// ─── Shopping List ────────────────────────────────────────────────────────────

export async function getShoppingList(userId: number, listDate: string) {
  const db = await getDb();
  if (!db) return [];
  // listDateはDatetime型で保存されているため、DATE()関数で日付部分のみ比較する
  return db.select().from(shoppingListItems).where(and(eq(shoppingListItems.userId, userId), sql`DATE(${shoppingListItems.listDate}) = ${listDate}`));
}

/**
 * プラン別保存期間内の買い物リスト日付一覧を取得
 * 無料: 直近3日, プレミアム: 直近1ヶ月
 */
export async function getShoppingListDates(userId: number, isPremium: boolean): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const days = isPremium ? 30 : 3;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cutoffStr = cutoff.toISOString().split("T")[0];
  const rows = await db
    .selectDistinct({ listDate: sql<string>`DATE(${shoppingListItems.listDate})` })
    .from(shoppingListItems)
    .where(and(eq(shoppingListItems.userId, userId), sql`DATE(${shoppingListItems.listDate}) >= ${cutoffStr}`))
    .orderBy(desc(shoppingListItems.listDate));
  return rows.map((r) => String(r.listDate));
}

export async function insertShoppingListItems(items: InsertShoppingListItem[]) {
  const db = await getDb();
  if (!db || items.length === 0) return;
  await db.insert(shoppingListItems).values(items);
}

export async function toggleShoppingItem(id: number, userId: number, isChecked: boolean) {
  const db = await getDb();
  if (!db) return;
  await db.update(shoppingListItems).set({ isChecked, updatedAt: new Date() }).where(and(eq(shoppingListItems.id, id), eq(shoppingListItems.userId, userId)));
}

export async function deleteShoppingItem(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(shoppingListItems).where(and(eq(shoppingListItems.id, id), eq(shoppingListItems.userId, userId)));
}

export async function bulkDeleteShoppingItems(ids: number[], userId: number) {
  const db = await getDb();
  if (!db || ids.length === 0) return;
  await db.delete(shoppingListItems).where(and(inArray(shoppingListItems.id, ids), eq(shoppingListItems.userId, userId)));
}

export async function bulkMoveShoppingToFridge(ids: number[], userId: number): Promise<number> {
  const db = await getDb();
  if (!db || ids.length === 0) return 0;
  const items = await db.select().from(shoppingListItems).where(and(inArray(shoppingListItems.id, ids), eq(shoppingListItems.userId, userId)));
  let moved = 0;
  for (const item of items) {
    await db.insert(fridgeItems).values({ userId, name: item.name, quantity: item.quantity ?? null });
    await db.delete(shoppingListItems).where(and(eq(shoppingListItems.id, item.id), eq(shoppingListItems.userId, userId)));
    moved++;
  }
  return moved;
}

export async function deleteCheckedShoppingItems(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.delete(shoppingListItems).where(and(eq(shoppingListItems.userId, userId), eq(shoppingListItems.isChecked, true)));
  return (result[0] as any)?.affectedRows ?? 0;
}

// ─── Delivery Logs ────────────────────────────────────────────────────────────

export async function insertDeliveryLog(data: InsertDeliveryLog) {
  const db = await getDb();
  if (!db) return;
  await db.insert(deliveryLogs).values(data);
}

export async function getDeliveryLogs(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(deliveryLogs).limit(limit);
}

/**
 * ① トライアルユーザーかどうか判定（plan=free かつ status=trial = カード未登録）
 * ① のみ true。② (plan=premium, status=trial) は false（プレミアム扱い）
 */
export async function getUserIsTrial(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return true; // DB接続不可の場合は安全側にトライアル扱い
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  if (!sub) return true; // サブスクリプションなし = トライアル
  // ② plan=premium かつ status=trial は「課金無料期間中」→ トライアルでない
  if (sub.plan === "premium" && sub.status === "trial") return false;
  // ③ active = 課金継続中 → トライアルでない
  if (sub.status === "active") return false;
  // ④ cancelled = 解約済み → トライアルでない
  if (sub.status === "cancelled") return false;
  // ① plan=free かつ status=trial = トライアル
  return true;
}

// ─── Shopping List ────────────────────────────────────────────────────────────────────────────────────
/** 直近Nターンの会話履歴を取得 */
export async function getConversationHistory(lineUserId: string, limit = 10) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(lineConversationHistory)
    .where(eq(lineConversationHistory.lineUserId, lineUserId))
    .orderBy(desc(lineConversationHistory.createdAt))
    .limit(limit);
  return rows.reverse(); // 古い順に並び替え
}

/** 会話履歴にメッセージを追加 */
export async function addConversationMessage(data: InsertLineConversationHistory) {
  const db = await getDb();
  if (!db) return;
  await db.insert(lineConversationHistory).values(data);
  // 古い履歴を削除（100件以上は削除）
  const all = await db
    .select({ id: lineConversationHistory.id })
    .from(lineConversationHistory)
    .where(eq(lineConversationHistory.lineUserId, data.lineUserId))
    .orderBy(desc(lineConversationHistory.createdAt));
  if (all.length > 100) {
    const toDelete = all.slice(100).map((r) => r.id);
    for (const id of toDelete) {
      await db.delete(lineConversationHistory).where(eq(lineConversationHistory.id, id));
    }
  }
}

/** 位置情報を更新 */
export async function updateLineUserLocation(
  lineUserId: string,
  latitude: number,
  longitude: number,
  region: string
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(lineUsers)
    .set({ latitude, longitude, region, updatedAt: new Date() })
    .where(eq(lineUsers.lineUserId, lineUserId));
}// ─── 会話状態管理（pendingAction） ───────────────────────────────────────────────

export async function setLineUserPendingAction(lineUserId: string, action: object | null) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(lineUsers)
    .set({ pendingAction: action, updatedAt: new Date() })
    .where(eq(lineUsers.lineUserId, lineUserId));
}export async function getLineUserPendingAction(lineUserId: string): Promise<any | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ pendingAction: lineUsers.pendingAction })
    .from(lineUsers)
    .where(eq(lineUsers.lineUserId, lineUserId))
    .limit(1);
  return rows[0]?.pendingAction ?? null;
}

// ─── 処理中フラグ管理 ───────────────────────────────────────────────────────────
/**
 * 処理開始時にisProcessing=trueをセット、完了時はfalseにリセット
 */
export async function setLineUserProcessing(lineUserId: string, processing: boolean): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(lineUsers)
    .set({
      isProcessing: processing,
      processingStartedAt: processing ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(lineUsers.lineUserId, lineUserId));
}

/**
 * 処理中フラグを確認する（60秒タイムアウトチェック含む）
 * @returns { isProcessing: boolean, isTimedOut: boolean }
 */
export async function checkLineUserProcessing(lineUserId: string): Promise<{ isProcessing: boolean; isTimedOut: boolean }> {
  const db = await getDb();
  if (!db) return { isProcessing: false, isTimedOut: false };
  const rows = await db
    .select({ isProcessing: lineUsers.isProcessing, processingStartedAt: lineUsers.processingStartedAt })
    .from(lineUsers)
    .where(eq(lineUsers.lineUserId, lineUserId))
    .limit(1);
  const row = rows[0];
  if (!row || !row.isProcessing) return { isProcessing: false, isTimedOut: false };
  const now = Date.now();
  const startedAt = row.processingStartedAt ? row.processingStartedAt.getTime() : 0;
  const isTimedOut = (now - startedAt) > 60 * 1000; // 60秒タイムアウト（AI処理は最大60秒かかる場合があるため）
  return { isProcessing: true, isTimedOut };
}

// ─── MenuPlan update helpers ────────────────────────────────────────────────
/**
 * 献立を削除する（外食・作らない日の献立削除用）
 */
export async function deleteMenuPlan(menuPlanId: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(menuPlans).where(and(eq(menuPlans.id, menuPlanId), eq(menuPlans.userId, userId)));
}

/**
 * 献立のプロテクト状態を更新する
 */
export async function updateMenuPlanProtect(menuPlanId: number, userId: number, isProtected: boolean) {
  const db = await getDb();
  if (!db) return;
  await db.update(menuPlans)
    .set({ isProtected, updatedAt: new Date() })
    .where(and(eq(menuPlans.id, menuPlanId), eq(menuPlans.userId, userId)));
}

/**
 * 複数の献立プランのプロテクト状態を一括更新する（1日に複数レコードある場合用）
 */
export async function updateMenuPlanProtectBulk(menuPlanIds: number[], userId: number, isProtected: boolean) {
  const db = await getDb();
  if (!db || menuPlanIds.length === 0) return;
  await db.update(menuPlans)
    .set({ isProtected, updatedAt: new Date() })
    .where(and(inArray(menuPlans.id, menuPlanIds), eq(menuPlans.userId, userId)));
}

/**
 * 指定日の献立を作成または更新する（週間生成用、プロテクト済みはスキップ）
 */
export async function upsertMenuPlanForDate(
  userId: number,
  planDate: string,
  menuData: object,
  messageText: string,
): Promise<{ skipped: boolean; id?: number }> {
  const db = await getDb();
  if (!db) return { skipped: false };
  const existing = await getMenuPlanByDate(userId, planDate);
  if (existing) {
    if (existing.isProtected) return { skipped: true, id: existing.id };
    await db.update(menuPlans)
      .set({ menuData: JSON.stringify(menuData), messageText, updatedAt: new Date() })
      .where(eq(menuPlans.id, existing.id));
    return { skipped: false, id: existing.id };
  } else {
    const result = await db.insert(menuPlans).values({
      userId,
      planDate: new Date(planDate + 'T00:00:00'),
      menuData: JSON.stringify(menuData),
      messageText,
      isDelivered: false,
      isProtected: false,
    });
    return { skipped: false, id: (result as any)[0]?.insertId };
  }
}

// ─── 買い物リスト → 冷蔵庫移行 ───────────────────────────────────────────────
/**
 * 買い物リストのアイテムを冷蔵庫に移行して、リストから削除する
 */
export async function moveShoppingItemToFridge(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db
    .select()
    .from(shoppingListItems)
    .where(and(eq(shoppingListItems.id, id), eq(shoppingListItems.userId, userId)))
    .limit(1);
  const item = rows[0];
  if (!item) return false;
  await db.insert(fridgeItems).values({
    userId,
    name: item.name,
    quantity: item.quantity ?? "1個",
    category: "other",
  });
  await db.delete(shoppingListItems).where(and(eq(shoppingListItems.id, id), eq(shoppingListItems.userId, userId)));
  return true;
}

/**
 * チェック済みの買い物リストアイテムを全て冷蔵庫に移行して削除する
 */
export async function moveCheckedShoppingItemsToFridge(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const items = await db
    .select()
    .from(shoppingListItems)
    .where(and(eq(shoppingListItems.userId, userId), eq(shoppingListItems.isChecked, true)));
  if (items.length === 0) return 0;
  await db.insert(fridgeItems).values(
    items.map((item) => ({
      userId,
      name: item.name,
      quantity: item.quantity ?? "1個",
      category: "other" as const,
    }))
  );
  await db.delete(shoppingListItems).where(and(eq(shoppingListItems.userId, userId), eq(shoppingListItems.isChecked, true)));
  return items.length;
}

// ─── 商品名正規化キャッシュ ────────────────────────────────────────────────────

export async function getProductNameCache(originalName: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(productNameCache).where(eq(productNameCache.originalName, originalName)).limit(1);
  return rows[0] ?? null;
}

export async function upsertProductNameCache(data: InsertProductNameCache) {
  const db = await getDb();
  if (!db) return;
  await db.insert(productNameCache).values(data).onDuplicateKeyUpdate({
    set: { normalizedName: data.normalizedName, category: data.category, resolvedBy: data.resolvedBy },
  });
}

// ─── ベーステーマ設定 ────────────────────────────────────────────────────────────

export async function getUserBaseTheme(userId: number): Promise<UserBaseTheme | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(userBaseThemes).where(eq(userBaseThemes.userId, userId)).limit(1);
  return rows[0] ?? null;
}

export async function upsertUserBaseTheme(data: InsertUserBaseTheme): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(userBaseThemes).values(data).onDuplicateKeyUpdate({
    set: {
      healthThemes: data.healthThemes ?? null,
      lifestageThemes: data.lifestageThemes ?? null,
      economyTheme: data.economyTheme ?? null,
      styleTheme: data.styleTheme ?? null,
      dishCountTheme: data.dishCountTheme ?? null,
      updatedAt: new Date(),
    },
  });
}

// ─── 配信メッセージ ────────────────────────────────────────────────────────────

export async function listBroadcastMessages(): Promise<BroadcastMessage[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(broadcastMessages).orderBy(broadcastMessages.createdAt);
  return rows;
}

export async function getBroadcastMessage(id: number): Promise<BroadcastMessage | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(broadcastMessages).where(eq(broadcastMessages.id, id));
  return rows[0] ?? null;
}

export async function insertBroadcastMessage(data: InsertBroadcastMessage): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(broadcastMessages).values(data);
  return (result as any)[0].insertId as number;
}

export async function updateBroadcastMessage(
  id: number,
  data: Partial<Pick<BroadcastMessage, "title" | "content" | "mediaType" | "mediaUrl" | "mediaThumbnailUrl">>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(broadcastMessages).set({ ...data, updatedAt: new Date() }).where(eq(broadcastMessages.id, id));
}

export async function deleteBroadcastMessage(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(broadcastMessages).where(eq(broadcastMessages.id, id));
}

export async function markBroadcastMessageSent(id: number, sentCount: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(broadcastMessages).set({
    status: "sent",
    sentAt: new Date(),
    sentCount,
    updatedAt: new Date(),
  }).where(eq(broadcastMessages.id, id));
}

// ─── Weekly Special Days ──────────────────────────────────────────────────────

export async function getWeeklySpecialDays(userId: number, startDate: string, endDate: string): Promise<WeeklySpecialDay[]> {
  const db = await getDb();
  if (!db) return [];
  const { gte, lte } = await import("drizzle-orm");
  return db.select().from(weeklySpecialDays)
    .where(and(
      eq(weeklySpecialDays.userId, userId),
      gte(weeklySpecialDays.date, startDate),
      lte(weeklySpecialDays.date, endDate)
    ));
}

export async function upsertWeeklySpecialDay(userId: number, date: string, type: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // 既存があれば更新、なければ挿入
  const existing = await db.select().from(weeklySpecialDays)
    .where(and(eq(weeklySpecialDays.userId, userId), eq(weeklySpecialDays.date, date))).limit(1);
  if (existing.length > 0) {
    await db.update(weeklySpecialDays).set({ type, updatedAt: new Date() })
      .where(and(eq(weeklySpecialDays.userId, userId), eq(weeklySpecialDays.date, date)));
  } else {
    await db.insert(weeklySpecialDays).values({ userId, date, type });
  }
}

export async function deleteWeeklySpecialDay(userId: number, date: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(weeklySpecialDays)
    .where(and(eq(weeklySpecialDays.userId, userId), eq(weeklySpecialDays.date, date)));
}
