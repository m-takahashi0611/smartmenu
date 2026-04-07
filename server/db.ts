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
  productNameCache,
  type InsertProductNameCache,
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

// リッチメニュー切り替えが必要なpendingActionの型一覧
// これらのpendingActionがセットされたときに数字メニューに切り替わる
const NUMBER_MENU_PENDING_TYPES = new Set([
  'menu_type_selection',       // 長事タイプ選択（朝食・昼食・夕食）
  'menu_option_selection',     // 献立候補選択（1・2・3番）
  'menu_option_confirm',       // 献立選択後の確認（1:はい 2:レシピ 3:キャンセル）
  'voice_ingredient_action',   // 音声入力後の3择（冷蔵庫・買い物・献立）
  'used_ingredient_action',    // 使った食材の確認
  'bought_item_action',        // 買った商品の確認
  'shopping_hearing',          // 買い物ヒアリング（行く・行かない）
]);

export async function setLineUserPendingAction(lineUserId: string, action: object | null) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(lineUsers)
    .set({ pendingAction: action, updatedAt: new Date() })
    .where(eq(lineUsers.lineUserId, lineUserId));

  // リッチメニュー切り替え（非同期で実行，エラーは無視）
  // switchToNumberMenu内でDBからIDを読み込むため、キャッシュチェックは不要
  try {
    const { switchToNumberMenu, switchToNormalMenu } = await import('./routers/richMenu');
    if (action !== null && typeof action === 'object' && 'type' in action) {
      const actionType = (action as any).type as string;
      if (NUMBER_MENU_PENDING_TYPES.has(actionType)) {
        switchToNumberMenu(lineUserId).catch((e) => {
          console.warn('[RichMenu] switchToNumberMenu失敗:', e?.message);
        });
      }
    } else if (action === null) {
      switchToNormalMenu(lineUserId).catch((e) => {
        console.warn('[RichMenu] switchToNormalMenu失敗:', e?.message);
      });
    }
  } catch (e) {
    console.warn('[RichMenu] richMenuモジュール読み込み失敗:', (e as any)?.message);
  }
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
