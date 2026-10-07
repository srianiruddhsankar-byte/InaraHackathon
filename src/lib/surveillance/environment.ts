// Weather and air quality for the area panel (pure). Both are REAL city-level
// data from Open-Meteo, saved in /public/data so the demo works offline.
// Water quality is SIMULATED (see seed.ts) and always labelled so.
import { WINDOW_START, type WeatherData } from "../wearable/types";

export const AIR_QUALITY_FILE = "/data/air_quality_chennai_2026-09-06_2026-10-05.json";

export interface AirQualityData {
  source: string;
  location: { name: string; latitude: number; longitude: number; timezone: string };
  start: string;
  end: string;
  fetchedAt: string;
  hourly: { time: string[]; pm2_5: (number | null)[]; pm10: (number | null)[]; us_aqi: (number | null)[] };
}

export interface EnvDay {
  day: number;
  date: string;
  maxFeelsLike: number | null;
  meanHumidity: number | null;
  meanPm25: number | null;
  maxAqi: number | null;
}

const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
const max = (xs: number[]) => (xs.length ? Math.round(Math.max(...xs) * 10) / 10 : null);

function byDate(times: string[], values: (number | null)[]): Map<string, number[]> {
  const out = new Map<string, number[]>();
  times.forEach((t, i) => {
    const v = values[i];
    if (v === null || v === undefined) return;
    const d = t.slice(0, 10);
    out.set(d, [...(out.get(d) ?? []), v]);
  });
  return out;
}

/** Daily weather + air quality for demo days 1…`days`. Either source may be missing. */
export function environmentDays(weather: WeatherData | null, air: AirQualityData | null, days: number): EnvDay[] {
  const feels = weather ? byDate(weather.hourly.time, weather.hourly.apparent_temperature) : new Map();
  const hum = weather ? byDate(weather.hourly.time, weather.hourly.relative_humidity_2m) : new Map();
  const pm = air ? byDate(air.hourly.time, air.hourly.pm2_5) : new Map();
  const aqi = air ? byDate(air.hourly.time, air.hourly.us_aqi) : new Map();
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(`${WINDOW_START}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10);
    return {
      day: i + 1,
      date,
      maxFeelsLike: max(feels.get(date) ?? []),
      meanHumidity: mean(hum.get(date) ?? []),
      meanPm25: mean(pm.get(date) ?? []),
      maxAqi: max(aqi.get(date) ?? []),
    };
  });
}

/** US AQI category in plain words. */
export function aqiCategory(aqi: number): { label: string; tone: "good" | "moderate" | "poor" } {
  if (aqi <= 50) return { label: "Good", tone: "good" };
  if (aqi <= 100) return { label: "Moderate", tone: "moderate" };
  if (aqi <= 150) return { label: "Unhealthy for sensitive groups", tone: "poor" };
  return { label: "Unhealthy", tone: "poor" };
}
