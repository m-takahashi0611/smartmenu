import { and, eq, desc } from "drizzle-orm";
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
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
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
  return db.select().from(lineUsers).where(eq(lineUsers.isActive, true));
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
  const result = await db.select().from(familyProfiles).where(eq(familyProfiles.userId, userId)).limit(1);
  return result[0];
}

export async function upsertFamilyProfile(data: InsertFamilyProfile) {
  const db = await getDb();
  if (!db) return;
  await db.insert(familyProfiles).values(data).onDuplicateKeyUpdate({
    set: { familyName: data.familyName, notes: data.notes, updatedAt: new Date() },
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

// ─── Shopping List ────────────────────────────────────────────────────────────

export async function getShoppingList(userId: number, listDate: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(shoppingListItems).where(and(eq(shoppingListItems.userId, userId), eq(shoppingListItems.listDate, listDate as any)));
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

// ─── LINE Conversation History ─────────────────────────────────────────────────────────────────────────────────

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
  // 古い履歴を削除（20件以上は削除）
  const all = await db
    .select({ id: lineConversationHistory.id })
    .from(lineConversationHistory)
    .where(eq(lineConversationHistory.lineUserId, data.lineUserId))
    .orderBy(desc(lineConversationHistory.createdAt));
  if (all.length > 20) {
    const toDelete = all.slice(20).map((r) => r.id);
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
}
