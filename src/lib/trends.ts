// Trend engine: slope per year, deviation from the patient's own baseline,
// and "drifting within range" detection. eGFR is derived from creatinine
// and trended like any other test.
import { parseISO } from "date-fns";
import { ageAtDate, egfrCkdEpi2021, flagValue } from "./rules";
import { NUMERIC_TEST_KEYS } from "./tests";
import type { Patient, Report, Sex, TestKey, Trend, TrendKey } from "./types";

export interface SeriesPoint {
  date: string;
  value: number;
}

/** A trend counts only with this many reports… */
export const MIN_POINTS_FOR_TREND = 3;
/** …a slope of at least this fraction of the baseline per year… */
export const MIN_RELATIVE_SLOPE = 0.03;
/** …and a good straight-line fit. */
export const MIN_R2 = 0.8;

/** eGFR at or above this is treated as "in range" for drift detection (G1–G2). */
export const EGFR_NORMAL_MIN = 60;

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

function sortByDate<T extends { date: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.date.localeCompare(b.date));
}

/** Least-squares line through the points, with x in years since the first point. */
export function linearRegression(points: SeriesPoint[]): { slopePerYear: number; r2: number } {
  const sorted = sortByDate(points);
  if (sorted.length < 2) return { slopePerYear: 0, r2: 0 };
  const t0 = parseISO(sorted[0].date).getTime();
  const xs = sorted.map((p) => (parseISO(p.date).getTime() - t0) / MS_PER_YEAR);
  const ys = sorted.map((p) => p.value);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0) return { slopePerYear: 0, r2: 0 };
  const slopePerYear = sxy / sxx;
  const r2 = syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  return { slopePerYear, r2 };
}

function isInRange(key: TrendKey, value: number, sex: Sex): boolean {
  if (key === "egfr") return value >= EGFR_NORMAL_MIN;
  return flagValue(key, value, sex) === "normal";
}

/** Trend for one series; null if there are no points. */
export function computeTrend(key: TrendKey, points: SeriesPoint[], sex: Sex): Trend | null {
  const sorted = sortByDate(points);
  if (sorted.length === 0) return null;
  const latest = sorted[sorted.length - 1].value;
  const earlier = sorted.slice(0, -1);
  const baselineMean = earlier.length
    ? earlier.reduce((a, p) => a + p.value, 0) / earlier.length
    : latest;
  const { slopePerYear, r2 } = linearRegression(sorted);
  const significant =
    sorted.length >= MIN_POINTS_FOR_TREND &&
    r2 >= MIN_R2 &&
    Math.abs(slopePerYear) >= MIN_RELATIVE_SLOPE * Math.abs(baselineMean);
  return {
    testKey: key,
    slopePerYear,
    baselineMean,
    latest,
    deviation: latest - baselineMean,
    direction: !significant ? "stable" : slopePerYear > 0 ? "rising" : "falling",
    driftingWithinRange: significant && isInRange(key, latest, sex),
  };
}

/** Points for a lab test across reports (reports missing the test are skipped). */
export function testSeries(reports: Report[], key: TestKey): SeriesPoint[] {
  return sortByDate(reports).flatMap((r) => {
    const v = r.values.find((lv) => lv.testKey === key);
    return v ? [{ date: r.date, value: v.value }] : [];
  });
}

/** eGFR per report, using the patient's age at each report date. */
export function egfrSeries(patient: Patient, reports: Report[]): SeriesPoint[] {
  return testSeries(reports, "creatinine").map((p) => ({
    date: p.date,
    value: egfrCkdEpi2021(p.value, ageAtDate(patient.age, p.date), patient.sex),
  }));
}

export function seriesFor(patient: Patient, reports: Report[], key: TrendKey): SeriesPoint[] {
  return key === "egfr" ? egfrSeries(patient, reports) : testSeries(reports, key);
}

/** Trends for every tracked numeric test plus eGFR (qualitative tests have no trend). */
export function computeTrends(patient: Patient, reports: Report[]): Trend[] {
  const keys: TrendKey[] = [...NUMERIC_TEST_KEYS, "egfr"];
  return keys.flatMap((key) => {
    const trend = computeTrend(key, seriesFor(patient, reports, key), patient.sex);
    return trend ? [trend] : [];
  });
}

export function findTrend(trends: Trend[], key: TrendKey): Trend | undefined {
  return trends.find((t) => t.testKey === key);
}
