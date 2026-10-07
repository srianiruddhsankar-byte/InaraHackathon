// Cleaning and daily values for the MarQ Sense streams (pure, tested).
//
// 1. Not worn → dropped. Electrode contact lost (worn, no EDA and no
//    impedance) → "sensor off", dropped.
// 2. Impossible values are removed per channel (the other channels of the
//    sample are kept): EDA outside 0.01–60 µS, impedance outside 200–1500 Ω,
//    sweat sodium 5–200, potassium 1–40, glucose 0.005–2, lactate 1–60 mmol/L.
// 3. Motion (steps > 100 per 5 min, as for HR): electrodes slide, so EDA and
//    impedance are excluded from the resting values. Sweat readings are kept
//    (exercise is when we sweat).
// 4. 3-point median smoothing of resting EDA and impedance.
//
// Daily values: night EDA and body water from 00:00–05:00 at rest (same
// posture every night, like the other night metrics); sweat analytes as the
// median of 10:00–20:00 readings, only with ≥ 6 readings.
import { robustBaseline, BASELINE, type MetricBaseline } from "./baseline";
import { MOTION_STEPS, NIGHT, DAY } from "./clean";
import { bodyWaterFromImpedance, type SenseSample } from "./sense";
import { dayDate, dayOf, hourOf, SAMPLE_MINUTES } from "./types";

export const SENSE_LIMITS = {
  eda: { min: 0.01, max: 60 },
  bioimpedance: { min: 200, max: 1500 },
  sodium: { min: 5, max: 200 },
  potassium: { min: 1, max: 40 },
  glucose: { min: 0.005, max: 2 },
  lactate: { min: 1, max: 60 },
} as const;

export type SenseChannel = keyof typeof SENSE_LIMITS;
const CHANNELS = Object.keys(SENSE_LIMITS) as SenseChannel[];

/** A day needs this many sweat readings for a daily sweat value. */
export const MIN_SWEAT_READINGS = 6;
/** A night needs this % of expected resting EDA/impedance samples. */
export const MIN_SENSE_NIGHT_QUALITY = 50;

export interface CleanSenseSample {
  minute: number;
  eda: number | null;
  bioimpedance: number | null;
  sodium: number | null;
  potassium: number | null;
  glucose: number | null;
  lactate: number | null;
  motion: boolean;
}

export interface SenseCleanResult {
  samples: CleanSenseSample[];
  total: number;
  dropped: { notWorn: number; sensorOff: number; impossible: number };
}

export function isImpossibleValue(channel: SenseChannel, v: number): boolean {
  const l = SENSE_LIMITS[channel];
  return v < l.min || v > l.max;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function smooth(samples: CleanSenseSample[], key: "eda" | "bioimpedance"): (number | null)[] {
  return samples.map((s, i) => {
    if (s[key] === null) return null;
    const near = [samples[i - 1], s, samples[i + 1]].filter(
      (x): x is CleanSenseSample => !!x && x[key] !== null && Math.abs(x.minute - s.minute) <= SAMPLE_MINUTES,
    );
    return near.length === 3 ? median(near.map((x) => x[key] as number)) : s[key];
  });
}

export function cleanSense(raw: SenseSample[]): SenseCleanResult {
  const dropped = { notWorn: 0, sensorOff: 0, impossible: 0 };
  const kept: CleanSenseSample[] = [];
  for (const s of raw) {
    if (!s.worn) {
      dropped.notWorn++;
      continue;
    }
    if (s.eda === null && s.bioimpedance === null) {
      dropped.sensorOff++;
      continue;
    }
    const c: CleanSenseSample = { minute: s.minute, eda: null, bioimpedance: null, sodium: null, potassium: null, glucose: null, lactate: null, motion: s.steps > MOTION_STEPS };
    for (const ch of CHANNELS) {
      const v = s[ch];
      if (v === null) continue;
      if (isImpossibleValue(ch, v)) dropped.impossible++;
      else c[ch] = v;
    }
    kept.push(c);
  }
  const resting = kept.filter((s) => !s.motion);
  const eda = smooth(resting, "eda");
  const z = smooth(resting, "bioimpedance");
  resting.forEach((s, i) => {
    s.eda = eda[i];
    s.bioimpedance = z[i];
  });
  return { samples: kept, total: raw.length, dropped };
}

/** One day's MarQ Sense values. Night values are from the early morning of `day`. */
export interface SenseDay {
  day: number; // 0-based, like NightSummary
  date: string;
  /** Night EDA median at rest (µS). */
  nightEda: number | null;
  /** Body water estimate from the night's resting impedance (%). */
  bodyWater: number | null;
  /** % of the night's expected resting EDA/impedance samples that were usable. */
  quality: number;
  valid: boolean;
  /** Daytime sweat medians (mmol/L); null without enough readings. */
  sodium: number | null;
  potassium: number | null;
  glucose: number | null;
  lactate: number | null;
  sweatReadings: number;
}

const inHours = (minute: number, from: number, to: number) => {
  const h = hourOf(minute);
  return h >= from && h < to;
};

export function senseDay(samples: CleanSenseSample[], day: number): SenseDay {
  const expected = ((NIGHT.to - NIGHT.from) * 60) / SAMPLE_MINUTES;
  const night = samples.filter((s) => dayOf(s.minute) === day && inHours(s.minute, NIGHT.from, NIGHT.to) && !s.motion);
  const edaVals = night.map((s) => s.eda).filter((v): v is number => v !== null);
  const zVals = night.map((s) => s.bioimpedance).filter((v): v is number => v !== null);
  const quality = Math.round((Math.min(edaVals.length, zVals.length) / expected) * 100);
  const valid = quality >= MIN_SENSE_NIGHT_QUALITY;
  const daytime = samples.filter((s) => dayOf(s.minute) === day && inHours(s.minute, DAY.from, DAY.to));
  const sweat = (key: "sodium" | "potassium" | "glucose" | "lactate", d: number) => {
    const vals = daytime.map((s) => s[key]).filter((v): v is number => v !== null);
    return vals.length >= MIN_SWEAT_READINGS ? Math.round(median(vals) * 10 ** d) / 10 ** d : null;
  };
  const sweatReadings = daytime.filter((s) => s.sodium !== null).length;
  return {
    day,
    date: dayDate(day),
    nightEda: edaVals.length ? Math.round(median(edaVals) * 100) / 100 : null,
    bodyWater: zVals.length ? bodyWaterFromImpedance(median(zVals)) : null,
    quality,
    valid,
    sodium: sweat("sodium", 1),
    potassium: sweat("potassium", 1),
    glucose: sweat("glucose", 3),
    lactate: sweat("lactate", 1),
    sweatReadings,
  };
}

// ---- Personal baselines -------------------------------------------------------------

export type SenseMetric = "nightEda" | "bodyWater" | "sodium" | "potassium" | "glucose" | "lactate";
export const SENSE_METRICS: SenseMetric[] = ["nightEda", "bodyWater", "sodium", "potassium", "glucose", "lactate"];
const NIGHT_SENSE: SenseMetric[] = ["nightEda", "bodyWater"];

/** Smallest spread we trust (as MIN_SPREAD in baseline.ts). */
export const SENSE_MIN_SPREAD: Record<SenseMetric, number> = {
  nightEda: 0.1,
  bodyWater: 0.4,
  sodium: 4,
  potassium: 0.4,
  glucose: 0.02,
  lactate: 2,
};

export const SENSE_INFO: Record<SenseMetric, { label: string; unit: string; decimals: number; research?: boolean }> = {
  nightEda: { label: "Skin conductance (EDA, night)", unit: "µS", decimals: 2 },
  bodyWater: { label: "Body water estimate (night, bioimpedance)", unit: "%", decimals: 1 },
  sodium: { label: "Sweat sodium (daytime)", unit: "mmol/L", decimals: 0, research: true },
  potassium: { label: "Sweat potassium (daytime)", unit: "mmol/L", decimals: 1, research: true },
  glucose: { label: "Sweat glucose (daytime)", unit: "mmol/L", decimals: 2, research: true },
  lactate: { label: "Sweat lactate (daytime)", unit: "mmol/L", decimals: 0, research: true },
};

export interface SenseEvaluation {
  sense: SenseDay;
  baseline: Partial<Record<SenseMetric, MetricBaseline>>;
  z: Partial<Record<SenseMetric, number>>;
}

/** Baseline + z for every day from the previous ≤ 28 days (night metrics: valid nights only). */
export function evaluateSense(days: SenseDay[]): SenseEvaluation[] {
  return days.map((d, i) => {
    const baseline: SenseEvaluation["baseline"] = {};
    const z: SenseEvaluation["z"] = {};
    for (const m of SENSE_METRICS) {
      const isNight = NIGHT_SENSE.includes(m);
      const previous = days
        .slice(0, i)
        .filter((p) => (isNight ? p.valid : true))
        .map((p) => p[m])
        .filter((v): v is number => v !== null)
        .slice(-BASELINE.maxNights);
      const b = robustBaseline(previous, SENSE_MIN_SPREAD[m]);
      if (!b) continue;
      baseline[m] = b;
      const v = d[m];
      if (v !== null && (!isNight || d.valid)) z[m] = Math.round(((v - b.median) / b.spread) * 100) / 100;
    }
    return { sense: d, baseline, z };
  });
}

export interface SenseAnalysis {
  days: SenseEvaluation[];
  dropped: SenseCleanResult["dropped"];
  total: number;
  /** % of worn samples with usable EDA + impedance. */
  quality: number;
}

export function analyseSense(raw: SenseSample[], days: number): SenseAnalysis {
  const cleaned = cleanSense(raw);
  const worn = cleaned.total - cleaned.dropped.notWorn;
  const usable = cleaned.samples.filter((s) => s.eda !== null && s.bioimpedance !== null).length;
  return {
    days: evaluateSense(Array.from({ length: days }, (_, d) => senseDay(cleaned.samples, d))),
    dropped: cleaned.dropped,
    total: cleaned.total,
    quality: worn ? Math.round((usable / worn) * 100) : 0,
  };
}
