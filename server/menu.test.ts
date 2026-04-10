import { describe, it, expect, vi, beforeEach } from "vitest";

// DB関数をモック（getDbも含む）
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  getMenuPlanByDate: vi.fn(),
  createMenuPlan: vi.fn(),
  insertMenuPlan: vi.fn(),
  getFamilyProfile: vi.fn(),
  getFamilyMembers: vi.fn(),
  getFridgeItems: vi.fn(),
  getMainStore: vi.fn(),
  getStores: vi.fn(),
  getRecentMenuPlans: vi.fn(),
  createShoppingListItems: vi.fn(),
  insertShoppingListItems: vi.fn(),
  markMenuPlanDelivered: vi.fn(),
  insertDeliveryLog: vi.fn(),
  getLineUserByUserId: vi.fn(),
}));

// LLM呼び出しをモック
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

// LINE送信をモック
vi.mock("./routers/line", () => ({
  sendLineMessage: vi.fn(),
}));

import { getMenuPlanByDate, insertMenuPlan, getFamilyProfile, getFamilyMembers, getFridgeItems, getStores, getRecentMenuPlans, insertShoppingListItems } from "./db";
import { invokeLLM } from "./_core/llm";
import { generateMenuPlan } from "./routers/menu";

const mockGetMenuPlanByDate = vi.mocked(getMenuPlanByDate);
const mockInsertMenuPlan = vi.mocked(insertMenuPlan);
const mockGetFamilyProfile = vi.mocked(getFamilyProfile);
const mockGetFamilyMembers = vi.mocked(getFamilyMembers);
const mockGetFridgeItems = vi.mocked(getFridgeItems);
const mockGetStores = vi.mocked(getStores);
const mockGetRecentMenuPlans = vi.mocked(getRecentMenuPlans);
const mockInsertShoppingListItems = vi.mocked(insertShoppingListItems);
const mockInvokeLLM = vi.mocked(invokeLLM);

describe("generateMenuPlan", () => {
  const userId = 1;
  const today = "2025-03-28";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("既存の献立プランがある場合はそれを返す", async () => {
    const existingPlan = {
      id: 1,
      userId,
      planDate: today,
      menuData: JSON.stringify({ mealType: "dinner", breakfast: "納豆ご飯", lunch: "パスタ", dinner: "鶏の照り焼き" }),
      messageText: "今日の献立です",
      isDelivered: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      storeId: null,
      budgetYen: null,
      notes: null,
      deliveredAt: null,
    };
    mockGetMenuPlanByDate.mockResolvedValueOnce(existingPlan);
    mockGetFridgeItems.mockResolvedValueOnce([]);
    mockGetRecentMenuPlans.mockResolvedValueOnce([]);

    const result = await generateMenuPlan(userId, today);

    expect(result.menuPlanId).toBe(1);
    expect(result.message).toBe("今日の献立です");
    expect(mockInvokeLLM).not.toHaveBeenCalled();
  });

  it("献立プランがない場合はAIで生成する", async () => {
    mockGetMenuPlanByDate.mockResolvedValueOnce(null);
    mockGetFamilyProfile.mockResolvedValueOnce(null);
    mockGetFamilyMembers.mockResolvedValueOnce([]);
    mockGetFridgeItems.mockResolvedValueOnce([]);
    mockGetStores.mockResolvedValueOnce([]);
    mockGetRecentMenuPlans.mockResolvedValueOnce([]);

    const aiResponse = {
      options: [
        { name: "納豆ご飯", mainIngredients: ["納豆", "ご飯"], usedFridgeItems: ["納豆"] },
        { name: "野菜炒め", mainIngredients: ["キャベツ", "豚肉"], usedFridgeItems: ["キャベツ"] },
        { name: "鮭の塩焼き", mainIngredients: ["鮭"], usedFridgeItems: [] },
      ],
      shoppingList: ["鮭（2切れ）"],
    };

    mockInvokeLLM.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(aiResponse) } }],
    } as any);

    mockInsertMenuPlan.mockResolvedValueOnce(undefined);

    // insertMenuPlan後にgetMenuPlanByDateで保存済みプランを取得する
    mockGetMenuPlanByDate.mockResolvedValueOnce({
      id: 2,
      userId,
      planDate: today,
      menuData: JSON.stringify(aiResponse),
      messageText: null,
      isDelivered: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      storeId: null,
      budgetYen: null,
      notes: null,
      deliveredAt: null,
    });

    const result = await generateMenuPlan(userId, today);

    expect(result.menuPlanId).toBe(2);
    expect(mockInvokeLLM).toHaveBeenCalledOnce();
    expect(mockInsertMenuPlan).toHaveBeenCalledOnce();
    expect(result.message).toContain("納豆ご飯");
    expect(result.message).toContain("野菜炒め");
    expect(result.message).toContain("鮭の塩焼き");
    expect(result.message).toContain("今夜の夕食");
  });

  it("LLMがJSONを返せない場合はエラーをスローする", async () => {
    mockGetMenuPlanByDate.mockResolvedValueOnce(null);
    mockGetFamilyProfile.mockResolvedValueOnce(null);
    mockGetFamilyMembers.mockResolvedValueOnce([]);
    mockGetFridgeItems.mockResolvedValueOnce([]);
    mockGetStores.mockResolvedValueOnce([]);
    mockGetRecentMenuPlans.mockResolvedValueOnce([]);

    mockInvokeLLM.mockResolvedValueOnce({
      choices: [{ message: { content: "invalid json" } }],
    } as any);

    await expect(generateMenuPlan(userId, today)).rejects.toThrow();
  });
});
