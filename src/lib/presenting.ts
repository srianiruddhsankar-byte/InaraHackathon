// Why a test was ordered, kept as two separate fields: the presenting
// symptoms (what the patient feels) and the suspected disease (what the
// doctor wants to check). Shown everywhere as
// "Symptoms: Fatigue · Suspected disease: Iron-deficiency anaemia".
import type { Case, Patient } from "./types";

export interface Presenting {
  symptoms: string;
  suspectedDisease: string;
}

const NONE = "None";

/** The case's fields win over the patient's own (a case knows why this test was ordered). */
export function presentingFor(
  patient: Pick<Patient, "symptoms" | "suspectedDisease">,
  c?: Partial<Pick<Case, "symptoms" | "suspectedDisease">> | null,
): Presenting {
  return {
    symptoms: c?.symptoms?.trim() || patient.symptoms?.trim() || "",
    suspectedDisease: c?.suspectedDisease?.trim() || patient.suspectedDisease?.trim() || "",
  };
}

/** "Symptoms: Fatigue · Suspected disease: Iron-deficiency anaemia" (empty field → "None"). */
export function presentingLine(p: Partial<Presenting>): string {
  return `Symptoms: ${p.symptoms?.trim() || NONE} · Suspected disease: ${p.suspectedDisease?.trim() || NONE}`;
}

/** ["fever", "body pain"] → "Fever, body pain". */
export function symptomList(items: string[]): string {
  const s = items.filter(Boolean).join(", ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
