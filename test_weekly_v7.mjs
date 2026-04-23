/**
 * 週間献立PNG v7
 * 修正点：
 * 1. 曜日エリアの色を固定：月〜金=クリーム系、土=青系、日=赤系
 * 2. 特別な日でも曜日エリアは固定色のまま（変えない）
 * 3. メニュー欄（下部）のみ特別な日に色付け
 * 4. アイコンをAI生成画像に置き換え（ローカルPNGを読み込み）
 */
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(__dirname, "server/assets/fonts");
const ICON_DIR = path.join(__dirname, "server/assets/icons");

try {
  GlobalFonts.registerFromPath(path.join(FONT_DIR, "MPLUSRounded1c-Regular.ttf"), "Rounded");
  GlobalFonts.registerFromPath(path.join(FONT_DIR, "MPLUSRounded1c-Bold.ttf"), "Rounded");
} catch (e) {}
try {
  GlobalFonts.registerFromPath(path.join(FONT_DIR, "NotoSansJP-Regular.ttf"), "NotoSansJP");
  GlobalFonts.registerFromPath(path.join(FONT_DIR, "NotoSansJP-Bold.ttf"), "NotoSansJP");
} catch (e) {}

const FONT = "Rounded, NotoSansJP, sans-serif";

const MASCOT_COOKING_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/chara_cooking-2kPVJfknvoFLpXHRLPVvVs.png";
const MASCOT_WAVE_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/chara_wave-SJFFFGGiajefS9Vh7cqFQF.png";

// テストデータ（木曜=特別な日、金曜=チートデイ、土曜=ご褒美デー）
const testDays = [
  { date: "2026-04-20", dow: "月", dinner: "鶏ひき肉と豆腐のヘルシーハンバーグ", dinnerOptions: null, special: null },
  { date: "2026-04-21", dow: "火", dinner: "鮭のムニエル レモンバター風味", dinnerOptions: null, special: null },
  { date: "2026-04-22", dow: "水", dinner: null, dinnerOptions: ["豚こま肉の生姜焼き", "鶏むね肉の棒棒鶏", "サバの味噌煮"], special: null },
  { date: "2026-04-23", dow: "木", dinner: "肉じゃが", dinnerOptions: null, special: "special" },
  { date: "2026-04-24", dow: "金", dinner: "好きなものを食べる日！", dinnerOptions: null, special: "cheat" },
  { date: "2026-04-25", dow: "土", dinner: "鶏むね肉の唐揚げ", dinnerOptions: null, special: "reward" },
  { date: "2026-04-26", dow: "日", dinner: null, dinnerOptions: ["鮭の塩焼き", "豚こまキャベツ炒め"], special: null },
];

// カラーパレット
const C = {
  bg: "#FDF8F3",
  bgDot: "#EDD9C8",
  hdrFrom: "#D4785A",
  hdrTo: "#E8956E",
  hdrText: "#FFFFFF",
  cardBg: "#FFFFFF",
  cardBorder: "#EDD9C8",
  // 曜日ヘッダー（固定色）
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
  // 特別な日（メニュー欄のみ）
  specialCardBg: "#FFF0F5",
  specialCardBorder: "#F4A0C0",
  specialText: "#C05080",
  // チートデイ（メニュー欄のみ）
  cheatCardBg: "#FFFBE8",
  cheatCardBorder: "#F5C518",
  cheatText: "#A07800",
  // ご褒美デー（メニュー欄のみ）
  rewardCardBg: "#F5F0FF",
  rewardCardBorder: "#9B7FD4",
  rewardText: "#6A4BAA",
};

// ─── ユーティリティ ─────────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
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

// 下半分だけ角丸（メニュー欄用）
function roundRectBottom(ctx, x, y, w, h, r) {
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

function wrapText(ctx, text, maxWidth) {
  if (!text) return [];
  const lines = [];
  let cur = "";
  for (const ch of text) {
    const t = cur + ch;
    if (ctx.measureText(t).width > maxWidth && cur.length > 0) { lines.push(cur); cur = ch; }
    else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawFlower(ctx, cx, cy, r, pc, cc) {
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

// ─── メイン生成 ─────────────────────────────────────────────────────────────
async function generate() {
  let imgCooking = null, imgWave = null;
  let iconSpecial = null, iconCheat = null, iconReward = null;

  try { imgCooking = await loadImage(MASCOT_COOKING_URL); } catch (e) { console.log("cooking load error", e.message); }
  try { imgWave = await loadImage(MASCOT_WAVE_URL); } catch (e) { console.log("wave load error", e.message); }
  try { iconSpecial = await loadImage(path.join(ICON_DIR, "icon_special.png")); } catch (e) { console.log("icon_special load error", e.message); }
  try { iconCheat = await loadImage(path.join(ICON_DIR, "icon_cheat.png")); } catch (e) { console.log("icon_cheat load error", e.message); }
  try { iconReward = await loadImage(path.join(ICON_DIR, "icon_reward.png")); } catch (e) { console.log("icon_reward load error", e.message); }

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

  // カード高さ計算
  const tempC = createCanvas(CARD_W, 100);
  const tempCtx = tempC.getContext("2d");
  tempCtx.font = `12px ${FONT}`;

  const cardHeights = testDays.map(day => {
    let lines = 0;
    if (day.dinnerOptions?.length) {
      for (const o of day.dinnerOptions) lines += Math.max(1, wrapText(tempCtx, o, DISH_MAX_W - 20).length);
      lines += (day.dinnerOptions.length - 1) * 0.3;
    } else if (day.dinner) {
      lines = Math.max(1, wrapText(tempCtx, day.dinner, DISH_MAX_W).length);
    } else {
      lines = 1;
    }
    return DOW_HEADER_H + CONTENT_PAD * 2 + Math.ceil(lines) * LINE_H + 16;
  });
  const MAX_CARD_H = Math.max(...cardHeights, 140);

  const GRID_H = ROWS * MAX_CARD_H + (ROWS - 1) * CARD_GAP;
  const LEGEND_H = 72;
  const HEIGHT = HEADER_H + PAD + GRID_H + PAD + LEGEND_H;

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  // ─── 背景 ───────────────────────────────────────────────────────────────
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

  // ─── ヘッダー ─────────────────────────────────────────────────────────────
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
  ctx.fillText("4/20 〜 4/26", WIDTH / 2, 96);
  ctx.textAlign = "left";

  if (imgWave) {
    const charH = 160;
    const charW = Math.round((imgWave.width / imgWave.height) * charH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(imgWave, 6, HEADER_H - charH + 50, charW, charH);
  }
  if (imgCooking) {
    const charH = 160;
    const charW = Math.round((imgCooking.width / imgCooking.height) * charH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(imgCooking, WIDTH - charW - 6, HEADER_H - charH + 50, charW, charH);
  }

  // ─── カード描画関数 ────────────────────────────────────────────────────────
  function drawCard(day, col, row) {
    const cx = PAD + col * (CARD_W + CARD_GAP);
    const cy = HEADER_H + PAD + row * (MAX_CARD_H + CARD_GAP);
    const cw = CARD_W;
    const ch = MAX_CARD_H;

    const isSat = day.dow === "土";
    const isSun = day.dow === "日";
    const sp = day.special;

    // カード影
    ctx.shadowColor = "rgba(0,0,0,0.07)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;

    // カード背景（特別な日はカード全体に薄い色）
    let cardBg = C.cardBg;
    let cardBorder = C.cardBorder;
    if (sp === "special") { cardBg = C.specialCardBg; cardBorder = C.specialCardBorder; }
    else if (sp === "cheat") { cardBg = C.cheatCardBg; cardBorder = C.cheatCardBorder; }
    else if (sp === "reward") { cardBg = C.rewardCardBg; cardBorder = C.rewardCardBorder; }

    ctx.fillStyle = cardBg;
    roundRect(ctx, cx, cy, cw, ch, CARD_R);
    ctx.fill();
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = cardBorder;
    ctx.lineWidth = 1.5;
    roundRect(ctx, cx, cy, cw, ch, CARD_R);
    ctx.stroke();

    // ─── 曜日ヘッダーエリア（固定色：土=青系、日=赤系、それ以外=クリーム） ──
    let dowBg, dowTxt;
    if (isSun) { dowBg = C.dowSunBg; dowTxt = C.dowSunText; }
    else if (isSat) { dowBg = C.dowSatBg; dowTxt = C.dowSatText; }
    else { dowBg = C.dowWeekdayBg; dowTxt = C.dowWeekdayText; }
    // ※ 特別な日でも曜日エリアの色は変えない

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

    // 曜日（大）
    ctx.textAlign = "center";
    ctx.fillStyle = dowTxt;
    ctx.font = `bold 28px ${FONT}`;
    ctx.fillText(day.dow, cx + cw / 2, cy + 38);

    // 日付（中）
    const d = new Date(day.date + "T00:00:00+09:00");
    const mmdd = `${d.getMonth() + 1}/${d.getDate()}`;
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = isSun ? C.dowSunText : isSat ? C.dowSatText : C.dateText;
    ctx.globalAlpha = 0.85;
    ctx.fillText(mmdd, cx + cw / 2, cy + 58);
    ctx.globalAlpha = 1.0;
    ctx.textAlign = "left";

    // 区切り線
    ctx.strokeStyle = sp ? cardBorder : C.divider;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + 12, cy + DOW_HEADER_H);
    ctx.lineTo(cx + cw - 12, cy + DOW_HEADER_H);
    ctx.stroke();

    // ─── メニュー欄（特別な日のみ色付き背景） ──────────────────────────────
    const menuY = cy + DOW_HEADER_H;
    const menuH = ch - DOW_HEADER_H;

    if (sp) {
      let menuBg;
      if (sp === "special") menuBg = C.specialCardBg;
      else if (sp === "cheat") menuBg = C.cheatCardBg;
      else if (sp === "reward") menuBg = C.rewardCardBg;

      ctx.fillStyle = menuBg;
      roundRectBottom(ctx, cx, menuY, cw, menuH, CARD_R);
      ctx.fill();
    }

    // ─── 料理名エリア ──────────────────────────────────────────────────────
    const contentY = menuY + CONTENT_PAD;
    const contentH = menuH - CONTENT_PAD * 2;

    if (!day.dinner && !day.dinnerOptions?.length) {
      ctx.fillStyle = C.dishLight;
      ctx.font = `11px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText("未設定", cx + cw / 2, contentY + contentH / 2);
      ctx.textAlign = "left";
    } else if (day.dinnerOptions?.length) {
      let ty = contentY + LINE_H * 0.5;
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
      const startY = contentY + (contentH - totalH) / 2 + LINE_H * 0.7;
      ctx.textAlign = "center";
      for (let li = 0; li < lines.length; li++) {
        ctx.fillText(lines[li], cx + cw / 2, startY + li * LINE_H);
      }
      ctx.textAlign = "left";
    }

    // ─── 特別アイコン（AI生成画像）右下に表示 ──────────────────────────────
    if (sp) {
      let iconImg = null;
      if (sp === "special") iconImg = iconSpecial;
      else if (sp === "cheat") iconImg = iconCheat;
      else if (sp === "reward") iconImg = iconReward;

      if (iconImg) {
        const iconSize = 36; // 大きめに表示
        const ix = cx + cw - iconSize - 8;
        const iy = cy + ch - iconSize - 8;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(iconImg, ix, iy, iconSize, iconSize);
      }
    }
  }

  // 1行目：月〜木
  for (let i = 0; i < 4; i++) drawCard(testDays[i], i, 0);
  // 2行目：金〜日
  for (let i = 0; i < 3; i++) drawCard(testDays[4 + i], i, 1);

  // キャッチコピーカード（右下 2行目4列目）
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

  // ─── 凡例エリア（下部独立） ────────────────────────────────────────────────
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
    { special: "special", icon: iconSpecial, label: "特別な日（誕生日・記念日など）" },
    { special: "cheat",   icon: iconCheat,   label: "チートデイ（好きなもの食べる日）" },
    { special: "reward",  icon: iconReward,  label: "ご褒美デー" },
  ];
  const itemW = (WIDTH - PAD * 2) / legendItems.length;
  for (let i = 0; i < legendItems.length; i++) {
    const item = legendItems[i];
    const ix = PAD + i * itemW;
    const iy = legendY + LEGEND_H / 2;
    const iconSize = 28;
    // アイコン（AI生成画像）
    if (item.icon) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(item.icon, ix + 12, iy - iconSize / 2, iconSize, iconSize);
    }
    // テキスト
    ctx.fillStyle = "#6B5040";
    ctx.font = `11px ${FONT}`;
    ctx.textAlign = "left";
    ctx.fillText(item.label, ix + 12 + iconSize + 8, iy + 4);
    // 縦区切り（最後以外）
    if (i < legendItems.length - 1) {
      ctx.strokeStyle = C.cardBorder;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD + (i + 1) * itemW, legendY + 14);
      ctx.lineTo(PAD + (i + 1) * itemW, legendY + LEGEND_H - 14);
      ctx.stroke();
    }
  }

  const buf = canvas.toBuffer("image/png");
  fs.writeFileSync("/tmp/test_weekly_v7.png", buf);
  console.log(`Saved: /tmp/test_weekly_v7.png (${buf.length} bytes), ${WIDTH}x${HEIGHT}`);
}

generate().catch(console.error);
