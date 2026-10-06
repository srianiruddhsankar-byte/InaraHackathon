// Flags (low/normal/high) and disease screens: diabetes (ADA), kidney
// (CKD-EPI 2021, KDIGO), anaemia (WHO, Mentzer), liver (FIB-4), lipids,
// dengue (WHO 1997 / 2009: platelets, haematocrit vs baseline, WBC, NS1/IgM).
// Thresholds follow CLAUDE.md exactly.
import { differenceInYears, parseISO } from "date-fns";
import { getRange, TESTS } from "./tests";
import { AGE_REFERENCE_DATE, type Flag, type QualResult, type Qualifier, type Sex, type TestKey } from "./types";

export function flagValue(key: TestKey, value: number, sex: Sex): Flag {
  const { low, high } = getRange(key, sex);
  if (low !== undefined && value < low) return "low";
  if (high !== undefined && value > high) return "high";
  return "normal";
}

/**
 * Flag a censored result ("<5", ">300"). The true value lies beyond the bound, so:
 * "<X" is normal when X is at most the upper limit (or the next reportable step
 * above it, e.g. LDL "<130" with limit ≤129), and low when X is at or below the
 * lower limit. ">X" is high when X is at or above the upper limit. Otherwise
 * the bound itself is flagged so the doctor still reviews it.
 */
export function flagLabValue(key: TestKey, value: number, sex: Sex, qualifier?: Qualifier): Flag {
  if (!qualifier) return flagValue(key, value, sex);
  const { low, high } = getRange(key, sex);
  if (qualifier === "<" || qualifier === "≤") {
    if (low !== undefined && (qualifier === "<" ? value <= low : value < low)) return "low";
    if (high === undefined || value <= high + 10 ** -TESTS[key].decimals) return "normal";
    return flagValue(key, value, sex);
  }
  if (high !== undefined && (qualifier === ">" ? value >= high : value > high)) return "high";
  return flagValue(key, value, sex);
}

/** Age on `date`, given the patient's age on AGE_REFERENCE_DATE. */
export function ageAtDate(age: number, date: string): number {
  return age + differenceInYears(parseISO(date), parseISO(AGE_REFERENCE_DATE));
}

// --- Kidney ---------------------------------------------------------------

/** eGFR (mL/min/1.73m²), CKD-EPI 2021 race-free equation. Creatinine in mg/dL. */
export function egfrCkdEpi2021(scr: number, age: number, sex: Sex): number {
  const kappa = sex === "F" ? 0.7 : 0.9;
  const alpha = sex === "F" ? -0.241 : -0.302;
  const ratio = scr / kappa;
  return (
    142 *
    Math.min(ratio, 1) ** alpha *
    Math.max(ratio, 1) ** -1.2 *
    0.9938 ** age *
    (sex === "F" ? 1.012 : 1)
  );
}

export type GStage = "G1" | "G2" | "G3a" | "G3b" | "G4" | "G5";
export type AStage = "A1" | "A2" | "A3";

export function kdigoGStage(egfr: number): GStage {
  if (egfr >= 90) return "G1";
  if (egfr >= 60) return "G2";
  if (egfr >= 45) return "G3a";
  if (egfr >= 30) return "G3b";
  if (egfr >= 15) return "G4";
  return "G5";
}

export function kdigoAStage(acr: number): AStage {
  if (acr >= 300) return "A3";
  if (acr >= 30) return "A2";
  return "A1";
}

/** KDIGO: sustained eGFR decline of more than 5 mL/min/1.73m² per year. */
export const RAPID_EGFR_DECLINE_PER_YEAR = 5;

export function isRapidEgfrDecline(slopePerYear: number): boolean {
  return slopePerYear < -RAPID_EGFR_DECLINE_PER_YEAR;
}

// --- Diabetes -------------------------------------------------------------

export type AdaCategory = "normal" | "prediabetes" | "diabetes";

const ADA_ORDER: AdaCategory[] = ["normal", "prediabetes", "diabetes"];

export function adaFromHba1c(hba1c: number): AdaCategory {
  if (hba1c >= 6.5) return "diabetes";
  if (hba1c >= 5.7) return "prediabetes";
  return "normal";
}

export function adaFromFastingGlucose(glucose: number): AdaCategory {
  if (glucose >= 126) return "diabetes";
  if (glucose >= 100) return "prediabetes";
  return "normal";
}

/** Worst ADA category across the available markers. */
export function adaCategory(input: { hba1c?: number; fastingGlucose?: number }): AdaCategory {
  const cats: AdaCategory[] = [];
  if (input.hba1c !== undefined) cats.push(adaFromHba1c(input.hba1c));
  if (input.fastingGlucose !== undefined) cats.push(adaFromFastingGlucose(input.fastingGlucose));
  return cats.reduce<AdaCategory>(
    (worst, c) => (ADA_ORDER.indexOf(c) > ADA_ORDER.indexOf(worst) ? c : worst),
    "normal",
  );
}

// --- Anaemia --------------------------------------------------------------

/** WHO haemoglobin threshold for anaemia (g/dL): 13 men, 12 women, 11 in pregnancy. */
export function anaemiaThreshold(sex: Sex, pregnant = false): number {
  if (sex === "F" && pregnant) return 11;
  return sex === "F" ? 12 : 13;
}

export function isAnaemic(hb: number, sex: Sex, pregnant = false): boolean {
  return hb < anaemiaThreshold(sex, pregnant);
}

export type MentzerSuggestion = "thalassaemia_trait" | "iron_deficiency" | "indeterminate";

/** Mentzer index = MCV ÷ RBC. <13 suggests thalassaemia trait, >13 iron deficiency. */
export function mentzer(mcv: number, rbc: number): { index: number; suggests: MentzerSuggestion } {
  const index = mcv / rbc;
  const suggests = index < 13 ? "thalassaemia_trait" : index > 13 ? "iron_deficiency" : "indeterminate";
  return { index, suggests };
}

// --- Liver ----------------------------------------------------------------

export type Fib4Risk = "low" | "indeterminate" | "high";

/** FIB-4 = (age × AST) ÷ (platelets × √ALT). Platelets in 10^3/µL. */
export function fib4(age: number, ast: number, alt: number, platelets: number): { score: number; risk: Fib4Risk } {
  const score = (age * ast) / (platelets * Math.sqrt(alt));
  const risk = score < 1.3 ? "low" : score > 2.67 ? "high" : "indeterminate";
  return { score, risk };
}

// --- Lipids ---------------------------------------------------------------

export type LdlCategory = "normal" | "borderline" | "high";

export function ldlCategory(ldl: number): LdlCategory {
  if (ldl >= 160) return "high";
  if (ldl >= 130) return "borderline";
  return "normal";
}

export function isHdlLow(hdl: number, sex: Sex): boolean {
  return hdl < (sex === "F" ? 50 : 40);
}

export function isTriglyceridesHigh(tg: number): boolean {
  return tg >= 150;
}

// --- Dengue (WHO 1997 / WHO 2009) -------------------------------------------

export const DENGUE = {
  lowPlatelets: { value: 100, reason: "Platelets <100 ×10³/µL: WHO 1997 DHF criterion and a WHO 2009 severity marker." },
  haemoconcentration: { value: 20, reason: "Haematocrit ≥20% above the person's baseline = evidence of plasma leakage (WHO 1997)." },
  hctRise: { value: 10, reason: "A rising haematocrit together with a rapid platelet fall is a WHO 2009 warning sign." },
  plateletFall: { value: 50, reason: "Platelets falling to half the person's baseline or less counts as a rapid fall." },
  lowWbc: { value: 4.0, reason: "WBC <4.0 ×10³/µL (leucopenia) is common in dengue (WHO 2009 'probable dengue')." },
} as const;

export function isLowPlatelets(platelets: number): boolean {
  return platelets < DENGUE.lowPlatelets.value;
}

export function isLowWbc(wbc: number): boolean {
  return wbc < DENGUE.lowWbc.value;
}

/** Change from baseline in percent (+ = rise), to 0.01% so 50.4 vs 42 is exactly +20%. */
export function percentChange(latest: number, baseline: number): number {
  return Math.round(((latest - baseline) / baseline) * 10000) / 100;
}

export interface DengueMarkers {
  ns1?: QualResult;
  igm?: QualResult;
  /** NS1 and/or IgM positive. */
  positive: boolean;
  /** At least one equivocal and none positive. */
  equivocal: boolean;
  /** Every marker measured is negative. */
  negative: boolean;
}

/** NS1 antigen and IgM as stored codes (Negative 0, Equivocal 0.5, Positive 1). */
export function dengueMarkers(ns1?: number, igm?: number): DengueMarkers | null {
  if (ns1 === undefined && igm === undefined) return null;
  const word = (v?: number): QualResult | undefined => (v === undefined ? undefined : v >= 1 ? "Positive" : v > 0 ? "Equivocal" : "Negative");
  const out: DengueMarkers = { positive: false, equivocal: false, negative: false };
  const n = word(ns1);
  const m = word(igm);
  if (n) out.ns1 = n;
  if (m) out.igm = m;
  const all = [n, m].filter((x): x is QualResult => !!x);
  out.positive = all.includes("Positive");
  out.equivocal = !out.positive && all.includes("Equivocal");
  out.negative = all.every((x) => x === "Negative");
  return out;
}

export type HaematocritKind = "haemoconcentration" | "warning" | "rise" | "no_rise" | "no_baseline";

export interface HaematocritAssessment {
  kind: HaematocritKind;
  /** % change of haematocrit from the baseline. */
  hctChange?: number;
  /** % change of platelets from the baseline (negative = fall). */
  plateletChange?: number;
  /** WHO 2009: haematocrit rise ≥10% with platelets fallen ≥50%. */
  warningSign: boolean;
}

/**
 * Haematocrit against the person's own earlier value (WHO 1997 / 2009):
 * ≥20% rise → haemoconcentration (plasma leakage); ≥10% rise with platelets
 * fallen ≥50% → warning sign; no earlier haematocrit → "no_baseline".
 */
export function assessHaematocrit(input: {
  hct: number;
  platelets?: number;
  baselineHct?: number;
  baselinePlatelets?: number;
}): HaematocritAssessment {
  if (input.baselineHct === undefined) return { kind: "no_baseline", warningSign: false };
  const hctChange = percentChange(input.hct, input.baselineHct);
  const plateletChange =
    input.platelets !== undefined && input.baselinePlatelets !== undefined
      ? percentChange(input.platelets, input.baselinePlatelets)
      : undefined;
  const warningSign =
    hctChange >= DENGUE.hctRise.value && plateletChange !== undefined && plateletChange <= -DENGUE.plateletFall.value;
  const kind: HaematocritKind =
    hctChange >= DENGUE.haemoconcentration.value ? "haemoconcentration" : warningSign ? "warning" : hctChange >= DENGUE.hctRise.value ? "rise" : "no_rise";
  const out: HaematocritAssessment = { kind, hctChange, warningSign };
  if (plateletChange !== undefined) out.plateletChange = plateletChange;
  return out;
}
