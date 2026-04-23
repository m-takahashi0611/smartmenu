/**
 * 週間献立PNG v3
 * - 曜日エリアをヘッダーと別色に
 * - キャラクターを大きく・高品質
 * - 曜日大きく・日付小さく
 * - 土：水色系、日：ピンク系
 * - M PLUS Rounded 1c（丸ゴシック）フォント
 * - チートデイバッジ（金曜）
 * - アイコン説明を下部に追加
 */
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(__dirname, "server/assets/fonts");

// M PLUS Rounded 1c（丸ゴシック）を優先登録
try {
  GlobalFonts.registerFromPath(path.join(FONT_DIR, "MPLUSRounded1c-Regular.ttf"), "Rounded");
  GlobalFonts.registerFromPath(path.join(FONT_DIR, "MPLUSRounded1c-Bold.ttf"), "Rounded");
  console.log("Rounded font registered");
} catch (e) { console.warn("Rounded font failed:", e.message); }

try {
  GlobalFonts.registerFromPath(path.join(FONT_DIR, "NotoSansJP-Regular.ttf"), "NotoSansJP");
  GlobalFonts.registerFromPath(path.join(FONT_DIR, "NotoSansJP-Bold.ttf"), "NotoSansJP");
} catch (e) {}

const FONT_FAMILY = "Rounded, NotoSansJP, sans-serif";

const MASCOT_COOKING_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/chara_cooking-2kPVJfknvoFLpXHRLPVvVs.png";
const MASCOT_WAVE_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/chara_wave-SJFFFGGiajefS9Vh7cqFQF.png";

// テスト用ダミーデータ（月〜日）
const testDays = [
  { date: "2026-04-20", dow: "月", dinner: "鶏ひき肉と豆腐のヘルシーハンバーグ", dinnerOptions: null, special: null },
  { date: "2026-04-21", dow: "火", dinner: "鮭のムニエル レモンバター風味", dinnerOptions: null, special: null },
  { date: "2026-04-22", dow: "水", dinner: null, dinnerOptions: ["豚こま肉の生姜焼き", "鶏むね肉の棒棒鶏", "サバの味噌煮"], special: null },
  { date: "2026-04-23", dow: "木", dinner: "肉じゃが", dinnerOptions: null, special: null },
  { date: "2026-04-24", dow: "金", dinner: "好きなものを食べる日！", dinnerOptions: null, special: "cheat" },
  { date: "2026-04-25", dow: "土", dinner: "鶏むね肉の唐揚げ", dinnerOptions: null, special: null },
  { date: "2026-04-26", dow: "日", dinner: null, dinnerOptions: ["鮭の塩焼き", "豚こまキャベツ炒め"], special: null },
];

// ─── カラーパレット ───────────────────────────────────────────────────────
const C = {
  bg: "#FDF8F3",
  bgDot: "#F0E4D4",
  // ヘッダー
  headerFrom: "#D4785A",
  headerTo: "#E8956E",
  headerText: "#FFFFFF",
  // カード
  cardBg: "#FFFFFF",
  cardBgEmpty: "#FAF5F0",
  cardBorder: "#EDD9C8",
  cardBorderWeekend: "#D4B8A0",
  // 曜日エリア（ヘッダーと区別）
  dowBg: "#F5E6D8",        // 平日：クリームオレンジ
  dowText: "#C4714A",      // 平日曜日テキスト：テラコッタ
  dowBgSat: "#D8EBF0",     // 土：水色系
  dowTextSat: "#4A8FA0",   // 土テキスト
  dowBgSun: "#F5D8D8",     // 日：ピンク系
  dowTextSun: "#B85C5C",   // 日テキスト
  dateText: "#A08070",
  dishText: "#3D2B1F",
  dishTextLight: "#B0A090",
  divider: "#EDD9C8",
  // チートデイ
  cheatBg: "#FFF3D0",
  cheatBorder: "#F0C040",
  cheatText: "#D4900A",
  cheatBadgeBg: "#F5C518",
  cheatBadgeText: "#FFFFFF",
  // オプション番号
  optNumBg: "#F5EDE4",
  optNumText: "#C4714A",
  // フッター（説明エリア）
  legendBg: "#FDF0E6",
  legendText: "#8B6347",
  legendBorder: "#EDD9C8",
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

function drawSimpleFlower(ctx, cx, cy, r, petalColor, centerColor) {
  ctx.fillStyle = petalColor;
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(angle) * r * 0.85, cy + Math.sin(angle) * r * 0.85, r * 0.48, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = centerColor;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
}

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

async function generate() {
  let mascotCooking = null;
  let mascotWave = null;
  try { mascotCooking = await loadImage(MASCOT_COOKING_URL); console.log("cooking loaded"); } catch (e) { console.warn(e.message); }
  try { mascotWave = await loadImage(MASCOT_WAVE_URL); console.log("wave loaded"); } catch (e) { console.warn(e.message); }

  // ─── レイアウト定数 ───────────────────────────────────────────────────────
  const WIDTH = 920;
  const OUTER_PAD = 16;
  const HEADER_H = 130;
  const LEGEND_H = 54;   // アイコン説明エリア
  const CARD_GAP = 10;
  const CARD_RADIUS = 14;
  const COLS = 4;
  const ROWS = 2;
  const CARD_W = Math.floor((WIDTH - OUTER_PAD * 2 - CARD_GAP * (COLS - 1)) / COLS);

  const DOW_AREA_H = 64;
  const CONTENT_PAD = 12;
  const LINE_H = 21;

  const tempCanvas = createCanvas(CARD_W, 100);
  const tempCtx = tempCanvas.getContext("2d");
  tempCtx.font = `13px ${FONT_FAMILY}`;
  const TEXT_MAX_W = CARD_W - CONTENT_PAD * 2;

  const cardHeights = testDays.map(day => {
    let textLines = 0;
    if (day.dinnerOptions && day.dinnerOptions.length > 0) {
      for (const opt of day.dinnerOptions) {
        textLines += Math.max(1, wrapText(tempCtx, opt, TEXT_MAX_W - 20).length);
      }
      textLines += (day.dinnerOptions.length - 1) * 0.3;
    } else if (day.dinner) {
      textLines = Math.max(1, wrapText(tempCtx, day.dinner, TEXT_MAX_W).length);
    } else {
      textLines = 1;
    }
    return DOW_AREA_H + CONTENT_PAD * 2 + Math.ceil(textLines) * LINE_H + 20;
  });
  const MAX_CARD_H = Math.max(...cardHeights, 170);

  const GRID_H = ROWS * MAX_CARD_H + (ROWS - 1) * CARD_GAP;
  const HEIGHT = HEADER_H + OUTER_PAD + GRID_H + OUTER_PAD + LEGEND_H;

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  // ─── 背景 ───────────────────────────────────────────────────────────────
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // 背景ドット
  ctx.fillStyle = C.bgDot;
  for (let dx = 22; dx < WIDTH; dx += 34) {
    for (let dy = HEADER_H + 6; dy < HEIGHT - LEGEND_H; dy += 34) {
      ctx.beginPath();
      ctx.arc(dx, dy, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ─── ヘッダー ─────────────────────────────────────────────────────────────
  const hGrad = ctx.createLinearGradient(0, 0, WIDTH, HEADER_H);
  hGrad.addColorStop(0, C.headerFrom);
  hGrad.addColorStop(1, C.headerTo);
  ctx.fillStyle = hGrad;
  ctx.fillRect(0, 0, WIDTH, HEADER_H);

  // ヘッダー下部の波形
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.moveTo(0, HEADER_H);
  for (let wx = 0; wx <= WIDTH + 32; wx += 32) {
    ctx.quadraticCurveTo(wx + 16, HEADER_H - 10, wx + 32, HEADER_H);
  }
  ctx.lineTo(WIDTH, 0);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();

  // ヘッダー装飾
  drawSimpleFlower(ctx, 100, 28, 10, "rgba(255,255,255,0.22)", "rgba(255,220,180,0.35)");
  drawSimpleFlower(ctx, 140, 72, 7, "rgba(255,255,255,0.16)", "rgba(255,220,180,0.25)");
  drawSimpleFlower(ctx, WIDTH - 100, 28, 10, "rgba(255,255,255,0.22)", "rgba(255,220,180,0.35)");
  drawSimpleFlower(ctx, WIDTH - 140, 72, 7, "rgba(255,255,255,0.16)", "rgba(255,220,180,0.25)");
  drawDiamond(ctx, 60, 60, 4, "rgba(255,255,255,0.28)");
  drawDiamond(ctx, WIDTH - 60, 60, 4, "rgba(255,255,255,0.28)");
  drawDiamond(ctx, WIDTH / 2 - 170, 100, 3, "rgba(255,255,255,0.2)");
  drawDiamond(ctx, WIDTH / 2 + 170, 100, 3, "rgba(255,255,255,0.2)");

  // キャラクター（波）→ 左端（大きく）
  if (mascotWave) {
    const charH = 118;
    const charW = (mascotWave.width / mascotWave.height) * charH;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(mascotWave, 14, HEADER_H - charH, charW, charH);
  }

  // キャラクター（料理）→ 右端（大きく）
  if (mascotCooking) {
    const charH = 118;
    const charW = (mascotCooking.width / mascotCooking.height) * charH;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(mascotCooking, WIDTH - charW - 14, HEADER_H - charH, charW, charH);
  }

  // タイトル
  ctx.textAlign = "center";
  ctx.fillStyle = C.headerText;
  ctx.font = `bold 32px ${FONT_FAMILY}`;
  ctx.fillText("今週の献立", WIDTH / 2, 46);

  ctx.font = `14px ${FONT_FAMILY}`;
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fillText("献立日和〜coto coto〜", WIDTH / 2, 72);

  ctx.font = `11px ${FONT_FAMILY}`;
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.fillText("4/20 〜 4/26", WIDTH / 2, 92);

  ctx.textAlign = "left";

  // ─── カードグリッド ────────────────────────────────────────────────────────
  const row1 = testDays.slice(0, 4); // 月〜木
  const row2 = testDays.slice(4, 7); // 金〜日

  function drawCard(day, colIdx, rowIdx) {
    const cardX = OUTER_PAD + colIdx * (CARD_W + CARD_GAP);
    const cardY = HEADER_H + OUTER_PAD + rowIdx * (MAX_CARD_H + CARD_GAP);
    const cardH = MAX_CARD_H;

    const isSat = day.dow === "土";
    const isSun = day.dow === "日";
    const isCheat = day.special === "cheat";
    const hasData = day.dinner || (day.dinnerOptions && day.dinnerOptions.length > 0);

    // カード影
    ctx.shadowColor = "rgba(0,0,0,0.09)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;

    // カード背景（チートデイは特別色）
    if (isCheat) {
      ctx.fillStyle = C.cheatBg;
    } else {
      ctx.fillStyle = hasData ? C.cardBg : C.cardBgEmpty;
    }
    roundRect(ctx, cardX, cardY, CARD_W, cardH, CARD_RADIUS);
    ctx.fill();

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // カード枠線
    if (isCheat) {
      ctx.strokeStyle = C.cheatBorder;
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = isSat || isSun ? C.cardBorderWeekend : C.cardBorder;
      ctx.lineWidth = 1;
    }
    roundRect(ctx, cardX, cardY, CARD_W, cardH, CARD_RADIUS);
    ctx.stroke();

    // 曜日エリア（上部カラー帯）
    let dowBg, dowTxt;
    if (isSun) { dowBg = C.dowBgSun; dowTxt = C.dowTextSun; }
    else if (isSat) { dowBg = C.dowBgSat; dowTxt = C.dowTextSat; }
    else if (isCheat) { dowBg = C.cheatBg; dowTxt = C.cheatText; }
    else { dowBg = C.dowBg; dowTxt = C.dowText; }

    ctx.fillStyle = dowBg;
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

    // 曜日エリアと本文の区切り線
    ctx.strokeStyle = isCheat ? C.cheatBorder : (isSat || isSun ? C.cardBorderWeekend : C.cardBorder);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cardX, cardY + DOW_AREA_H);
    ctx.lineTo(cardX + CARD_W, cardY + DOW_AREA_H);
    ctx.stroke();

    // チートデイバッジ（右上角）
    if (isCheat) {
      const badgeW = 52;
      const badgeH = 20;
      const bx = cardX + CARD_W - badgeW - 6;
      const by = cardY + 6;
      ctx.fillStyle = C.cheatBadgeBg;
      roundRect(ctx, bx, by, badgeW, badgeH, 6);
      ctx.fill();
      ctx.fillStyle = C.cheatBadgeText;
      ctx.font = `bold 9px ${FONT_FAMILY}`;
      ctx.textAlign = "center";
      ctx.fillText("🍕 チートデイ", bx + badgeW / 2, by + 13);
      ctx.textAlign = "left";
    }

    // 曜日テキスト（大きく）
    ctx.textAlign = "center";
    ctx.fillStyle = dowTxt;
    ctx.font = `bold 30px ${FONT_FAMILY}`;
    ctx.fillText(day.dow, cardX + CARD_W / 2, cardY + 36);

    // 日付（小さく・薄く）
    const d = new Date(day.date + "T00:00:00+09:00");
    const mmdd = `${d.getMonth() + 1}/${d.getDate()}`;
    ctx.font = `10px ${FONT_FAMILY}`;
    ctx.fillStyle = isCheat ? C.cheatText : (isSat ? C.dowTextSat : isSun ? C.dowTextSun : C.dateText);
    ctx.globalAlpha = 0.7;
    ctx.fillText(mmdd, cardX + CARD_W / 2, cardY + 54);
    ctx.globalAlpha = 1.0;

    ctx.textAlign = "left";

    // 本文エリア
    let textY = cardY + DOW_AREA_H + CONTENT_PAD + LINE_H;

    if (!hasData) {
      ctx.fillStyle = C.dishTextLight;
      ctx.font = `12px ${FONT_FAMILY}`;
      ctx.textAlign = "center";
      ctx.fillText("未設定", cardX + CARD_W / 2, textY);
      ctx.textAlign = "left";
    } else if (day.dinnerOptions && day.dinnerOptions.length > 0) {
      for (let oi = 0; oi < day.dinnerOptions.length; oi++) {
        const opt = day.dinnerOptions[oi];
        // 番号バッジ
        const badgeCX = cardX + CONTENT_PAD + 8;
        const badgeCY = textY - 6;
        ctx.fillStyle = C.optNumBg;
        ctx.beginPath();
        ctx.arc(badgeCX, badgeCY, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.optNumText;
        ctx.font = `bold 9px ${FONT_FAMILY}`;
        ctx.textAlign = "center";
        ctx.fillText(String(oi + 1), badgeCX, badgeCY + 3);
        ctx.textAlign = "left";

        ctx.fillStyle = C.dishText;
        ctx.font = `12px ${FONT_FAMILY}`;
        const lines = wrapText(ctx, opt, TEXT_MAX_W - 22);
        for (let li = 0; li < lines.length; li++) {
          ctx.fillText(lines[li], cardX + CONTENT_PAD + 20, textY + li * LINE_H);
        }
        textY += lines.length * LINE_H + 6;
      }
    } else {
      ctx.fillStyle = isCheat ? C.cheatText : C.dishText;
      ctx.font = isCheat ? `bold 13px ${FONT_FAMILY}` : `13px ${FONT_FAMILY}`;
      const lines = wrapText(ctx, day.dinner, TEXT_MAX_W);
      ctx.textAlign = "center";
      for (let li = 0; li < lines.length; li++) {
        ctx.fillText(lines[li], cardX + CARD_W / 2, textY + li * LINE_H);
      }
      ctx.textAlign = "left";
    }
  }

  // 1行目：月〜木
  for (let i = 0; i < row1.length; i++) drawCard(row1[i], i, 0);

  // 2行目：金〜日（3枚）＋ キャッチコピーカード
  for (let i = 0; i < row2.length; i++) drawCard(row2[i], i, 1);

  // キャッチコピーカード（右下）
  {
    const colIdx = 3;
    const rowIdx = 1;
    const cardX = OUTER_PAD + colIdx * (CARD_W + CARD_GAP);
    const cardY = HEADER_H + OUTER_PAD + rowIdx * (MAX_CARD_H + CARD_GAP);
    const cardH = MAX_CARD_H;

    ctx.shadowColor = "rgba(0,0,0,0.09)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    const cGrad = ctx.createLinearGradient(cardX, cardY, cardX + CARD_W, cardY + cardH);
    cGrad.addColorStop(0, C.headerFrom);
    cGrad.addColorStop(1, C.headerTo);
    ctx.fillStyle = cGrad;
    roundRect(ctx, cardX, cardY, CARD_W, cardH, CARD_RADIUS);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    drawSimpleFlower(ctx, cardX + CARD_W / 2, cardY + 30, 13, "rgba(255,255,255,0.2)", "rgba(255,220,180,0.3)");
    drawSimpleFlower(ctx, cardX + 22, cardY + cardH - 28, 7, "rgba(255,255,255,0.15)", "rgba(255,220,180,0.2)");
    drawSimpleFlower(ctx, cardX + CARD_W - 22, cardY + cardH - 28, 7, "rgba(255,255,255,0.15)", "rgba(255,220,180,0.2)");
    drawDiamond(ctx, cardX + CARD_W / 2, cardY + cardH - 16, 4, "rgba(255,255,255,0.3)");

    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = `bold 15px ${FONT_FAMILY}`;
    ctx.fillText("今週も", cardX + CARD_W / 2, cardY + cardH / 2 - 12);
    ctx.fillText("美味しい食卓を", cardX + CARD_W / 2, cardY + cardH / 2 + 10);
    ctx.font = `10px ${FONT_FAMILY}`;
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.fillText("献立日和", cardX + CARD_W / 2, cardY + cardH / 2 + 28);
    ctx.textAlign = "left";
  }

  // ─── アイコン説明エリア（下部）────────────────────────────────────────────
  const legendY = HEADER_H + OUTER_PAD + GRID_H + OUTER_PAD;

  ctx.fillStyle = C.legendBg;
  ctx.fillRect(0, legendY, WIDTH, LEGEND_H);

  // 上部区切り線
  ctx.strokeStyle = C.legendBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, legendY);
  ctx.lineTo(WIDTH, legendY);
  ctx.stroke();

  // アイコン説明テキスト
  const legends = [
    { icon: "🎉", label: "特別な日（誕生日・記念日など）" },
    { icon: "🍕", label: "チートデイ（好きなもの食べる日）" },
    { icon: "✨", label: "ご褒美デー" },
  ];

  const legendItemW = WIDTH / legends.length;
  ctx.font = `11px ${FONT_FAMILY}`;
  ctx.textAlign = "center";

  for (let li = 0; li < legends.length; li++) {
    const lx = legendItemW * li + legendItemW / 2;
    const ly = legendY + LEGEND_H / 2;
    ctx.fillStyle = C.legendText;
    ctx.fillText(`${legends[li].icon}  ${legends[li].label}`, lx, ly + 4);

    // 区切り縦線（最後以外）
    if (li < legends.length - 1) {
      ctx.strokeStyle = C.legendBorder;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(legendItemW * (li + 1), legendY + 10);
      ctx.lineTo(legendItemW * (li + 1), legendY + LEGEND_H - 10);
      ctx.stroke();
    }
  }

  ctx.textAlign = "left";

  // PNG保存
  const pngBuffer = canvas.toBuffer("image/png");
  fs.writeFileSync("/tmp/test_weekly_v3.png", pngBuffer);
  console.log(`PNG saved: /tmp/test_weekly_v3.png (${pngBuffer.length} bytes), size: ${WIDTH}x${HEIGHT}`);
}

generate().catch(console.error);
