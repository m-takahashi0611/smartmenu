// ============================================================
// SmartMenu 共有型定義
// Cloud Functions / LIFF 両方で使用
// ============================================================

import { Timestamp } from "firebase/firestore";

// ─── ユーザー ────────────────────────────────────────────────
export interface UserDoc {
  uid: string;
  email?: string;
  displayName?: string;
  role: "user" | "admin";
  plan: "free" | "premium";
  lineUserId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── LINE ユーザー ───────────────────────────────────────────
export interface LineUserDoc {
  lineUserId: string;
  uid?: string; // Firebase UID（アプリログイン後に紐付け）
  displayName?: string;
  pictureUrl?: string;
  isActive: boolean;
  followedAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── 家族構成 ────────────────────────────────────────────────
export interface FamilyProfileDoc {
  uid: string;
  adults: number;
  children: number;
  budgetPerDay?: number;
  notes?: string;
  updatedAt: Timestamp;
}

export interface FamilyMemberDoc {
  name: string;
  age?: number;
  gender?: "male" | "female" | "other";
  allergies: string[];
  preferences: string[];
  dislikes: string[];
}

// ─── 冷蔵庫在庫 ─────────────────────────────────────────────
export interface FridgeItemDoc {
  uid: string;
  name: string;
  category: string;
  quantity?: string;
  expiryDate?: string; // YYYY-MM-DD
  addedAt: Timestamp;
}

// ─── マイ店舗 ────────────────────────────────────────────────
export interface StoreDoc {
  uid: string;
  name: string;
  isMain: boolean;
  saleInfo?: string;
  updatedAt: Timestamp;
}

// ─── 献立プラン ──────────────────────────────────────────────
export interface MenuPlanDoc {
  uid: string;
  planDate: string; // YYYY-MM-DD
  breakfast: string;
  lunch: string;
  dinner: string;
  dinnerRecipe?: string;
  shoppingList: string[];
  tips?: string;
  estimatedCost?: number;
  messageText: string;
  isDelivered: boolean;
  deliveredAt?: Timestamp;
  createdAt: Timestamp;
}

// ─── 買い物リスト ────────────────────────────────────────────
export interface ShoppingItemDoc {
  uid: string;
  menuPlanId?: string;
  listDate: string; // YYYY-MM-DD
  name: string;
  quantity?: string;
  isChecked: boolean;
  addedAt: Timestamp;
}

// ─── 配信ログ ────────────────────────────────────────────────
export interface DeliveryLogDoc {
  uid?: string;
  lineUserId: string;
  menuPlanId?: string;
  status: "success" | "failed" | "skipped";
  errorMessage?: string;
  deliveredAt: Timestamp;
}

// ─── レシート（Phase 7: OCR機能） ───────────────────────────
export interface ReceiptDoc {
  uid: string;
  imageUrl: string;
  storeName?: string;
  purchaseDate?: string;
  totalAmount?: number;
  items: ReceiptItem[];
  rawText?: string;
  createdAt: Timestamp;
}

export interface ReceiptItem {
  name: string;
  price?: number;
  quantity?: string;
  category?: string;
}

// ─── AI 献立生成レスポンス ───────────────────────────────────
export interface MenuGenerationResult {
  breakfast: string;
  lunch: string;
  dinner: string;
  dinnerRecipe: string;
  shoppingList: string[];
  tips: string;
  estimatedCost: number;
}
