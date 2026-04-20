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
  decimal,
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
  // 処理中フラグ（重複メッセージ防止）
  isProcessing: boolean("isProcessing").default(false).notNull(),
  processingStartedAt: timestamp("processingStartedAt"),
  // ブロックフラグ（管理者によるブロック）
  isBlocked: boolean("isBlocked").default(false).notNull(),
  blockedAt: timestamp("blockedAt"),
  // 流入元キャンペーンコード（YouTuber紹介 or 友達紹介）
  referralCode: varchar("referralCode", { length: 100 }), // LINE友だち追加時のref=パラメータ
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
  // 実食記録
  actualMealBreakfast: varchar("actualMealBreakfast", { length: 200 }), // 実際に食べた朝食料理名
  actualMealLunch: varchar("actualMealLunch", { length: 200 }), // 実際に食べた昼食料理名
  actualMealDinner: varchar("actualMealDinner", { length: 200 }), // 実際に食べた夕食料理名
  actualStatusBreakfast: mysqlEnum("actualStatusBreakfast", ["cooked", "other", "eating_out", "not_eaten", "skipped"]),
  actualStatusLunch: mysqlEnum("actualStatusLunch", ["cooked", "other", "eating_out", "not_eaten", "skipped"]),
  actualStatusDinner: mysqlEnum("actualStatusDinner", ["cooked", "other", "eating_out", "not_eaten", "skipped"]),
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

/**
 * 商品名正規化キャッシュテーブル
 * レシートの正式商品名→一般的な食材名へのマッピングをキャッシュ
 * 例: 「北海道根釧牛乳」→「牛乳」、「コカ・コーラ70」→「コーラ」
 */
export const productNameCache = mysqlTable("product_name_cache", {
  id: int("id").autoincrement().primaryKey(),
  originalName: varchar("originalName", { length: 255 }).notNull().unique(), // レシートの正式商品名
  normalizedName: varchar("normalizedName", { length: 100 }).notNull(),       // 正規化後の一般食材名
  category: varchar("category", { length: 50 }),                              // カテゴリ（乳製品・飲料・肉類など）
  resolvedBy: mysqlEnum("resolvedBy", ["rule", "llm"]).default("llm").notNull(), // 判定方法
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ProductNameCache = typeof productNameCache.$inferSelect;
export type InsertProductNameCache = typeof productNameCache.$inferInsert;

/**
 * 献立テーマ履歴テーブル
 * ユーザーが「やり直し」→テーマ指定した際の履歴を保存
 * 好みパターンの学習に活用
 */
export const menuThemes = mysqlTable("menu_themes", {
  id: int("id").autoincrement().primaryKey(),
  lineUserId: varchar("lineUserId", { length: 64 }).notNull(),
  rawInput: text("rawInput").notNull(),           // ユーザーの生入力（例：「和食でさっぱりしたい」）
  mainDish: varchar("mainDish", { length: 50 }),  // 主食: rice/noodle/bread/other
  noodleType: varchar("noodleType", { length: 50 }), // 麺種: ramen/udon/soba/somen/pasta/yakisoba
  cuisine: varchar("cuisine", { length: 50 }),    // ジャンル: japanese/western/chinese/korean/ethnic
  flavor: varchar("flavor", { length: 100 }),     // 味付け: soy/miso/salt/sauce/tomato/cream/curry/spicy/sweet/sour
  texture: varchar("texture", { length: 50 }),    // 体感: light/hearty/warm/refreshing
  cookingMethod: varchar("cookingMethod", { length: 50 }), // 調理法: boil/grill/fry/stir/steam/raw
  scene: varchar("scene", { length: 50 }),        // シーン: quick/easy/meal_prep/kids/adult/party
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type MenuTheme = typeof menuThemes.$inferSelect;
export type InsertMenuTheme = typeof menuThemes.$inferInsert;

/**
 * ユーザー好みパターンテーブル
 * 家族の好み嫌い・アレルギー・食材制限を保存
 * 献立生成プロンプトに反映して精度向上
 */
export const userPreferences = mysqlTable("user_preferences", {
  id: int("id").autoincrement().primaryKey(),
  lineUserId: varchar("lineUserId", { length: 64 }).notNull(),
  memberName: varchar("memberName", { length: 50 }),  // 対象家族メンバー名（null=全員）
  preferenceType: mysqlEnum("preferenceType", [
    "dislike",    // 嫌い
    "allergy",    // アレルギー
    "favorite",   // 好き
    "restriction" // 制限（宗教・健康上の理由など）
  ]).notNull(),
  ingredient: varchar("ingredient", { length: 100 }).notNull(), // 食材名
  note: text("note"),           // 補足（例：「最近嫌いになった」「重度のアレルギー」）
  active: boolean("active").default(true).notNull(), // 有効フラグ（解除時はfalse）
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type UserPreference = typeof userPreferences.$inferSelect;
export type InsertUserPreference = typeof userPreferences.$inferInsert;

// システム設定（リッチメニューIDなどの永続化）
export const systemSettings = mysqlTable("system_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SystemSetting = typeof systemSettings.$inferSelect;

/**
 * サブスクリプション（課金）テーブル
 * ユーザーのプラン・トライアル状態を管理
 */
export const subscriptions = mysqlTable("subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  plan: mysqlEnum("plan", ["free", "premium"]).default("free").notNull(),
  status: mysqlEnum("status", ["trial", "active", "cancelled", "expired"]).default("trial").notNull(),
  trialStartedAt: timestamp("trialStartedAt").defaultNow().notNull(),
  trialDays: int("trialDays").default(45).notNull(), // 通常45日、キャンペーンで60日
  campaignCode: varchar("campaignCode", { length: 50 }), // 適用済みキャンペーンコード
  stripeCustomerId: varchar("stripeCustomerId", { length: 100 }),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 100 }),
  currentPeriodEnd: timestamp("currentPeriodEnd"), // 次回請求日
  cancelledAt: timestamp("cancelledAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;

/**
 * お弁当モード設定テーブル
 * ユーザーごとのお弁当モード設定を保存
 */
export const bentoSettings = mysqlTable("bento_settings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  enabled: boolean("enabled").default(false).notNull(),
  dayMode: mysqlEnum("dayMode", ["everyday", "weekday", "custom"]).default("weekday").notNull(),
  customDays: text("customDays"), // JSON配列 e.g. '["mon","tue"]'
  prepEvening: boolean("prepEvening").default(true).notNull(),
  selectedMembers: text("selectedMembers"), // JSON配列 e.g. '[1,2]'
  boxSizes: text("boxSizes"), // JSON object e.g. '{"1":"medium"}'
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type BentoSetting = typeof bentoSettings.$inferSelect;
export type InsertBentoSetting = typeof bentoSettings.$inferInsert;

/**
 * ベーステーマ設定テーブル
 * ユーザーが設定した日常の献立方針（課金ユーザー限定）
 * カテゴリ内は排他選択、カテゴリをまたいだ複数選択は可能
 * 例: healthTheme="diet" + styleTheme="quick" = ダイエット＋時短
 */
export const userBaseThemes = mysqlTable("user_base_themes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  // 健康・体型管理：複数選択可（カンマ区切り）diet/muscle/low_salt/low_sugar/gut
  healthThemes: varchar("healthThemes", { length: 255 }),
  // ライフステージ：複数選択可（カンマ区切り）baby_food/toddler/teen/exam/senior
  lifestageThemes: varchar("lifestageThemes", { length: 255 }),
  // 経済・節約：1択 budget/month_end/batch_cook
  economyTheme: varchar("economyTheme", { length: 50 }),
  // 調理スタイル：1択 quick/elaborate/entertaining/special（お弁当対応は削除）
  styleTheme: varchar("styleTheme", { length: 50 }),
  // 食卓イメージ（品数）：1択 ichiju_issai/ichiju_nisai/ichiju_sansai/ichiju_yonsai
  dishCountTheme: varchar("dishCountTheme", { length: 50 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type UserBaseTheme = typeof userBaseThemes.$inferSelect;
export type InsertUserBaseTheme = typeof userBaseThemes.$inferInsert;

/**
 * 配信メッセージテーブル
 * 管理者が作成した配信用メッセージを保存
 */
export const broadcastMessages = mysqlTable("broadcast_messages", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  content: text("content").notNull(),
  status: mysqlEnum("status", ["draft", "sent"]).default("draft").notNull(),
  sentAt: timestamp("sentAt"),
  sentCount: int("sentCount").default(0).notNull(),
  createdBy: int("createdBy").notNull(), // admin userId
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type BroadcastMessage = typeof broadcastMessages.$inferSelect;
export type InsertBroadcastMessage = typeof broadcastMessages.$inferInsert;

/**
 * エラーログテーブル
 * フロントエンドで発生したログインエラー等を記録
 * ダッシュボードで確認・オーナー通知に使用
 */
export const errorLogs = mysqlTable("error_logs", {
  id: int("id").autoincrement().primaryKey(),
  type: varchar("type", { length: 100 }).notNull(), // 例: "liff_init_timeout", "login_failed", "oauth_error"
  message: text("message").notNull(), // エラーメッセージ
  userAgent: text("userAgent"), // UA文字列
  userId: int("userId"), // ログイン済みの場合のuserId（任意）
  lineUserId: varchar("lineUserId", { length: 64 }), // LINEユーザーID（任意）
  extra: json("extra"), // 追加情報（任意）
  notifiedOwner: boolean("notifiedOwner").default(false).notNull(), // オーナー通知済みフラグ
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ErrorLog = typeof errorLogs.$inferSelect;
export type InsertErrorLog = typeof errorLogs.$inferInsert;

/**
 * キャンペーンコードテーブル（YouTuber専用・管理者発行）
 * 初回決済時に割引を適用するコード
 */
export const campaignCodes = mysqlTable("campaign_codes", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 100 }).notNull().unique(), // 例: tanaka_youtube
  label: varchar("label", { length: 200 }), // 管理用ラベル（例: 田中チャンネル）
  discountPercent: decimal("discountPercent", { precision: 5, scale: 2 }).notNull(), // 割引率（例: 30.00 = 30%OFF）
  feePercent: decimal("feePercent", { precision: 5, scale: 2 }).default("0").notNull(), // 紹介者へのフィー率（例: 10.00 = 10%）
  isActive: boolean("isActive").default(true).notNull(),
  usageCount: int("usageCount").default(0).notNull(), // 使用回数
  expiresAt: timestamp("expiresAt"), // 有効期限（NULLなら無期限）
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CampaignCode = typeof campaignCodes.$inferSelect;
export type InsertCampaignCode = typeof campaignCodes.$inferInsert;

/**
 * 友達紹介コードテーブル（ユーザー自動発行）
 * 既存ユーザーが友達を紹介するためのコード
 */
export const referralCodes = mysqlTable("referral_codes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(), // 紹介者のuserId
  code: varchar("code", { length: 20 }).notNull().unique(), // 例: USR_abc123
  usageCount: int("usageCount").default(0).notNull(), // 使用回数
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ReferralCode = typeof referralCodes.$inferSelect;
export type InsertReferralCode = typeof referralCodes.$inferInsert;

/**
 * 紹介コード使用履歴テーブル
 * 誰が誰の紹介コードを使って登録したかを記録
 */
export const referralUsages = mysqlTable("referral_usages", {
  id: int("id").autoincrement().primaryKey(),
  referralCodeId: int("referralCodeId").notNull(), // referral_codes.id
  referrerId: int("referrerId").notNull(), // 紹介者のuserId
  referredUserId: int("referredUserId").notNull().unique(), // 紹介された側のuserId
  bonusGranted: boolean("bonusGranted").default(false).notNull(), // 特典付与済みフラグ
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ReferralUsage = typeof referralUsages.$inferSelect;
export type InsertReferralUsage = typeof referralUsages.$inferInsert;
