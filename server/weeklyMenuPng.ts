/**
 * 週間献立PNG生成ヘルパー
 * puppeteer-coreを使ってHTMLをPNG画像に変換し、S3にアップロードする
 */
import puppeteer from "puppeteer-core";
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

/** 料理名を短縮（長すぎる場合は省略） */
function truncate(text: string, maxLen = 18): string {
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

/** 週間献立HTMLを生成 */
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
 */
export async function generateWeeklyMenuPng(userId: number): Promise<string> {
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

  // 日付ごとにmenuDataを統合（menu.tsのgetByDateRangeと同じロジック）
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
      entry.dinnerOptions = md?.dinnerOptions ?? [];
      entry.dinner = md?.dinner || (md?.dinnerOptions?.[0]?.name ?? "");
      entry.selectedDinnerIndex = md?.selectedDinnerIndex != null ? Number(md.selectedDinnerIndex) : null;
    }
  }

  // 月〜日の7日分の配列を作成
  const days: Array<{ date: string; menuData: any }> = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    days.push({ date: dateStr, menuData: byDate.get(dateStr) || null });
  }

  const html = buildWeeklyMenuHtml(days);

  // puppeteer-coreでPNG生成
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    headless: true,
  });
  let pngBuffer: Buffer;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 750, height: 1200 });
    await page.setContent(html, { waitUntil: "networkidle0" });
    pngBuffer = await page.screenshot({
      type: "png",
      fullPage: true,
    }) as Buffer;
  } finally {
    await browser.close();
  }

  // S3にアップロード
  const key = `weekly-menu/${userId}-${Date.now()}.png`;
  const { url } = await storagePut(key, pngBuffer, "image/png");
  return url;
}
