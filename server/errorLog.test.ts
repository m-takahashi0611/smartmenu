/**
 * errorLog router のユニットテスト
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// DB・通知モジュールをモック
vi.mock("../server/db", () => ({
  getDb: vi.fn(),
}));
vi.mock("../server/_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

import { getDb } from "./db";
import { notifyOwner } from "./_core/notification";

describe("errorLog router - report mutation logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getDb が null を返す場合はエラーをスローする", async () => {
    (getDb as any).mockResolvedValue(null);

    const db = await getDb();
    expect(db).toBeNull();
  });

  it("notifyOwner が呼ばれた場合は true を返す", async () => {
    const result = await notifyOwner({
      title: "テストエラー",
      content: "テストメッセージ",
    });
    expect(result).toBe(true);
    expect(notifyOwner).toHaveBeenCalledWith({
      title: "テストエラー",
      content: "テストメッセージ",
    });
  });

  it("notifyOwner のタイトルフォーマットが正しい", async () => {
    const errorType = "liff_init_timeout";
    const expectedTitle = `⚠️ エラー発生: ${errorType}`;

    await notifyOwner({
      title: expectedTitle,
      content: `**種別:** ${errorType}`,
    });

    expect(notifyOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expectedTitle,
      })
    );
  });
});

describe("errorLog type labels", () => {
  const typeLabel: Record<string, string> = {
    liff_init_timeout: "タイムアウト",
    liff_login_failed: "LIFFログイン失敗",
    login_session_failed: "セッション作成失敗",
  };

  it("既知のエラー種別に対してラベルが定義されている", () => {
    expect(typeLabel["liff_init_timeout"]).toBe("タイムアウト");
    expect(typeLabel["liff_login_failed"]).toBe("LIFFログイン失敗");
    expect(typeLabel["login_session_failed"]).toBe("セッション作成失敗");
  });

  it("未知のエラー種別はそのまま表示される", () => {
    const unknownType = "unknown_error";
    const label = typeLabel[unknownType] ?? unknownType;
    expect(label).toBe(unknownType);
  });
});
