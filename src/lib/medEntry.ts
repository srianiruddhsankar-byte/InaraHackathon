// Prescription row helpers for the Treatment step: pre-fill a medicine from the
// formulary's standard defaults, track which pre-filled fields the doctor still
// has to confirm, and build the one-line preview the patient will see.
// Defaults come only from the formulary — never from AI or lab values.
import { foodTimingLabel, frequencyMeaning, type FormularyEntry } from "./formulary";
import type { DefaultField, Medication } from "./types";

export { formularyByCategory } from "./formulary";

export const DEFAULT_FIELDS: DefaultField[] = ["dose", "frequency", "foodTiming", "duration", "instructions"];

/** A new row for a formulary medicine, with every default field filled and flagged. */
export function medicationFromFormulary(e: FormularyEntry): Medication {
  return {
    name: e.genericName,
    formularyId: e.id,
    dose: e.defaultStrength,
    frequency: e.defaultFrequency,
    foodTiming: e.foodTiming,
    duration: e.defaultDuration,
    instructions: e.defaultInstructions,
    unconfirmedDefaults: [...DEFAULT_FIELDS],
  };
}

/** A new row for a medicine not in the formulary: no defaults, no safety checks. */
export function customMedication(name: string): Medication {
  return { name, dose: "", frequency: "", duration: "", instructions: "", custom: true };
}

/** Apply a doctor's edit; any edited default field counts as confirmed. */
export function editMedication(med: Medication, patch: Partial<Medication>): Medication {
  const pending = med.unconfirmedDefaults?.filter((f) => !(f in patch));
  return { ...med, ...patch, unconfirmedDefaults: pending?.length ? pending : undefined };
}

/** The doctor accepts every remaining default on this row. */
export function confirmDefaults(med: Medication): Medication {
  return { ...med, unconfirmedDefaults: undefined };
}

export function isUnconfirmed(med: Medication, field: DefaultField): boolean {
  return !!med.unconfirmedDefaults?.includes(field);
}

/** Number of medicines that still have defaults to confirm. Approval needs this to be 0. */
export function unconfirmedCount(meds: Medication[]): number {
  return meds.filter((m) => m.unconfirmedDefaults?.length).length;
}

/** True while any medicine still has formulary defaults the doctor hasn't confirmed. */
export function hasUnconfirmedDefaults(meds: Medication[]): boolean {
  return unconfirmedCount(meds) > 0;
}

/** "Metformin 500 mg · Twice daily · With food · 30 days · Take with meals" */
export function patientPreview(med: Medication): string {
  return [
    [med.name.trim(), med.dose.trim()].filter(Boolean).join(" "),
    med.frequency.trim() && frequencyMeaning(med.frequency),
    foodTimingLabel(med.foodTiming),
    med.duration.trim(),
    med.instructions.trim(),
  ]
    .filter(Boolean)
    .join(" · ");
}
