// Test dictionary: canonical name, LOINC code, unit, aliases and reference
// ranges (by sex where needed). Ranges are inclusive: a value is "normal"
// when low <= value <= high.
import type { Sex, TestKey } from "./types";

export interface ReferenceRange {
  low?: number;
  high?: number;
}

export interface TestDefinition {
  key: TestKey;
  name: string;
  loinc: string;
  /** Canonical unit, used for display and storage. */
  unit: string;
  /** Other spellings of the canonical unit (no conversion needed). */
  unitAliases: string[];
  /** Non-canonical units: canonical value = raw value × factor. */
  conversions: Record<string, number>;
  /**
   * Conversions that depend on the raw test name and win over the defaults,
   * e.g. "Serum Urea" in mg/dL is urea (÷ 2.14 = BUN), not BUN itself.
   */
  nameConversions?: { aliases: string[]; conversions: Record<string, number> }[];
  decimals: number;
  aliases: string[];
  range: ReferenceRange | Record<Sex, ReferenceRange>;
  description: string;
}

export const TEST_KEYS: TestKey[] = [
  "hba1c",
  "fasting_glucose",
  "total_chol",
  "ldl",
  "hdl",
  "triglycerides",
  "creatinine",
  "urine_acr",
  "hb",
  "mcv",
  "rbc",
  "platelets",
  "ferritin",
  "ast",
  "alt",
  "tsh",
  "vitamin_d",
  "vitamin_b12",
  "uric_acid",
  "sodium",
  "potassium",
  "bun",
  "crp",
];

/** Raw names that mean urea itself (not urea nitrogen): mg/dL ÷ 2.14 = BUN. */
const UREA_ALIASES = ["Urea", "Serum Urea", "S. Urea", "Blood Urea", "Urea Serum"];

export const TESTS: Record<TestKey, TestDefinition> = {
  hba1c: {
    key: "hba1c",
    name: "HbA1c",
    loinc: "4548-4",
    unit: "%",
    unitAliases: ["percent"],
    conversions: {},
    decimals: 1,
    aliases: ["A1C", "HbA1c%", "Glycated Hb", "Glycated Haemoglobin", "Glycated Hemoglobin", "Glycosylated Hemoglobin", "Hb A1c"],
    range: { low: 4.0, high: 5.6 },
    description: "Your average blood sugar over the last 2–3 months.",
  },
  fasting_glucose: {
    key: "fasting_glucose",
    name: "Fasting glucose",
    loinc: "1558-6",
    unit: "mg/dL",
    unitAliases: [],
    conversions: { "mmol/L": 18 },
    decimals: 0,
    aliases: ["FBS", "Fasting Sugar", "Fasting Blood Sugar", "FPG", "Fasting Plasma Glucose", "Glucose Fasting", "Blood Sugar Fasting", "FBG"],
    range: { low: 70, high: 99 },
    description: "The sugar level in your blood after not eating overnight.",
  },
  total_chol: {
    key: "total_chol",
    name: "Total cholesterol",
    loinc: "2093-3",
    unit: "mg/dL",
    unitAliases: [],
    conversions: {},
    decimals: 0,
    aliases: ["Cholesterol", "Total Chol", "T. Cholesterol", "TC", "Serum Cholesterol", "Chol Total"],
    range: { high: 199 },
    description: "All the cholesterol (a type of fat) in your blood.",
  },
  ldl: {
    key: "ldl",
    name: "LDL cholesterol",
    loinc: "13457-7",
    unit: "mg/dL",
    unitAliases: [],
    conversions: {},
    decimals: 0,
    aliases: ["LDL", "LDL-C", "LDL Cholesterol", "Low Density Lipoprotein", "LDL Chol"],
    range: { high: 129 },
    description: "The 'bad' cholesterol that can build up in blood vessels.",
  },
  hdl: {
    key: "hdl",
    name: "HDL cholesterol",
    loinc: "2085-9",
    unit: "mg/dL",
    unitAliases: [],
    conversions: {},
    decimals: 0,
    aliases: ["HDL", "HDL-C", "HDL Cholesterol", "High Density Lipoprotein", "HDL Chol"],
    range: { M: { low: 40 }, F: { low: 50 } },
    description: "The 'good' cholesterol that helps clear fat from your blood.",
  },
  triglycerides: {
    key: "triglycerides",
    name: "Triglycerides",
    loinc: "2571-8",
    unit: "mg/dL",
    unitAliases: [],
    conversions: {},
    decimals: 0,
    aliases: ["TG", "Trig", "Triglyceride", "TGL", "Serum Triglycerides"],
    range: { high: 149 },
    description: "A type of fat in your blood that comes from food.",
  },
  creatinine: {
    key: "creatinine",
    name: "Creatinine",
    loinc: "2160-0",
    unit: "mg/dL",
    unitAliases: [],
    conversions: { "µmol/L": 1 / 88.4 },
    decimals: 2,
    aliases: ["S. Creatinine", "Creat", "Serum Creatinine", "Creatinine Serum", "Cr", "SCr", "S Creat"],
    range: { M: { low: 0.7, high: 1.3 }, F: { low: 0.6, high: 1.1 } },
    description: "A waste product your kidneys filter out; it shows how well they work.",
  },
  urine_acr: {
    key: "urine_acr",
    name: "Urine albumin/creatinine ratio",
    loinc: "9318-7",
    unit: "mg/g",
    unitAliases: ["mg/g creat", "mg/g creatinine", "ug/mg"],
    conversions: { "mg/mmol": 8.84 },
    decimals: 0,
    aliases: ["Urine ACR", "ACR", "UACR", "Microalbumin Ratio", "Albumin Creatinine Ratio", "Urine Microalbumin/Creatinine"],
    range: { high: 29 },
    description: "Checks for protein leaking into your urine, an early sign of kidney stress.",
  },
  hb: {
    key: "hb",
    name: "Haemoglobin",
    loinc: "718-7",
    unit: "g/dL",
    unitAliases: [],
    conversions: { "g/L": 0.1 },
    decimals: 1,
    aliases: ["Haemoglobin", "Hemoglobin", "Hgb", "Hb", "HGB"],
    range: { M: { low: 13, high: 17 }, F: { low: 12, high: 15.5 } },
    description: "The part of red blood cells that carries oxygen around your body.",
  },
  mcv: {
    key: "mcv",
    name: "MCV",
    loinc: "787-2",
    unit: "fL",
    unitAliases: ["fl", "femtolitre", "femtoliter"],
    conversions: {},
    decimals: 0,
    aliases: ["Mean Corpuscular Volume", "Mean Cell Volume"],
    range: { low: 80, high: 100 },
    description: "The average size of your red blood cells.",
  },
  rbc: {
    key: "rbc",
    name: "Red blood cells",
    loinc: "789-8",
    unit: "million/µL",
    unitAliases: ["10^6/µL", "x10^6/µL", "10^12/L", "x10^12/L", "M/µL", "mill/µL", "million/cmm"],
    conversions: {},
    decimals: 1,
    aliases: ["RBC", "RBC Count", "Red Blood Cell Count", "Red Cell Count", "Erythrocytes", "Total RBC"],
    range: { M: { low: 4.5, high: 5.9 }, F: { low: 4.0, high: 5.2 } },
    description: "The number of red blood cells in your blood.",
  },
  platelets: {
    key: "platelets",
    name: "Platelets",
    loinc: "777-3",
    unit: "10^3/µL",
    unitAliases: ["x10^3/µL", "10^9/L", "x10^9/L", "K/µL", "thou/µL", "thousand/µL"],
    conversions: { "lakh/cmm": 100 },
    decimals: 0,
    aliases: ["Plt", "Platelet Count", "PLT Count", "Thrombocytes", "Platelet"],
    range: { low: 150, high: 400 },
    description: "Tiny blood cells that help your blood clot.",
  },
  ferritin: {
    key: "ferritin",
    name: "Ferritin",
    loinc: "2276-4",
    unit: "ng/mL",
    unitAliases: ["µg/L"],
    conversions: {},
    decimals: 0,
    aliases: ["Serum Ferritin", "S. Ferritin", "Ferritin Serum"],
    range: { M: { low: 30, high: 400 }, F: { low: 15, high: 150 } },
    description: "Your body's iron stores.",
  },
  ast: {
    key: "ast",
    name: "AST",
    loinc: "1920-8",
    unit: "U/L",
    unitAliases: ["IU/L"],
    conversions: {},
    decimals: 0,
    aliases: ["SGOT", "Aspartate Aminotransferase", "Aspartate Transaminase", "AST (SGOT)", "SGOT/AST"],
    range: { high: 40 },
    description: "A liver enzyme; high levels can mean the liver is under strain.",
  },
  alt: {
    key: "alt",
    name: "ALT",
    loinc: "1742-6",
    unit: "U/L",
    unitAliases: ["IU/L"],
    conversions: {},
    decimals: 0,
    aliases: ["SGPT", "Alanine Aminotransferase", "Alanine Transaminase", "ALT (SGPT)", "SGPT/ALT"],
    range: { high: 40 },
    description: "A liver enzyme; high levels can mean the liver is under strain.",
  },
  tsh: {
    key: "tsh",
    name: "TSH",
    loinc: "3016-3",
    unit: "mIU/L",
    unitAliases: ["µIU/mL", "uIU/mL"],
    conversions: {},
    decimals: 2,
    aliases: ["S. TSH", "Serum TSH", "TSH 3rd Gen", "TSH Ultrasensitive", "Thyroid Stimulating Hormone", "Thyrotropin"],
    range: { low: 0.4, high: 4.0 },
    description: "A hormone that shows how well your thyroid gland is working.",
  },
  vitamin_d: {
    key: "vitamin_d",
    name: "Vitamin D (25-OH)",
    loinc: "1989-3",
    unit: "ng/mL",
    unitAliases: [],
    conversions: { "nmol/L": 1 / 2.5 },
    decimals: 0,
    aliases: ["Vitamin D", "Vit D", "25 OH Vit D", "25-OH Vitamin D", "25-Hydroxy Vitamin D", "Vitamin D Total", "Vit D3", "Vitamin D3"],
    range: { low: 30, high: 100 },
    description: "Vitamin D level — needed for strong bones and muscles.",
  },
  vitamin_b12: {
    key: "vitamin_b12",
    name: "Vitamin B12",
    loinc: "2132-9",
    unit: "pg/mL",
    unitAliases: ["ng/L"],
    conversions: {},
    decimals: 0,
    aliases: ["Vit B12", "B12", "Cobalamin", "Cyanocobalamin", "S. B12", "Serum B12", "Serum Vitamin B12"],
    range: { low: 200, high: 900 },
    description: "Vitamin B12 level — needed for healthy nerves and red blood cells.",
  },
  uric_acid: {
    key: "uric_acid",
    name: "Uric acid",
    loinc: "3084-1",
    unit: "mg/dL",
    unitAliases: [],
    conversions: { "µmol/L": 1 / 59.48 },
    decimals: 1,
    aliases: ["S. Uric Acid", "Serum Uric Acid", "Urate", "Serum Urate", "UA", "Uric Acid Serum"],
    range: { M: { low: 3.4, high: 7.0 }, F: { low: 2.4, high: 6.0 } },
    description: "A waste product from food breakdown; high levels can cause gout.",
  },
  sodium: {
    key: "sodium",
    name: "Sodium",
    loinc: "2951-2",
    unit: "mmol/L",
    unitAliases: ["mEq/L"],
    conversions: {},
    decimals: 0,
    aliases: ["Na", "Na+", "S. Sodium", "Serum Sodium", "Sodium Serum", "S. Na"],
    range: { low: 135, high: 145 },
    description: "A salt in your blood that helps balance fluids and nerves.",
  },
  potassium: {
    key: "potassium",
    name: "Potassium",
    loinc: "2823-3",
    unit: "mmol/L",
    unitAliases: ["mEq/L"],
    conversions: {},
    decimals: 1,
    aliases: ["K", "K+", "S. Potassium", "Serum Potassium", "Potassium Serum", "S. K"],
    range: { low: 3.5, high: 5.1 },
    description: "A salt in your blood that keeps your heart and muscles working.",
  },
  bun: {
    key: "bun",
    name: "Urea (BUN)",
    loinc: "3094-0",
    unit: "mg/dL",
    unitAliases: [],
    // Urea and BUN in mmol/L are the same number: × 2.8 = BUN mg/dL.
    conversions: { "mmol/L": 2.8 },
    nameConversions: [{ aliases: UREA_ALIASES, conversions: { "mg/dL": 1 / 2.14, "mmol/L": 2.8 } }],
    decimals: 0,
    aliases: ["BUN", "Blood Urea Nitrogen", "Urea Nitrogen", "S. BUN", ...UREA_ALIASES],
    range: { low: 7, high: 20 },
    description: "A waste product your kidneys clear from the blood.",
  },
  crp: {
    key: "crp",
    name: "CRP",
    loinc: "1988-5",
    unit: "mg/L",
    unitAliases: [],
    conversions: {},
    decimals: 1,
    aliases: ["C-Reactive Protein", "C Reactive Protein", "hs-CRP", "hsCRP", "CRP Quantitative", "S. CRP"],
    range: { high: 5 },
    description: "A marker of inflammation or infection in the body.",
  },
};

/** Reference range for a test, resolved for the patient's sex. */
export function getRange(key: TestKey, sex: Sex): ReferenceRange {
  const range = TESTS[key].range;
  return "M" in range ? range[sex] : range;
}

/** Format a value with the test's usual precision, e.g. "6.1 %". */
export function formatValue(key: TestKey, value: number): string {
  const def = TESTS[key];
  return `${value.toFixed(def.decimals)} ${def.unit}`;
}
