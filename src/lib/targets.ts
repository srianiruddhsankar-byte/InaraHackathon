// Personalised targets: the target that applies to THIS patient for each
// test, with a reason and source, falling back to the population reference
// range. Guideline-based examples for the prototype — a real deployment
// would use local protocols, and the doctor can override any target.
import { ageAtDate } from "./rules";
import { formatValue, getRange, isQualitative, TEST_KEYS, TESTS } from "./tests";
import type { Finding, Patient, TargetOverride, TestKey, Trend } from "./types";

export type TargetKind = "reference" | "guideline" | "override";

export interface PatientTarget {
  testKey: TestKey;
  /** Population reference range, e.g. "≤129 mg/dL". */
  populationRange: string;
  /** Meets target when value ≥ low and value < high (high is exclusive for guideline targets). */
  low?: number;
  high?: number;
  /** True when `high` is a strict "<" bound. */
  highExclusive?: boolean;
  /** e.g. "<55 mg/dL" */
  label: string;
  reason: string;
  source: string;
  kind: TargetKind;
  /** The guideline/reference target this replaces, when overridden. */
  replaced?: { label: string; reason: string; source: string };
  override?: Pick<TargetOverride, "author" | "timestamp" | "reason">;
}

// --- context --------------------------------------------------------------

const ASCVD =
  /coronary|heart attack|myocardial|\bmi\b|stroke|\btia\b|angina|ascvd|\bcad\b|ischaemic heart|ischemic heart|heart disease|peripheral arter|\bpad\b|stent|cabg/i;
const DIABETES = /(?<!pre)diabet|\bt2dm\b|\bt1dm\b/i;

export function hasAscvd(patient: Patient): boolean {
  return patient.chronicConditions.some((c) => ASCVD.test(c));
}

/** Known diabetes (chronic condition) or values in the ADA diabetes range on this panel. */
export function hasDiabetes(patient: Patient, findings: Finding[]): boolean {
  return (
    patient.chronicConditions.some((c) => DIABETES.test(c)) ||
    findings.some((f) => f.screen === "diabetes" && f.pattern === "diabetes_range")
  );
}

function rangeLabel(key: TestKey, patient: Patient): string {
  if (isQualitative(key)) return "Negative";
  const { low, high } = getRange(key, patient.sex);
  const unit = TESTS[key].unit;
  if (low !== undefined && high !== undefined) return `${low}–${high} ${unit}`;
  if (high !== undefined) return `≤${high} ${unit}`;
  if (low !== undefined) return `≥${low} ${unit}`;
  return "—";
}

function reference(key: TestKey, patient: Patient): PatientTarget {
  const { low, high } = getRange(key, patient.sex);
  const label = rangeLabel(key, patient);
  return {
    testKey: key,
    populationRange: label,
    low,
    high,
    label,
    reason: "Population reference range",
    source: "Lab reference range",
    kind: "reference",
  };
}

function below(key: TestKey, patient: Patient, high: number, reason: string, source: string): PatientTarget {
  return {
    ...reference(key, patient),
    low: undefined,
    high,
    highExclusive: true,
    label: `<${high} ${TESTS[key].unit}`,
    reason,
    source,
    kind: "guideline",
  };
}

// --- rules ----------------------------------------------------------------

function ldlTarget(patient: Patient, findings: Finding[], age: number): PatientTarget {
  const ascvd = hasAscvd(patient);
  const diabetes = hasDiabetes(patient, findings);
  if (ascvd) {
    return below(
      "ldl",
      patient,
      55,
      diabetes ? "Diabetes with heart/vascular disease (very high risk)" : "Heart/vascular disease (very high risk)",
      "ESC/EAS 2019",
    );
  }
  if (diabetes && age >= 40 && age <= 75) {
    return below("ldl", patient, 70, `Diabetes, age ${age} (40–75)`, "ADA Standards of Care");
  }
  return reference("ldl", patient);
}

function hba1cTarget(patient: Patient, findings: Finding[], age: number): PatientTarget {
  if (!hasDiabetes(patient, findings)) return reference("hba1c", patient);
  const conditions = patient.chronicConditions.length;
  if (age >= 65 && conditions >= 3) {
    return below("hba1c", patient, 8.0, `Age ${age} with ${conditions} chronic conditions`, "ADA older adults");
  }
  if (age >= 65) return below("hba1c", patient, 7.5, `Age ${age}, otherwise healthy`, "ADA older adults");
  return below("hba1c", patient, 7.0, "Adult with diabetes", "ADA Standards of Care");
}

function hbTarget(patient: Patient): PatientTarget {
  if (patient.sex === "F" && patient.pregnant) {
    return {
      ...reference("hb", patient),
      low: 11,
      high: undefined,
      label: `≥11 ${TESTS.hb.unit}`,
      reason: "Pregnancy — anaemia below 11 g/dL",
      source: "WHO",
      kind: "guideline",
    };
  }
  return reference("hb", patient);
}

function applyOverride(target: PatientTarget, o: TargetOverride): PatientTarget {
  const unit = TESTS[target.testKey].unit;
  return {
    ...target,
    low: o.op === ">" ? o.value : undefined,
    high: o.op === "<" ? o.value : undefined,
    highExclusive: o.op === "<",
    label: `${o.op}${o.value} ${unit}`,
    reason: o.reason,
    source: `Set by ${o.author}`,
    kind: "override",
    replaced: { label: target.label, reason: target.reason, source: target.source },
    override: { author: o.author, timestamp: o.timestamp, reason: o.reason },
  };
}

/**
 * The target for every test for this patient: guideline targets where a rule
 * applies, otherwise the population range; doctor overrides win.
 * Uses age (at `onDate`), sex, pregnancy and chronic conditions.
 */
export function getTargets(
  patient: Patient,
  findings: Finding[],
  overrides: TargetOverride[] = [],
  onDate?: string,
): PatientTarget[] {
  const age = onDate ? ageAtDate(patient.age, onDate) : patient.age;
  return TEST_KEYS.map((key) => {
    let t: PatientTarget;
    if (key === "ldl") t = ldlTarget(patient, findings, age);
    else if (key === "hba1c") t = hba1cTarget(patient, findings, age);
    else if (key === "hb") t = hbTarget(patient);
    else t = reference(key, patient);
    const o = overrides.find((x) => x.patientId === patient.id && x.testKey === key);
    return o ? applyOverride(t, o) : t;
  });
}

export function targetFor(targets: PatientTarget[], key: TestKey): PatientTarget | undefined {
  return targets.find((t) => t.testKey === key);
}

export function meetsTarget(t: PatientTarget, value: number): boolean {
  if (t.low !== undefined && value < t.low) return false;
  if (t.high !== undefined && (t.highExclusive ? value >= t.high : value > t.high)) return false;
  return true;
}

/** Targets that differ from the population range (guideline or doctor-set). */
export function personalisedTargets(targets: PatientTarget[]): PatientTarget[] {
  return targets.filter((t) => t.kind !== "reference");
}

/** "LDL cholesterol 150 mg/dL is above target <70 mg/dL" style text, or null when met. */
export function targetGap(t: PatientTarget, value: number): string | null {
  if (meetsTarget(t, value)) return null;
  const dir = t.low !== undefined && value < t.low ? "below" : "above";
  return `${TESTS[t.testKey].name} ${formatValue(t.testKey, value)} is ${dir} target ${t.label}`;
}

// --- eGFR: expected vs actual decline --------------------------------------

/** Typical age-related eGFR decline after 40 (mL/min/1.73m² per year). */
export const EXPECTED_EGFR_DECLINE_AFTER_40 = 1;

export interface EgfrDeclineComparison {
  expectedPerYear: number; // negative = decline
  actualPerYear: number;
  /** How many times faster than expected (only when both are declines). */
  timesExpected?: number;
  text: string;
}

export function egfrDeclineComparison(age: number, egfrTrend: Trend | undefined): EgfrDeclineComparison | null {
  if (!egfrTrend) return null;
  const expected = age > 40 ? -EXPECTED_EGFR_DECLINE_AFTER_40 : 0;
  const actual = egfrTrend.slopePerYear;
  const times = expected < 0 && actual < 0 ? actual / expected : undefined;
  const fmt = (n: number) => `${n < 0 ? "−" : n > 0 ? "+" : ""}${Math.abs(n).toFixed(1)}/yr`;
  const text =
    expected < 0
      ? `Expected for age ${age}: about ${fmt(expected)}. This patient: ${fmt(actual)}${
          times && times >= 1.5 ? ` (${times.toFixed(1)}× faster)` : ""
        }.`
      : `Age ${age}: little or no age-related decline expected. This patient: ${fmt(actual)}.`;
  return { expectedPerYear: expected, actualPerYear: actual, timesExpected: times, text };
}
