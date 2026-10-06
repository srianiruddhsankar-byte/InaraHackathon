// Prototype formulary — verify doses against current prescribing information.
// ~40 common generic medicines used in India (generic names only, no brands).
// Used for the Treatment step's medicine search and prescription safety checks.
import type { FoodTiming } from "./types";

export type DrugTag =
  | "nsaid"
  | "ace_inhibitor"
  | "arb"
  | "diuretic"
  | "statin"
  | "sulfonamide_antibiotic"
  | "sulfonamide_nonantibiotic"
  | "sglt2"
  | "biguanide"
  | "iron";

export type FrequencyCode = "OD" | "BD" | "TDS" | "HS" | "SOS" | "Weekly";

export const CATEGORIES = [
  "Diabetes",
  "BP/Heart",
  "Lipids",
  "Anaemia/Vitamins",
  "Pain",
  "Antibiotics",
  "Others",
] as const;

export type FormularyCategory = (typeof CATEGORIES)[number];

export interface FormularyEntry {
  id: string;
  category: FormularyCategory;
  genericName: string;
  drugClass: string;
  forms: string[];
  strengths: string[];
  defaultFrequencies: FrequencyCode[];
  route: "oral" | "subcutaneous" | "topical";
  foodTiming: FoodTiming;
  pregnancyCategoryNote: string;
  tags: DrugTag[];
  /**
   * Standard starting choices from this formulary, used to pre-fill a new
   * prescription row. Never AI-generated and never changed by lab values —
   * the doctor confirms or edits every one.
   */
  defaultStrength: string;
  defaultFrequency: FrequencyCode;
  defaultDuration: string;
  defaultInstructions: string;
}

export const FORMULARY_NOTE = "Prototype formulary — verify doses against current prescribing information.";

export const FREQUENCIES: { code: FrequencyCode; meaning: string }[] = [
  { code: "OD", meaning: "Once daily" },
  { code: "BD", meaning: "Twice daily" },
  { code: "TDS", meaning: "Three times daily" },
  { code: "HS", meaning: "At bedtime" },
  { code: "SOS", meaning: "As needed" },
  { code: "Weekly", meaning: "Once a week" },
];

export const FOOD_TIMINGS: { value: FoodTiming; label: string }[] = [
  { value: "before food", label: "Before food" },
  { value: "with food", label: "With food" },
  { value: "after food", label: "After food" },
  { value: "any", label: "With or without food" },
];

const PREG_AVOID = "Avoid in pregnancy";
const PREG_CAUTION = "Use only if clearly needed — check before prescribing in pregnancy";
const PREG_OK = "Generally considered acceptable in pregnancy at usual doses";

type Draft = Omit<FormularyEntry, "route" | "forms" | DefaultKey> & Partial<Pick<FormularyEntry, "route" | "forms">>;
type DefaultKey = "defaultStrength" | "defaultFrequency" | "defaultDuration" | "defaultInstructions";

const ENTRIES: Draft[] = [
  // --- Diabetes
  { category: "Diabetes", id: "metformin", genericName: "Metformin", drugClass: "Biguanide", strengths: ["500 mg", "850 mg", "1000 mg"], defaultFrequencies: ["BD", "OD"], foodTiming: "with food", pregnancyCategoryNote: PREG_CAUTION, tags: ["biguanide"] },
  { category: "Diabetes", id: "glimepiride", genericName: "Glimepiride", drugClass: "Sulfonylurea", strengths: ["1 mg", "2 mg"], defaultFrequencies: ["OD"], foodTiming: "before food", pregnancyCategoryNote: PREG_AVOID, tags: [] },
  { category: "Diabetes", id: "gliclazide", genericName: "Gliclazide", drugClass: "Sulfonylurea", strengths: ["40 mg", "80 mg"], defaultFrequencies: ["OD", "BD"], foodTiming: "before food", pregnancyCategoryNote: PREG_AVOID, tags: [] },
  { category: "Diabetes", id: "sitagliptin", genericName: "Sitagliptin", drugClass: "DPP-4 inhibitor", strengths: ["50 mg", "100 mg"], defaultFrequencies: ["OD"], foodTiming: "any", pregnancyCategoryNote: PREG_CAUTION, tags: [] },
  { category: "Diabetes", id: "vildagliptin", genericName: "Vildagliptin", drugClass: "DPP-4 inhibitor", strengths: ["50 mg"], defaultFrequencies: ["BD", "OD"], foodTiming: "any", pregnancyCategoryNote: PREG_CAUTION, tags: [] },
  { category: "Diabetes", id: "dapagliflozin", genericName: "Dapagliflozin", drugClass: "SGLT2 inhibitor", strengths: ["10 mg"], defaultFrequencies: ["OD"], foodTiming: "any", pregnancyCategoryNote: PREG_AVOID, tags: ["sglt2"] },
  { category: "Diabetes", id: "empagliflozin", genericName: "Empagliflozin", drugClass: "SGLT2 inhibitor", strengths: ["10 mg", "25 mg"], defaultFrequencies: ["OD"], foodTiming: "any", pregnancyCategoryNote: PREG_AVOID, tags: ["sglt2"] },
  // --- Blood pressure / heart
  { category: "BP/Heart", id: "amlodipine", genericName: "Amlodipine", drugClass: "Calcium channel blocker", strengths: ["2.5 mg", "5 mg", "10 mg"], defaultFrequencies: ["OD"], foodTiming: "any", pregnancyCategoryNote: PREG_CAUTION, tags: [] },
  { category: "BP/Heart", id: "telmisartan", genericName: "Telmisartan", drugClass: "ARB", strengths: ["20 mg", "40 mg", "80 mg"], defaultFrequencies: ["OD"], foodTiming: "any", pregnancyCategoryNote: PREG_AVOID, tags: ["arb"] },
  { category: "BP/Heart", id: "losartan", genericName: "Losartan", drugClass: "ARB", strengths: ["25 mg", "50 mg"], defaultFrequencies: ["OD"], foodTiming: "any", pregnancyCategoryNote: PREG_AVOID, tags: ["arb"] },
  { category: "BP/Heart", id: "olmesartan", genericName: "Olmesartan", drugClass: "ARB", strengths: ["20 mg", "40 mg"], defaultFrequencies: ["OD"], foodTiming: "any", pregnancyCategoryNote: PREG_AVOID, tags: ["arb"] },
  { category: "BP/Heart", id: "ramipril", genericName: "Ramipril", drugClass: "ACE inhibitor", strengths: ["2.5 mg", "5 mg"], defaultFrequencies: ["OD"], foodTiming: "any", pregnancyCategoryNote: PREG_AVOID, tags: ["ace_inhibitor"] },
  { category: "BP/Heart", id: "enalapril", genericName: "Enalapril", drugClass: "ACE inhibitor", strengths: ["5 mg", "10 mg"], defaultFrequencies: ["OD", "BD"], foodTiming: "any", pregnancyCategoryNote: PREG_AVOID, tags: ["ace_inhibitor"] },
  { category: "BP/Heart", id: "hydrochlorothiazide", genericName: "Hydrochlorothiazide", drugClass: "Thiazide diuretic", strengths: ["12.5 mg", "25 mg"], defaultFrequencies: ["OD"], foodTiming: "any", pregnancyCategoryNote: PREG_CAUTION, tags: ["diuretic", "sulfonamide_nonantibiotic"] },
  { category: "BP/Heart", id: "chlorthalidone", genericName: "Chlorthalidone", drugClass: "Thiazide diuretic", strengths: ["6.25 mg", "12.5 mg"], defaultFrequencies: ["OD"], foodTiming: "any", pregnancyCategoryNote: PREG_CAUTION, tags: ["diuretic", "sulfonamide_nonantibiotic"] },
  { category: "BP/Heart", id: "furosemide", genericName: "Furosemide", drugClass: "Loop diuretic", strengths: ["20 mg", "40 mg"], defaultFrequencies: ["OD"], foodTiming: "any", pregnancyCategoryNote: PREG_CAUTION, tags: ["diuretic", "sulfonamide_nonantibiotic"] },
  { category: "BP/Heart", id: "metoprolol_succinate", genericName: "Metoprolol succinate", drugClass: "Beta blocker", strengths: ["25 mg", "50 mg"], defaultFrequencies: ["OD"], foodTiming: "any", pregnancyCategoryNote: PREG_CAUTION, tags: [] },
  { category: "BP/Heart", id: "atenolol", genericName: "Atenolol", drugClass: "Beta blocker", strengths: ["25 mg", "50 mg"], defaultFrequencies: ["OD"], foodTiming: "any", pregnancyCategoryNote: PREG_AVOID, tags: [] },
  { category: "BP/Heart", id: "aspirin", genericName: "Aspirin", drugClass: "Antiplatelet", strengths: ["75 mg"], defaultFrequencies: ["OD"], foodTiming: "after food", pregnancyCategoryNote: PREG_CAUTION, tags: [] },
  { category: "BP/Heart", id: "clopidogrel", genericName: "Clopidogrel", drugClass: "Antiplatelet", strengths: ["75 mg"], defaultFrequencies: ["OD"], foodTiming: "any", pregnancyCategoryNote: PREG_CAUTION, tags: [] },
  // --- Lipids
  { category: "Lipids", id: "atorvastatin", genericName: "Atorvastatin", drugClass: "Statin", strengths: ["10 mg", "20 mg", "40 mg", "80 mg"], defaultFrequencies: ["HS", "OD"], foodTiming: "any", pregnancyCategoryNote: PREG_AVOID, tags: ["statin"] },
  { category: "Lipids", id: "rosuvastatin", genericName: "Rosuvastatin", drugClass: "Statin", strengths: ["5 mg", "10 mg", "20 mg"], defaultFrequencies: ["HS", "OD"], foodTiming: "any", pregnancyCategoryNote: PREG_AVOID, tags: ["statin"] },
  // --- Anaemia / vitamins
  { category: "Anaemia/Vitamins", id: "ferrous_ascorbate", genericName: "Ferrous ascorbate", drugClass: "Iron supplement", strengths: ["100 mg elemental iron"], defaultFrequencies: ["OD"], foodTiming: "before food", pregnancyCategoryNote: PREG_OK, tags: ["iron"] },
  { category: "Anaemia/Vitamins", id: "ferrous_sulphate", genericName: "Ferrous sulphate", drugClass: "Iron supplement", strengths: ["200 mg (60 mg elemental iron)"], defaultFrequencies: ["OD", "BD"], foodTiming: "before food", pregnancyCategoryNote: PREG_OK, tags: ["iron"] },
  { category: "Anaemia/Vitamins", id: "folic_acid", genericName: "Folic acid", drugClass: "Vitamin (folate)", strengths: ["5 mg"], defaultFrequencies: ["OD"], foodTiming: "any", pregnancyCategoryNote: PREG_OK, tags: [] },
  { category: "Anaemia/Vitamins", id: "methylcobalamin", genericName: "Methylcobalamin", drugClass: "Vitamin B12", strengths: ["1500 mcg"], defaultFrequencies: ["OD"], foodTiming: "after food", pregnancyCategoryNote: PREG_OK, tags: [] },
  { category: "Anaemia/Vitamins", id: "cholecalciferol", genericName: "Cholecalciferol", drugClass: "Vitamin D3", strengths: ["60,000 IU"], defaultFrequencies: ["Weekly"], foodTiming: "after food", pregnancyCategoryNote: PREG_CAUTION, tags: [] },
  { category: "Anaemia/Vitamins", id: "calcium_carbonate", genericName: "Calcium carbonate", drugClass: "Calcium supplement", strengths: ["500 mg"], defaultFrequencies: ["OD", "BD"], foodTiming: "after food", pregnancyCategoryNote: PREG_OK, tags: [] },
  // --- Pain
  { category: "Pain", id: "paracetamol", genericName: "Paracetamol", drugClass: "Analgesic / antipyretic", strengths: ["500 mg", "650 mg"], defaultFrequencies: ["SOS", "TDS"], foodTiming: "any", pregnancyCategoryNote: PREG_OK, tags: [] },
  { category: "Pain", id: "ibuprofen", genericName: "Ibuprofen", drugClass: "NSAID", strengths: ["400 mg"], defaultFrequencies: ["SOS", "TDS"], foodTiming: "after food", pregnancyCategoryNote: PREG_AVOID, tags: ["nsaid"] },
  { category: "Pain", id: "diclofenac", genericName: "Diclofenac", drugClass: "NSAID", strengths: ["50 mg"], defaultFrequencies: ["SOS", "BD"], foodTiming: "after food", pregnancyCategoryNote: PREG_AVOID, tags: ["nsaid"] },
  { category: "Pain", id: "aceclofenac", genericName: "Aceclofenac", drugClass: "NSAID", strengths: ["100 mg"], defaultFrequencies: ["SOS", "BD"], foodTiming: "after food", pregnancyCategoryNote: PREG_AVOID, tags: ["nsaid"] },
  // --- Antibiotics
  { category: "Antibiotics", id: "amoxicillin", genericName: "Amoxicillin", drugClass: "Penicillin antibiotic", strengths: ["500 mg"], defaultFrequencies: ["TDS"], foodTiming: "any", pregnancyCategoryNote: PREG_OK, tags: [] },
  { category: "Antibiotics", id: "amoxicillin_clavulanate", genericName: "Amoxicillin + clavulanic acid", drugClass: "Penicillin antibiotic", strengths: ["625 mg"], defaultFrequencies: ["BD", "TDS"], foodTiming: "after food", pregnancyCategoryNote: PREG_OK, tags: [] },
  { category: "Antibiotics", id: "azithromycin", genericName: "Azithromycin", drugClass: "Macrolide antibiotic", strengths: ["500 mg"], defaultFrequencies: ["OD"], foodTiming: "any", pregnancyCategoryNote: PREG_CAUTION, tags: [] },
  { category: "Antibiotics", id: "cotrimoxazole", genericName: "Cotrimoxazole (sulfamethoxazole + trimethoprim)", drugClass: "Sulfonamide antibiotic", strengths: ["800/160 mg"], defaultFrequencies: ["BD"], foodTiming: "after food", pregnancyCategoryNote: PREG_AVOID, tags: ["sulfonamide_antibiotic"] },
  { category: "Antibiotics", id: "nitrofurantoin", genericName: "Nitrofurantoin", drugClass: "Urinary antibiotic", strengths: ["100 mg"], defaultFrequencies: ["BD"], foodTiming: "with food", pregnancyCategoryNote: PREG_CAUTION, tags: [] },
  { category: "Antibiotics", id: "ciprofloxacin", genericName: "Ciprofloxacin", drugClass: "Fluoroquinolone antibiotic", strengths: ["250 mg", "500 mg"], defaultFrequencies: ["BD"], foodTiming: "any", pregnancyCategoryNote: PREG_AVOID, tags: [] },
  { category: "Antibiotics", id: "doxycycline", genericName: "Doxycycline", drugClass: "Tetracycline antibiotic", strengths: ["100 mg"], defaultFrequencies: ["BD", "OD"], foodTiming: "after food", pregnancyCategoryNote: PREG_AVOID, tags: [] },
  // --- Others
  { category: "Others", id: "pantoprazole", genericName: "Pantoprazole", drugClass: "Proton pump inhibitor", strengths: ["40 mg"], defaultFrequencies: ["OD"], foodTiming: "before food", pregnancyCategoryNote: PREG_CAUTION, tags: [] },
  { category: "Others", id: "levothyroxine", genericName: "Levothyroxine", drugClass: "Thyroid hormone", strengths: ["25 mcg", "50 mcg", "100 mcg"], defaultFrequencies: ["OD"], foodTiming: "before food", pregnancyCategoryNote: PREG_OK, tags: [] },
  { category: "Others", id: "cetirizine", genericName: "Cetirizine", drugClass: "Antihistamine", strengths: ["10 mg"], defaultFrequencies: ["HS", "OD"], foodTiming: "any", pregnancyCategoryNote: PREG_CAUTION, tags: [] },
  { category: "Others", id: "ondansetron", genericName: "Ondansetron", drugClass: "Antiemetic", strengths: ["4 mg"], defaultFrequencies: ["SOS", "TDS"], foodTiming: "any", pregnancyCategoryNote: PREG_CAUTION, tags: [] },
];

const AS_NEEDED = "As needed";
const SAME_TIME = "Same time each day";
const COURSE = "Complete the full course, even if you feel better";
const MORNING = "Take in the morning";

/**
 * Typical starting choices per medicine: [duration, instructions, strength?, frequency?].
 * Strength and frequency fall back to the entry's first listed strength / frequency.
 */
const DEFAULTS: Record<string, [string, string, string?, FrequencyCode?]> = {
  metformin: ["30 days", "Take with meals"],
  glimepiride: ["30 days", "Take just before breakfast; do not skip meals"],
  gliclazide: ["30 days", "Take just before breakfast; do not skip meals"],
  sitagliptin: ["30 days", SAME_TIME, "100 mg"],
  vildagliptin: ["30 days", "Morning and evening"],
  dapagliflozin: ["30 days", "Take in the morning; drink enough water"],
  empagliflozin: ["30 days", "Take in the morning; drink enough water"],
  amlodipine: ["30 days", SAME_TIME, "5 mg"],
  telmisartan: ["30 days", SAME_TIME, "40 mg"],
  losartan: ["30 days", SAME_TIME, "50 mg"],
  olmesartan: ["30 days", SAME_TIME],
  ramipril: ["30 days", "Same time each day; tell your doctor if you get a dry cough"],
  enalapril: ["30 days", "Same time each day; tell your doctor if you get a dry cough", undefined, "OD"],
  hydrochlorothiazide: ["30 days", MORNING],
  chlorthalidone: ["30 days", MORNING, "12.5 mg"],
  furosemide: ["30 days", MORNING],
  metoprolol_succinate: ["30 days", "Same time each day; do not stop suddenly"],
  atenolol: ["30 days", "Same time each day; do not stop suddenly"],
  aspirin: ["30 days", "Take after food"],
  clopidogrel: ["30 days", SAME_TIME],
  atorvastatin: ["30 days", "At bedtime"],
  rosuvastatin: ["30 days", "At bedtime", "10 mg"],
  ferrous_ascorbate: ["90 days", "Empty stomach; not with tea, coffee or milk"],
  ferrous_sulphate: ["90 days", "Empty stomach; not with tea, coffee or milk", undefined, "OD"],
  folic_acid: ["90 days", SAME_TIME],
  methylcobalamin: ["30 days", "Take after food"],
  cholecalciferol: ["8 weeks", "Once a week on the same day, after a meal"],
  calcium_carbonate: ["30 days", "Take after food; keep 2 hours apart from iron tablets", undefined, "OD"],
  paracetamol: [AS_NEEDED, "Max 4 doses in 24 hours", "500 mg"],
  ibuprofen: [AS_NEEDED, "Take after food; max 3 doses in 24 hours"],
  diclofenac: [AS_NEEDED, "Take after food; max 2 doses in 24 hours"],
  aceclofenac: [AS_NEEDED, "Take after food; max 2 doses in 24 hours"],
  amoxicillin: ["5 days", COURSE],
  amoxicillin_clavulanate: ["5 days", "Take after food. " + COURSE],
  azithromycin: ["3 days", COURSE],
  cotrimoxazole: ["5 days", "Drink plenty of water. " + COURSE],
  nitrofurantoin: ["5 days", "Take with food. " + COURSE],
  ciprofloxacin: ["5 days", "Not with milk or antacids. " + COURSE, "500 mg"],
  doxycycline: ["7 days", "Full glass of water; stay upright for 30 minutes", undefined, "BD"],
  pantoprazole: ["14 days", "30 minutes before breakfast"],
  levothyroxine: ["30 days", "Empty stomach, 30–60 minutes before breakfast"],
  cetirizine: ["5 days", "At bedtime; may cause drowsiness"],
  ondansetron: [AS_NEEDED, "Max 3 doses in 24 hours"],
};

function withDefaults(e: Draft): FormularyEntry {
  const d = DEFAULTS[e.id];
  if (!d) throw new Error(`Formulary entry ${e.id} has no defaults`);
  const [defaultDuration, defaultInstructions, strength, frequency] = d;
  return {
    route: "oral",
    forms: ["Tablet"],
    ...e,
    defaultStrength: strength ?? e.strengths[0],
    defaultFrequency: frequency ?? e.defaultFrequencies[0],
    defaultDuration,
    defaultInstructions,
  };
}

export const FORMULARY: FormularyEntry[] = ENTRIES.map(withDefaults);

/** The formulary grouped for "Browse by class", in CATEGORIES order. */
export function formularyByCategory(): { category: FormularyCategory; entries: FormularyEntry[] }[] {
  return CATEGORIES.map((category) => ({
    category,
    entries: FORMULARY.filter((e) => e.category === category).sort((a, b) => a.genericName.localeCompare(b.genericName)),
  }));
}

/** By id, or by generic name (case-insensitive) — so free-text current medicines like "Ibuprofen" resolve too. */
export function findFormulary(idOrName: string | undefined): FormularyEntry | undefined {
  if (!idOrName) return undefined;
  const q = idOrName.trim().toLowerCase();
  return FORMULARY.find((e) => e.id === q || e.genericName.toLowerCase() === q);
}

/** Autocomplete by generic name, drug class or browse category; name-prefix matches first. */
export function searchFormulary(query: string, limit = 8): FormularyEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const score = (e: FormularyEntry) => {
    const name = e.genericName.toLowerCase();
    if (name.startsWith(q)) return 0;
    if (name.includes(q)) return 1;
    if (e.drugClass.toLowerCase().includes(q) || e.tags.some((t) => t.replace(/_/g, " ").includes(q))) return 2;
    if (e.category.toLowerCase().includes(q)) return 3;
    return -1;
  };
  return FORMULARY.map((e) => ({ e, s: score(e) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s || a.e.genericName.localeCompare(b.e.genericName))
    .slice(0, limit)
    .map((x) => x.e);
}

/** "BD" → "Twice daily". Unknown (free-text) frequencies are returned unchanged. */
export function frequencyMeaning(code: string): string {
  return FREQUENCIES.find((f) => f.code.toLowerCase() === code.trim().toLowerCase())?.meaning ?? code;
}

export function foodTimingLabel(t: FoodTiming | undefined): string | undefined {
  return t ? FOOD_TIMINGS.find((f) => f.value === t)?.label : undefined;
}
