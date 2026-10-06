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

export interface FormularyEntry {
  id: string;
  genericName: string;
  drugClass: string;
  forms: string[];
  strengths: string[];
  defaultFrequencies: FrequencyCode[];
  route: "oral" | "subcutaneous" | "topical";
  foodTiming: FoodTiming;
  pregnancyCategoryNote: string;
  tags: DrugTag[];
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
  { value: "after food", label: "After food" },
  { value: "any", label: "With or without food" },
];

const PREG_AVOID = "Avoid in pregnancy";
const PREG_CAUTION = "Use only if clearly needed — check before prescribing in pregnancy";
const PREG_OK = "Generally considered acceptable in pregnancy at usual doses";

type Draft = Omit<FormularyEntry, "route" | "forms"> & Partial<Pick<FormularyEntry, "route" | "forms">>;

const ENTRIES: Draft[] = [
  // --- Diabetes
  { id: "metformin", genericName: "Metformin", drugClass: "Biguanide", strengths: ["500 mg", "850 mg", "1000 mg"], defaultFrequencies: ["BD", "OD"], foodTiming: "after food", pregnancyCategoryNote: PREG_CAUTION, tags: ["biguanide"] },
  { id: "glimepiride", genericName: "Glimepiride", drugClass: "Sulfonylurea", strengths: ["1 mg", "2 mg"], defaultFrequencies: ["OD"], foodTiming: "before food", pregnancyCategoryNote: PREG_AVOID, tags: [] },
  { id: "gliclazide", genericName: "Gliclazide", drugClass: "Sulfonylurea", strengths: ["40 mg", "80 mg"], defaultFrequencies: ["OD", "BD"], foodTiming: "before food", pregnancyCategoryNote: PREG_AVOID, tags: [] },
  { id: "sitagliptin", genericName: "Sitagliptin", drugClass: "DPP-4 inhibitor", strengths: ["50 mg", "100 mg"], defaultFrequencies: ["OD"], foodTiming: "any", pregnancyCategoryNote: PREG_CAUTION, tags: [] },
  { id: "vildagliptin", genericName: "Vildagliptin", drugClass: "DPP-4 inhibitor", strengths: ["50 mg"], defaultFrequencies: ["BD", "OD"], foodTiming: "any", pregnancyCategoryNote: PREG_CAUTION, tags: [] },
  { id: "dapagliflozin", genericName: "Dapagliflozin", drugClass: "SGLT2 inhibitor", strengths: ["10 mg"], defaultFrequencies: ["OD"], foodTiming: "any", pregnancyCategoryNote: PREG_AVOID, tags: ["sglt2"] },
  { id: "empagliflozin", genericName: "Empagliflozin", drugClass: "SGLT2 inhibitor", strengths: ["10 mg", "25 mg"], defaultFrequencies: ["OD"], foodTiming: "any", pregnancyCategoryNote: PREG_AVOID, tags: ["sglt2"] },
  // --- Blood pressure / heart
  { id: "amlodipine", genericName: "Amlodipine", drugClass: "Calcium channel blocker", strengths: ["2.5 mg", "5 mg", "10 mg"], defaultFrequencies: ["OD"], foodTiming: "any", pregnancyCategoryNote: PREG_CAUTION, tags: [] },
  { id: "telmisartan", genericName: "Telmisartan", drugClass: "ARB", strengths: ["20 mg", "40 mg", "80 mg"], defaultFrequencies: ["OD"], foodTiming: "any", pregnancyCategoryNote: PREG_AVOID, tags: ["arb"] },
  { id: "losartan", genericName: "Losartan", drugClass: "ARB", strengths: ["25 mg", "50 mg"], defaultFrequencies: ["OD"], foodTiming: "any", pregnancyCategoryNote: PREG_AVOID, tags: ["arb"] },
  { id: "olmesartan", genericName: "Olmesartan", drugClass: "ARB", strengths: ["20 mg", "40 mg"], defaultFrequencies: ["OD"], foodTiming: "any", pregnancyCategoryNote: PREG_AVOID, tags: ["arb"] },
  { id: "ramipril", genericName: "Ramipril", drugClass: "ACE inhibitor", strengths: ["2.5 mg", "5 mg"], defaultFrequencies: ["OD"], foodTiming: "any", pregnancyCategoryNote: PREG_AVOID, tags: ["ace_inhibitor"] },
  { id: "enalapril", genericName: "Enalapril", drugClass: "ACE inhibitor", strengths: ["5 mg", "10 mg"], defaultFrequencies: ["OD", "BD"], foodTiming: "any", pregnancyCategoryNote: PREG_AVOID, tags: ["ace_inhibitor"] },
  { id: "hydrochlorothiazide", genericName: "Hydrochlorothiazide", drugClass: "Thiazide diuretic", strengths: ["12.5 mg", "25 mg"], defaultFrequencies: ["OD"], foodTiming: "any", pregnancyCategoryNote: PREG_CAUTION, tags: ["diuretic", "sulfonamide_nonantibiotic"] },
  { id: "chlorthalidone", genericName: "Chlorthalidone", drugClass: "Thiazide diuretic", strengths: ["6.25 mg", "12.5 mg"], defaultFrequencies: ["OD"], foodTiming: "any", pregnancyCategoryNote: PREG_CAUTION, tags: ["diuretic", "sulfonamide_nonantibiotic"] },
  { id: "furosemide", genericName: "Furosemide", drugClass: "Loop diuretic", strengths: ["20 mg", "40 mg"], defaultFrequencies: ["OD"], foodTiming: "any", pregnancyCategoryNote: PREG_CAUTION, tags: ["diuretic", "sulfonamide_nonantibiotic"] },
  { id: "metoprolol_succinate", genericName: "Metoprolol succinate", drugClass: "Beta blocker", strengths: ["25 mg", "50 mg"], defaultFrequencies: ["OD"], foodTiming: "any", pregnancyCategoryNote: PREG_CAUTION, tags: [] },
  { id: "atenolol", genericName: "Atenolol", drugClass: "Beta blocker", strengths: ["25 mg", "50 mg"], defaultFrequencies: ["OD"], foodTiming: "any", pregnancyCategoryNote: PREG_AVOID, tags: [] },
  { id: "aspirin", genericName: "Aspirin", drugClass: "Antiplatelet", strengths: ["75 mg"], defaultFrequencies: ["OD"], foodTiming: "after food", pregnancyCategoryNote: PREG_CAUTION, tags: [] },
  { id: "clopidogrel", genericName: "Clopidogrel", drugClass: "Antiplatelet", strengths: ["75 mg"], defaultFrequencies: ["OD"], foodTiming: "any", pregnancyCategoryNote: PREG_CAUTION, tags: [] },
  // --- Lipids
  { id: "atorvastatin", genericName: "Atorvastatin", drugClass: "Statin", strengths: ["10 mg", "20 mg", "40 mg", "80 mg"], defaultFrequencies: ["HS", "OD"], foodTiming: "any", pregnancyCategoryNote: PREG_AVOID, tags: ["statin"] },
  { id: "rosuvastatin", genericName: "Rosuvastatin", drugClass: "Statin", strengths: ["5 mg", "10 mg", "20 mg"], defaultFrequencies: ["HS", "OD"], foodTiming: "any", pregnancyCategoryNote: PREG_AVOID, tags: ["statin"] },
  // --- Anaemia / vitamins
  { id: "ferrous_ascorbate", genericName: "Ferrous ascorbate", drugClass: "Iron supplement", strengths: ["100 mg elemental iron"], defaultFrequencies: ["OD"], foodTiming: "before food", pregnancyCategoryNote: PREG_OK, tags: ["iron"] },
  { id: "ferrous_sulphate", genericName: "Ferrous sulphate", drugClass: "Iron supplement", strengths: ["200 mg (60 mg elemental iron)"], defaultFrequencies: ["OD", "BD"], foodTiming: "before food", pregnancyCategoryNote: PREG_OK, tags: ["iron"] },
  { id: "folic_acid", genericName: "Folic acid", drugClass: "Vitamin (folate)", strengths: ["5 mg"], defaultFrequencies: ["OD"], foodTiming: "any", pregnancyCategoryNote: PREG_OK, tags: [] },
  { id: "methylcobalamin", genericName: "Methylcobalamin", drugClass: "Vitamin B12", strengths: ["1500 mcg"], defaultFrequencies: ["OD"], foodTiming: "after food", pregnancyCategoryNote: PREG_OK, tags: [] },
  { id: "cholecalciferol", genericName: "Cholecalciferol", drugClass: "Vitamin D3", strengths: ["60,000 IU"], defaultFrequencies: ["Weekly"], foodTiming: "after food", pregnancyCategoryNote: PREG_CAUTION, tags: [] },
  { id: "calcium_carbonate", genericName: "Calcium carbonate", drugClass: "Calcium supplement", strengths: ["500 mg"], defaultFrequencies: ["OD", "BD"], foodTiming: "after food", pregnancyCategoryNote: PREG_OK, tags: [] },
  // --- Pain
  { id: "paracetamol", genericName: "Paracetamol", drugClass: "Analgesic / antipyretic", strengths: ["500 mg", "650 mg"], defaultFrequencies: ["SOS", "TDS"], foodTiming: "any", pregnancyCategoryNote: PREG_OK, tags: [] },
  { id: "ibuprofen", genericName: "Ibuprofen", drugClass: "NSAID", strengths: ["400 mg"], defaultFrequencies: ["SOS", "TDS"], foodTiming: "after food", pregnancyCategoryNote: PREG_AVOID, tags: ["nsaid"] },
  { id: "diclofenac", genericName: "Diclofenac", drugClass: "NSAID", strengths: ["50 mg"], defaultFrequencies: ["SOS", "BD"], foodTiming: "after food", pregnancyCategoryNote: PREG_AVOID, tags: ["nsaid"] },
  { id: "aceclofenac", genericName: "Aceclofenac", drugClass: "NSAID", strengths: ["100 mg"], defaultFrequencies: ["SOS", "BD"], foodTiming: "after food", pregnancyCategoryNote: PREG_AVOID, tags: ["nsaid"] },
  // --- Antibiotics
  { id: "amoxicillin", genericName: "Amoxicillin", drugClass: "Penicillin antibiotic", strengths: ["500 mg"], defaultFrequencies: ["TDS"], foodTiming: "any", pregnancyCategoryNote: PREG_OK, tags: [] },
  { id: "amoxicillin_clavulanate", genericName: "Amoxicillin + clavulanic acid", drugClass: "Penicillin antibiotic", strengths: ["625 mg"], defaultFrequencies: ["BD", "TDS"], foodTiming: "after food", pregnancyCategoryNote: PREG_OK, tags: [] },
  { id: "azithromycin", genericName: "Azithromycin", drugClass: "Macrolide antibiotic", strengths: ["500 mg"], defaultFrequencies: ["OD"], foodTiming: "any", pregnancyCategoryNote: PREG_CAUTION, tags: [] },
  { id: "cotrimoxazole", genericName: "Cotrimoxazole (sulfamethoxazole + trimethoprim)", drugClass: "Sulfonamide antibiotic", strengths: ["800/160 mg"], defaultFrequencies: ["BD"], foodTiming: "after food", pregnancyCategoryNote: PREG_AVOID, tags: ["sulfonamide_antibiotic"] },
  { id: "nitrofurantoin", genericName: "Nitrofurantoin", drugClass: "Urinary antibiotic", strengths: ["100 mg"], defaultFrequencies: ["BD"], foodTiming: "after food", pregnancyCategoryNote: PREG_CAUTION, tags: [] },
  { id: "ciprofloxacin", genericName: "Ciprofloxacin", drugClass: "Fluoroquinolone antibiotic", strengths: ["250 mg", "500 mg"], defaultFrequencies: ["BD"], foodTiming: "any", pregnancyCategoryNote: PREG_AVOID, tags: [] },
  { id: "doxycycline", genericName: "Doxycycline", drugClass: "Tetracycline antibiotic", strengths: ["100 mg"], defaultFrequencies: ["BD", "OD"], foodTiming: "after food", pregnancyCategoryNote: PREG_AVOID, tags: [] },
  // --- Others
  { id: "pantoprazole", genericName: "Pantoprazole", drugClass: "Proton pump inhibitor", strengths: ["40 mg"], defaultFrequencies: ["OD"], foodTiming: "before food", pregnancyCategoryNote: PREG_CAUTION, tags: [] },
  { id: "levothyroxine", genericName: "Levothyroxine", drugClass: "Thyroid hormone", strengths: ["25 mcg", "50 mcg", "100 mcg"], defaultFrequencies: ["OD"], foodTiming: "before food", pregnancyCategoryNote: PREG_OK, tags: [] },
  { id: "cetirizine", genericName: "Cetirizine", drugClass: "Antihistamine", strengths: ["10 mg"], defaultFrequencies: ["HS", "OD"], foodTiming: "any", pregnancyCategoryNote: PREG_CAUTION, tags: [] },
  { id: "ondansetron", genericName: "Ondansetron", drugClass: "Antiemetic", strengths: ["4 mg"], defaultFrequencies: ["SOS", "TDS"], foodTiming: "any", pregnancyCategoryNote: PREG_CAUTION, tags: [] },
];

export const FORMULARY: FormularyEntry[] = ENTRIES.map((e) => ({ route: "oral", forms: ["Tablet"], ...e }));

/** By id, or by generic name (case-insensitive) — so free-text current medicines like "Ibuprofen" resolve too. */
export function findFormulary(idOrName: string | undefined): FormularyEntry | undefined {
  if (!idOrName) return undefined;
  const q = idOrName.trim().toLowerCase();
  return FORMULARY.find((e) => e.id === q || e.genericName.toLowerCase() === q);
}

/** Autocomplete by generic name or drug class; name-prefix matches first. */
export function searchFormulary(query: string, limit = 8): FormularyEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const score = (e: FormularyEntry) => {
    const name = e.genericName.toLowerCase();
    if (name.startsWith(q)) return 0;
    if (name.includes(q)) return 1;
    if (e.drugClass.toLowerCase().includes(q) || e.tags.some((t) => t.replace(/_/g, " ").includes(q))) return 2;
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
