// Medication-aware notes: when a medicine the patient already takes matters
// for a finding, attach a short note for the doctor. Decision support only —
// wording is "consider", never an instruction.
import type { CurrentMedication, Finding, ScreenId } from "./types";

export interface MedNote {
  findingId: string;
  medication: string;
  text: string;
}

interface MedRule {
  /** Medicine class, matched on the medicine name. */
  match: RegExp;
  screens: ScreenId[];
  /** Extra condition on the finding, e.g. only for the thalassaemia pattern. */
  when?: (f: Finding) => boolean;
  text: (med: string) => string;
}

const NSAID = /ibuprofen|diclofenac|naproxen|aceclofenac|ketorolac|indometh?acin|celecoxib|etoricoxib|mefenamic|piroxicam|nimesulide/i;
const RULES: MedRule[] = [
  {
    match: NSAID,
    screens: ["kidney"],
    text: (m) => `Patient takes ${m.toLowerCase()} (NSAID) — NSAIDs can worsen kidney function; consider stopping.`,
  },
  {
    match: /metformin/i,
    screens: ["kidney"],
    text: () => "Patient takes metformin — dose depends on eGFR; review if eGFR falls below 45.",
  },
  {
    match: /amlodipine|nifedipine|felodipine|cilnidipine/i,
    screens: ["kidney"],
    when: (f) => /albumin|ACR/i.test(f.summary),
    text: (m) =>
      `Blood pressure is treated with ${m.toLowerCase()} — with albuminuria, consider whether BP control is optimal for kidney protection.`,
  },
  {
    match: /prednisolone|prednisone|dexamethasone|hydrocortisone|methylprednisolone|deflazacort/i,
    screens: ["diabetes"],
    text: (m) => `Patient takes ${m.toLowerCase()} (corticosteroid) — steroids can raise blood glucose.`,
  },
  {
    match: /hydrochlorothiazide|chlorthalidone|indapamide/i,
    screens: ["diabetes", "lipids"],
    text: (m) => `Patient takes ${m.toLowerCase()} (thiazide) — can modestly raise glucose and lipids.`,
  },
  {
    match: /statin\b|atorvastatin|rosuvastatin|simvastatin|pravastatin/i,
    screens: ["lipids"],
    text: (m) => `Patient already takes ${m.toLowerCase()} — lipids outside target on treatment; consider reviewing adherence.`,
  },
  {
    match: /iron|ferrous|ferric/i,
    screens: ["anaemia"],
    when: (f) => f.pattern === "thalassaemia_trait",
    text: (m) => `Patient takes ${m.toLowerCase()} — iron may not help if thalassaemia trait is confirmed.`,
  },
  {
    match: /methotrexate|amiodarone|valproate|isoniazid/i,
    screens: ["liver"],
    text: (m) => `Patient takes ${m.toLowerCase()} — can affect the liver; consider in the liver work-up.`,
  },
];

/** Notes for findings that need attention, given the patient's current medicines. */
export function medicationNotes(findings: Finding[], meds: CurrentMedication[]): MedNote[] {
  const notes: MedNote[] = [];
  for (const f of findings) {
    if (!f.screen || f.severity === "normal") continue;
    for (const rule of RULES) {
      if (!rule.screens.includes(f.screen) || (rule.when && !rule.when(f))) continue;
      for (const med of meds) {
        if (rule.match.test(med.name)) notes.push({ findingId: f.id, medication: med.name, text: rule.text(med.name) });
      }
    }
  }
  return notes;
}

export function notesFor(notes: MedNote[], findingId: string): string[] {
  return notes.filter((n) => n.findingId === findingId).map((n) => n.text);
}
