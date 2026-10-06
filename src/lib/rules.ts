// Flags (low/normal/high) and disease screens: diabetes (ADA), kidney
// (CKD-EPI 2021, KDIGO), anaemia (WHO, Mentzer), liver (FIB-4), lipids.
// Thresholds follow CLAUDE.md exactly.
import { differenceInYears, parseISO } from "date-fns";
import { getRange } from "./tests";
import { AGE_REFERENCE_DATE, type Flag, type Sex, type TestKey } from "./types";

export function flagValue(key: TestKey, value: number, sex: Sex): Flag {
  const { low, high } = getRange(key, sex);
  if (low !== undefined && value < low) return "low";
  if (high !== undefined && value > high) return "high";
  return "normal";
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
