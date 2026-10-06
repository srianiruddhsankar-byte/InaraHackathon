// Doctor review helpers: apply the doctor's finding edits, build the drafts
// from only the kept findings, and derive dashboard status, risk, evidence
// chips, trend labels and lab-table rows. All pure.
import { doctorDraft, patientExplanation } from "./draft";
import { SCREEN_TESTS, SEVERITY_ORDER } from "./findings";
import { isRapidEgfrDecline, mentzer } from "./rules";
import { formatValue, getRange, TESTS } from "./tests";
import { EGFR_NORMAL_MIN } from "./trends";
import type {
  Finding,
  FindingEdits,
  Flag,
  LabValue,
  Report,
  Severity,
  Sex,
  TestKey,
  TreatmentPlan,
  Trend,
  TrendKey,
} from "./types";
import { isApproved } from "./versions";

// --- finding edits --------------------------------------------------------

/** Findings the doctor kept, with any rewording applied. Order is preserved. */
export function applyFindingEdits(findings: Finding[], edits: FindingEdits = {}): Finding[] {
  return findings.flatMap((f) => {
    const edit = edits[f.id];
    if (!edit) return [f];
    if (!edit.included) return [];
    return [
      {
        ...f,
        title: edit.title?.trim() || f.title,
        summary: edit.summary?.trim() || f.summary,
        recommendation: edit.recommendation?.trim() || f.recommendation,
      },
    ];
  });
}

/** True when the doctor reworded the finding (not just toggled it). */
export function isReworded(f: Finding, edits: FindingEdits = {}): boolean {
  const e = edits[f.id];
  if (!e) return false;
  return (
    (!!e.title && e.title !== f.title) ||
    (!!e.summary && e.summary !== f.summary) ||
    (!!e.recommendation && e.recommendation !== f.recommendation)
  );
}

/** Trends behind the given findings only (in finding order). */
export function relevantTrends(trends: Trend[], findings: Finding[]): Trend[] {
  const keys = new Set(findings.flatMap((f) => (f.screen ? SCREEN_TESTS[f.screen] : [])));
  return trends.filter((t) => keys.has(t.testKey));
}

export interface Drafts {
  /** Clinical summary — doctor only. */
  clinical: string;
  /** What the patient will see after approval. */
  patient: string;
}

/** Both AI drafts, built only from the findings the doctor kept. */
export function buildDrafts(
  findings: Finding[],
  edits: FindingEdits | undefined,
  trends: Trend[],
  values: LabValue[],
  reportCount: number,
): Drafts {
  const kept = applyFindingEdits(findings, edits);
  return {
    clinical: doctorDraft(kept, relevantTrends(trends, kept), reportCount),
    patient: patientExplanation(kept, values),
  };
}

// --- dashboard ------------------------------------------------------------

export type ReviewStage = "awaiting_review" | "plan_pending" | "complete";

export const STAGE_LABEL: Record<ReviewStage, string> = {
  awaiting_review: "Awaiting review",
  plan_pending: "Treatment plan pending",
  complete: "Approved",
};

/** Where a report is in the doctor flow: review → treatment plan → done. */
export function reviewStage(report: Report, plans: TreatmentPlan[]): ReviewStage {
  if (!isApproved(report)) return "awaiting_review";
  const planApproved = plans.some((p) => p.reportId === report.id && p.status === "approved");
  return planApproved ? "complete" : "plan_pending";
}

/** Highest severity among findings ("normal" when there are none). */
export function riskOf(findings: Finding[]): Severity {
  return findings.reduce<Severity>(
    (worst, f) => (SEVERITY_ORDER[f.severity] < SEVERITY_ORDER[worst] ? f.severity : worst),
    "normal",
  );
}

export interface DashboardRow {
  name: string;
  stage?: ReviewStage;
  risk: Severity;
}

/** Awaiting review first, then by severity (high → normal), then by name. */
export function sortDashboard<T extends DashboardRow>(rows: T[]): T[] {
  const awaiting = (r: T) => (r.stage === "awaiting_review" ? 0 : 1);
  return [...rows].sort(
    (a, b) =>
      awaiting(a) - awaiting(b) ||
      SEVERITY_ORDER[a.risk] - SEVERITY_ORDER[b.risk] ||
      a.name.localeCompare(b.name),
  );
}

// --- trends and evidence chips -------------------------------------------

export function trendName(key: TrendKey): string {
  return key === "egfr" ? "eGFR" : TESTS[key].name;
}

export function trendUnit(key: TrendKey): string {
  return key === "egfr" ? "mL/min/1.73m²" : TESTS[key].unit;
}

/** Display decimals for a trend's values. */
export function trendDecimals(key: TrendKey): number {
  return key === "egfr" ? 0 : TESTS[key].decimals;
}

/** Short name used in chips, e.g. "LDL" instead of "LDL cholesterol". */
const SHORT_NAME: Partial<Record<TrendKey, string>> = {
  ldl: "LDL",
  hdl: "HDL",
  total_chol: "Total chol",
  urine_acr: "Urine ACR",
  hb: "Hb",
  rbc: "RBC",
  fasting_glucose: "Fasting glucose",
};

function signed(n: number, decimals: number): string {
  const s = Math.abs(n).toFixed(decimals);
  return n < 0 ? `−${s}` : `+${s}`;
}

/** Slope label, e.g. "+0.24 %/yr" or "−9.3 /yr" for eGFR. */
export function slopeLabel(trend: Trend, withUnit = true): string {
  const d = trendDecimals(trend.testKey) + 1;
  const unit = withUnit && trend.testKey !== "egfr" ? ` ${trendUnit(trend.testKey)}` : "";
  return `${signed(trend.slopePerYear, d)}${unit}/yr`;
}

/** Normal range for a trend key (eGFR: ≥60, i.e. G1–G2). */
export function trendRange(key: TrendKey, sex: Sex): { low?: number; high?: number } {
  return key === "egfr" ? { low: EGFR_NORMAL_MIN } : getRange(key, sex);
}

export interface TrendLabel {
  main: string;
  /** Small secondary text, e.g. "still within normal range". */
  secondary?: string;
  tone: Severity;
}

/** Plain label for a trend. Rapid eGFR decline in range → "Rapid decline" + "still within normal range". */
export function trendLabel(trend: Trend): TrendLabel {
  if (trend.testKey === "egfr" && isRapidEgfrDecline(trend.slopePerYear)) {
    return trend.latest >= EGFR_NORMAL_MIN
      ? { main: "Rapid decline", secondary: "still within normal range", tone: "high" }
      : { main: "Rapid decline", tone: "high" };
  }
  if (trend.direction === "stable") return { main: "Stable", tone: "normal" };
  const main = trend.direction === "rising" ? "Rising" : "Falling";
  return trend.driftingWithinRange
    ? { main, secondary: "still within normal range", tone: "watch" }
    : { main, tone: "watch" };
}

/** Compact evidence chips for a finding, e.g. "eGFR 64 · −9.3/yr". */
export function findingChips(finding: Finding, trends: Trend[]): string[] {
  if (!finding.screen) return [];
  const byKey = new Map(trends.map((t) => [t.testKey, t]));
  const chips: string[] = [];
  for (const key of SCREEN_TESTS[finding.screen]) {
    const t = byKey.get(key);
    if (!t) continue;
    const value = key === "egfr" ? t.latest.toFixed(0) : formatValue(key, t.latest);
    const name = SHORT_NAME[key] ?? trendName(key);
    chips.push(t.direction === "stable" ? `${name} ${value}` : `${name} ${value} · ${slopeLabel(t, false)}`);
  }
  if (finding.screen === "anaemia") {
    const mcv = byKey.get("mcv")?.latest;
    const rbc = byKey.get("rbc")?.latest;
    if (mcv !== undefined && rbc !== undefined && mcv < 80) {
      chips.push(`Mentzer ${mentzer(mcv, rbc).index.toFixed(1)}`);
    }
  }
  return chips;
}

/** Trend keys to chart first: the tests behind the findings, in finding order. */
export function chartKeysFor(findings: Finding[]): TrendKey[] {
  const keys: TrendKey[] = [];
  for (const f of findings) {
    if (!f.screen) continue;
    if (f.category !== "suspected" && f.severity === "normal") continue;
    for (const k of SCREEN_TESTS[f.screen].slice(0, f.screen === "anaemia" ? 4 : 2)) {
      if (!keys.includes(k)) keys.push(k);
    }
  }
  return keys;
}

// --- lab table -------------------------------------------------------------

export interface LabRow {
  testKey: TestKey;
  name: string;
  value: number;
  unit: string;
  range: string;
  flag: Flag;
  /** latest − previous report's value; undefined when there's no previous value. */
  delta?: number;
  decimals: number;
}

/** "70–99", "≤129", "≥40" */
export function formatRange(range: { low?: number; high?: number }): string {
  const { low, high } = range;
  if (low !== undefined && high !== undefined) return `${low}–${high}`;
  if (high !== undefined) return `≤${high}`;
  if (low !== undefined) return `≥${low}`;
  return "—";
}

/** Rows for the lab table: the report's values with change vs the previous report. */
export function labRows(report: Report, previous: Report | undefined, sex: Sex): LabRow[] {
  return report.values.map((v) => {
    const prev = previous?.values.find((p) => p.testKey === v.testKey);
    return {
      testKey: v.testKey,
      name: TESTS[v.testKey].name,
      value: v.value,
      unit: v.unit,
      range: formatRange(getRange(v.testKey, sex)),
      flag: v.flag,
      delta: prev ? v.value - prev.value : undefined,
      decimals: TESTS[v.testKey].decimals,
    };
  });
}
