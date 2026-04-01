/**
 * 天気情報取得ユーティリティ
 * Open-Meteo API（無料・APIキー不要）を使用
 * https://open-meteo.com/
 */

export interface WeatherInfo {
  date: string;
  temperatureMax: number;
  temperatureMin: number;
  weatherCode: number;
  weatherDescription: string;
  season: string;
}

// WMO天気コードを日本語に変換
function getWeatherDescription(code: number): string {
  if (code === 0) return "快晴";
  if (code <= 3) return "晴れ";
  if (code <= 49) return "霧";
  if (code <= 59) return "霧雨";
  if (code <= 69) return "雨";
  if (code <= 79) return "雪";
  if (code <= 84) return "にわか雨";
  if (code <= 94) return "雷雨";
  return "悪天候";
}

// 月から季節を取得
function getSeason(month: number): string {
  if (month >= 3 && month <= 5) return "春";
  if (month >= 6 && month <= 8) return "夏";
  if (month >= 9 && month <= 11) return "秋";
  return "冬";
}

/**
 * 指定した緯度経度の天気情報を取得
 * デフォルトは東京（緯度35.68, 経度139.69）
 */
export async function getWeatherInfo(
  latitude = 35.68,
  longitude = 139.69,
  date?: string
): Promise<WeatherInfo | null> {
  try {
    const targetDate = date ?? new Date().toISOString().split("T")[0];
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=Asia%2FTokyo&start_date=${targetDate}&end_date=${targetDate}`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000), // 5秒タイムアウト
    });

    if (!response.ok) {
      console.warn("[Weather] API request failed:", response.status);
      return null;
    }

    const data = await response.json() as {
      daily: {
        time: string[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        weathercode: number[];
      };
    };

    const idx = 0;
    const weatherCode = data.daily.weathercode[idx];
    const month = new Date(targetDate).getMonth() + 1;

    return {
      date: targetDate,
      temperatureMax: Math.round(data.daily.temperature_2m_max[idx]),
      temperatureMin: Math.round(data.daily.temperature_2m_min[idx]),
      weatherCode,
      weatherDescription: getWeatherDescription(weatherCode),
      season: getSeason(month),
    };
  } catch (err) {
    console.warn("[Weather] Failed to fetch weather info:", err);
    return null;
  }
}

/**
 * 天気情報を献立プロンプト用のテキストに変換
 */
export function formatWeatherForPrompt(weather: WeatherInfo | null): string {
  if (!weather) return "天気情報取得不可";
  return `${weather.season}・${weather.weatherDescription}（最高${weather.temperatureMax}℃／最低${weather.temperatureMin}℃）`;
}
