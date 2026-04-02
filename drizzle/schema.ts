import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
  date,
  json,
  double,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  adminPasswordHash: varchar("adminPasswordHash", { length: 255 }),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * LINE ユーザー連携テーブル
 * LINEのユーザーIDとアプリのユーザーIDを紐付ける
 */
export const lineUsers = mysqlTable("line_users", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"), // NULL = LIFFログイン未完了（LINEフォローのみ）
  lineUserId: varchar("lineUserId", { length: 64 }).notNull().unique(),
  displayName: text("displayName"),
  pictureUrl: text("pictureUrl"),
  deliveryHour: int("deliveryHour").default(7).notNull(), // 配信時間（時）
  deliveryMinute: int("deliveryMinute").default(0).notNull(), // 配信時間（分）
  isActive: boolean("isActive").default(true).notNull(),
  // 位置情報（LINEの位置情報メッセージから取得）
  latitude: double("latitude"),
  longitude: double("longitude"),
  region: varchar("region", { length: 100 }), // 地域名（例: 東京都渋谷区）
  // 会話状態管理（多ターン会話フロー用）
  pendingAction: json("pendingAction"), // { type: 'fridge_add_qty', itemName: '玉ねぎ', existingQty: 3 } など
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LineUser = typeof lineUsers.$inferSelect;
export type InsertLineUser = typeof lineUsers.$inferInsert;

/**
 * 家族構成テーブル
 * ユーザーごとの家族全体の設定
 */
export const familyProfiles = mysqlTable("family_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  familyName: varchar("familyName", { length: 100 }),
  notes: text("notes"), // 備考・特記事項
  shoppingFrequency: int("shoppingFrequency").default(2), // 週の買い物回数（回/週）
  shoppingDays: json("shoppingDays").$type<string[]>(), // 買い物に行く曜日リスト（["mon","wed"] / ["everyday"] / ["irregular"]）
  cookingFrequency: int("cookingFrequency").default(5), // 週の自炊回数（回/週）—御庁用合計
  breakfastCookCount: int("breakfastCookCount").default(0), // 週の朝食自炊回数
  lunchCookCount: int("lunchCookCount").default(0), // 週の昼食自炊回数
  dinnerCookCount: int("dinnerCookCount").default(5), // 週の夕食自炊回数
  breakfastAttendees: json("breakfastAttendees").$type<string[]>(), // 朝食に食べる家族メンバー名リスト
  lunchAttendees: json("lunchAttendees").$type<string[]>(), // 昼食に食べる家族メンバー名リスト
  dinnerAttendees: json("dinnerAttendees").$type<string[]>(), // 夕食に食べる家族メンバー名リスト
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FamilyProfile = typeof familyProfiles.$inferSelect;
export type InsertFamilyProfile = typeof familyProfiles.$inferInsert;

/**
 * 家族メンバーテーブル
 * 家族の各メンバーの情報
 */
export const familyMembers = mysqlTable("family_members", {
  id: int("id").autoincrement().primaryKey(),
  familyProfileId: int("familyProfileId").notNull(),
  name: varchar("name", { length: 50 }).notNull(),
  ageGroup: mysqlEnum("ageGroup", ["baby", "child", "teen", "adult", "senior"]).notNull(),
  gender: mysqlEnum("gender", ["male", "female", "other"]).default("other"),
  allergies: text("allergies"), // カンマ区切りのアレルギー情報
  preferences: text("preferences"), // 好き嫌い・嗜好
  portionSize: mysqlEnum("portionSize", ["small", "normal", "large"]).default("normal"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FamilyMember = typeof familyMembers.$inferSelect;
export type InsertFamilyMember = typeof familyMembers.$inferInsert;

/**
 * 冷蔵庫在庫テーブル
 */
export const fridgeItems = mysqlTable("fridge_items", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  quantity: varchar("quantity", { length: 50 }), // 例: "2個", "300g"
  expiryDate: date("expiryDate"),
  category: mysqlEnum("category", [
    "vegetable",
    "meat",
    "fish",
    "dairy",
    "egg",
    "seasoning",
    "frozen",
    "other",
  ]).default("other"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FridgeItem = typeof fridgeItems.$inferSelect;
export type InsertFridgeItem = typeof fridgeItems.$inferInsert;

/**
 * マイ店舗テーブル
 */
export const stores = mysqlTable("stores", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  area: varchar("area", { length: 100 }), // 地域・エリア
  saleInfo: text("saleInfo"), // 手動入力の特売情報
  isMain: boolean("isMain").default(false).notNull(), // メインのスーパー
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Store = typeof stores.$inferSelect;
export type InsertStore = typeof stores.$inferInsert;

/**
 * 献立プランテーブル
 */
export const menuPlans = mysqlTable("menu_plans", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  planDate: date("planDate").notNull(),
  breakfast: text("breakfast"), // 朝食
  lunch: text("lunch"), // 昼食
  dinner: text("dinner"), // 夕食
  snack: text("snack"), // おやつ
  menuData: text("menuData"), // AI生成の完全なJSONデータ
  messageText: text("messageText"), // LINEに送信するメッセージテキスト
  generatedPrompt: text("generatedPrompt"), // 生成に使ったプロンプト（デバッグ用）
  rawResponse: text("rawResponse"), // AIの生成結果（JSON文字列）
  isDelivered: boolean("isDelivered").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MenuPlan = typeof menuPlans.$inferSelect;
export type InsertMenuPlan = typeof menuPlans.$inferInsert;

/**
 * 買い物リストテーブル
 */
export const shoppingListItems = mysqlTable("shopping_list_items", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  menuPlanId: int("menuPlanId"), // 紐付く献立プラン（任意）
  name: varchar("name", { length: 100 }).notNull(),
  quantity: varchar("quantity", { length: 50 }),
  category: varchar("category", { length: 50 }),
  isChecked: boolean("isChecked").default(false).notNull(),
  listDate: date("listDate").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ShoppingListItem = typeof shoppingListItems.$inferSelect;
export type InsertShoppingListItem = typeof shoppingListItems.$inferInsert;

/**
 * 配信ログテーブル
 */
export const deliveryLogs = mysqlTable("delivery_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  lineUserId: varchar("lineUserId", { length: 64 }),
  menuPlanId: int("menuPlanId"),
  status: mysqlEnum("status", ["success", "failed", "skipped"]).notNull(),
  message: text("message"), // 送信したメッセージ内容
  errorMessage: text("errorMessage"),
  deliveredAt: timestamp("deliveredAt").defaultNow().notNull(),
});

export type DeliveryLog = typeof deliveryLogs.$inferSelect;
export type InsertDeliveryLog = typeof deliveryLogs.$inferInsert;

/**
 * LINE会話履歴テーブル
 * AIが文脈を維持するために直近の会話を保存
 */
export const lineConversationHistory = mysqlTable("line_conversation_history", {
  id: int("id").autoincrement().primaryKey(),
  lineUserId: varchar("lineUserId", { length: 64 }).notNull(),
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LineConversationHistory = typeof lineConversationHistory.$inferSelect;
export type InsertLineConversationHistory = typeof lineConversationHistory.$inferInsert;
