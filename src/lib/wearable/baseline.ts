// Personal baseline: "normal for this person". Pure functions.
// For each night, the previous 14–28 valid nights give a median and a robust
// spread (MAD × 1.4826 ≈ one standard deviation for normal data). A night's
// z-score = (value − median) ÷ spread. With fewer than 7 valid nights we don't
// judge yet ("building your baseline").
import { NIGHT_METRICS, type NightMetric, type NightSummary } from "./types";

export const BASELINE = {
  /** Don't judge before this many valid nights. */
  minNights: 7,
  /** Ideal baseline length (shown in the UI). */
  targetNights: 14,
  /** Use at most this many previous nights. */
  maxNights: 28,
};

/** Smallest spread we trust, so a very steady baseline doesn't turn tiny wobbles into big z-scores. */
export const MIN_SPREAD: Record<NightMetric, number> = { restingHr: 1.5, hrv: 3, skinTemp: 0.15, spo2: 0.5 };

export interface MetricBaseline {
  median: number;
  /** Robust SD: 1.4826 × MAD, floored at MIN_SPREAD. */
  spread: number;
  n: number;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Median and robust spread of values; null with fewer than BASELINE.minNights values. */
export function robustBaseline(values: number[], minSpread = 0): MetricBaseline | null {
  if (values.length < BASELINE.minNights) return null;
  const med = median(values);
  const mad = median(values.map((v) => Math.abs(v - med)));
  return { median: med, spread: Math.max(1.4826 * mad, minSpread), n: values.length };
}

export function zScore(value: number, b: MetricBaseline): number {
  return (value - b.median) / b.spread;
}

export interface NightEvaluation {
  night: NightSummary;
  /** Number of valid previous nights used (0–28). */
  baselineNights: number;
  baseline: Partial<Record<NightMetric, MetricBaseline>>;
  z: Partial<Record<NightMetric, number>>;
  /** True once there are ≥ 7 valid previous nights and this night is valid. */
  judged: boolean;
}

/** Baseline + z-scores for every night, each using only the nights before it. */
export function evaluateNights(nights: NightSummary[]): NightEvaluation[] {
  return nights.map((night, i) => {
    const previous = nights.slice(0, i).filter((n) => n.valid).slice(-BASELINE.maxNights);
    const baseline: NightEvaluation["baseline"] = {};
    const z: NightEvaluation["z"] = {};
    for (const metric of NIGHT_METRICS) {
      const values = previous.map((n) => n[metric]).filter((v): v is number => v !== null);
      const b = robustBaseline(values, MIN_SPREAD[metric]);
      if (!b) continue;
      baseline[metric] = b;
      const v = night[metric];
      if (night.valid && v !== null) z[metric] = Math.round(zScore(v, b) * 100) / 100;
    }
    const judged = night.valid && previous.length >= BASELINE.minNights;
    return { night, baselineNights: previous.length, baseline, z, judged };
  });
}

/**
 * The person's usual day–night heart-rate amplitude before `day` (median of up
 * to 28 previous days, ≥ 7 needed). A much smaller amplitude = flattened rhythm.
 */
export function usualHrAmplitude(amplitudes: { day: number; hr: number | null }[], day: number): number | null {
  const previous = amplitudes
    .filter((a) => a.day < day && a.hr !== null)
    .slice(-BASELINE.maxNights)
    .map((a) => a.hr as number);
  return robustBaseline(previous)?.median ?? null;
}
