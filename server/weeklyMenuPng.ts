/**
 * 週間献立PNG生成ヘルパー
 * @napi-rs/canvas を使ってPNG画像を直接生成し、S3にアップロードする
 */
import { createCanvas } from "@napi-rs/canvas";
import { storagePut } from "./storage";
import { getMenuPlansByDateRange } from "./db";

const DAYS_JA = ["日", "月", "火", "水", "木", "金", "土"];

/** 日付文字列(YYYY-MM-DD)を「M月D日(曜)」形式に変換 */
function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00+09:00");
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const dow = DAYS_JA[d.getDay()];
  return `${m}/${day}(${dow})`;
}

/** menuDataから朝・昼・晩のテキストを取得 */
function extractMeals(menuData: any): { breakfast: string; lunch: string; dinner: string } {
  if (!menuData) return { breakfast: "", lunch: "", dinner: "" };
  const breakfast = menuData.breakfast || "";
  const lunch = menuData.lunch || "";
  // 夕食は選択済み or 候補1番目 or dinnerフィールド
  let dinner = "";
  if (menuData.selectedDinnerIndex != null && menuData.dinnerOptions?.length > 0) {
    const idx = Number(menuData.selectedDinnerIndex);
    dinner = menuData.dinnerOptions[idx]?.name || menuData.dinnerOptions[0]?.name || "";
  } else if (menuData.dinner) {
    dinner = menuData.dinner;
  } else if (menuData.dinnerOptions?.length > 0) {
    dinner = menuData.dinnerOptions[0]?.name || "";
  }
  return { breakfast, lunch, dinner };
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

/** 週間献立HTMLを生成（未使用・削除予定） */
function buildWeeklyMenuHtml(days: Array<{ date: string; menuData: any }>): string {
  const rows = days.map(({ date, menuData }) => {
    const { breakfast, lunch, dinner } = extractMeals(menuData);
    const hasData = breakfast || lunch || dinner;
    const dateLabel = formatDateLabel(date);

    const mealRow = (icon: string, label: string, meal: string, color: string) => {
      const isEmpty = !meal;
      return `
        <div class="meal-row">
          <span class="meal-icon" style="color:${color}">${icon}</span>
          <span class="meal-label" style="color:${color}">${label}</span>
          <span class="meal-text ${isEmpty ? 'empty' : ''}">${isEmpty ? "未定" : truncate(meal)}</span>
        </div>
      `;
    };

    return `
      <div class="day-card ${!hasData ? 'no-data' : ''}">
        <div class="day-header">
          <span class="day-label">${dateLabel}</span>
          ${!hasData ? '<span class="undecided-badge">未定</span>' : ''}
        </div>
        <div class="meals">
          ${mealRow("🌅", "朝", breakfast, "#E8A838")}
          ${mealRow("☀️", "昼", lunch, "#4CAF50")}
          ${mealRow("🌙", "夜", dinner, "#5C7CFA")}
        </div>
      </div>
    `;
  }).join("");

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Hiragino Kaku Gothic Pro', 'Noto Sans JP', sans-serif;
    background: #FFF8F0;
    padding: 24px 20px 28px;
    width: 750px;
  }
  .header {
    text-align: center;
    margin-bottom: 20px;
  }
  .header h1 {
    font-size: 26px;
    font-weight: bold;
    color: #5C3D2E;
    letter-spacing: 0.05em;
  }
  .header .subtitle {
    font-size: 14px;
    color: #9E7B5A;
    margin-top: 4px;
  }
  .grid {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .day-card {
    background: #fff;
    border-radius: 12px;
    padding: 12px 16px;
    border: 1.5px solid #F0DFC8;
    box-shadow: 0 2px 6px rgba(0,0,0,0.06);
  }
  .day-card.no-data {
    background: #F9F5F0;
    border-color: #E8DDD0;
    opacity: 0.75;
  }
  .day-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid #F0DFC8;
  }
  .day-label {
    font-size: 17px;
    font-weight: bold;
    color: #5C3D2E;
    min-width: 72px;
  }
  .undecided-badge {
    font-size: 11px;
    background: #E8DDD0;
    color: #9E7B5A;
    padding: 2px 8px;
    border-radius: 20px;
  }
  .meals {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .meal-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
  }
  .meal-icon {
    font-size: 15px;
    width: 20px;
    text-align: center;
  }
  .meal-label {
    font-size: 12px;
    font-weight: bold;
    min-width: 18px;
  }
  .meal-text {
    color: #3D2B1F;
    flex: 1;
    font-size: 14px;
    line-height: 1.4;
  }
  .meal-text.empty {
    color: #C4B0A0;
    font-style: italic;
    font-size: 13px;
  }
  .footer {
    text-align: center;
    margin-top: 16px;
    font-size: 12px;
    color: #B09070;
  }
</style>
</head>
<body>
  <div class="header">
    <h1>🍽 今週の献立</h1>
    <div class="subtitle">献立日和〜coto coto〜</div>
  </div>
  <div class="grid">${rows}</div>
  <div class="footer">ダッシュボードから詳細を確認・編集できます</div>
</body>
</html>`;
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

  // ─── Canvas描画 ───────────────────────────────────────────────────────────
  const WIDTH = 640;
  const PADDING = 16;
  const HEADER_H = 72;
  const ROW_LABEL_W = 76;
  const CELL_PAD = 10;
  const FONT_FAMILY = "sans-serif";
  const LINE_H = 20;
  const MEAL_ICON_W = 22;
  const CELL_INNER_W = WIDTH - PADDING * 2 - ROW_LABEL_W - CELL_PAD * 2;

  // 仮canvasでテキスト幅を測定して各行の高さを計算
  const tempCanvas = createCanvas(WIDTH, 100);
  const tempCtx = tempCanvas.getContext("2d");
  tempCtx.font = `13px ${FONT_FAMILY}`;
  const maxTextW = CELL_INNER_W - MEAL_ICON_W - 6;

  const rowHeights: number[] = [];
  for (const day of days) {
    const { breakfast, lunch, dinner } = extractMeals(day.menuData);
    let totalLines = 0;
    if (breakfast) totalLines += wrapText(tempCtx, breakfast, maxTextW).length;
    if (lunch) totalLines += wrapText(tempCtx, lunch, maxTextW).length;
    if (dinner) totalLines += wrapText(tempCtx, dinner, maxTextW).length;
    if (!breakfast && !lunch && !dinner) totalLines = 1;
    const rowH = Math.max(64, CELL_PAD * 2 + totalLines * LINE_H + 8);
    rowHeights.push(rowH);
  }

  const FOOTER_H = 36;
  const totalH = HEADER_H + rowHeights.reduce((a, b) => a + b, 0) + PADDING + FOOTER_H;

  const canvas = createCanvas(WIDTH, totalH);
  const ctx = canvas.getContext("2d");

  // 背景
  ctx.fillStyle = "#FFF8F0";
  ctx.fillRect(0, 0, WIDTH, totalH);

  // ヘッダー
  ctx.fillStyle = "#9E7B5A";
  ctx.fillRect(0, 0, WIDTH, HEADER_H);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold 22px ${FONT_FAMILY}`;
  ctx.fillText("今週の献立", PADDING + 4, 40);
  ctx.font = `13px ${FONT_FAMILY}`;
  ctx.fillStyle = "#F5E6D3";
  ctx.fillText("献立日和〜coto coto〜", PADDING + 4, 60);

  // 各行
  let y = HEADER_H;
  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const rowH = rowHeights[i];
    const { breakfast, lunch, dinner } = extractMeals(day.menuData);
    const hasData = breakfast || lunch || dinner;

    // 行背景
    ctx.fillStyle = i % 2 === 0 ? "#FFFFFF" : "#FDF5EC";
    ctx.fillRect(PADDING, y, WIDTH - PADDING * 2, rowH);

    // 枠線
    ctx.strokeStyle = "#F0DFC8";
    ctx.lineWidth = 1;
    ctx.strokeRect(PADDING, y, WIDTH - PADDING * 2, rowH);

    // 日付列背景
    ctx.fillStyle = "#F5E6D3";
    ctx.fillRect(PADDING, y, ROW_LABEL_W, rowH);

    // 日付テキスト
    ctx.fillStyle = "#9E7B5A";
    ctx.font = `bold 13px ${FONT_FAMILY}`;
    const parts = day.label.split("(");
    ctx.fillText(parts[0], PADDING + 6, y + rowH / 2 - 4);
    if (parts[1]) {
      ctx.font = `12px ${FONT_FAMILY}`;
      ctx.fillText("(" + parts[1], PADDING + 6, y + rowH / 2 + 14);
    }

    // 食事内容
    const textX = PADDING + ROW_LABEL_W + CELL_PAD;
    let textY = y + CELL_PAD + LINE_H;
    ctx.font = `13px ${FONT_FAMILY}`;

    if (!hasData) {
      ctx.fillStyle = "#C4B0A0";
      ctx.fillText("未設定", textX, y + rowH / 2 + 5);
    } else {
      const meals = [
        { icon: "[朝]", text: breakfast },
        { icon: "[昼]", text: lunch },
        { icon: "[夜]", text: dinner },
      ];
      for (const meal of meals) {
        if (!meal.text) continue;
        ctx.fillStyle = "#9E7B5A";
        ctx.font = `bold 12px ${FONT_FAMILY}`;
        ctx.fillText(meal.icon, textX, textY);
        ctx.fillStyle = "#3D2B1F";
        ctx.font = `13px ${FONT_FAMILY}`;
        const lines = wrapText(ctx, meal.text, maxTextW);
        for (const line of lines) {
          ctx.fillText(line, textX + MEAL_ICON_W + 4, textY);
          textY += LINE_H;
        }
        textY += 2;
      }
    }

    y += rowH;
  }

  // フッター
  ctx.fillStyle = "#F5E6D3";
  ctx.fillRect(0, y, WIDTH, FOOTER_H);
  ctx.fillStyle = "#9E7B5A";
  ctx.font = `12px ${FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.fillText("ダッシュボードから詳細を確認・編集できます", WIDTH / 2, y + 24);

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

