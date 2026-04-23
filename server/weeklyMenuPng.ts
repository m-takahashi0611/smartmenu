/**
 * 週間献立PNG生成ヘルパー (v8デザイン)
 * - 4列グリッドレイアウト（月〜木 / 金〜日＋キャッチコピー）
 * - 曜日エリアの色は固定：月〜金=クリーム、土=青系、日=赤系
 * - 特別な日でも曜日エリアの色は変えない
 * - メニュー欄（下部）のみ特別な日に色付け
 * - AI生成アイコン（ケーキ・ハート炎・王冠）をメニュー欄上部中央に表示
 */
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import path from "path";
import { fileURLToPath } from "url";
import { storagePut } from "./storage";
import { getMenuPlansByDateRange } from "./db";

const _dir = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(_dir, "assets", "fonts");
const ICON_DIR = path.join(_dir, "assets", "icons");

// フォント登録（Rounded優先、NotoSansJPフォールバック）
try {
  GlobalFonts.registerFromPath(path.join(FONT_DIR, "MPLUSRounded1c-Regular.ttf"), "Rounded");
  GlobalFonts.registerFromPath(path.join(FONT_DIR, "MPLUSRounded1c-Bold.ttf"), "Rounded");
} catch (_e) {}
try {
  GlobalFonts.registerFromPath(path.join(FONT_DIR, "NotoSansJP-Regular.woff2"), "NotoSansJP");
  GlobalFonts.registerFromPath(path.join(FONT_DIR, "NotoSansJP-Bold.woff2"), "NotoSansJP");
  console.log("[weeklyMenuPng] NotoSansJP font registered from:", FONT_DIR);
} catch (e) {
  console.warn("[weeklyMenuPng] Font registration failed:", e);
}

const FONT = "Rounded, NotoSansJP, sans-serif";

const MASCOT_COOKING_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/chara_cooking-2kPVJfknvoFLpXHRLPVvVs.png";
const MASCOT_WAVE_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/chara_wave-SJFFFGGiajefS9Vh7cqFQF.png";

const DAYS_JA = ["日", "月", "火", "水", "木", "金", "土"];

const SPECIAL_LABELS: Record<string, string> = {
  special: "特別な日",
  cheat: "チートデイ",
  reward: "ご褒美デー",
};

// カラーパレット
const C = {
  bg: "#FDF8F3",
  bgDot: "#EDD9C8",
  hdrFrom: "#D4785A",
  hdrTo: "#E8956E",
  hdrText: "#FFFFFF",
  cardBg: "#FFFFFF",
  cardBorder: "#EDD9C8",
  dowWeekdayBg: "#F5EDE4",
  dowWeekdayText: "#C4714A",
  dowSatBg: "#E0EEF5",
  dowSatText: "#4A8FA0",
  dowSunBg: "#F5E0E0",
  dowSunText: "#B85C5C",
  dateText: "#A09080",
  dishText: "#3D2B1F",
  dishLight: "#B0A090",
  numBg: "#F5EDE4",
  numText: "#C4714A",
  divider: "#EDD9C8",
  specialCardBg: "#FFF0F5",
  specialCardBorder: "#F4A0C0",
  specialText: "#C05080",
  specialLabel: "#D06090",
  cheatCardBg: "#FFFBE8",
  cheatCardBorder: "#E8B800",
  cheatText: "#A07800",
  cheatLabel: "#B08000",
  rewardCardBg: "#F5F0FF",
  rewardCardBorder: "#9B7FD4",
  rewardText: "#6A4BAA",
  rewardLabel: "#7A5BBB",
};

// ─── ユーティリティ ───────────────────────────────────────────────────────────

function roundRect(ctx: any, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function roundRectBottom(ctx: any, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y);
  ctx.closePath();
}

function wrapText(ctx: any, text: string, maxWidth: number): string[] {
  if (!text) return [];
  const lines: string[] = [];
  let cur = "";
  for (const ch of text) {
    const t = cur + ch;
    if (ctx.measureText(t).width > maxWidth && cur.length > 0) { lines.push(cur); cur = ch; }
    else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawFlower(ctx: any, cx: number, cy: number, r: number, pc: string, cc: string) {
  ctx.fillStyle = pc;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = cc;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.4, 0, Math.PI * 2);
  ctx.fill();
}

/** menuDataから夜の主菜を取得（dinnerOptions対応） */
function extractDinner(menuData: any): { dinner: string; dinnerOptions: string[] | null } {
  if (!menuData) return { dinner: "", dinnerOptions: null };
  if (menuData.dinnerOptions && menuData.dinnerOptions.length > 1) {
    return {
      dinner: "",
      dinnerOptions: menuData.dinnerOptions.map((o: any) => o.name || o.mainDish || String(o)),
    };
  }
  if (menuData.selectedDinnerIndex != null && menuData.dinnerOptions?.length > 0) {
    const idx = Number(menuData.selectedDinnerIndex);
    return { dinner: menuData.dinnerOptions[idx]?.name || menuData.dinnerOptions[0]?.name || "", dinnerOptions: null };
  }
  if (menuData.dinner) return { dinner: menuData.dinner, dinnerOptions: null };
  if (menuData.dinnerOptions?.length > 0) return { dinner: menuData.dinnerOptions[0]?.name || "", dinnerOptions: null };
  return { dinner: "", dinnerOptions: null };
}

function extractMainDishFromStr(str: string): string {
  if (!str) return "";
  const mainMatch = str.match(/主菜[：:](.*?)(?:[、,](?:副菜|汁物|サラダ)|$)/);
  if (mainMatch) return mainMatch[1].trim();
  if (str.startsWith("主菜：") || str.startsWith("主菜:")) {
    return str.replace(/^主菜[：:]/, "").split(/[、・,]/)[0].trim();
  }
  return str.split(/[、・,]/)[0].trim();
}

// ─── メイン生成関数 ────────────────────────────────────────────────────────────

export async function generateWeeklyMenuPng(userId: number): Promise<string> {
  // 今週月〜日の日付範囲を計算（JST）
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  const jstNow = new Date(now.getTime() + jstOffset);
  const dayOfWeek = jstNow.getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(jstNow);
  monday.setUTCDate(jstNow.getUTCDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const startDate = monday.toISOString().split("T")[0];
  const endDate = sunday.toISOString().split("T")[0];

  // DBから献立データを取得
  const plans = await getMenuPlansByDateRange(userId, startDate, endDate);
  const byDate = new Map<string, any>();
  for (const p of plans) {
    const dateStr = p.planDate instanceof Date
      ? p.planDate.toISOString().split("T")[0]
      : String(p.planDate);
    const md = (() => {
      try { return typeof p.menuData === "string" ? JSON.parse(p.menuData) : p.menuData; }
      catch { return null; }
    })();
    if (!md) continue;
    const mealType: string = md?.mealType ?? "";
    if (!byDate.has(dateStr)) byDate.set(dateStr, {});
    const entry = byDate.get(dateStr)!;
    if (mealType === "dinner") {
      entry.selectedDinnerIndex = md?.selectedDinnerIndex != null ? Number(md.selectedDinnerIndex) : null;
      if (md?.dinnerOptions && md.dinnerOptions.length > 0) {
        entry.dinnerOptions = md.dinnerOptions.map((o: any) => ({ name: o.name || o.mainDish || String(o) }));
        entry.dinner = "";
      } else {
        entry.dinner = md?.dinner || md?.mainDish || "";
        entry.dinnerOptions = [];
      }
      // 特別な日フラグ
      if (md?.specialDay) entry.specialDay = md.specialDay;
    } else if (mealType !== "breakfast" && mealType !== "lunch") {
      // 旧形式
      if (md?.dinnerOptions && md.dinnerOptions.length > 0) {
        entry.dinnerOptions = md.dinnerOptions.map((o: any) => ({ name: o.name || o.mainDish || String(o) }));
        entry.dinner = "";
      } else if (md?.dinner) {
        entry.dinner = extractMainDishFromStr(md.dinner);
        entry.dinnerOptions = [];
      }
      if (md?.specialDay) entry.specialDay = md.specialDay;
    }
  }

  // 月〜日の7日分の配列を作成
  const dayLabelsArr = ["月", "火", "水", "木", "金", "土", "日"];
  const days: Array<{
    date: string; dow: string; mmdd: string;
    dinner: string; dinnerOptions: string[] | null;
    special: string | null;
  }> = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    const mmdd = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
    const md = byDate.get(dateStr) || null;
    const { dinner, dinnerOptions } = extractDinner(md);
    const special = md?.specialDay || null;
    days.push({ date: dateStr, dow: dayLabelsArr[i], mmdd, dinner, dinnerOptions, special });
  }

  // 画像ロード
  let imgCooking: any = null, imgWave: any = null;
  let iconSpecial: any = null, iconCheat: any = null, iconReward: any = null;
  try { imgCooking = await loadImage(MASCOT_COOKING_URL); } catch (_e) {}
  try { imgWave = await loadImage(MASCOT_WAVE_URL); } catch (_e) {}
  try { iconSpecial = await loadImage(path.join(ICON_DIR, "icon_special_64.png")); } catch (_e) {}
  try { iconCheat = await loadImage(path.join(ICON_DIR, "icon_cheat_64.png")); } catch (_e) {}
  try { iconReward = await loadImage(path.join(ICON_DIR, "icon_reward_64.png")); } catch (_e) {}

  // ─── レイアウト定数 ──────────────────────────────────────────────────────────
  const WIDTH = 960;
  const PAD = 14;
  const HEADER_H = 120;
  const CARD_GAP = 10;
  const CARD_R = 16;
  const COLS = 4;
  const ROWS = 2;
  const CARD_W = Math.floor((WIDTH - PAD * 2 - CARD_GAP * (COLS - 1)) / COLS);
  const DOW_HEADER_H = 70;
  const CONTENT_PAD = 12;
  const LINE_H = 20;
  const DISH_MAX_W = CARD_W - CONTENT_PAD * 2;
  const SPECIAL_BADGE_H = 32;
  const LEGEND_H = 72;

  // カード高さを計算
  const tempC = createCanvas(CARD_W, 100);
  const tempCtx = tempC.getContext("2d");
  tempCtx.font = `12px ${FONT}`;

  const cardHeights = days.map(day => {
    let lines = 0;
    if (day.dinnerOptions?.length) {
      for (const o of day.dinnerOptions) lines += Math.max(1, wrapText(tempCtx, o, DISH_MAX_W - 20).length);
      lines += (day.dinnerOptions.length - 1) * 0.3;
    } else if (day.dinner) {
      lines = Math.max(1, wrapText(tempCtx, day.dinner, DISH_MAX_W).length);
    } else {
      lines = 1;
    }
    const badgeH = day.special ? SPECIAL_BADGE_H : 0;
    return DOW_HEADER_H + CONTENT_PAD * 2 + Math.ceil(lines) * LINE_H + badgeH + 16;
  });
  const MAX_CARD_H = Math.max(...cardHeights, 150);

  const GRID_H = ROWS * MAX_CARD_H + (ROWS - 1) * CARD_GAP;
  const HEIGHT = HEADER_H + PAD + GRID_H + PAD + LEGEND_H;

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  // ─── 背景 ──────────────────────────────────────────────────────────────────
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  for (let dx = 20; dx < WIDTH; dx += 30) {
    for (let dy = HEADER_H + 4; dy < HEIGHT - LEGEND_H; dy += 30) {
      ctx.fillStyle = C.bgDot;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(dx, dy, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // ─── ヘッダー ────────────────────────────────────────────────────────────────
  const hGrad = ctx.createLinearGradient(0, 0, WIDTH, 0);
  hGrad.addColorStop(0, C.hdrFrom);
  hGrad.addColorStop(1, C.hdrTo);
  ctx.fillStyle = hGrad;
  ctx.fillRect(0, 0, WIDTH, HEADER_H);

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.moveTo(0, HEADER_H);
  for (let wx = 0; wx <= WIDTH + 28; wx += 28) {
    ctx.quadraticCurveTo(wx + 14, HEADER_H - 9, wx + 28, HEADER_H);
  }
  ctx.lineTo(WIDTH, 0); ctx.lineTo(0, 0); ctx.closePath();
  ctx.fill();

  drawFlower(ctx, WIDTH / 2 - 220, 20, 9, "rgba(255,255,255,0.15)", "rgba(255,220,180,0.22)");
  drawFlower(ctx, WIDTH / 2 + 220, 20, 9, "rgba(255,255,255,0.15)", "rgba(255,220,180,0.22)");
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  [WIDTH/2-170, WIDTH/2-80, WIDTH/2+80, WIDTH/2+170].forEach(x => {
    ctx.beginPath(); ctx.arc(x, 72, 2.5, 0, Math.PI * 2); ctx.fill();
  });

  ctx.textAlign = "center";
  ctx.fillStyle = C.hdrText;
  ctx.font = `bold 36px ${FONT}`;
  ctx.fillText("今週の献立", WIDTH / 2, 52);
  ctx.font = `14px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fillText("献立日和〜coto coto〜", WIDTH / 2, 76);
  ctx.font = `12px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.70)";
  const weekStart = `${new Date(monday.getTime()).getUTCMonth() + 1}/${new Date(monday.getTime()).getUTCDate()}`;
  const weekEnd = `${new Date(sunday.getTime()).getUTCMonth() + 1}/${new Date(sunday.getTime()).getUTCDate()}`;
  ctx.fillText(`${weekStart} 〜 ${weekEnd}`, WIDTH / 2, 96);
  ctx.textAlign = "left";

  if (imgWave) {
    const charH = 160;
    const charW = Math.round((imgWave.width / imgWave.height) * charH);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(imgWave, 6, HEADER_H - charH + 50, charW, charH);
  }
  if (imgCooking) {
    const charH = 160;
    const charW = Math.round((imgCooking.width / imgCooking.height) * charH);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(imgCooking, WIDTH - charW - 6, HEADER_H - charH + 50, charW, charH);
  }

  // ─── カード描画 ────────────────────────────────────────────────────────────
  function drawCard(day: typeof days[0], col: number, row: number) {
    const cx = PAD + col * (CARD_W + CARD_GAP);
    const cy = HEADER_H + PAD + row * (MAX_CARD_H + CARD_GAP);
    const cw = CARD_W;
    const ch = MAX_CARD_H;

    const isSat = day.dow === "土";
    const isSun = day.dow === "日";
    const sp = day.special;

    let cardBg = C.cardBg;
    let cardBorder = C.cardBorder;
    if (sp === "special") { cardBg = C.specialCardBg; cardBorder = C.specialCardBorder; }
    else if (sp === "cheat") { cardBg = C.cheatCardBg; cardBorder = C.cheatCardBorder; }
    else if (sp === "reward") { cardBg = C.rewardCardBg; cardBorder = C.rewardCardBorder; }

    // カード影
    ctx.shadowColor = "rgba(0,0,0,0.07)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = cardBg;
    roundRect(ctx, cx, cy, cw, ch, CARD_R);
    ctx.fill();
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = cardBorder;
    ctx.lineWidth = 1.5;
    roundRect(ctx, cx, cy, cw, ch, CARD_R);
    ctx.stroke();

    // 曜日ヘッダー（固定色）
    let dowBg: string, dowTxt: string;
    if (isSun) { dowBg = C.dowSunBg; dowTxt = C.dowSunText; }
    else if (isSat) { dowBg = C.dowSatBg; dowTxt = C.dowSatText; }
    else { dowBg = C.dowWeekdayBg; dowTxt = C.dowWeekdayText; }

    ctx.fillStyle = dowBg;
    ctx.beginPath();
    ctx.moveTo(cx + CARD_R, cy);
    ctx.lineTo(cx + cw - CARD_R, cy);
    ctx.quadraticCurveTo(cx + cw, cy, cx + cw, cy + CARD_R);
    ctx.lineTo(cx + cw, cy + DOW_HEADER_H);
    ctx.lineTo(cx, cy + DOW_HEADER_H);
    ctx.lineTo(cx, cy + CARD_R);
    ctx.quadraticCurveTo(cx, cy, cx + CARD_R, cy);
    ctx.closePath();
    ctx.fill();

    ctx.textAlign = "center";
    ctx.fillStyle = dowTxt;
    ctx.font = `bold 28px ${FONT}`;
    ctx.fillText(day.dow, cx + cw / 2, cy + 38);
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = isSun ? C.dowSunText : isSat ? C.dowSatText : C.dateText;
    ctx.globalAlpha = 0.85;
    ctx.fillText(day.mmdd, cx + cw / 2, cy + 58);
    ctx.globalAlpha = 1.0;
    ctx.textAlign = "left";

    // 区切り線
    ctx.strokeStyle = sp ? cardBorder : C.divider;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + 12, cy + DOW_HEADER_H);
    ctx.lineTo(cx + cw - 12, cy + DOW_HEADER_H);
    ctx.stroke();

    // メニュー欄背景（特別な日のみ色付き）
    const menuY = cy + DOW_HEADER_H;
    const menuH = ch - DOW_HEADER_H;
    if (sp) {
      ctx.fillStyle = cardBg;
      roundRectBottom(ctx, cx, menuY, cw, menuH, CARD_R);
      ctx.fill();
    }

    // 特別な日バッジ（アイコン＋ラベル）
    let iconImg: any = null;
    let labelColor = C.dishText;
    if (sp === "special") { iconImg = iconSpecial; labelColor = C.specialLabel; }
    else if (sp === "cheat") { iconImg = iconCheat; labelColor = C.cheatLabel; }
    else if (sp === "reward") { iconImg = iconReward; labelColor = C.rewardLabel; }

    let dishStartY = menuY + CONTENT_PAD;
    if (sp && iconImg) {
      const iconSize = 22;
      const label = SPECIAL_LABELS[sp] || sp;
      ctx.font = `bold 11px ${FONT}`;
      const labelW = ctx.measureText(label).width;
      const totalW = iconSize + 4 + labelW;
      const badgeCx = cx + cw / 2;
      const badgeY = menuY + 10;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(iconImg, badgeCx - totalW / 2, badgeY, iconSize, iconSize);

      ctx.fillStyle = labelColor;
      ctx.textAlign = "left";
      ctx.fillText(label, badgeCx - totalW / 2 + iconSize + 4, badgeY + iconSize * 0.72);

      ctx.strokeStyle = cardBorder;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(cx + 20, badgeY + iconSize + 6);
      ctx.lineTo(cx + cw - 20, badgeY + iconSize + 6);
      ctx.stroke();
      ctx.globalAlpha = 1;

      dishStartY = badgeY + iconSize + 10;
    }

    // 料理名
    const contentH = cy + ch - dishStartY - CONTENT_PAD;

    if (!day.dinner && !day.dinnerOptions?.length) {
      ctx.fillStyle = C.dishLight;
      ctx.font = `11px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText("未設定", cx + cw / 2, dishStartY + contentH / 2);
      ctx.textAlign = "left";
    } else if (day.dinnerOptions?.length) {
      let ty = dishStartY + LINE_H * 0.5;
      for (let oi = 0; oi < day.dinnerOptions.length; oi++) {
        const opt = day.dinnerOptions[oi];
        const bx = cx + CONTENT_PAD + 8;
        const by = ty;
        ctx.fillStyle = C.numBg;
        ctx.beginPath(); ctx.arc(bx, by, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C.numText;
        ctx.font = `bold 9px ${FONT}`;
        ctx.textAlign = "center";
        ctx.fillText(String(oi + 1), bx, by + 3.5);
        ctx.textAlign = "left";
        ctx.fillStyle = C.dishText;
        ctx.font = `12px ${FONT}`;
        const lines = wrapText(ctx, opt, DISH_MAX_W - 22);
        for (let li = 0; li < lines.length; li++) {
          ctx.fillText(lines[li], cx + CONTENT_PAD + 20, ty + li * LINE_H);
        }
        ty += lines.length * LINE_H + 5;
      }
    } else {
      let dishColor = C.dishText;
      let dishFont = `12px ${FONT}`;
      if (sp === "special") { dishColor = C.specialText; dishFont = `bold 13px ${FONT}`; }
      else if (sp === "cheat") { dishColor = C.cheatText; dishFont = `bold 13px ${FONT}`; }
      else if (sp === "reward") { dishColor = C.rewardText; dishFont = `bold 13px ${FONT}`; }

      ctx.fillStyle = dishColor;
      ctx.font = dishFont;
      const lines = wrapText(ctx, day.dinner, DISH_MAX_W);
      const totalH = lines.length * LINE_H;
      const startY = dishStartY + (contentH - totalH) / 2 + LINE_H * 0.7;
      ctx.textAlign = "center";
      for (let li = 0; li < lines.length; li++) {
        ctx.fillText(lines[li], cx + cw / 2, startY + li * LINE_H);
      }
      ctx.textAlign = "left";
    }
  }

  // 1行目：月〜木
  for (let i = 0; i < 4; i++) drawCard(days[i], i, 0);
  // 2行目：金〜日
  for (let i = 0; i < 3; i++) drawCard(days[4 + i], i, 1);

  // キャッチコピーカード（2行目・4列目）
  {
    const cx = PAD + 3 * (CARD_W + CARD_GAP);
    const cy = HEADER_H + PAD + 1 * (MAX_CARD_H + CARD_GAP);
    const cw = CARD_W;
    const ch = MAX_CARD_H;

    ctx.shadowColor = "rgba(0,0,0,0.07)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    const cg = ctx.createLinearGradient(cx, cy, cx + cw, cy + ch);
    cg.addColorStop(0, C.hdrFrom);
    cg.addColorStop(1, C.hdrTo);
    ctx.fillStyle = cg;
    roundRect(ctx, cx, cy, cw, ch, CARD_R);
    ctx.fill();
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    drawFlower(ctx, cx + cw / 2, cy + 30, 12, "rgba(255,255,255,0.18)", "rgba(255,220,180,0.28)");
    drawFlower(ctx, cx + 16, cy + ch - 20, 7, "rgba(255,255,255,0.14)", "rgba(255,220,180,0.2)");
    drawFlower(ctx, cx + cw - 16, cy + ch - 20, 7, "rgba(255,255,255,0.14)", "rgba(255,220,180,0.2)");

    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.font = `bold 15px ${FONT}`;
    ctx.fillText("今週も", cx + cw / 2, cy + ch / 2 - 8);
    ctx.fillText("美味しい食卓を", cx + cw / 2, cy + ch / 2 + 14);
    ctx.font = `9px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.60)";
    ctx.fillText("献立日和", cx + cw / 2, cy + ch / 2 + 30);
    ctx.textAlign = "left";
  }

  // ─── 凡例エリア ──────────────────────────────────────────────────────────────
  const legendY = HEADER_H + PAD + GRID_H + PAD;
  ctx.fillStyle = "#FDF0E8";
  ctx.fillRect(0, legendY, WIDTH, LEGEND_H);
  ctx.strokeStyle = C.cardBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, legendY + 1);
  ctx.lineTo(WIDTH - PAD, legendY + 1);
  ctx.stroke();

  const legendItems = [
    { icon: iconSpecial, label: "特別な日（誕生日・記念日など）" },
    { icon: iconCheat,   label: "チートデイ（好きなもの食べる日）" },
    { icon: iconReward,  label: "ご褒美デー" },
  ];
  const itemW = (WIDTH - PAD * 2) / legendItems.length;
  for (let i = 0; i < legendItems.length; i++) {
    const item = legendItems[i];
    const ix = PAD + i * itemW;
    const iy = legendY + LEGEND_H / 2;
    const iconSize = 26;
    if (item.icon) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(item.icon, ix + 16, iy - iconSize / 2, iconSize, iconSize);
    }
    ctx.fillStyle = "#6B5040";
    ctx.font = `11px ${FONT}`;
    ctx.textAlign = "left";
    ctx.fillText(item.label, ix + 16 + iconSize + 8, iy + 4);
    if (i < legendItems.length - 1) {
      ctx.strokeStyle = C.cardBorder;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD + (i + 1) * itemW, legendY + 14);
      ctx.lineTo(PAD + (i + 1) * itemW, legendY + LEGEND_H - 14);
      ctx.stroke();
    }
  }

  // PNG生成 → S3アップロード
  const pngBuffer = canvas.toBuffer("image/png") as Buffer;
  const key = `weekly-menu/${userId}-${Date.now()}.png`;
  const { url } = await storagePut(key, pngBuffer, "image/png");
  return url;
}

/**
 * 週間献立をLINE Flexメッセージとして構築する（後方互換）
 */
export async function generateWeeklyMenuFlex(userId: number): Promise<any> {
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  const jstNow = new Date(now.getTime() + jstOffset);
  const dayOfWeek = jstNow.getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(jstNow);
  monday.setUTCDate(jstNow.getUTCDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const startDate = monday.toISOString().split("T")[0];
  const endDate = sunday.toISOString().split("T")[0];

  const plans = await getMenuPlansByDateRange(userId, startDate, endDate);
  const byDate = new Map<string, any>();
  for (const p of plans) {
    const dateStr = p.planDate instanceof Date
      ? p.planDate.toISOString().split("T")[0]
      : String(p.planDate);
    const md = (() => {
      try { return typeof p.menuData === "string" ? JSON.parse(p.menuData) : p.menuData; }
      catch { return null; }
    })();
    const mealType: string = md?.mealType ?? "dinner";
    if (!byDate.has(dateStr)) byDate.set(dateStr, {});
    const entry = byDate.get(dateStr)!;
    if (mealType === "breakfast") {
      entry.breakfast = md?.breakfast || md?.name || "";
    } else if (mealType === "lunch") {
      entry.lunch = md?.lunch || md?.name || "";
    } else {
      entry.dinner = md?.dinner || (md?.dinnerOptions?.[0]?.name ?? "");
    }
  }

  const dayLabels = ["月", "火", "水", "木", "金", "土", "日"];
  const days: Array<{ date: string; label: string; menuData: any }> = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    const mmdd = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
    days.push({ date: dateStr, label: `${mmdd}(${dayLabels[i]})`, menuData: byDate.get(dateStr) || null });
  }

  const rows: any[] = [];
  for (const day of days) {
    const md = day.menuData;
    const breakfast = md?.breakfast || "";
    const lunch = md?.lunch || "";
    const dinner = md?.dinner || "";
    const hasData = breakfast || lunch || dinner;

    const mealLines: any[] = [];
    if (breakfast) mealLines.push({ type: "text", text: `🌅 ${breakfast}`, size: "xs", color: "#5C3D2E", wrap: true });
    if (lunch) mealLines.push({ type: "text", text: `☀️ ${lunch}`, size: "xs", color: "#5C3D2E", wrap: true });
    if (dinner) mealLines.push({ type: "text", text: `🌙 ${dinner}`, size: "xs", color: "#5C3D2E", wrap: true });
    if (!hasData) mealLines.push({ type: "text", text: "未設定", size: "xs", color: "#C4B0A0", style: "italic" });

    rows.push({
      type: "box",
      layout: "horizontal",
      contents: [
        {
          type: "box",
          layout: "vertical",
          contents: [{ type: "text", text: day.label, size: "xs", weight: "bold", color: "#9E7B5A" }],
          width: "72px",
          justifyContent: "center",
        },
        { type: "box", layout: "vertical", contents: mealLines, flex: 1 },
      ],
      paddingTop: "8px",
      paddingBottom: "8px",
      borderWidth: "1px",
      borderColor: "#F0DFC8",
      cornerRadius: "8px",
      backgroundColor: hasData ? "#FFFFFF" : "#F9F5F0",
      margin: "4px",
    });
  }

  return {
    type: "flex",
    altText: "今週の献立表",
    contents: {
      type: "bubble",
      size: "giga",
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "🍽 今週の献立", weight: "bold", size: "lg", color: "#5C3D2E" },
          { type: "text", text: "献立日和〜coto coto〜", size: "xs", color: "#9E7B5A" },
        ],
        backgroundColor: "#FFF8F0",
        paddingAll: "16px",
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: rows,
        backgroundColor: "#FFF8F0",
        paddingAll: "8px",
        spacing: "none",
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "ダッシュボードから詳細を確認・編集できます", size: "xxs", color: "#B09070", align: "center" },
        ],
        backgroundColor: "#FFF8F0",
        paddingAll: "8px",
      },
      styles: {
        header: { backgroundColor: "#FFF8F0" },
        body: { backgroundColor: "#FFF8F0" },
        footer: { backgroundColor: "#FFF8F0" },
      },
    },
  };
}
