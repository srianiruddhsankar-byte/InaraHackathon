// The MarQ Sense sweat panel: one entry per analyte (pure data, tested).
//
// SWEAT, not blood: every "typical" range here is for sweat from the wrist
// patch, and none of them can be read as a blood value (sweat glucose is ~100×
// lower than blood glucose, for example). All ranges are LITERATURE VALUES,
// PROTOTYPE — TO BE VERIFIED against the sources listed (also "to verify").
//
// Chloride: the ≥ 60 mmol/L cut-off of the clinical sweat test (pilocarpine
// iontophoresis, used for cystic fibrosis) does NOT apply to exercise or
// heat sweat from a wearable, so it is deliberately not used anywhere.
import type { Specimen } from "../tests";

export type SweatAnalyte = "sodium" | "chloride" | "potassium" | "glucose" | "uricAcid" | "lactate" | "cortisol" | "ethanol";

export const SWEAT_RANGE_STATUS = "Literature values, prototype — to be verified";
export const SWEAT_NOT_BLOOD = "Sweat values are not blood values and can't be compared with a blood test. Use them for trends against this person's own usual only.";

export interface SweatAnalyteInfo {
  label: string;
  unit: string;
  specimen: Extract<Specimen, "sweat">;
  decimals: number;
  /** Typical wearable sweat range (literature values, prototype — to be verified). */
  typical: { low: number; high: number };
  /** Outside these = impossible reading (sensor fault), removed in cleaning. */
  limits: { min: number; max: number };
  /** Research-grade channel shown inside the "not a blood test" box on doctor screens. */
  research: boolean;
  /** Sources to verify (not confirmed citations). */
  sourcesToVerify: string;
  note?: string;
}

export const SWEAT_ANALYTES: Record<SweatAnalyte, SweatAnalyteInfo> = {
  sodium: {
    label: "Sweat sodium (Na)",
    unit: "mmol/L",
    specimen: "sweat",
    decimals: 0,
    typical: { low: 20, high: 60 },
    limits: { min: 5, max: 200 },
    research: false,
    sourcesToVerify: "Baker LB 2017, Sports Med (sweat sodium in athletes); Baker LB & Wolfe AS 2020, Eur J Appl Physiol (eccrine sweat composition review)",
  },
  chloride: {
    label: "Sweat chloride (Cl)",
    unit: "mmol/L",
    specimen: "sweat",
    decimals: 0,
    typical: { low: 15, high: 55 },
    limits: { min: 5, max: 200 },
    research: false,
    sourcesToVerify: "Baker LB & Wolfe AS 2020, Eur J Appl Physiol (eccrine sweat composition review)",
    note: "Exercise/heat sweat range. The clinical sweat-test cut-off is not used: it applies only to the pilocarpine sweat test.",
  },
  potassium: {
    label: "Sweat potassium (K)",
    unit: "mmol/L",
    specimen: "sweat",
    decimals: 1,
    typical: { low: 3, high: 8 },
    limits: { min: 1, max: 40 },
    research: true,
    sourcesToVerify: "Baker LB & Wolfe AS 2020, Eur J Appl Physiol",
  },
  glucose: {
    label: "Sweat glucose",
    unit: "mmol/L",
    specimen: "sweat",
    decimals: 2,
    typical: { low: 0.01, high: 0.2 },
    limits: { min: 0.005, max: 2 },
    research: true,
    sourcesToVerify: "Moyer J et al. 2012, Diabetes Technol Ther; Baker LB & Wolfe AS 2020",
    note: "About 100× lower than blood glucose.",
  },
  uricAcid: {
    label: "Sweat uric acid",
    unit: "µmol/L",
    specimen: "sweat",
    decimals: 0,
    typical: { low: 20, high: 100 },
    limits: { min: 2, max: 1000 },
    research: true,
    sourcesToVerify: "Yang Y et al. 2020, Nat Biotechnol (wearable sweat uric acid sensor)",
  },
  lactate: {
    label: "Sweat lactate",
    unit: "mmol/L",
    specimen: "sweat",
    decimals: 0,
    typical: { low: 5, high: 40 },
    limits: { min: 1, max: 60 },
    research: true,
    sourcesToVerify: "Baker LB & Wolfe AS 2020, Eur J Appl Physiol",
    note: "Made by the sweat glands themselves — not blood lactate.",
  },
  cortisol: {
    label: "Sweat cortisol",
    unit: "ng/mL",
    specimen: "sweat",
    decimals: 0,
    typical: { low: 8, high: 140 },
    limits: { min: 0.5, max: 500 },
    research: true,
    sourcesToVerify: "Parlak O et al. 2018, Sci Adv (wearable sweat cortisol sensor)",
    note: "Higher in the morning (daily rhythm); use the personal trend.",
  },
  ethanol: {
    label: "Transdermal alcohol",
    unit: "mmol/L",
    specimen: "sweat",
    decimals: 1,
    typical: { low: 0, high: 0 },
    limits: { min: 0, max: 100 },
    research: true,
    sourcesToVerify: "Kim J et al. 2016, ACS Sens (tattoo-based sweat alcohol sensor)",
    note: "Normally not detectable; a few to ~25 mmol/L after drinking. Sensitive: needs its own patient consent.",
  },
};

/** Sweat analytes that can have a daily value (alcohol is handled on its own, see alcohol.ts). */
export const DAILY_SWEAT: Exclude<SweatAnalyte, "ethanol">[] = ["sodium", "chloride", "potassium", "glucose", "uricAcid", "lactate", "cortisol"];

/** "15–55 mmol/L (typical sweat · literature values, prototype — to be verified)". */
export function typicalSweatText(a: SweatAnalyte): string {
  const i = SWEAT_ANALYTES[a];
  const n = (v: number) => v.toFixed(i.decimals);
  if (a === "ethanol") return "Normally not detectable (literature values, prototype — to be verified)";
  return `${n(i.typical.low)}–${n(i.typical.high)} ${i.unit} (typical sweat · ${SWEAT_RANGE_STATUS.toLowerCase()})`;
}

/** Local sweat rate (mg/cm²/min). Below the minimum the patch can't fill → readings unreliable (dropped). */
export const SWEAT_RATE = { min: 0.1, max: 5 };
