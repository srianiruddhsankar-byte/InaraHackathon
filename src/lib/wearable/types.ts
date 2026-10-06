// Wearable early-warning: shared types and the demo window.
// Wearable data is SIMULATED (synthetic, seeded); weather is REAL (Open-Meteo).
// Time is "minutes since the window started" in local time (IST), so day and
// hour are simple arithmetic and there are no timezone surprises.

/** The 30-day demo window. Day 1 = 2026-09-06, Day 30 = 2026-10-05 (the most recent night). */
export const WINDOW_START = "2026-09-06";
export const WINDOW_DAYS = 30;
export const SAMPLE_MINUTES = 5;
export const SAMPLES_PER_DAY = (24 * 60) / SAMPLE_MINUTES;

/** One 5-minute reading as the device reports it. Nulls are dropouts. */
export interface WearableSample {
  /** Minutes since WINDOW_START 00:00 local time. */
  minute: number;
  heartRate: number | null; // bpm
  hrvRmssd: number | null; // ms
  spo2: number | null; // %
  skinTemp: number | null; // °C
  steps: number; // steps in the 5 minutes (motion)
  worn: boolean;
}

export type NightMetric = "restingHr" | "hrv" | "skinTemp" | "spo2";

export const NIGHT_METRICS: NightMetric[] = ["restingHr", "hrv", "skinTemp", "spo2"];

export const METRIC_INFO: Record<NightMetric, { label: string; unit: string; decimals: number; patientLabel: string }> = {
  restingHr: { label: "Resting heart rate (night)", unit: "bpm", decimals: 0, patientLabel: "Night-time heart rate" },
  hrv: { label: "HRV (RMSSD, night)", unit: "ms", decimals: 0, patientLabel: "Heart rate variability" },
  skinTemp: { label: "Skin temperature (night)", unit: "°C", decimals: 1, patientLabel: "Night-time skin temperature" },
  spo2: { label: "SpO₂ (night)", unit: "%", decimals: 1, patientLabel: "Blood oxygen" },
};

/** Resting values from one night (00:00–05:00, low motion). */
export interface NightSummary {
  /** 0-based day index; the night is the early morning of this day. */
  day: number;
  date: string; // ISO date
  restingHr: number | null;
  hrv: number | null;
  skinTemp: number | null;
  spo2: number | null;
  /** % of the night's expected samples that were usable (worn, valid, low motion). */
  quality: number;
  /** Enough usable data to judge the night. */
  valid: boolean;
}

/** Day–night difference (circadian amplitude): daytime (10–20h) median minus night (00–05h) median. */
export interface DayNightAmplitude {
  day: number;
  hr: number | null;
  /** Skin temp is higher at night, so this is usually negative. */
  skinTemp: number | null;
}

/** Hourly weather for the window, as saved from Open-Meteo. */
export interface WeatherData {
  source: string;
  location: { name: string; latitude: number; longitude: number; timezone: string };
  start: string;
  end: string;
  fetchedAt: string;
  hourly: {
    time: string[];
    temperature_2m: (number | null)[];
    relative_humidity_2m: (number | null)[];
    apparent_temperature: (number | null)[];
  };
}

export function dayDate(day: number): string {
  const d = new Date(`${WINDOW_START}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + day);
  return d.toISOString().slice(0, 10);
}

export function dayOf(minute: number): number {
  return Math.floor(minute / 1440);
}

/** Hour of day (0–23.92) for a sample minute. */
export function hourOf(minute: number): number {
  return (minute % 1440) / 60;
}
