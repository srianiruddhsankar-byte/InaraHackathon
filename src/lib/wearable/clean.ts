// Cleaning wearable data and computing nightly resting metrics. Pure functions.
//
// 1. Drop samples that were not worn, or have missing readings (gaps).
// 2. Drop physiologically impossible values: HR < 30 or > 220 bpm, SpO2 < 70
//    or > 100 %, skin temp outside 30–40 °C.
// 3. Mark motion-affected samples (many steps) — they stay for daytime views
//    but are excluded from resting metrics.
// 4. Light smoothing: 3-point median over neighbouring readings.
//
// Nights (00:00–05:00, low motion) are the primary signal: the body is at
// rest, so changes there are less likely to be activity, heat or stress.
import { dayDate, dayOf, hourOf, SAMPLE_MINUTES, type DayNightAmplitude, type NightSummary, type WearableSample } from "./types";

export const LIMITS = {
  heartRate: { min: 30, max: 220 },
  spo2: { min: 70, max: 100 },
  skinTemp: { min: 30, max: 40 },
  hrv: { min: 1, max: 300 },
} as const;

/** Steps in 5 minutes above this = moving: not a resting sample. */
export const MOTION_STEPS = 100;

export const NIGHT = { from: 0, to: 5 };
export const DAY = { from: 10, to: 20 };
/** A night needs at least this % of usable samples to be judged. */
export const MIN_NIGHT_QUALITY = 50;

export interface CleanSample {
  minute: number;
  heartRate: number;
  hrvRmssd: number;
  spo2: number;
  skinTemp: number;
  steps: number;
  /** Moving: excluded from resting metrics. */
  motion: boolean;
}

export interface CleanResult {
  samples: CleanSample[];
  total: number;
  dropped: { notWorn: number; missing: number; impossible: number };
}

export function isImpossible(s: Pick<WearableSample, "heartRate" | "spo2" | "skinTemp" | "hrvRmssd">): boolean {
  const out = (v: number | null, l: { min: number; max: number }) => v !== null && (v < l.min || v > l.max);
  return out(s.heartRate, LIMITS.heartRate) || out(s.spo2, LIMITS.spo2) || out(s.skinTemp, LIMITS.skinTemp) || out(s.hrvRmssd, LIMITS.hrv);
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** 3-point median over neighbours no more than one sample apart in time. */
function smooth(samples: CleanSample[], key: "heartRate" | "hrvRmssd" | "spo2" | "skinTemp"): number[] {
  return samples.map((s, i) => {
    const near = [samples[i - 1], s, samples[i + 1]].filter(
      (x): x is CleanSample => !!x && Math.abs(x.minute - s.minute) <= SAMPLE_MINUTES,
    );
    return near.length === 3 ? median(near.map((x) => x[key])) : s[key];
  });
}

export function cleanSamples(raw: WearableSample[]): CleanResult {
  const dropped = { notWorn: 0, missing: 0, impossible: 0 };
  const kept: CleanSample[] = [];
  for (const s of raw) {
    if (!s.worn) {
      dropped.notWorn++;
      continue;
    }
    if (s.heartRate === null || s.spo2 === null || s.skinTemp === null || s.hrvRmssd === null) {
      dropped.missing++;
      continue;
    }
    if (isImpossible(s)) {
      dropped.impossible++;
      continue;
    }
    kept.push({
      minute: s.minute,
      heartRate: s.heartRate,
      hrvRmssd: s.hrvRmssd,
      spo2: s.spo2,
      skinTemp: s.skinTemp,
      steps: s.steps,
      motion: s.steps > MOTION_STEPS,
    });
  }
  // Smooth resting samples only, so a walk doesn't blur into the readings around it.
  const resting = kept.filter((s) => !s.motion);
  const hr = smooth(resting, "heartRate");
  const hrv = smooth(resting, "hrvRmssd");
  const spo2 = smooth(resting, "spo2");
  const temp = smooth(resting, "skinTemp");
  resting.forEach((s, i) => {
    s.heartRate = hr[i];
    s.hrvRmssd = hrv[i];
    s.spo2 = spo2[i];
    s.skinTemp = temp[i];
  });
  return { samples: kept, total: raw.length, dropped };
}

const inHours = (minute: number, from: number, to: number) => {
  const h = hourOf(minute);
  return h >= from && h < to;
};

/** Resting metrics for the night that ends on the morning of `day`. */
export function nightSummary(samples: CleanSample[], day: number): NightSummary {
  const expected = ((NIGHT.to - NIGHT.from) * 60) / SAMPLE_MINUTES;
  const usable = samples.filter((s) => dayOf(s.minute) === day && inHours(s.minute, NIGHT.from, NIGHT.to) && !s.motion);
  const quality = Math.round((usable.length / expected) * 100);
  const valid = quality >= MIN_NIGHT_QUALITY;
  const m = (key: "heartRate" | "hrvRmssd" | "skinTemp" | "spo2", decimals: number) => {
    if (!usable.length) return null;
    const p = 10 ** decimals;
    return Math.round(median(usable.map((s) => s[key])) * p) / p;
  };
  return {
    day,
    date: dayDate(day),
    restingHr: m("heartRate", 1),
    hrv: m("hrvRmssd", 1),
    skinTemp: m("skinTemp", 2),
    spo2: m("spo2", 1),
    quality,
    valid,
  };
}

export function nightSummaries(samples: CleanSample[], days: number): NightSummary[] {
  return Array.from({ length: days }, (_, day) => nightSummary(samples, day));
}

/** Day (10–20h) median minus night (00–05h) median, low-motion samples only. Flattening = smaller amplitude. */
export function dayNightAmplitude(samples: CleanSample[], day: number): DayNightAmplitude {
  const of = (from: number, to: number) => samples.filter((s) => dayOf(s.minute) === day && inHours(s.minute, from, to) && !s.motion);
  const night = of(NIGHT.from, NIGHT.to);
  const daytime = of(DAY.from, DAY.to);
  const diff = (key: "heartRate" | "skinTemp") =>
    night.length && daytime.length ? Math.round((median(daytime.map((s) => s[key])) - median(night.map((s) => s[key]))) * 10) / 10 : null;
  return { day, hr: diff("heartRate"), skinTemp: diff("skinTemp") };
}

/** % of all samples usable for resting metrics (worn, valid, not moving). */
export function dataQuality(result: CleanResult): number {
  if (result.total === 0) return 0;
  return Math.round((result.samples.filter((s) => !s.motion).length / result.total) * 100);
}
