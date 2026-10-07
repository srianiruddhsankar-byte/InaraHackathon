// Longitudinal biomarker trajectory analysis: for every biomarker with ≥ 2
// reports, the value per report date, absolute and relative (%) change vs the
// previous report, vs the patient's own baseline (mean of earlier reports) and
// since the first report, the yearly slope, direction and range status — and
// whether the change is clinically meaningful even though the value is still
// in range (e.g. Ravi's eGFR ≈ −31% since 2023 while still "normal").
//
// Censored results ("<5", ">300") are shown but never used for a % change,
// baseline or slope: the true value is unknown. Qualitative tests (NS1, IgM)
// have no trajectory.
import { format, parseISO } from "date-fns";
import { computeTrend, EGFR_NORMAL_MIN, linearRegression } from "./trends";
import { trendDecimals, trendName, trendRange, trendUnit } from "./review";
import { ageAtDate, egfrCkdEpi2021, flagValue } from "./rules";
import { NUMERIC_TEST_KEYS, refText, TESTS } from "./tests";
import type { Patient, Qualifier, Report, Sex, TrendKey } from "./types";

/** Relative change in %, (to − from) ÷ |from| × 100; null when it can't be computed (from = 0, not finite). */
export function percentChange(from: number, to: number): number | null {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) return null;
  return ((to - from) / Math.abs(from)) * 100;
}

// ---- What counts as a "meaningful" change -------------------------------------

export interface ChangeThreshold {
  /** Relative change (%) at or beyond which a change is meaningful for this person. */
  percent: number;
  reason: string;
}

const RCV_REASON =
  "Reference change value (RCV, 95%): the smallest change between two results of the same person that is unlikely to be " +
  "lab imprecision or normal day-to-day variation — RCV = 2.77 × √(CVa² + CVi²), rounded up, from typical within-person " +
  "biological variation (EFLM Biological Variation Database).";

function rcv(percent: number): ChangeThreshold {
  return { percent, reason: RCV_REASON };
}

/**
 * Per-biomarker thresholds for a clinically meaningful relative change.
 * Prototype values: rounded, approximate — each with its reason.
 */
export const MEANINGFUL_CHANGE: Record<TrendKey, ChangeThreshold> = {
  egfr: {
    percent: 25,
    reason:
      "KDIGO 2012: a certain drop in kidney function is an eGFR fall of ≥ 25% from baseline (smaller changes can be measurement variation).",
  },
  urine_acr: {
    percent: 100,
    reason: "KDIGO 2012: a doubling of urine ACR on repeat testing is beyond normal laboratory and day-to-day variation.",
  },
  hba1c: rcv(7),
  fasting_glucose: rcv(15),
  total_chol: rcv(17),
  ldl: rcv(25),
  hdl: rcv(20),
  triglycerides: rcv(60),
  creatinine: rcv(15),
  hb: rcv(10),
  wbc: rcv(35),
  mcv: rcv(5),
  rbc: rcv(10),
  hct: rcv(10),
  platelets: rcv(25),
  ferritin: rcv(40),
  ast: rcv(35),
  alt: rcv(50),
  ggt: rcv(35),
  tsh: rcv(55),
  vitamin_d: rcv(30),
  vitamin_b12: rcv(25),
  uric_acid: rcv(25),
  sodium: rcv(3),
  potassium: rcv(15),
  bun: rcv(40),
  crp: rcv(100),
  // Qualitative — never used (no trajectory), listed for completeness.
  ns1: { percent: Infinity, reason: "Qualitative test — no % change." },
  dengue_igm: { percent: Infinity, reason: "Qualitative test — no % change." },
};

// ---- Series --------------------------------------------------------------------

export interface TrajectoryPoint {
  date: string;
  value: number;
  /** "<" / ">" when the lab reported a bound: shown, but excluded from % change, baseline and slope. */
  qualifier?: Qualifier;
}

/** Points for a numeric test (or eGFR from creatinine) across reports, oldest first. */
export function trajectorySeries(patient: Patient, reports: Report[], key: TrendKey): TrajectoryPoint[] {
  const sorted = [...reports].sort((a, b) => a.date.localeCompare(b.date));
  const testKey = key === "egfr" ? "creatinine" : key;
  return sorted.flatMap((r) => {
    const v = r.values.find((lv) => lv.testKey === testKey);
    if (!v || !Number.isFinite(v.value)) return [];
    if (key !== "egfr") return [{ date: r.date, value: v.value, qualifier: v.qualifier }];
    const egfr = egfrCkdEpi2021(v.value, ageAtDate(patient.age, r.date), patient.sex);
    // eGFR falls as creatinine rises, so a censored creatinine gives the opposite bound.
    const flip: Partial<Record<Qualifier, Qualifier>> = { "<": ">", ">": "<", "≤": "≥", "≥": "≤" };
    return [{ date: r.date, value: egfr, qualifier: v.qualifier ? flip[v.qualifier] : undefined }];
  });
}

// ---- Summary -------------------------------------------------------------------

export interface Change {
  /** Absolute change in the test's unit. */
  abs: number;
  /** Relative change in %, null when it can't be computed. */
  pct: number | null;
}

export interface TrajectorySummary {
  key: TrendKey;
  name: string;
  unit: string;
  decimals: number;
  points: TrajectoryPoint[];
  /** "Ref: 0.7–1.3 mg/dL" (eGFR: "Ref: ≥60 mL/min/1.73m²"). */
  ref: string;
  range: { low?: number; high?: number };
  latest: TrajectoryPoint;
  /** Mean of the earlier uncensored values; undefined when there are none. */
  baselineMean?: number;
  /** Change of the latest value vs the previous report (both uncensored), else undefined. */
  vsPrevious?: Change;
  /** vs the patient's own baseline (mean of earlier reports). */
  vsBaseline?: Change;
  /** vs the first uncensored report. */
  sinceFirst?: Change & { date: string };
  /** Least-squares slope per year over the uncensored points (≥ 2). */
  slopePerYear?: number;
  direction: "rising" | "falling" | "stable";
  inRange: boolean;
  threshold: ChangeThreshold;
  /** |% vs baseline| or |% since first| reaches the threshold, and the direction is not stable. */
  meaningful: boolean;
  /** Meaningful change while still in range — the ones easy to miss. */
  highlight: boolean;
}

function isInRange(key: TrendKey, value: number, sex: Sex): boolean {
  if (key === "egfr") return value >= EGFR_NORMAL_MIN;
  return flagValue(key, value, sex) === "normal";
}

function change(from: number, to: number): Change {
  return { abs: to - from, pct: percentChange(from, to) };
}

/**
 * Trajectory for one biomarker; null with fewer than 2 reports.
 * Direction: with ≥ 3 uncensored points the trend engine's rule (good fit and
 * ≥ 3% of baseline per year); with 2 points, rising / falling only when the
 * change reaches the meaningful threshold.
 */
export function trajectorySummary(key: TrendKey, points: TrajectoryPoint[], sex: Sex): TrajectorySummary | null {
  if (points.length < 2) return null;
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1];
  const exact = sorted.filter((p) => !p.qualifier);
  const latestExact = !latest.qualifier;
  const earlierExact = exact.filter((p) => p !== latest);
  const previous = sorted[sorted.length - 2];
  const threshold = MEANINGFUL_CHANGE[key];

  const baselineMean = earlierExact.length
    ? earlierExact.reduce((a, p) => a + p.value, 0) / earlierExact.length
    : undefined;
  const vsPrevious = latestExact && !previous.qualifier ? change(previous.value, latest.value) : undefined;
  const vsBaseline = latestExact && baselineMean !== undefined ? change(baselineMean, latest.value) : undefined;
  const first = earlierExact[0];
  const sinceFirst = latestExact && first ? { ...change(first.value, latest.value), date: first.date } : undefined;
  const slopePerYear = exact.length >= 2 ? linearRegression(exact).slopePerYear : undefined;

  const biggest = Math.max(Math.abs(vsBaseline?.pct ?? 0), Math.abs(sinceFirst?.pct ?? 0));
  let direction: TrajectorySummary["direction"] = "stable";
  if (exact.length >= 3 && latestExact) {
    direction = computeTrend(key, exact, sex)?.direction ?? "stable";
  } else if (vsPrevious?.pct != null && Math.abs(vsPrevious.pct) >= threshold.percent) {
    direction = vsPrevious.pct > 0 ? "rising" : "falling";
  }
  const inRange = latest.qualifier
    ? key !== "egfr" && flagValue(key, latest.value, sex) === "normal" && (latest.qualifier === "<" || latest.qualifier === "≤")
    : isInRange(key, latest.value, sex);
  const meaningful = direction !== "stable" && biggest >= threshold.percent;

  return {
    key,
    name: trendName(key),
    unit: trendUnit(key),
    decimals: trendDecimals(key),
    points: sorted,
    ref: key === "egfr" ? `Ref: ≥${EGFR_NORMAL_MIN} ${trendUnit(key)}` : refText(key, sex),
    range: trendRange(key, sex),
    latest,
    baselineMean,
    vsPrevious,
    vsBaseline,
    sinceFirst,
    slopePerYear,
    direction,
    inRange,
    threshold,
    meaningful,
    highlight: meaningful && inRange,
  };
}

/** Lab order first, eGFR right after creatinine. Numeric tests only. */
export const TRAJECTORY_KEYS: TrendKey[] = NUMERIC_TEST_KEYS.flatMap((k): TrendKey[] => (k === "creatinine" ? [k, "egfr"] : [k]));

/** Every biomarker with ≥ 2 reports: highlighted first, then meaningful, then the rest (lab order). */
export function buildTrajectories(patient: Patient, reports: Report[]): TrajectorySummary[] {
  const rank = (t: TrajectorySummary) => (t.highlight ? 0 : t.meaningful ? 1 : 2);
  return TRAJECTORY_KEYS.flatMap((key) => {
    const t = trajectorySummary(key, trajectorySeries(patient, reports, key), patient.sex);
    return t ? [t] : [];
  })
    .map((t, i) => ({ t, i }))
    .sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i)
    .map(({ t }) => t);
}

/** "−30.6%" / "+4.2%" / "—". */
export function formatPct(pct: number | null | undefined, decimals = 1): string {
  if (pct == null) return "—";
  const s = Math.abs(pct).toFixed(decimals);
  if (Number(s) === 0) return `0${decimals ? "." + "0".repeat(decimals) : ""}%`;
  return `${pct < 0 ? "−" : "+"}${s}%`;
}

// ---- Patient wording (plain, no numbers) ----------------------------------------

/** The subject of a patient sentence, e.g. "Your kidney filtering". */
const PLAIN_SUBJECT: Partial<Record<TrendKey, string>> = {
  egfr: "Your kidney filtering",
  creatinine: "Your creatinine (a kidney waste product)",
  urine_acr: "The protein in your urine",
  hba1c: "Your average blood sugar (HbA1c)",
  fasting_glucose: "Your fasting blood sugar",
  total_chol: "Your total cholesterol",
  ldl: "Your LDL (“bad”) cholesterol",
  hdl: "Your HDL (“good”) cholesterol",
  triglycerides: "Your triglycerides (blood fats)",
  hb: "Your haemoglobin",
  wbc: "Your white blood cell count",
  platelets: "Your platelet count",
  hct: "Your haematocrit (how concentrated the blood is)",
  mcv: "Your red cell size",
  rbc: "Your red blood cell count",
  ferritin: "Your iron stores (ferritin)",
  ast: "Your liver enzyme AST",
  alt: "Your liver enzyme ALT",
  sodium: "Your blood sodium",
  potassium: "Your blood potassium",
  crp: "Your inflammation marker (CRP)",
};

function subjectFor(key: TrendKey): string {
  const name = key === "egfr" ? "eGFR" : TESTS[key].name;
  return PLAIN_SUBJECT[key] ?? `Your ${/^[A-Z][a-z]+(\s|$)/.test(name) ? name[0].toLowerCase() + name.slice(1) : name}`;
}

/** "about a third", "about half", "about twice as high"… — no numbers. */
export function plainAmount(pct: number): string {
  const a = Math.abs(pct);
  if (pct > 0 && a >= 90) return a >= 190 ? "to more than double" : "to about double";
  if (a < 8) return "slightly";
  if (a < 14) return "by about a tenth";
  if (a < 18.5) return "by about a sixth";
  if (a < 23) return "by about a fifth";
  if (a < 29) return "by about a quarter";
  if (a < 40) return "by about a third";
  if (a < 60) return "by about half";
  if (a < 70) return "by about two-thirds";
  return "by about three-quarters";
}

/**
 * Plain sentences for the patient (approved reports only — the caller passes them):
 * one per meaningful change, kidney creatinine dropped when eGFR says the same thing.
 * No z-scores, slopes or percentages.
 */
export function patientTrajectorySentences(trajectories: TrajectorySummary[]): string[] {
  const meaningful = trajectories.filter((t) => t.meaningful);
  const keys = new Set(meaningful.map((t) => t.key));
  return meaningful
    .filter((t) => !(t.key === "creatinine" && keys.has("egfr")))
    .flatMap((t) => {
      const ch = Math.abs(t.sinceFirst?.pct ?? 0) >= Math.abs(t.vsBaseline?.pct ?? 0) ? t.sinceFirst : t.vsBaseline;
      if (ch?.pct == null) return [];
      const from = t.sinceFirst?.date ?? t.points[0].date;
      const since = from.slice(0, 4) === t.latest.date.slice(0, 4) ? format(parseISO(from), "MMMM") : from.slice(0, 4);
      const amount = plainAmount(ch.pct);
      const verb = ch.pct < 0 ? (t.key === "egfr" ? "dropped" : "gone down") : "gone up";
      const tail = t.inRange
        ? " — it is still in the normal range, and your doctor is following this up."
        : " — your doctor is following this up.";
      return [`${subjectFor(t.key)} has ${verb} ${amount} since ${since}${tail}`];
    });
}
