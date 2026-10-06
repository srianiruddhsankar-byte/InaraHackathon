// Real weather (Open-Meteo, free, no key) and the personal weather correction.
// Heat raises heart rate. From the person's own baseline days we learn how much
// their daytime resting heart rate rises per °C of apparent ("feels like")
// temperature and per % of humidity (humid heat limits cooling by sweat), then report expected HR for the weather and the residual
// (observed − expected). A hot afternoon with a small residual is explained by
// the weather, not by illness.
import type { CleanSample } from "./clean";
import { dayOf, hourOf, WINDOW_DAYS, WINDOW_START, type WeatherData } from "./types";

export const CHENNAI = { name: "Chennai", latitude: 13.08, longitude: 80.27, timezone: "Asia/Kolkata" };

/** The saved copy used by the app (works offline). */
export function weatherFileName(start: string, end: string): string {
  return `weather_chennai_${start}_${end}.json`;
}

export function windowEnd(): string {
  const d = new Date(`${WINDOW_START}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + WINDOW_DAYS - 1);
  return d.toISOString().slice(0, 10);
}

export const WEATHER_FILE = `/data/${weatherFileName(WINDOW_START, windowEnd())}`;

/** Fetch hourly weather from the Open-Meteo archive (used by "Refresh from Open-Meteo"). */
export async function fetchOpenMeteo(start = WINDOW_START, end = windowEnd()): Promise<WeatherData> {
  const params = new URLSearchParams({
    latitude: String(CHENNAI.latitude),
    longitude: String(CHENNAI.longitude),
    start_date: start,
    end_date: end,
    hourly: "temperature_2m,relative_humidity_2m,apparent_temperature",
    timezone: CHENNAI.timezone,
  });
  const res = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`);
  if (!res.ok) throw new Error(`Open-Meteo returned ${res.status}`);
  const json = await res.json();
  return {
    source: "Open-Meteo Historical Weather API (archive-api.open-meteo.com), ERA5 reanalysis",
    location: CHENNAI,
    start,
    end,
    fetchedAt: new Date().toISOString(),
    hourly: json.hourly,
  };
}

/** True when the file covers the whole window hour by hour. */
export function isUsableWeather(w: WeatherData): boolean {
  return w.start === WINDOW_START && w.hourly.time.length >= WINDOW_DAYS * 24;
}

/** Apparent temperature for the hour containing `minute` (null if missing). */
export function apparentAt(w: WeatherData, minute: number): number | null {
  return w.hourly.apparent_temperature[Math.floor(minute / 60)] ?? null;
}

/** Relative humidity (%) for the hour containing `minute` (null if missing). */
export function humidityAt(w: WeatherData, minute: number): number | null {
  return w.hourly.relative_humidity_2m[Math.floor(minute / 60)] ?? null;
}

/** Mean of an hourly series over [fromHour, toHour) of a day. */
export function hourlyMean(series: (number | null)[], day: number, fromHour: number, toHour: number): number | null {
  const vals = series.slice(day * 24 + fromHour, day * 24 + toHour).filter((v): v is number => v !== null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

export const AFTERNOON = { from: 12, to: 17 };

/** Afternoons at or above this mean humidity count as "humid". */
export const HUMID_AFTERNOON = 70;

/**
 * The day (index) with the hottest afternoon apparent temperature within
 * [fromDay, toDay], optionally only among afternoons with mean humidity ≥ minHumidity.
 */
export function hottestAfternoon(w: WeatherData, fromDay: number, toDay: number, minHumidity = 0): number {
  let best = fromDay;
  let bestTemp = -Infinity;
  for (let d = fromDay; d <= toDay; d++) {
    if ((hourlyMean(w.hourly.relative_humidity_2m, d, AFTERNOON.from, AFTERNOON.to) ?? 0) < minHumidity) continue;
    const t = hourlyMean(w.hourly.apparent_temperature, d, AFTERNOON.from, AFTERNOON.to) ?? -Infinity;
    if (t > bestTemp) {
      bestTemp = t;
      best = d;
    }
  }
  return best;
}

// ---- Personal heat model -----------------------------------------------------

/** Daytime hours used for the heat model (awake, mostly resting). */
export const DAYTIME = { from: 9, to: 20 };

export interface HeatPoint {
  day: number;
  hour: number;
  apparentTemp: number;
  /** Relative humidity, %. */
  humidity: number;
  /** Median of low-motion heart-rate samples in that hour. */
  restingHr: number;
}

/** One point per daytime hour: resting (low-motion) HR vs apparent temperature. Needs ≥ 4 resting samples in the hour. */
export function heatPoints(samples: CleanSample[], w: WeatherData): HeatPoint[] {
  const byHour = new Map<number, number[]>();
  for (const s of samples) {
    const h = Math.floor(hourOf(s.minute));
    if (s.motion || h < DAYTIME.from || h >= DAYTIME.to) continue;
    const key = Math.floor(s.minute / 60);
    const list = byHour.get(key) ?? [];
    list.push(s.heartRate);
    byHour.set(key, list);
  }
  const points: HeatPoint[] = [];
  for (const [hourIndex, hrs] of [...byHour.entries()].sort((a, b) => a[0] - b[0])) {
    const temp = w.hourly.apparent_temperature[hourIndex];
    const humidity = w.hourly.relative_humidity_2m[hourIndex];
    if (hrs.length < 4 || temp == null || humidity == null) continue;
    points.push({ day: dayOf(hourIndex * 60), hour: hourIndex % 24, apparentTemp: temp, humidity, restingHr: median(hrs) });
  }
  return points;
}

export interface HeatModel {
  /** bpm per °C of apparent temperature. */
  slope: number;
  /** Extra bpm per % relative humidity (humid heat limits cooling by sweat). */
  humiditySlope: number;
  intercept: number;
  n: number;
  r2: number;
}

/**
 * Least squares with two inputs: restingHr = intercept + slope × apparentTemp
 * + humiditySlope × humidity. Null with fewer than 10 points. If humidity
 * doesn't vary, falls back to temperature only (humiditySlope = 0).
 */
export function fitHeatModel(points: HeatPoint[]): HeatModel | null {
  const n = points.length;
  if (n < 10) return null;
  const mean = (f: (p: HeatPoint) => number) => points.reduce((a, p) => a + f(p), 0) / n;
  const mt = mean((p) => p.apparentTemp);
  const mh = mean((p) => p.humidity);
  const my = mean((p) => p.restingHr);
  let stt = 0, shh = 0, sth = 0, sty = 0, shy = 0, syy = 0;
  for (const p of points) {
    const t = p.apparentTemp - mt, h = p.humidity - mh, y = p.restingHr - my;
    stt += t * t;
    shh += h * h;
    sth += t * h;
    sty += t * y;
    shy += h * y;
    syy += y * y;
  }
  if (stt === 0) return null;
  const det = stt * shh - sth * sth;
  // Humidity constant (or exactly tied to temperature): temperature only.
  const [slope, humiditySlope] = Math.abs(det) < 1e-9 ? [sty / stt, 0] : [(sty * shh - shy * sth) / det, (shy * stt - sty * sth) / det];
  const explained = slope * sty + humiditySlope * shy;
  return { slope, humiditySlope, intercept: my - slope * mt - humiditySlope * mh, n, r2: syy === 0 ? 0 : explained / syy };
}

export function expectedHr(model: HeatModel, apparentTemp: number, humidity: number): number {
  return model.intercept + model.slope * apparentTemp + model.humiditySlope * humidity;
}

export interface WeatherAdjustedDay {
  day: number;
  /** Afternoon (12–17h) mean apparent temperature and relative humidity. */
  apparentTemp: number | null;
  humidity: number | null;
  /** Afternoon resting HR: observed, expected for the weather, and observed − expected. */
  observedHr: number | null;
  expectedHr: number | null;
  residual: number | null;
}

/** Afternoon observed vs weather-expected resting HR for each day. */
export function weatherAdjustedDays(points: HeatPoint[], w: WeatherData, model: HeatModel | null, days: number): WeatherAdjustedDay[] {
  return Array.from({ length: days }, (_, day) => {
    const afternoon = points.filter((p) => p.day === day && p.hour >= AFTERNOON.from && p.hour < AFTERNOON.to);
    const apparentTemp = hourlyMean(w.hourly.apparent_temperature, day, AFTERNOON.from, AFTERNOON.to);
    const humidity = hourlyMean(w.hourly.relative_humidity_2m, day, AFTERNOON.from, AFTERNOON.to);
    if (afternoon.length === 0) return { day, apparentTemp, humidity, observedHr: null, expectedHr: null, residual: null };
    const observedHr = afternoon.reduce((a, p) => a + p.restingHr, 0) / afternoon.length;
    const expected = model ? afternoon.reduce((a, p) => a + expectedHr(model, p.apparentTemp, p.humidity), 0) / afternoon.length : null;
    return { day, apparentTemp, humidity, observedHr, expectedHr: expected, residual: expected === null ? null : observedHr - expected };
  });
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
