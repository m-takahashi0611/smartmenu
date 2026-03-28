import * as admin from "firebase-admin";
import { setGlobalOptions } from "firebase-functions/v2";

// Firebase Admin 初期化
admin.initializeApp();

// リージョンをアジア（東京）に設定
setGlobalOptions({ region: "asia-northeast1" });

// 各機能のエクスポート
export { lineWebhook } from "./line/webhook";
export { scheduledMenuDelivery } from "./line/scheduler";
export { generateMenu, getMenuHistory } from "./menu/generate";
