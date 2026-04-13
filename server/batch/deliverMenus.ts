/**
 * 自動配信バッチ
 * 毎朝7時にcronで実行し、全アクティブLINEユーザーに献立を配信する
 * 実行: npx tsx server/batch/deliverMenus.ts
 */
import { getAllActiveLineUsers, insertDeliveryLog, markMenuPlanDelivered } from "../db";
import { generateMenuPlan } from "../routers/menu";
import { sendLineMessage } from "../routers/line";

export async function broadcastMenus(date?: string) {
  const today = date ?? new Date().toISOString().split("T")[0];
  const lineUsers = await getAllActiveLineUsers();

  const results = {
    total: lineUsers.length,
    success: 0,
    failed: 0,
    skipped: 0,
  };

  for (const lineUser of lineUsers) {
    if (!lineUser.userId) {
      results.skipped++;
      continue;
    }

    try {
      const { message, menuPlanId } = await generateMenuPlan(lineUser.userId, today);
      await sendLineMessage(lineUser.lineUserId, [{ type: "text", text: message }]);
      await insertDeliveryLog({
        userId: lineUser.userId,
        lineUserId: lineUser.lineUserId,
        menuPlanId: menuPlanId ?? null,
        status: "success",
        deliveredAt: new Date(),
      });
      if (menuPlanId) {
        await markMenuPlanDelivered(menuPlanId);
      }
      results.success++;
    } catch (err) {
      console.error(`[Batch] Failed to send menu to ${lineUser.lineUserId}:`, err);
      await insertDeliveryLog({
        userId: lineUser.userId,
        lineUserId: lineUser.lineUserId,
        menuPlanId: null,
        status: "failed",
        errorMessage: String(err),
        deliveredAt: new Date(),
      });
      results.failed++;
    }
  }

  return results;
}

/**
 * 選択したLINEユーザーに個別配信
 */
export async function broadcastToSelected(lineUserIds: string[], date?: string) {
  const today = date ?? new Date().toISOString().split("T")[0];
  const { getDb } = await import("../db");
  const { lineUsers } = await import("../../drizzle/schema");
  const { inArray } = await import("drizzle-orm");

  const db = await getDb();
  if (!db) return { total: 0, success: 0, failed: 0, skipped: 0 };

  const selectedUsers = await db
    .select()
    .from(lineUsers)
    .where(inArray(lineUsers.lineUserId, lineUserIds));

  const results = { total: selectedUsers.length, success: 0, failed: 0, skipped: 0 };

  for (const lineUser of selectedUsers) {
    if (!lineUser.userId || lineUser.isBlocked) {
      results.skipped++;
      continue;
    }
    try {
      const { message, menuPlanId } = await generateMenuPlan(lineUser.userId, today);
      await sendLineMessage(lineUser.lineUserId, [{ type: "text", text: message }]);
      await insertDeliveryLog({
        userId: lineUser.userId,
        lineUserId: lineUser.lineUserId,
        menuPlanId: menuPlanId ?? null,
        status: "success",
        deliveredAt: new Date(),
      });
      if (menuPlanId) await markMenuPlanDelivered(menuPlanId);
      results.success++;
    } catch (err) {
      console.error(`[Batch] Failed to send menu to ${lineUser.lineUserId}:`, err);
      await insertDeliveryLog({
        userId: lineUser.userId!,
        lineUserId: lineUser.lineUserId,
        menuPlanId: null,
        status: "failed",
        errorMessage: String(err),
        deliveredAt: new Date(),
      });
      results.failed++;
    }
  }
  return results;
}

// スタンドアロン実行用（直接呼び出しはしない。Adminページまたは手動実行時のみ使用）
// 実行方法: npx tsx server/batch/deliverMenus.ts
// async function main() {
//   console.log("[Batch] 献立自動配信バッチ開始:", new Date().toISOString());
//   try {
//     const result = await broadcastMenus();
//     console.log("[Batch] 配信完了:", result);
//   } catch (err) {
//     console.error("[Batch] 配信エラー:", err);
//     process.exit(1);
//   }
// }
// main();
