/**
 * 週間献立PNG v4
 * - カード：左に曜日（大）＋日付（小）、右に料理名
 * - キャラクターをグリッドにはみ出して大きく配置
 * - チートデイ：ゴールドグラデーション＋リボン装飾
 * - 下部注釈廃止→右下に凡例ボックスをオーバーレイ
 */
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(__dirname, "server/assets/fonts");

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

const testDays = [
  { date: "2026-04-20", dow: "月", dinner: "鶏ひき肉と豆腐のヘルシーハンバーグ", dinnerOptions: null, special: null },
  { date: "2026-04-21", dow: "火", dinner: "鮭のムニエル レモンバター風味", dinnerOptions: null, special: null },
  { date: "2026-04-22", dow: "水", dinner: null, dinnerOptions: ["豚こま肉の生姜焼き", "鶏むね肉の棒棒鶏", "サバの味噌煮"], special: null },
  { date: "2026-04-23", dow: "木", dinner: "肉じゃが", dinnerOptions: null, special: null },
  { date: "2026-04-24", dow: "金", dinner: "好きなものを食べる日！", dinnerOptions: null, special: "cheat" },
  { date: "2026-04-25", dow: "土", dinner: "鶏むね肉の唐揚げ", dinnerOptions: null, special: null },
  { date: "2026-04-26", dow: "日", dinner: null, dinnerOptions: ["鮭の塩焼き", "豚こまキャベツ炒め"], special: null },
];

// カラーパレット
const C = {
  bg: "#FDF8F3",
  bgDot: "#EDD9C8",
  // ヘッダー
  hdrFrom: "#C4714A",
  hdrTo: "#E8956E",
  hdrText: "#FFFFFF",
  // カード
  cardBg: "#FFFFFF",
  cardBorder: "#EDD9C8",
  // 曜日エリア（左帯）
  dowWeekday: "#F5EDE4",   // 平日
  dowWeekdayText: "#C4714A",
  dowSat: "#E0EEF5",       // 土
  dowSatText: "#4A8FA0",
  dowSun: "#F5E0E0",       // 日
  dowSunText: "#B85C5C",
  dateText: "#B0A090",
  // 料理名
  dishText: "#3D2B1F",
  dishLight: "#B0A090",
  // 複数提案番号
  numBg: "#F5EDE4",
  numText: "#C4714A",
  // チートデイ
  cheatFrom: "#FFF0B0",
  cheatTo: "#FFE070",
  cheatText: "#A07800",
  cheatAccent: "#F5C518",
  // 仕切り
  divider: "#EDD9C8",
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

function drawDot(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

async function generate() {
  let imgCooking = null, imgWave = null;
  try { imgCooking = await loadImage(MASCOT_COOKING_URL); } catch (e) {}
  try { imgWave = await loadImage(MASCOT_WAVE_URL); } catch (e) {}

  // ─── レイアウト定数 ───────────────────────────────────────────────────────
  const WIDTH = 920;
  const PAD = 16;
  const HEADER_H = 110;
  const CARD_GAP = 10;
  const CARD_R = 14;
  const COLS = 4;
  const ROWS = 2;
  const CARD_W = Math.floor((WIDTH - PAD * 2 - CARD_GAP * (COLS - 1)) / COLS);

  // カード内レイアウト
  const DOW_W = 52;        // 左の曜日帯の幅
  const CONTENT_PAD = 10;
  const LINE_H = 20;
  const DISH_MAX_W = CARD_W - DOW_W - CONTENT_PAD * 2;

  // カード高さ計算
  const tempC = createCanvas(CARD_W, 100);
  const tempCtx = tempC.getContext("2d");
  tempCtx.font = `12px ${FONT}`;

  const cardHeights = testDays.map(day => {
    let lines = 0;
    if (day.dinnerOptions?.length) {
      for (const o of day.dinnerOptions) lines += Math.max(1, wrapText(tempCtx, o, DISH_MAX_W - 18).length);
      lines += (day.dinnerOptions.length - 1) * 0.4;
    } else if (day.dinner) {
      lines = Math.max(1, wrapText(tempCtx, day.dinner, DISH_MAX_W).length);
    } else {
      lines = 1;
    }
    return CONTENT_PAD * 2 + Math.ceil(lines) * LINE_H + 20;
  });
  const MAX_CARD_H = Math.max(...cardHeights, 110);

  const GRID_H = ROWS * MAX_CARD_H + (ROWS - 1) * CARD_GAP;
  const HEIGHT = HEADER_H + PAD + GRID_H + PAD;

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  // ─── 背景 ───────────────────────────────────────────────────────────────
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // 背景ドット（薄く）
  for (let dx = 20; dx < WIDTH; dx += 32) {
    for (let dy = HEADER_H + 4; dy < HEIGHT; dy += 32) {
      drawDot(ctx, dx, dy, 1.2, C.bgDot);
    }
  }

  // ─── ヘッダー ─────────────────────────────────────────────────────────────
  const hGrad = ctx.createLinearGradient(0, 0, WIDTH, 0);
  hGrad.addColorStop(0, C.hdrFrom);
  hGrad.addColorStop(1, C.hdrTo);
  ctx.fillStyle = hGrad;
  ctx.fillRect(0, 0, WIDTH, HEADER_H);

  // ヘッダー下部の波形装飾
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.beginPath();
  ctx.moveTo(0, HEADER_H);
  for (let wx = 0; wx <= WIDTH + 28; wx += 28) {
    ctx.quadraticCurveTo(wx + 14, HEADER_H - 8, wx + 28, HEADER_H);
  }
  ctx.lineTo(WIDTH, 0); ctx.lineTo(0, 0); ctx.closePath();
  ctx.fill();

  // ヘッダー装飾（小花・ドット）
  drawFlower(ctx, WIDTH / 2 - 200, 22, 8, "rgba(255,255,255,0.18)", "rgba(255,220,180,0.28)");
  drawFlower(ctx, WIDTH / 2 + 200, 22, 8, "rgba(255,255,255,0.18)", "rgba(255,220,180,0.28)");
  drawDot(ctx, WIDTH / 2 - 240, 60, 3, "rgba(255,255,255,0.2)");
  drawDot(ctx, WIDTH / 2 + 240, 60, 3, "rgba(255,255,255,0.2)");
  drawDot(ctx, WIDTH / 2 - 160, 85, 2, "rgba(255,255,255,0.15)");
  drawDot(ctx, WIDTH / 2 + 160, 85, 2, "rgba(255,255,255,0.15)");

  // タイトル（中央）
  ctx.textAlign = "center";
  ctx.fillStyle = C.hdrText;
  ctx.font = `bold 34px ${FONT}`;
  ctx.fillText("今週の献立", WIDTH / 2, 46);
  ctx.font = `14px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fillText("献立日和〜coto coto〜", WIDTH / 2, 70);
  ctx.font = `11px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.70)";
  ctx.fillText("4/20 〜 4/26", WIDTH / 2, 88);
  ctx.textAlign = "left";

  // キャラクター（波）→ 左端にはみ出し配置（大きく）
  if (imgWave) {
    const charH = 140;
    const charW = (imgWave.width / imgWave.height) * charH;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    // グリッドエリアにはみ出して下まで伸ばす
    ctx.drawImage(imgWave, 8, HEADER_H - charH + 30, charW, charH);
  }

  // キャラクター（料理）→ 右端にはみ出し配置（大きく）
  if (imgCooking) {
    const charH = 140;
    const charW = (imgCooking.width / imgCooking.height) * charH;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(imgCooking, WIDTH - charW - 8, HEADER_H - charH + 30, charW, charH);
  }

  // ─── カードグリッド ────────────────────────────────────────────────────────
  function drawCard(day, col, row) {
    const cx = PAD + col * (CARD_W + CARD_GAP);
    const cy = HEADER_H + PAD + row * (MAX_CARD_H + CARD_GAP);
    const cw = CARD_W;
    const ch = MAX_CARD_H;

    const isSat = day.dow === "土";
    const isSun = day.dow === "日";
    const isCheat = day.special === "cheat";
    const hasData = day.dinner || day.dinnerOptions?.length;

    // カード影
    ctx.shadowColor = "rgba(0,0,0,0.08)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;

    // カード背景
    if (isCheat) {
      const cg = ctx.createLinearGradient(cx, cy, cx + cw, cy + ch);
      cg.addColorStop(0, C.cheatFrom);
      cg.addColorStop(1, C.cheatTo);
      ctx.fillStyle = cg;
    } else {
      ctx.fillStyle = C.cardBg;
    }
    roundRect(ctx, cx, cy, cw, ch, CARD_R);
    ctx.fill();

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // カード枠線
    ctx.strokeStyle = isCheat ? C.cheatAccent : C.cardBorder;
    ctx.lineWidth = isCheat ? 1.5 : 1;
    roundRect(ctx, cx, cy, cw, ch, CARD_R);
    ctx.stroke();

    // ─── 左帯（曜日エリア）───────────────────────────────────────────────
    let dowBg, dowTxt;
    if (isCheat)      { dowBg = C.cheatAccent; dowTxt = "#FFFFFF"; }
    else if (isSun)   { dowBg = C.dowSun; dowTxt = C.dowSunText; }
    else if (isSat)   { dowBg = C.dowSat; dowTxt = C.dowSatText; }
    else              { dowBg = C.dowWeekday; dowTxt = C.dowWeekdayText; }

    ctx.fillStyle = dowBg;
    ctx.beginPath();
    ctx.moveTo(cx + CARD_R, cy);
    ctx.lineTo(cx + DOW_W, cy);
    ctx.lineTo(cx + DOW_W, cy + ch);
    ctx.lineTo(cx + CARD_R, cy + ch);
    ctx.quadraticCurveTo(cx, cy + ch, cx, cy + ch - CARD_R);
    ctx.lineTo(cx, cy + CARD_R);
    ctx.quadraticCurveTo(cx, cy, cx + CARD_R, cy);
    ctx.closePath();
    ctx.fill();

    // 曜日（大）
    ctx.textAlign = "center";
    ctx.fillStyle = dowTxt;
    ctx.font = `bold 26px ${FONT}`;
    ctx.fillText(day.dow, cx + DOW_W / 2, cy + ch / 2 - 6);

    // 日付（小）
    const d = new Date(day.date + "T00:00:00+09:00");
    const mmdd = `${d.getMonth() + 1}/${d.getDate()}`;
    ctx.font = `9px ${FONT}`;
    ctx.fillStyle = isCheat ? "rgba(255,255,255,0.85)" : (isSat ? C.dowSatText : isSun ? C.dowSunText : C.dateText);
    ctx.globalAlpha = 0.75;
    ctx.fillText(mmdd, cx + DOW_W / 2, cy + ch / 2 + 14);
    ctx.globalAlpha = 1.0;
    ctx.textAlign = "left";

    // 縦区切り線
    ctx.strokeStyle = isCheat ? "rgba(245,197,24,0.5)" : C.divider;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + DOW_W, cy + 10);
    ctx.lineTo(cx + DOW_W, cy + ch - 10);
    ctx.stroke();

    // ─── 右エリア（料理名）───────────────────────────────────────────────
    const rx = cx + DOW_W + CONTENT_PAD;
    let ty = cy + CONTENT_PAD + LINE_H;

    if (isCheat) {
      // チートデイ：星マーク＋テキスト
      ctx.fillStyle = C.cheatText;
      ctx.font = `bold 13px ${FONT}`;
      ctx.textAlign = "center";
      const lines = wrapText(ctx, day.dinner || "チートデイ！", DISH_MAX_W);
      const totalH = lines.length * LINE_H;
      const startY = cy + (ch - totalH) / 2;
      for (let li = 0; li < lines.length; li++) {
        ctx.fillText(lines[li], cx + DOW_W + (cw - DOW_W) / 2, startY + li * LINE_H);
      }
      // 右上に小さなリボン風装飾
      const rbx = cx + cw - 24;
      const rby = cy + 8;
      ctx.fillStyle = C.cheatAccent;
      ctx.beginPath();
      ctx.moveTo(rbx, rby);
      ctx.lineTo(rbx + 16, rby + 8);
      ctx.lineTo(rbx, rby + 16);
      ctx.lineTo(rbx - 16, rby + 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.font = `bold 9px ${FONT}`;
      ctx.fillText("★", rbx - 4, rby + 11);
      ctx.textAlign = "left";
    } else if (!hasData) {
      ctx.fillStyle = C.dishLight;
      ctx.font = `11px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText("未設定", cx + DOW_W + (cw - DOW_W) / 2, cy + ch / 2);
      ctx.textAlign = "left";
    } else if (day.dinnerOptions?.length) {
      for (let oi = 0; oi < day.dinnerOptions.length; oi++) {
        const opt = day.dinnerOptions[oi];
        // 番号バッジ（小さな丸）
        const bx = rx + 6;
        const by = ty - 6;
        ctx.fillStyle = C.numBg;
        ctx.beginPath();
        ctx.arc(bx, by, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.numText;
        ctx.font = `bold 8px ${FONT}`;
        ctx.textAlign = "center";
        ctx.fillText(String(oi + 1), bx, by + 3);
        ctx.textAlign = "left";

        ctx.fillStyle = C.dishText;
        ctx.font = `12px ${FONT}`;
        const lines = wrapText(ctx, opt, DISH_MAX_W - 18);
        for (let li = 0; li < lines.length; li++) {
          ctx.fillText(lines[li], rx + 18, ty + li * LINE_H);
        }
        ty += lines.length * LINE_H + 6;
      }
    } else {
      ctx.fillStyle = C.dishText;
      ctx.font = `12px ${FONT}`;
      const lines = wrapText(ctx, day.dinner, DISH_MAX_W);
      const totalH = lines.length * LINE_H;
      const startY = cy + (ch - totalH) / 2;
      for (let li = 0; li < lines.length; li++) {
        ctx.fillText(lines[li], rx, startY + li * LINE_H);
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

    ctx.shadowColor = "rgba(0,0,0,0.08)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    const cg = ctx.createLinearGradient(cx, cy, cx + cw, cy + ch);
    cg.addColorStop(0, C.hdrFrom);
    cg.addColorStop(1, C.hdrTo);
    ctx.fillStyle = cg;
    roundRect(ctx, cx, cy, cw, ch, CARD_R);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    drawFlower(ctx, cx + cw / 2, cy + 24, 11, "rgba(255,255,255,0.2)", "rgba(255,220,180,0.3)");
    drawFlower(ctx, cx + 18, cy + ch - 22, 6, "rgba(255,255,255,0.15)", "rgba(255,220,180,0.2)");
    drawFlower(ctx, cx + cw - 18, cy + ch - 22, 6, "rgba(255,255,255,0.15)", "rgba(255,220,180,0.2)");

    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = `bold 15px ${FONT}`;
    ctx.fillText("今週も", cx + cw / 2, cy + ch / 2 - 10);
    ctx.fillText("美味しい食卓を", cx + cw / 2, cy + ch / 2 + 12);
    ctx.font = `9px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.62)";
    ctx.fillText("献立日和", cx + cw / 2, cy + ch / 2 + 28);
    ctx.textAlign = "left";
  }

  // ─── 凡例ボックス（右下オーバーレイ）──────────────────────────────────
  // 画像の右下に小さな凡例を重ねて表示
  const legendItems = [
    { color: "#F5A623", label: "特別な日（誕生日・記念日など）" },
    { color: "#F5C518", label: "チートデイ（好きなもの食べる日）" },
    { color: "#E8A0BF", label: "ご褒美デー" },
  ];
  const legendPad = 10;
  const legendLineH = 18;
  const legendW = 230;
  const legendH = legendPad * 2 + legendItems.length * legendLineH + 4;
  const lx = WIDTH - legendW - 12;
  const ly = HEIGHT - legendH - 10;

  // 凡例背景
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  roundRect(ctx, lx, ly, legendW, legendH, 8);
  ctx.fill();
  ctx.strokeStyle = C.cardBorder;
  ctx.lineWidth = 1;
  roundRect(ctx, lx, ly, legendW, legendH, 8);
  ctx.stroke();

  // 凡例テキスト
  for (let i = 0; i < legendItems.length; i++) {
    const item = legendItems[i];
    const iy = ly + legendPad + i * legendLineH + legendLineH / 2;
    // 色丸
    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.arc(lx + legendPad + 6, iy, 5, 0, Math.PI * 2);
    ctx.fill();
    // テキスト
    ctx.fillStyle = "#6B5040";
    ctx.font = `10px ${FONT}`;
    ctx.fillText(item.label, lx + legendPad + 18, iy + 4);
  }

  const buf = canvas.toBuffer("image/png");
  fs.writeFileSync("/tmp/test_weekly_v4.png", buf);
  console.log(`Saved: /tmp/test_weekly_v4.png (${buf.length} bytes), ${WIDTH}x${HEIGHT}`);
}

generate().catch(console.error);
