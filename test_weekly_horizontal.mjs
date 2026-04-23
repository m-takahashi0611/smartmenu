/**
 * 横長・夜の主菜のみ・オシャレかわいいデザインの週間献立PNGテスト
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
  console.log("Font registered");
} catch (e) {
  console.warn("Font registration failed:", e);
}

const MASCOT_COOKING_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/chara_cooking-2kPVJfknvoFLpXHRLPVvVs.png";
const MASCOT_WAVE_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/chara_wave-SJFFFGGiajefS9Vh7cqFQF.png";

// テスト用ダミーデータ（月〜日）
const testDays = [
  { date: "2026-04-20", dinner: "鶏ひき肉と豆腐のヘルシーハンバーグ", dinnerOptions: null },
  { date: "2026-04-21", dinner: "鮭のムニエル レモンバター風味", dinnerOptions: null },
  { date: "2026-04-22", dinner: null, dinnerOptions: ["豚こま肉の生姜焼き", "鶏むね肉の棒棒鶏", "サバの味噌煮"] },
  { date: "2026-04-23", dinner: "肉じゃが", dinnerOptions: null },
  { date: "2026-04-24", dinner: "豚バラと大根の煮物", dinnerOptions: null },
  { date: "2026-04-25", dinner: "鶏むね肉の唐揚げ", dinnerOptions: null },
  { date: "2026-04-26", dinner: null, dinnerOptions: ["鮭の塩焼き", "豚こまキャベツ炒め"] },
];

const DAYS_JA = ["日", "月", "火", "水", "木", "金", "土"];

function formatDateParts(dateStr) {
  const d = new Date(dateStr + "T00:00:00+09:00");
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const dowIdx = d.getDay();
  return {
    mmdd: `${m}/${day}`,
    dow: DAYS_JA[dowIdx],
    isWeekend: dowIdx === 0 || dowIdx === 6,
    isSun: dowIdx === 0,
    isSat: dowIdx === 6,
  };
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

// 小花の装飾を描画
function drawFlower(ctx, cx, cy, r, color) {
  const petals = 5;
  ctx.fillStyle = color;
  for (let i = 0; i < petals; i++) {
    const angle = (i / petals) * Math.PI * 2;
    const px = cx + Math.cos(angle) * r;
    const py = cy + Math.sin(angle) * r;
    ctx.beginPath();
    ctx.arc(px, py, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
  // 中心
  ctx.fillStyle = "#FFD700";
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
  ctx.fill();
}

// リーフ装飾を描画
function drawLeaf(ctx, x, y, size, angle, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.bezierCurveTo(size * 0.6, -size * 0.5, size * 0.6, size * 0.5, 0, size);
  ctx.bezierCurveTo(-size * 0.6, size * 0.5, -size * 0.6, -size * 0.5, 0, -size);
  ctx.fill();
  // 葉脈
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.8);
  ctx.lineTo(0, size * 0.8);
  ctx.stroke();
  ctx.restore();
}

async function generate() {
  // キャラクター画像をロード
  let mascotCooking = null;
  let mascotWave = null;
  try {
    mascotCooking = await loadImage(MASCOT_COOKING_URL);
    console.log("Cooking image loaded");
  } catch (e) { console.warn("Failed to load cooking image:", e.message); }
  try {
    mascotWave = await loadImage(MASCOT_WAVE_URL);
    console.log("Wave image loaded");
  } catch (e) { console.warn("Failed to load wave image:", e.message); }

  // ─── レイアウト定数 ───────────────────────────────────────────────────────
  const FONT_FAMILY = "NotoSansJP, sans-serif";
  const WIDTH = 1200;
  const HEADER_H = 110;
  const FOOTER_H = 52;
  const CARD_GAP = 10;
  const OUTER_PAD = 20;
  const CARD_RADIUS = 14;

  // 7枚のカードを横並び
  const NUM_DAYS = 7;
  const CARD_W = Math.floor((WIDTH - OUTER_PAD * 2 - CARD_GAP * (NUM_DAYS - 1)) / NUM_DAYS);

  // カードの高さ：夜の主菜のみ表示なので固定高さでOK
  // 最大3行（複数提案）を想定
  const DOW_BADGE_H = 52;
  const DATE_H = 24;
  const CONTENT_PAD = 14;
  const LINE_H = 22;
  const MAX_LINES = 3; // 最大3提案

  // 仮canvasでテキスト幅を測定
  const tempCanvas = createCanvas(CARD_W, 100);
  const tempCtx = tempCanvas.getContext("2d");
  tempCtx.font = `14px ${FONT_FAMILY}`;
  const TEXT_MAX_W = CARD_W - CONTENT_PAD * 2;

  // 各カードの必要高さを計算
  const cardHeights = testDays.map(day => {
    let textLines = 0;
    if (day.dinnerOptions && day.dinnerOptions.length > 0) {
      for (const opt of day.dinnerOptions) {
        textLines += Math.max(1, wrapText(tempCtx, opt, TEXT_MAX_W).length);
      }
    } else if (day.dinner) {
      textLines = Math.max(1, wrapText(tempCtx, day.dinner, TEXT_MAX_W).length);
    } else {
      textLines = 1; // 未設定
    }
    return DOW_BADGE_H + DATE_H + CONTENT_PAD * 2 + textLines * LINE_H + 10;
  });
  const MAX_CARD_H = Math.max(...cardHeights, 180);

  const HEIGHT = HEADER_H + OUTER_PAD + MAX_CARD_H + OUTER_PAD + FOOTER_H;

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  // ─── 背景 ───────────────────────────────────────────────────────────────
  const bgGrad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  bgGrad.addColorStop(0, "#FFF8F0");
  bgGrad.addColorStop(0.5, "#FFF3E8");
  bgGrad.addColorStop(1, "#FFEEDD");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // 背景装飾：ドット柄（薄く）
  ctx.fillStyle = "rgba(249, 115, 22, 0.04)";
  for (let dx = 30; dx < WIDTH; dx += 40) {
    for (let dy = HEADER_H + 10; dy < HEIGHT - FOOTER_H; dy += 40) {
      ctx.beginPath();
      ctx.arc(dx, dy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ─── ヘッダー ─────────────────────────────────────────────────────────────
  const headerGrad = ctx.createLinearGradient(0, 0, WIDTH, HEADER_H);
  headerGrad.addColorStop(0, "#FF6B35");
  headerGrad.addColorStop(0.5, "#FF8C42");
  headerGrad.addColorStop(1, "#FFA85C");
  ctx.fillStyle = headerGrad;
  ctx.fillRect(0, 0, WIDTH, HEADER_H);

  // ヘッダー装飾：波形ライン
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.moveTo(0, HEADER_H);
  for (let wx = 0; wx <= WIDTH; wx += 40) {
    ctx.quadraticCurveTo(wx + 20, HEADER_H - 8, wx + 40, HEADER_H);
  }
  ctx.lineTo(WIDTH, 0);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();

  // ヘッダー装飾：小花
  const flowerColors = ["rgba(255,255,255,0.25)", "rgba(255,220,180,0.3)", "rgba(255,200,150,0.2)"];
  const flowerPositions = [
    [180, 25, 8], [220, 55, 6], [160, 70, 5],
    [WIDTH - 180, 25, 8], [WIDTH - 220, 55, 6], [WIDTH - 160, 70, 5],
    [WIDTH / 2 - 150, 20, 5], [WIDTH / 2 + 150, 20, 5],
  ];
  for (const [fx, fy, fr] of flowerPositions) {
    drawFlower(ctx, fx, fy, fr, flowerColors[Math.floor(Math.random() * flowerColors.length)]);
  }

  // ヘッダー装飾：リーフ
  const leafData = [
    [140, 40, 12, -0.5, "rgba(255,255,255,0.2)"],
    [WIDTH - 140, 40, 12, 0.5, "rgba(255,255,255,0.2)"],
    [WIDTH / 2 - 200, 60, 9, -0.3, "rgba(255,220,180,0.25)"],
    [WIDTH / 2 + 200, 60, 9, 0.3, "rgba(255,220,180,0.25)"],
  ];
  for (const [lx, ly, ls, la, lc] of leafData) {
    drawLeaf(ctx, lx, ly, ls, la, lc);
  }

  // キャラクター（料理中）をヘッダー右端に配置
  if (mascotCooking) {
    const charH = 100;
    const charW = (mascotCooking.width / mascotCooking.height) * charH;
    ctx.drawImage(mascotCooking, WIDTH - charW - 20, HEADER_H - charH, charW, charH);
  }

  // キャラクター（手を振る）をヘッダー左端に配置
  if (mascotWave) {
    const charH = 90;
    const charW = (mascotWave.width / mascotWave.height) * charH;
    ctx.drawImage(mascotWave, 20, HEADER_H - charH, charW, charH);
  }

  // タイトルテキスト（中央）
  ctx.textAlign = "center";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold 32px ${FONT_FAMILY}`;
  ctx.fillText("今週の献立", WIDTH / 2, 48);

  // サブタイトル
  ctx.font = `15px ${FONT_FAMILY}`;
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fillText("献立日和〜coto coto〜", WIDTH / 2, 72);

  // 週の日付範囲
  const weekStart = `${new Date("2026-04-20T00:00:00+09:00").getMonth() + 1}/${new Date("2026-04-20T00:00:00+09:00").getDate()}`;
  const weekEnd = `${new Date("2026-04-26T00:00:00+09:00").getMonth() + 1}/${new Date("2026-04-26T00:00:00+09:00").getDate()}`;
  ctx.font = `12px ${FONT_FAMILY}`;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText(`${weekStart} 〜 ${weekEnd}`, WIDTH / 2, 92);

  ctx.textAlign = "left";

  // ─── 各日カード（横並び）────────────────────────────────────────────────────
  const cardsY = HEADER_H + OUTER_PAD;

  for (let i = 0; i < testDays.length; i++) {
    const day = testDays[i];
    const cardX = OUTER_PAD + i * (CARD_W + CARD_GAP);
    const cardH = MAX_CARD_H;
    const { mmdd, dow, isWeekend, isSun, isSat } = formatDateParts(day.date);

    // カード影
    ctx.shadowColor = "rgba(0,0,0,0.10)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;

    // カード背景
    const hasData = day.dinner || (day.dinnerOptions && day.dinnerOptions.length > 0);
    ctx.fillStyle = hasData ? "#FFFFFF" : "#FBF7F4";
    roundRect(ctx, cardX, cardsY, CARD_W, cardH, CARD_RADIUS);
    ctx.fill();

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // カード枠線
    ctx.strokeStyle = isWeekend ? "#FFCBA4" : "#F0DFC8";
    ctx.lineWidth = 1.5;
    roundRect(ctx, cardX, cardsY, CARD_W, cardH, CARD_RADIUS);
    ctx.stroke();

    // 曜日バッジ（カード上部の色帯）
    const badgeColor = isSun ? "#FF6B6B" : isSat ? "#6B9EFF" : "#FF8C42";
    const badgeLightColor = isSun ? "#FFE8E8" : isSat ? "#E8EEFF" : "#FFF0E6";

    // 上部カラー帯（角丸上側のみ）
    ctx.fillStyle = badgeColor;
    ctx.beginPath();
    ctx.moveTo(cardX + CARD_RADIUS, cardsY);
    ctx.lineTo(cardX + CARD_W - CARD_RADIUS, cardsY);
    ctx.quadraticCurveTo(cardX + CARD_W, cardsY, cardX + CARD_W, cardsY + CARD_RADIUS);
    ctx.lineTo(cardX + CARD_W, cardsY + DOW_BADGE_H);
    ctx.lineTo(cardX, cardsY + DOW_BADGE_H);
    ctx.lineTo(cardX, cardsY + CARD_RADIUS);
    ctx.quadraticCurveTo(cardX, cardsY, cardX + CARD_RADIUS, cardsY);
    ctx.closePath();
    ctx.fill();

    // 曜日テキスト
    ctx.textAlign = "center";
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `bold 22px ${FONT_FAMILY}`;
    ctx.fillText(dow, cardX + CARD_W / 2, cardsY + 32);

    // 日付テキスト（バッジ内）
    ctx.font = `11px ${FONT_FAMILY}`;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillText(mmdd, cardX + CARD_W / 2, cardsY + 48);

    ctx.textAlign = "left";

    // 夜アイコン（小さい月マーク）
    const iconY = cardsY + DOW_BADGE_H + CONTENT_PAD + 4;
    ctx.fillStyle = badgeLightColor;
    roundRect(ctx, cardX + CONTENT_PAD, iconY - 14, CARD_W - CONTENT_PAD * 2, 18, 4);
    ctx.fill();
    ctx.fillStyle = "#5C7CFA";
    ctx.font = `bold 10px ${FONT_FAMILY}`;
    ctx.textAlign = "center";
    ctx.fillText("夜ごはん", cardX + CARD_W / 2, iconY);
    ctx.textAlign = "left";

    // 夜の主菜テキスト
    ctx.fillStyle = "#3D2B1F";
    ctx.font = `14px ${FONT_FAMILY}`;
    let textY = cardsY + DOW_BADGE_H + CONTENT_PAD + 14 + LINE_H;

    if (!hasData) {
      ctx.fillStyle = "#C4B0A0";
      ctx.font = `13px ${FONT_FAMILY}`;
      ctx.textAlign = "center";
      ctx.fillText("未設定", cardX + CARD_W / 2, textY);
      ctx.textAlign = "left";
    } else if (day.dinnerOptions && day.dinnerOptions.length > 0) {
      // 複数提案
      for (let oi = 0; oi < day.dinnerOptions.length; oi++) {
        const opt = day.dinnerOptions[oi];
        // 番号バッジ
        ctx.fillStyle = "#FF8C42";
        ctx.beginPath();
        ctx.arc(cardX + CONTENT_PAD + 8, textY - 5, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
        ctx.font = `bold 10px ${FONT_FAMILY}`;
        ctx.textAlign = "center";
        ctx.fillText(String(oi + 1), cardX + CONTENT_PAD + 8, textY - 1);
        ctx.textAlign = "left";

        // 料理名
        ctx.fillStyle = "#3D2B1F";
        ctx.font = `13px ${FONT_FAMILY}`;
        const lines = wrapText(ctx, opt, TEXT_MAX_W - 20);
        for (let li = 0; li < lines.length; li++) {
          ctx.fillText(lines[li], cardX + CONTENT_PAD + 20, textY + li * LINE_H);
        }
        textY += lines.length * LINE_H + 6;
      }
    } else {
      // 単一料理
      const lines = wrapText(ctx, day.dinner, TEXT_MAX_W);
      ctx.font = `14px ${FONT_FAMILY}`;
      ctx.textAlign = "center";
      for (let li = 0; li < lines.length; li++) {
        ctx.fillText(lines[li], cardX + CARD_W / 2, textY + li * LINE_H);
      }
      ctx.textAlign = "left";
    }

    // カード下部の装飾ライン
    ctx.strokeStyle = badgeColor;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.15;
    ctx.beginPath();
    ctx.moveTo(cardX + 10, cardsY + cardH - 8);
    ctx.lineTo(cardX + CARD_W - 10, cardsY + cardH - 8);
    ctx.stroke();
    ctx.globalAlpha = 1.0;
  }

  // ─── フッター ────────────────────────────────────────────────────────────
  const footerY = cardsY + MAX_CARD_H + OUTER_PAD;

  const footerGrad = ctx.createLinearGradient(0, footerY, WIDTH, footerY + FOOTER_H);
  footerGrad.addColorStop(0, "#FF6B35");
  footerGrad.addColorStop(1, "#FFA85C");
  ctx.fillStyle = footerGrad;
  ctx.fillRect(0, footerY, WIDTH, FOOTER_H);

  // フッターキャラクター（手を振る）を右端に
  if (mascotWave) {
    const charH = 46;
    const charW = (mascotWave.width / mascotWave.height) * charH;
    ctx.drawImage(mascotWave, WIDTH - charW - 16, footerY + (FOOTER_H - charH) / 2, charW, charH);
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = `13px ${FONT_FAMILY}`;
  ctx.fillText("ダッシュボードから詳細を確認・編集できます", WIDTH / 2, footerY + FOOTER_H / 2 + 5);
  ctx.textAlign = "left";

  // PNG保存
  const pngBuffer = canvas.toBuffer("image/png");
  fs.writeFileSync("/tmp/test_weekly_horizontal.png", pngBuffer);
  console.log(`PNG saved to /tmp/test_weekly_horizontal.png, size: ${pngBuffer.length}`);
}

generate().catch(console.error);
