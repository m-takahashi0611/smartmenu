import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = "/home/ubuntu/smartmenu/server/assets/fonts";

try {
  GlobalFonts.registerFromPath(path.join(FONT_DIR, "NotoSansJP-Regular.woff2"), "NotoSansJP");
  GlobalFonts.registerFromPath(path.join(FONT_DIR, "NotoSansJP-Bold.woff2"), "NotoSansJP");
  console.log("Font registered");
} catch (e) {
  console.warn("Font registration failed:", e);
}

const MASCOT_COOKING_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/chara_cooking-2kPVJfknvoFLpXHRLPVvVs.png";
const MASCOT_WAVE_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/chara_wave-SJFFFGGiajefS9Vh7cqFQF.png";

const DAYS_JA = ["日", "月", "火", "水", "木", "金", "土"];

function formatDateParts(dateStr) {
  const d = new Date(dateStr + "T00:00:00+09:00");
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const dowIdx = d.getDay();
  const dow = DAYS_JA[dowIdx];
  const isWeekend = dowIdx === 0 || dowIdx === 6;
  return { mmdd: `${m}/${day}`, dow: `(${dow})`, isWeekend };
}

function wrapText(ctx, text, maxWidth) {
  if (!text) return [];
  const lines = [];
  let current = "";
  for (const char of text) {
    const test = current + char;
    if (ctx.measureText(test).width > maxWidth && current.length > 0) {
      lines.push(current);
      current = char;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

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

// extractMeals: dinnerOptionsに対応
function extractMeals(menuData) {
  if (!menuData) return { breakfast: "", lunch: "", dinner: "", dinnerOptions: null };
  const breakfast = menuData.breakfast || "";
  const lunch = menuData.lunch || "";
  let dinner = "";
  let dinnerOptions = null;
  if (menuData.dinnerOptions && menuData.dinnerOptions.length > 1) {
    // 複数提案がある場合はリスト表示
    dinnerOptions = menuData.dinnerOptions.map((o, idx) => `[${idx+1}] ${o.name || o}`);
  } else if (menuData.selectedDinnerIndex != null && menuData.dinnerOptions?.length > 0) {
    const idx = Number(menuData.selectedDinnerIndex);
    dinner = menuData.dinnerOptions[idx]?.name || menuData.dinnerOptions[0]?.name || "";
  } else if (menuData.dinner) {
    dinner = menuData.dinner;
  } else if (menuData.dinnerOptions?.length > 0) {
    dinner = menuData.dinnerOptions[0]?.name || "";
  }
  return { breakfast, lunch, dinner, dinnerOptions };
}

// テスト用ダミーデータ
const monday = new Date("2026-04-20T00:00:00+09:00");
const dayLabelsArr = ["月", "火", "水", "木", "金", "土", "日"];
const testMenus = [
  { breakfast: "鮭の塩焼き", lunch: "鶏むね肉のピカタ", dinnerOptions: [{name:"鶏ひき肉と豆腐のヘルシーハンバーグ"},{name:"鮭のムニエル"},{name:"豚の生姜焼き"}] },
  { breakfast: "卵焼き", lunch: "鶏むね肉の照り焼き丼", dinner: "鶏むね肉の唐揚げ" },
  { breakfast: "納豆ご飯", lunch: "鶏むね肉の塩麹焼き", dinner: "鶏むね肉の棒棒鶏" },
  { breakfast: "鮭の塩焼き", lunch: "鶏むね肉のピカタ", dinner: "肉じゃが" },
  { breakfast: "目玉焼き", lunch: "豚バラ大根", dinner: "鶏むね肉の棒棒鶏" },
  { breakfast: "鮭の塩焼き", lunch: "鶏むね肉のピカタ", dinner: "豚こま切れ肉とキャベツの生姜焼き" },
  { breakfast: "卵焼き", lunch: "鶏むね肉のピカタ", dinner: "鶏むね肉のピカタ" },
];

const days = [];
for (let i = 0; i < 7; i++) {
  const d = new Date(monday);
  d.setDate(monday.getDate() + i);
  const dateStr = d.toISOString().split("T")[0];
  const mmdd = `${d.getMonth() + 1}/${d.getDate()}`;
  days.push({ date: dateStr, label: `${mmdd}(${dayLabelsArr[i]})`, menuData: testMenus[i] });
}

let mascotCooking = null;
let mascotWave = null;
try { mascotCooking = await loadImage(MASCOT_COOKING_URL); console.log("Cooking image loaded"); } catch(e) { console.warn("cooking img failed:", e.message); }
try { mascotWave = await loadImage(MASCOT_WAVE_URL); console.log("Wave image loaded"); } catch(e) { console.warn("wave img failed:", e.message); }

const WIDTH = 680;
const PADDING = 14;
const HEADER_H = 90;
const FOOTER_H = 50;
const FONT_FAMILY = "NotoSansJP, sans-serif";
const DATE_COL_W = 68;
const MEAL_COL_W = WIDTH - PADDING * 2 - DATE_COL_W - 8;
const MEAL_BADGE_W = 32;
const MEAL_TEXT_MAX_W = MEAL_COL_W - MEAL_BADGE_W - 10;
const LINE_H = 22;
const MEAL_ROW_GAP = 4;
const CARD_PAD_V = 12;
const CARD_RADIUS = 10;

const tempCanvas = createCanvas(WIDTH, 100);
const tempCtx = tempCanvas.getContext("2d");
tempCtx.font = `14px ${FONT_FAMILY}`;

const rowHeights = [];
for (const day of days) {
  const { breakfast, lunch, dinner, dinnerOptions } = extractMeals(day.menuData);
  let totalH = CARD_PAD_V * 2;
  const meals = [breakfast, lunch].filter(Boolean);
  if (meals.length === 0 && !dinner && (!dinnerOptions || dinnerOptions.length === 0)) {
    totalH += LINE_H;
  } else {
    for (const meal of meals) {
      const lines = wrapText(tempCtx, meal, MEAL_TEXT_MAX_W);
      totalH += Math.max(1, lines.length) * LINE_H + MEAL_ROW_GAP;
    }
    if (dinnerOptions && dinnerOptions.length > 0) {
      // 複数提案の行数を合計
      let optH = 0;
      for (const optText of dinnerOptions) {
        const lines = wrapText(tempCtx, optText, MEAL_TEXT_MAX_W);
        optH += Math.max(1, lines.length) * LINE_H + 2;
      }
      totalH += optH + MEAL_ROW_GAP;
    } else if (dinner) {
      const lines = wrapText(tempCtx, dinner, MEAL_TEXT_MAX_W);
      totalH += Math.max(1, lines.length) * LINE_H + MEAL_ROW_GAP;
    }
  }
  rowHeights.push(Math.max(72, totalH));
}

const totalH = HEADER_H + rowHeights.reduce((a, b) => a + b, 0) + PADDING * 2 + FOOTER_H + 8 * 7;

const canvas = createCanvas(WIDTH, totalH);
const ctx = canvas.getContext("2d");

const bgGrad = ctx.createLinearGradient(0, 0, 0, totalH);
bgGrad.addColorStop(0, "#FFF8F0");
bgGrad.addColorStop(1, "#FFF3E8");
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, WIDTH, totalH);

const headerGrad = ctx.createLinearGradient(0, 0, WIDTH, HEADER_H);
headerGrad.addColorStop(0, "#FF7F50");
headerGrad.addColorStop(1, "#FF9966");
ctx.fillStyle = headerGrad;
ctx.fillRect(0, 0, WIDTH, HEADER_H);

ctx.fillStyle = "rgba(255,255,255,0.2)";
ctx.fillRect(0, HEADER_H - 3, WIDTH, 3);

if (mascotCooking) {
  const charH = 80;
  const charW = (mascotCooking.width / mascotCooking.height) * charH;
  ctx.drawImage(mascotCooking, WIDTH - charW - 10, HEADER_H - charH, charW, charH);
}
if (mascotWave) {
  const charH = 70;
  const charW = (mascotWave.width / mascotWave.height) * charH;
  ctx.drawImage(mascotWave, 10, HEADER_H - charH, charW, charH);
}

ctx.textAlign = "center";
ctx.fillStyle = "#FFFFFF";
ctx.font = `bold 24px ${FONT_FAMILY}`;
ctx.fillText("今週の献立", WIDTH / 2, 42);
ctx.font = `13px ${FONT_FAMILY}`;
ctx.fillStyle = "rgba(255,255,255,0.85)";
ctx.fillText("献立日和〜coto coto〜", WIDTH / 2, 64);
ctx.font = `11px ${FONT_FAMILY}`;
ctx.fillStyle = "rgba(255,255,255,0.75)";
ctx.fillText("4/20 〜 4/26", WIDTH / 2, 80);
ctx.textAlign = "left";

let y = HEADER_H + PADDING;

for (let i = 0; i < days.length; i++) {
  const day = days[i];
  const rowH = rowHeights[i];
  const { breakfast, lunch, dinner, dinnerOptions } = extractMeals(day.menuData);
  const hasData = breakfast || lunch || dinner || (dinnerOptions && dinnerOptions.length > 0);
  const { mmdd, dow, isWeekend } = formatDateParts(day.date);

  const cardX = PADDING;
  const cardW = WIDTH - PADDING * 2;

  ctx.shadowColor = "rgba(0,0,0,0.08)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = hasData ? "#FFFFFF" : "#FAF6F2";
  roundRect(ctx, cardX, y, cardW, rowH, CARD_RADIUS);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.strokeStyle = "#F0DFC8";
  ctx.lineWidth = 1;
  roundRect(ctx, cardX, y, cardW, rowH, CARD_RADIUS);
  ctx.stroke();

  const dateColX = cardX;
  const dateColGrad = ctx.createLinearGradient(dateColX, y, dateColX + DATE_COL_W, y);
  if (isWeekend) {
    dateColGrad.addColorStop(0, "#FFF0E8");
    dateColGrad.addColorStop(1, "#FFE4D0");
  } else {
    dateColGrad.addColorStop(0, "#FFF5EE");
    dateColGrad.addColorStop(1, "#FDEEE2");
  }
  ctx.fillStyle = dateColGrad;
  ctx.beginPath();
  ctx.moveTo(dateColX + CARD_RADIUS, y);
  ctx.lineTo(dateColX + DATE_COL_W, y);
  ctx.lineTo(dateColX + DATE_COL_W, y + rowH);
  ctx.lineTo(dateColX + CARD_RADIUS, y + rowH);
  ctx.quadraticCurveTo(dateColX, y + rowH, dateColX, y + rowH - CARD_RADIUS);
  ctx.lineTo(dateColX, y + CARD_RADIUS);
  ctx.quadraticCurveTo(dateColX, y, dateColX + CARD_RADIUS, y);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#F0DFC8";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cardX + DATE_COL_W, y);
  ctx.lineTo(cardX + DATE_COL_W, y + rowH);
  ctx.stroke();

  ctx.textAlign = "center";
  const dateCenterX = cardX + DATE_COL_W / 2;
  const dowText = dow.replace(/[()]/g, "");
  const dateColor = dowText === "日" ? "#E05050" : dowText === "土" ? "#5080D0" : "#9E7B5A";
  ctx.fillStyle = dateColor;
  ctx.font = `bold 16px ${FONT_FAMILY}`;
  ctx.fillText(mmdd, dateCenterX, y + rowH / 2 - 8);
  ctx.font = `bold 13px ${FONT_FAMILY}`;
  ctx.fillText(dow, dateCenterX, y + rowH / 2 + 12);
  ctx.textAlign = "left";

  const mealAreaX = cardX + DATE_COL_W + 10;
  let textY = y + CARD_PAD_V + LINE_H - 4;

  if (!hasData) {
    ctx.fillStyle = "#C4B0A0";
    ctx.font = `13px ${FONT_FAMILY}`;
    ctx.fillText("未設定", mealAreaX, y + rowH / 2 + 5);
  } else {
    const mealDefs = [
      { text: breakfast, label: "朝", bgColor: "#FFF3E0", textColor: "#E8A838" },
      { text: lunch,     label: "昼", bgColor: "#E8F5E9", textColor: "#4CAF50" },
      { text: dinner,    label: "夜", bgColor: "#E8EAF6", textColor: "#5C7CFA", options: dinnerOptions },
    ];

    for (const meal of mealDefs) {
      const hasOptions = meal.options && meal.options.length > 0;
      if (!meal.text && !hasOptions) continue;

      const badgeX = mealAreaX;
      const badgeY = textY - LINE_H + 3;
      const badgeH = LINE_H - 2;
      ctx.fillStyle = meal.bgColor;
      roundRect(ctx, badgeX, badgeY, MEAL_BADGE_W, badgeH, 4);
      ctx.fill();

      ctx.fillStyle = meal.textColor;
      ctx.font = `bold 11px ${FONT_FAMILY}`;
      ctx.textAlign = "center";
      ctx.fillText(meal.label, badgeX + MEAL_BADGE_W / 2, badgeY + badgeH - 4);
      ctx.textAlign = "left";

      ctx.fillStyle = "#3D2B1F";
      ctx.font = `14px ${FONT_FAMILY}`;
      if (hasOptions) {
        // 複数提案を各行に表示
        for (const optText of meal.options) {
          const lines = wrapText(ctx, optText, MEAL_TEXT_MAX_W);
          for (let li = 0; li < lines.length; li++) {
            ctx.fillText(lines[li], mealAreaX + MEAL_BADGE_W + 8, textY + li * LINE_H);
          }
          textY += lines.length * LINE_H + 2;
        }
        textY += MEAL_ROW_GAP;
      } else {
        const lines = wrapText(ctx, meal.text, MEAL_TEXT_MAX_W);
        for (let li = 0; li < lines.length; li++) {
          ctx.fillText(lines[li], mealAreaX + MEAL_BADGE_W + 8, textY + li * LINE_H);
        }
        textY += lines.length * LINE_H + MEAL_ROW_GAP;
      }
    }
  }

  y += rowH + 8;
}

const footerY = y;
ctx.fillStyle = "#FF7F50";
ctx.fillRect(0, footerY, WIDTH, FOOTER_H);

if (mascotWave) {
  const charH = 44;
  const charW = (mascotWave.width / mascotWave.height) * charH;
  ctx.drawImage(mascotWave, WIDTH - charW - 12, footerY + (FOOTER_H - charH) / 2, charW, charH);
}

ctx.textAlign = "center";
ctx.fillStyle = "rgba(255,255,255,0.9)";
ctx.font = `12px ${FONT_FAMILY}`;
ctx.fillText("ダッシュボードから詳細を確認・編集できます", WIDTH / 2, footerY + FOOTER_H / 2 + 5);

const buf = canvas.toBuffer("image/png");
fs.writeFileSync("/tmp/test_weekly_new.png", buf);
console.log("PNG saved to /tmp/test_weekly_new.png, size:", buf.length);
