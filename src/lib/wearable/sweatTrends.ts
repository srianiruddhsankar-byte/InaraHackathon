// Daily sweat trends for the Longitudinal trajectory view (pure, tested).
//
// For each daily sweat analyte (never alcohol): the median of the last 7 days
// vs the person's own baseline (the days before that, up to 28), the change
// (absolute and %), the direction, and whether the recent value is outside the
// personal usual range (baseline median ± 2 robust SD — the band on the
// Wearable charts). Sweat is compared only with the same person's sweat,
// never with blood or with the literature range.
import { robustBaseline, BASELINE } from "./baseline";
import { SENSE_MIN_SPREAD, type SenseEvaluation } from "./senseClean";
import { DAILY_SWEAT, SWEAT_ANALYTES, typicalSweatText, type SweatAnalyte } from "./sweatPanel";

export const SWEAT_TREND = {
  /** Recent window (days). */
  recentDays: 7,
  /** A recent value needs this many days with a reading; the baseline needs this many earlier days. */
  minRecent: 3,
  minBaseline: 7,
  /** |% change| below this = stable. */
  stablePct: 10,
  /** Outside the personal usual range = beyond ± this many robust SD. */
  bandSd: 2,
};

export interface SweatTrend {
  analyte: Exclude<SweatAnalyte, "ethanol">;
  label: string;
  unit: string;
  decimals: number;
  research: boolean;
  typical: string;
  /** Daily values up to the day shown (null = no reading). */
  values: (number | null)[];
  baseline: number | null;
  recent: number | null;
  change: { abs: number; pct: number | null } | null;
  direction: "rising" | "falling" | "stable" | null;
  outsideUsual: boolean;
}

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Trends for every daily sweat analyte up to `uptoDay` (1-based). */
export function sweatTrends(days: SenseEvaluation[], uptoDay: number): SweatTrend[] {
  const shown = days.slice(0, uptoDay);
  const splitAt = Math.max(0, shown.length - SWEAT_TREND.recentDays);
  return DAILY_SWEAT.map((a) => {
    const info = SWEAT_ANALYTES[a];
    const values = shown.map((e) => e.sense[a]);
    const nums = (xs: (number | null)[]) => xs.filter((v): v is number => v !== null);
    const earlier = nums(values.slice(0, splitAt)).slice(-BASELINE.maxNights);
    const recentVals = nums(values.slice(splitAt));
    const base = earlier.length >= SWEAT_TREND.minBaseline ? robustBaseline(earlier, SENSE_MIN_SPREAD[a]) : null;
    const recent = recentVals.length >= SWEAT_TREND.minRecent ? median(recentVals) : null;
    const round = (v: number) => Math.round(v * 10 ** info.decimals) / 10 ** info.decimals;
    let change: SweatTrend["change"] = null;
    let direction: SweatTrend["direction"] = null;
    let outsideUsual = false;
    if (base && recent !== null) {
      const abs = recent - base.median;
      const pct = base.median !== 0 ? Math.round((abs / base.median) * 1000) / 10 : null;
      change = { abs: round(abs), pct };
      direction = pct === null || Math.abs(pct) < SWEAT_TREND.stablePct ? "stable" : abs > 0 ? "rising" : "falling";
      outsideUsual = Math.abs(abs) > SWEAT_TREND.bandSd * base.spread;
    }
    return {
      analyte: a,
      label: info.label,
      unit: info.unit,
      decimals: info.decimals,
      research: info.research,
      typical: typicalSweatText(a),
      values,
      baseline: base ? round(base.median) : null,
      recent: recent === null ? null : round(recent),
      change,
      direction,
      outsideUsual,
    };
  });
}
