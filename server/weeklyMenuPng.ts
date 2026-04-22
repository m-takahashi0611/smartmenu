/**
 * 週間献立PNG生成ヘルパー
 * @napi-rs/canvas を使ってPNG画像を直接生成し、S3にアップロードする
 */
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import path from "path";
import { fileURLToPath } from "url";
import { storagePut } from "./storage";
import { getMenuPlansByDateRange } from "./db";

// NotoSansJP フォントを登録（本番環境でも日本語テキストを描画できるようにする）
const _weeklyMenuDirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(_weeklyMenuDirname, "assets", "fonts");
try {
  GlobalFonts.registerFromPath(path.join(FONT_DIR, "NotoSansJP-Regular.woff2"), "NotoSansJP");
  GlobalFonts.registerFromPath(path.join(FONT_DIR, "NotoSansJP-Bold.woff2"), "NotoSansJP");
  console.log("[weeklyMenuPng] NotoSansJP font registered from:", FONT_DIR);
} catch (e) {
  console.warn("[weeklyMenuPng] Font registration failed:", e);
}

// キャラクター画像URL
const MASCOT_COOKING_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/chara_cooking-2kPVJfknvoFLpXHRLPVvVs.png";
const MASCOT_WAVE_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/chara_wave-SJFFFGGiajefS9Vh7cqFQF.png";

const DAYS_JA = ["日", "月", "火", "水", "木", "金", "土"];

/** 日付文字列(YYYY-MM-DD)を「M/D」と「(曜)」に分けて返す */
function formatDateParts(dateStr: string): { mmdd: string; dow: string; isWeekend: boolean } {
  const d = new Date(dateStr + "T00:00:00+09:00");
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const dowIdx = d.getDay();
  const dow = DAYS_JA[dowIdx];
  const isWeekend = dowIdx === 0 || dowIdx === 6;
  return { mmdd: `${m}/${day}`, dow: `(${dow})`, isWeekend };
}

/** menuDataから朝・昼・晩のテキストを取得（dinnerOptions対応） */
function extractMeals(menuData: any): { breakfast: string; lunch: string; dinner: string; dinnerOptions: string[] | null } {
  if (!menuData) return { breakfast: "", lunch: "", dinner: "", dinnerOptions: null };
  const breakfast = menuData.breakfast || "";
  const lunch = menuData.lunch || "";
  let dinner = "";
  let dinnerOptions: string[] | null = null;
  if (menuData.dinnerOptions && menuData.dinnerOptions.length > 1) {
    // 複数提案がある場合はリスト表示
    dinnerOptions = menuData.dinnerOptions.map((o: any, idx: number) => `[${idx + 1}] ${o.name || o}`);
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

/** テキストを指定幅に収まるよう折り返す */
function wrapText(ctx: any, text: string, maxWidth: number): string[] {
  if (!text) return [];
  const lines: string[] = [];
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

/** 角丸矩形を描画 */
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

/**
 * ユーザーの今週の献立をPNG画像として生成し、S3にアップロードしてURLを返す
 * @napi-rs/canvas を使用（Puppeteer不要）
 */
export async function generateWeeklyMenuPng(userId: number): Promise<string> {
  // 今週月曜〜日曜の日付範囲を計算（JST）
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
    const mealType: string = md?.mealType ?? "dinner";
    if (!byDate.has(dateStr)) byDate.set(dateStr, {});
    const entry = byDate.get(dateStr)!;
    if (mealType === "breakfast") {
      entry.breakfast = md?.breakfast || md?.name || "";
    } else if (mealType === "lunch") {
      entry.lunch = md?.lunch || md?.name || "";
    } else {
      entry.dinner = md?.dinner || (md?.dinnerOptions?.[0]?.name ?? "");
      entry.selectedDinnerIndex = md?.selectedDinnerIndex != null ? Number(md.selectedDinnerIndex) : null;
      entry.dinnerOptions = md?.dinnerOptions ?? [];
    }
  }

  // 月〜日の7日分の配列を作成
  const dayLabelsArr = ["月", "火", "水", "木", "金", "土", "日"];
  const days: Array<{ date: string; label: string; menuData: any }> = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    const mmdd = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
    days.push({ date: dateStr, label: `${mmdd}(${dayLabelsArr[i]})`, menuData: byDate.get(dateStr) || null });
  }

  // キャラクター画像を事前ロード
  let mascotCooking: any = null;
  let mascotWave: any = null;
  try {
    mascotCooking = await loadImage(MASCOT_COOKING_URL);
  } catch (e) {
    console.warn("[weeklyMenuPng] Failed to load mascot cooking image:", e);
  }
  try {
    mascotWave = await loadImage(MASCOT_WAVE_URL);
  } catch (e) {
    console.warn("[weeklyMenuPng] Failed to load mascot wave image:", e);
  }

  // ─── レイアウト定数 ───────────────────────────────────────────────────────
  const WIDTH = 680;
  const PADDING = 14;
  const HEADER_H = 90;
  const FOOTER_H = 50;
  const FONT_FAMILY = "NotoSansJP, sans-serif";

  // 日付列幅・食事列幅
  const DATE_COL_W = 68;
  const MEAL_COL_W = WIDTH - PADDING * 2 - DATE_COL_W - 8;
  const MEAL_BADGE_W = 32;
  const MEAL_TEXT_MAX_W = MEAL_COL_W - MEAL_BADGE_W - 10;
  const LINE_H = 22;
  const MEAL_ROW_GAP = 4;
  const CARD_PAD_V = 12;
  const CARD_RADIUS = 10;

  // 仮canvasでテキスト幅を測定して各行の高さを計算
  const tempCanvas = createCanvas(WIDTH, 100);
  const tempCtx = tempCanvas.getContext("2d");
  tempCtx.font = `14px ${FONT_FAMILY}`;

  const rowHeights: number[] = [];
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

  const totalH = HEADER_H + rowHeights.reduce((a, b) => a + b, 0) + PADDING * 2 + FOOTER_H + 8 * 7; // 8px gap per card

  const canvas = createCanvas(WIDTH, totalH);
  const ctx = canvas.getContext("2d");

  // ─── 背景 ───────────────────────────────────────────────────────────────
  // グラデーション背景
  const bgGrad = ctx.createLinearGradient(0, 0, 0, totalH);
  bgGrad.addColorStop(0, "#FFF8F0");
  bgGrad.addColorStop(1, "#FFF3E8");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, WIDTH, totalH);

  // ─── ヘッダー ─────────────────────────────────────────────────────────────
  // ヘッダー背景（角丸なし）
  const headerGrad = ctx.createLinearGradient(0, 0, WIDTH, HEADER_H);
  headerGrad.addColorStop(0, "#FF7F50");
  headerGrad.addColorStop(1, "#FF9966");
  ctx.fillStyle = headerGrad;
  ctx.fillRect(0, 0, WIDTH, HEADER_H);

  // ヘッダー装飾ライン（下部）
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.fillRect(0, HEADER_H - 3, WIDTH, 3);

  // キャラクター（料理中）をヘッダー右端に配置
  if (mascotCooking) {
    const charH = 80;
    const charW = (mascotCooking.width / mascotCooking.height) * charH;
    ctx.drawImage(mascotCooking, WIDTH - charW - 10, HEADER_H - charH, charW, charH);
  }

  // キャラクター（手を振る）をヘッダー左端に配置
  if (mascotWave) {
    const charH = 70;
    const charW = (mascotWave.width / mascotWave.height) * charH;
    ctx.drawImage(mascotWave, 10, HEADER_H - charH, charW, charH);
  }

  // タイトルテキスト（中央）
  ctx.textAlign = "center";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold 24px ${FONT_FAMILY}`;
  ctx.fillText("今週の献立", WIDTH / 2, 42);
  ctx.font = `13px ${FONT_FAMILY}`;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText("献立日和〜coto coto〜", WIDTH / 2, 64);

  // 週の日付範囲
  const weekStart = days[0]?.label?.split("(")[0] ?? "";
  const weekEnd = days[6]?.label?.split("(")[0] ?? "";
  ctx.font = `11px ${FONT_FAMILY}`;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText(`${weekStart} 〜 ${weekEnd}`, WIDTH / 2, 80);

  ctx.textAlign = "left";

  // ─── 各日カード ────────────────────────────────────────────────────────────
  let y = HEADER_H + PADDING;

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const rowH = rowHeights[i];
    const { breakfast, lunch, dinner, dinnerOptions } = extractMeals(day.menuData);
    const hasData = breakfast || lunch || dinner || (dinnerOptions && dinnerOptions.length > 0);
    const { mmdd, dow, isWeekend } = formatDateParts(day.date);

    const cardX = PADDING;
    const cardW = WIDTH - PADDING * 2;

    // カード背景（白・角丸・影）
    ctx.shadowColor = "rgba(0,0,0,0.08)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = hasData ? "#FFFFFF" : "#FAF6F2";
    roundRect(ctx, cardX, y, cardW, rowH, CARD_RADIUS);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // カード枠線
    ctx.strokeStyle = "#F0DFC8";
    ctx.lineWidth = 1;
    roundRect(ctx, cardX, y, cardW, rowH, CARD_RADIUS);
    ctx.stroke();

    // 日付列背景（左側の色帯）
    const dateColX = cardX;
    const dateColGrad = ctx.createLinearGradient(dateColX, y, dateColX + DATE_COL_W, y);
    if (isWeekend) {
      // 土日はアクセントカラー
      dateColGrad.addColorStop(0, "#FFF0E8");
      dateColGrad.addColorStop(1, "#FFE4D0");
    } else {
      dateColGrad.addColorStop(0, "#FFF5EE");
      dateColGrad.addColorStop(1, "#FDEEE2");
    }
    ctx.fillStyle = dateColGrad;
    // 左側のみ角丸
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

    // 日付列の縦区切り線
    ctx.strokeStyle = "#F0DFC8";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cardX + DATE_COL_W, y);
    ctx.lineTo(cardX + DATE_COL_W, y + rowH);
    ctx.stroke();

    // 日付テキスト（中央揃え）
    ctx.textAlign = "center";
    const dateCenterX = cardX + DATE_COL_W / 2;
    // 日付の色（土=青、日=赤、平日=茶）
    const dowText = dow.replace(/[()]/g, "");
    const dateColor = dowText === "日" ? "#E05050" : dowText === "土" ? "#5080D0" : "#9E7B5A";
    ctx.fillStyle = dateColor;
    ctx.font = `bold 16px ${FONT_FAMILY}`;
    ctx.fillText(mmdd, dateCenterX, y + rowH / 2 - 8);
    ctx.font = `bold 13px ${FONT_FAMILY}`;
    ctx.fillText(dow, dateCenterX, y + rowH / 2 + 12);
    ctx.textAlign = "left";

    // 食事内容エリア
    const mealAreaX = cardX + DATE_COL_W + 10;
    let textY = y + CARD_PAD_V + LINE_H - 4;

    if (!hasData) {
      ctx.fillStyle = "#C4B0A0";
      ctx.font = `13px ${FONT_FAMILY}`;
      ctx.fillText("未設定", mealAreaX, y + rowH / 2 + 5);
    } else {
      const mealDefs = [
        { text: breakfast, label: "朝", bgColor: "#FFF3E0", textColor: "#E8A838", options: null as string[] | null },
        { text: lunch,     label: "昼", bgColor: "#E8F5E9", textColor: "#4CAF50", options: null as string[] | null },
        { text: dinner,    label: "夜", bgColor: "#E8EAF6", textColor: "#5C7CFA", options: dinnerOptions },
      ];

      for (const meal of mealDefs) {
        const hasOptions = meal.options && meal.options.length > 0;
        if (!meal.text && !hasOptions) continue;

        // バッジ背景（角丸）
        const badgeX = mealAreaX;
        const badgeY = textY - LINE_H + 3;
        const badgeH = LINE_H - 2;
        ctx.fillStyle = meal.bgColor;
        roundRect(ctx, badgeX, badgeY, MEAL_BADGE_W, badgeH, 4);
        ctx.fill();

        // バッジテキスト
        ctx.fillStyle = meal.textColor;
        ctx.font = `bold 11px ${FONT_FAMILY}`;
        ctx.textAlign = "center";
        ctx.fillText(meal.label, badgeX + MEAL_BADGE_W / 2, badgeY + badgeH - 4);
        ctx.textAlign = "left";

        // 料理名テキスト
        ctx.fillStyle = "#3D2B1F";
        ctx.font = `14px ${FONT_FAMILY}`;
        if (hasOptions) {
          // 複数提案を各行に表示
          for (const optText of meal.options!) {
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

  // ─── フッター ────────────────────────────────────────────────────────────
  const footerY = y;

  // フッター背景
  ctx.fillStyle = "#FF7F50";
  ctx.fillRect(0, footerY, WIDTH, FOOTER_H);

  // フッターキャラクター（手を振る）を右端に
  if (mascotWave) {
    const charH = 44;
    const charW = (mascotWave.width / mascotWave.height) * charH;
    ctx.drawImage(mascotWave, WIDTH - charW - 12, footerY + (FOOTER_H - charH) / 2, charW, charH);
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = `12px ${FONT_FAMILY}`;
  ctx.fillText("ダッシュボードから詳細を確認・編集できます", WIDTH / 2, footerY + FOOTER_H / 2 + 5);
  ctx.textAlign = "left";

  // PNG バッファ生成
  const pngBuffer = canvas.toBuffer("image/png") as Buffer;

  // S3にアップロード
  const key = `weekly-menu/${userId}-${Date.now()}.png`;
  const { url } = await storagePut(key, pngBuffer, "image/png");
  return url;
}

/**
 * 週間献立をLINE Flexメッセージとして構築する（puppeteer不要）
 */
export async function generateWeeklyMenuFlex(userId: number): Promise<any> {
  // 今週月曜〜日曜の日付範囲を計算（JST）
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  const jstNow = new Date(now.getTime() + jstOffset);
  const dayOfWeek = jstNow.getUTCDay(); // 0=Sun
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(jstNow);
  monday.setUTCDate(jstNow.getUTCDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const startDate = monday.toISOString().split("T")[0];
  const endDate = sunday.toISOString().split("T")[0];

  // DBから献立データを取得
  const plans = await getMenuPlansByDateRange(userId, startDate, endDate);

  // 日付ごとにmenuDataを統合
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

  // 月〜日の7日分の配列を作成
  const dayLabels = ["月", "火", "水", "木", "金", "土", "日"];
  const days: Array<{ date: string; label: string; menuData: any }> = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    const mmdd = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
    days.push({ date: dateStr, label: `${mmdd}(${dayLabels[i]})`, menuData: byDate.get(dateStr) || null });
  }

  // Flexメッセージのbody contentsを構築
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
        {
          type: "box",
          layout: "vertical",
          contents: mealLines,
          flex: 1,
        },
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

  const flexMessage = {
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

  return flexMessage;
}
