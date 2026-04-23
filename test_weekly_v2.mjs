/**
 * 週間献立PNG v2 - オシャレかわいいデザイン
 * レイアウト：ヘッダー上部 + 2行×4列グリッド（月〜木 / 金〜日＋余白）
 * カラー：クリーム×テラコッタ×グリーン系（大人女性向け）
 */
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(__dirname, "server/assets/fonts");

try {
  GlobalFonts.registerFromPath(path.join(FONT_DIR, "NotoSansJP-Regular.woff2"), "NotoSansJP");
  GlobalFonts.registerFromPath(path.join(FONT_DIR, "NotoSansJP-Bold.woff2"), "NotoSansJP");
} catch (e) { console.warn("Font registration failed:", e); }

const MASCOT_COOKING_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/chara_cooking-2kPVJfknvoFLpXHRLPVvVs.png";
const MASCOT_WAVE_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/chara_wave-SJFFFGGiajefS9Vh7cqFQF.png";

// テスト用ダミーデータ（月〜日）
const testDays = [
  { date: "2026-04-20", dow: "月", dinner: "鶏ひき肉と豆腐のヘルシーハンバーグ", dinnerOptions: null },
  { date: "2026-04-21", dow: "火", dinner: "鮭のムニエル レモンバター風味", dinnerOptions: null },
  { date: "2026-04-22", dow: "水", dinner: null, dinnerOptions: ["豚こま肉の生姜焼き", "鶏むね肉の棒棒鶏", "サバの味噌煮"] },
  { date: "2026-04-23", dow: "木", dinner: "肉じゃが", dinnerOptions: null },
  { date: "2026-04-24", dow: "金", dinner: "豚バラと大根の煮物", dinnerOptions: null },
  { date: "2026-04-25", dow: "土", dinner: "鶏むね肉の唐揚げ", dinnerOptions: null },
  { date: "2026-04-26", dow: "日", dinner: null, dinnerOptions: ["鮭の塩焼き", "豚こまキャベツ炒め"] },
];

const FONT_FAMILY = "NotoSansJP, sans-serif";

// ─── カラーパレット（大人女性向け：テラコッタ×クリーム×セージグリーン）───
const COLORS = {
  bg: "#FDF6F0",           // クリームホワイト背景
  bgDot: "#F5E6D8",        // ドット装飾色
  header: "#C4714A",       // テラコッタ（ヘッダー）
  headerLight: "#D4895E",  // テラコッタライト
  headerText: "#FFFFFF",
  cardBg: "#FFFFFF",
  cardBgEmpty: "#FAF5F0",
  cardBorder: "#EDD9C8",
  cardBorderWeekend: "#D4B8A0",
  dowBg: "#C4714A",        // 平日曜日バッジ
  dowBgSat: "#7B9E87",     // 土曜：セージグリーン
  dowBgSun: "#B85C5C",     // 日曜：ローズ
  dowText: "#FFFFFF",
  dateText: "#8B6347",
  dishText: "#3D2B1F",
  dishTextLight: "#A08070",
  accent: "#C4714A",
  accentGreen: "#7B9E87",
  tagBg: "#F5EDE4",
  tagText: "#C4714A",
  optionNum: "#C4714A",
  optionNumBg: "#F5EDE4",
  divider: "#EDD9C8",
  footerBg: "#C4714A",
  footerText: "#FFFFFF",
};

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

// 細い装飾ライン（水平）
function drawDottedLine(ctx, x1, y1, x2, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y1);
  ctx.stroke();
  ctx.setLineDash([]);
}

// 小さな菱形装飾
function drawDiamond(ctx, cx, cy, size, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - size);
  ctx.lineTo(cx + size, cy);
  ctx.lineTo(cx, cy + size);
  ctx.lineTo(cx - size, cy);
  ctx.closePath();
  ctx.fill();
}

// 小花（シンプル）
function drawSimpleFlower(ctx, cx, cy, r, petalColor, centerColor) {
  ctx.fillStyle = petalColor;
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(angle) * r * 0.9, cy + Math.sin(angle) * r * 0.9, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = centerColor;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
  ctx.fill();
}

async function generate() {
  let mascotCooking = null;
  let mascotWave = null;
  try { mascotCooking = await loadImage(MASCOT_COOKING_URL); } catch (e) {}
  try { mascotWave = await loadImage(MASCOT_WAVE_URL); } catch (e) {}

  // ─── レイアウト定数 ───────────────────────────────────────────────────────
  // 全体サイズ：縦横比 約4:3 (800×620)
  const WIDTH = 900;
  const OUTER_PAD = 18;
  const HEADER_H = 120;
  const FOOTER_H = 44;
  const CARD_GAP = 10;
  const CARD_RADIUS = 12;
  const COLS = 4;
  const ROWS = 2;
  const CARD_W = Math.floor((WIDTH - OUTER_PAD * 2 - CARD_GAP * (COLS - 1)) / COLS);

  // カード内レイアウト
  const DOW_AREA_H = 56;   // 曜日エリアの高さ
  const CONTENT_PAD = 12;
  const LINE_H = 20;

  // テキスト幅計算用
  const tempCanvas = createCanvas(CARD_W, 100);
  const tempCtx = tempCanvas.getContext("2d");
  tempCtx.font = `13px ${FONT_FAMILY}`;
  const TEXT_MAX_W = CARD_W - CONTENT_PAD * 2;

  // 各カードの必要高さを計算
  const cardHeights = testDays.map(day => {
    let textLines = 0;
    if (day.dinnerOptions && day.dinnerOptions.length > 0) {
      for (const opt of day.dinnerOptions) {
        textLines += Math.max(1, wrapText(tempCtx, opt, TEXT_MAX_W - 18).length);
      }
      textLines += (day.dinnerOptions.length - 1) * 0.3; // 間隔
    } else if (day.dinner) {
      textLines = Math.max(1, wrapText(tempCtx, day.dinner, TEXT_MAX_W).length);
    } else {
      textLines = 1;
    }
    return DOW_AREA_H + CONTENT_PAD * 2 + Math.ceil(textLines) * LINE_H + 16;
  });
  const MAX_CARD_H = Math.max(...cardHeights, 160);

  const GRID_H = ROWS * MAX_CARD_H + (ROWS - 1) * CARD_GAP;
  const HEIGHT = HEADER_H + OUTER_PAD + GRID_H + OUTER_PAD + FOOTER_H;

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  // ─── 背景 ───────────────────────────────────────────────────────────────
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // 背景装飾：薄いドット
  ctx.fillStyle = COLORS.bgDot;
  for (let dx = 24; dx < WIDTH; dx += 36) {
    for (let dy = HEADER_H + 8; dy < HEIGHT - FOOTER_H; dy += 36) {
      ctx.beginPath();
      ctx.arc(dx, dy, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ─── ヘッダー ─────────────────────────────────────────────────────────────
  // ヘッダー背景（角丸なし）
  ctx.fillStyle = COLORS.header;
  ctx.fillRect(0, 0, WIDTH, HEADER_H);

  // ヘッダー下部の波形装飾
  ctx.fillStyle = COLORS.headerLight;
  ctx.beginPath();
  ctx.moveTo(0, HEADER_H - 14);
  for (let wx = 0; wx <= WIDTH + 30; wx += 30) {
    ctx.quadraticCurveTo(wx + 15, HEADER_H - 24, wx + 30, HEADER_H - 14);
  }
  ctx.lineTo(WIDTH, HEADER_H);
  ctx.lineTo(0, HEADER_H);
  ctx.closePath();
  ctx.fill();

  // ヘッダー装飾：小花（左右）
  drawSimpleFlower(ctx, 80, 30, 10, "rgba(255,255,255,0.2)", "rgba(255,220,180,0.35)");
  drawSimpleFlower(ctx, 120, 70, 7, "rgba(255,255,255,0.15)", "rgba(255,220,180,0.25)");
  drawSimpleFlower(ctx, WIDTH - 80, 30, 10, "rgba(255,255,255,0.2)", "rgba(255,220,180,0.35)");
  drawSimpleFlower(ctx, WIDTH - 120, 70, 7, "rgba(255,255,255,0.15)", "rgba(255,220,180,0.25)");

  // 菱形装飾
  drawDiamond(ctx, 50, 55, 4, "rgba(255,255,255,0.25)");
  drawDiamond(ctx, WIDTH - 50, 55, 4, "rgba(255,255,255,0.25)");
  drawDiamond(ctx, WIDTH / 2 - 160, 95, 3, "rgba(255,255,255,0.2)");
  drawDiamond(ctx, WIDTH / 2 + 160, 95, 3, "rgba(255,255,255,0.2)");

  // キャラクター（料理中）→ 右端
  if (mascotCooking) {
    const charH = 108;
    const charW = (mascotCooking.width / mascotCooking.height) * charH;
    // スムーズスケーリングのため imageSmoothingEnabled を true に
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(mascotCooking, WIDTH - charW - 16, HEADER_H - charH, charW, charH);
  }

  // キャラクター（手を振る）→ 左端
  if (mascotWave) {
    const charH = 96;
    const charW = (mascotWave.width / mascotWave.height) * charH;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(mascotWave, 16, HEADER_H - charH, charW, charH);
  }

  // タイトル
  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.headerText;
  ctx.font = `bold 30px ${FONT_FAMILY}`;
  ctx.fillText("今週の献立", WIDTH / 2, 44);

  ctx.font = `13px ${FONT_FAMILY}`;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText("献立日和〜coto coto〜", WIDTH / 2, 68);

  // 週の日付範囲
  const weekStart = "4/20";
  const weekEnd = "4/26";
  ctx.font = `11px ${FONT_FAMILY}`;
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.fillText(`${weekStart} 〜 ${weekEnd}`, WIDTH / 2, 88);

  ctx.textAlign = "left";

  // ─── カードグリッド（2行×4列）────────────────────────────────────────────
  // 月〜木（1行目）、金〜日（2行目）
  const row1 = testDays.slice(0, 4); // 月〜木
  const row2 = testDays.slice(4, 7); // 金〜日

  function drawCard(day, colIdx, rowIdx) {
    const cardX = OUTER_PAD + colIdx * (CARD_W + CARD_GAP);
    const cardY = HEADER_H + OUTER_PAD + rowIdx * (MAX_CARD_H + CARD_GAP);
    const cardH = MAX_CARD_H;

    const isSat = day.dow === "土";
    const isSun = day.dow === "日";
    const hasData = day.dinner || (day.dinnerOptions && day.dinnerOptions.length > 0);

    // カード影
    ctx.shadowColor = "rgba(0,0,0,0.08)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = hasData ? COLORS.cardBg : COLORS.cardBgEmpty;
    roundRect(ctx, cardX, cardY, CARD_W, cardH, CARD_RADIUS);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // カード枠線
    ctx.strokeStyle = isSat || isSun ? COLORS.cardBorderWeekend : COLORS.cardBorder;
    ctx.lineWidth = 1;
    roundRect(ctx, cardX, cardY, CARD_W, cardH, CARD_RADIUS);
    ctx.stroke();

    // 曜日エリア（上部カラー帯）
    const dowBgColor = isSun ? COLORS.dowBgSun : isSat ? COLORS.dowBgSat : COLORS.dowBg;
    ctx.fillStyle = dowBgColor;
    ctx.beginPath();
    ctx.moveTo(cardX + CARD_RADIUS, cardY);
    ctx.lineTo(cardX + CARD_W - CARD_RADIUS, cardY);
    ctx.quadraticCurveTo(cardX + CARD_W, cardY, cardX + CARD_W, cardY + CARD_RADIUS);
    ctx.lineTo(cardX + CARD_W, cardY + DOW_AREA_H);
    ctx.lineTo(cardX, cardY + DOW_AREA_H);
    ctx.lineTo(cardX, cardY + CARD_RADIUS);
    ctx.quadraticCurveTo(cardX, cardY, cardX + CARD_RADIUS, cardY);
    ctx.closePath();
    ctx.fill();

    // 曜日テキスト（大きく中央）
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.dowText;
    ctx.font = `bold 26px ${FONT_FAMILY}`;
    ctx.fillText(day.dow, cardX + CARD_W / 2, cardY + 32);

    // 日付（小さく下）
    const dateStr = day.date;
    const d = new Date(dateStr + "T00:00:00+09:00");
    const mmdd = `${d.getMonth() + 1}/${d.getDate()}`;
    ctx.font = `10px ${FONT_FAMILY}`;
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.fillText(mmdd, cardX + CARD_W / 2, cardY + 48);

    ctx.textAlign = "left";

    // 区切り線（ドット）
    drawDottedLine(ctx, cardX + CONTENT_PAD, cardY + DOW_AREA_H + 10, cardX + CARD_W - CONTENT_PAD, COLORS.divider);

    // 夜の主菜テキスト
    let textY = cardY + DOW_AREA_H + CONTENT_PAD + LINE_H;

    if (!hasData) {
      ctx.fillStyle = COLORS.dishTextLight;
      ctx.font = `12px ${FONT_FAMILY}`;
      ctx.textAlign = "center";
      ctx.fillText("未設定", cardX + CARD_W / 2, textY);
      ctx.textAlign = "left";
    } else if (day.dinnerOptions && day.dinnerOptions.length > 0) {
      for (let oi = 0; oi < day.dinnerOptions.length; oi++) {
        const opt = day.dinnerOptions[oi];

        // 番号バッジ（小さな丸）
        const badgeCX = cardX + CONTENT_PAD + 7;
        const badgeCY = textY - 5;
        ctx.fillStyle = COLORS.optionNumBg;
        ctx.beginPath();
        ctx.arc(badgeCX, badgeCY, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = COLORS.optionNum;
        ctx.font = `bold 9px ${FONT_FAMILY}`;
        ctx.textAlign = "center";
        ctx.fillText(String(oi + 1), badgeCX, badgeCY + 3);
        ctx.textAlign = "left";

        // 料理名
        ctx.fillStyle = COLORS.dishText;
        ctx.font = `12px ${FONT_FAMILY}`;
        const lines = wrapText(ctx, opt, TEXT_MAX_W - 18);
        for (let li = 0; li < lines.length; li++) {
          ctx.fillText(lines[li], cardX + CONTENT_PAD + 18, textY + li * LINE_H);
        }
        textY += lines.length * LINE_H + 5;
      }
    } else {
      // 単一料理（中央揃え）
      ctx.fillStyle = COLORS.dishText;
      ctx.font = `13px ${FONT_FAMILY}`;
      const lines = wrapText(ctx, day.dinner, TEXT_MAX_W);
      ctx.textAlign = "center";
      for (let li = 0; li < lines.length; li++) {
        ctx.fillText(lines[li], cardX + CARD_W / 2, textY + li * LINE_H);
      }
      ctx.textAlign = "left";
    }
  }

  // 1行目：月〜木
  for (let i = 0; i < row1.length; i++) {
    drawCard(row1[i], i, 0);
  }

  // 2行目：金〜日（3枚）＋ 右端にキャッチコピーカード
  for (let i = 0; i < row2.length; i++) {
    drawCard(row2[i], i, 1);
  }

  // 2行目右端：キャッチコピーカード
  {
    const colIdx = 3;
    const rowIdx = 1;
    const cardX = OUTER_PAD + colIdx * (CARD_W + CARD_GAP);
    const cardY = HEADER_H + OUTER_PAD + rowIdx * (MAX_CARD_H + CARD_GAP);
    const cardH = MAX_CARD_H;

    // カード背景（テラコッタ）
    ctx.shadowColor = "rgba(0,0,0,0.08)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = COLORS.header;
    roundRect(ctx, cardX, cardY, CARD_W, cardH, CARD_RADIUS);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // 装飾：小花
    drawSimpleFlower(ctx, cardX + CARD_W / 2, cardY + 28, 12, "rgba(255,255,255,0.2)", "rgba(255,220,180,0.3)");
    drawSimpleFlower(ctx, cardX + 20, cardY + cardH - 30, 7, "rgba(255,255,255,0.15)", "rgba(255,220,180,0.2)");
    drawSimpleFlower(ctx, cardX + CARD_W - 20, cardY + cardH - 30, 7, "rgba(255,255,255,0.15)", "rgba(255,220,180,0.2)");

    // キャッチコピー
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = `bold 14px ${FONT_FAMILY}`;
    ctx.fillText("今週も", cardX + CARD_W / 2, cardY + cardH / 2 - 14);
    ctx.fillText("美味しい食卓を", cardX + CARD_W / 2, cardY + cardH / 2 + 6);

    ctx.font = `10px ${FONT_FAMILY}`;
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.fillText("献立日和", cardX + CARD_W / 2, cardY + cardH / 2 + 26);

    // 菱形装飾
    drawDiamond(ctx, cardX + CARD_W / 2, cardY + cardH - 16, 4, "rgba(255,255,255,0.3)");

    ctx.textAlign = "left";
  }

  // PNG保存
  const pngBuffer = canvas.toBuffer("image/png");
  fs.writeFileSync("/tmp/test_weekly_v2.png", pngBuffer);
  console.log(`PNG saved: /tmp/test_weekly_v2.png (${pngBuffer.length} bytes), size: ${WIDTH}x${HEIGHT}`);
}

generate().catch(console.error);
