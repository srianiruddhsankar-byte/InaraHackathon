// Wearable consent (DPDP-style): three separate choices plus an emergency
// contact and "notify my doctor on urgent alerts". Pure functions.
// No wearable data is processed unless the patient allows streaming (c).
import type { ConsentKey, EmergencyContact, PatientSettings } from "../types";

export const CONSENT_TEXT: Record<ConsentKey, { title: string; detail: string }> = {
  ownCare: {
    title: "Use my data for my own care",
    detail: "My doctor can see my wearable readings and Inara can compare them with my own normal.",
  },
  populationShare: {
    title: "Add my data anonymously to the local population database",
    detail: "My readings, without my name or phone, help set local norms for people like me.",
  },
  streaming: {
    title: "Stream wearable data continuously",
    detail: "My watch sends heart rate, HRV, SpO₂, skin temperature and motion around the clock. Off = nothing is processed.",
  },
  notifyDoctorOnUrgent: {
    title: "Notify my doctor on urgent alerts",
    detail: "If a reading looks urgent, my doctor is told straight away.",
  },
};

export const CONSENT_ORDER: ConsentKey[] = ["ownCare", "populationShare", "streaming"];

/** Wearable data may be generated/processed at all. */
export function canProcessWearable(settings: PatientSettings | undefined): boolean {
  return !!settings?.streaming.granted;
}

/** The doctor may see the wearable view: streaming on and the patient allows use for their own care. */
export function doctorCanView(settings: PatientSettings | undefined): boolean {
  return canProcessWearable(settings) && !!settings?.ownCare.granted;
}

export function setConsent(settings: PatientSettings, key: ConsentKey, granted: boolean, at: string): PatientSettings {
  return { ...settings, [key]: { granted, updatedAt: at } };
}

export type ContactInput = Omit<EmergencyContact, "updatedAt">;

/** Problems with an emergency contact (empty = valid). Indian mobile: 10 digits, optional +91. */
export function contactErrors(c: ContactInput): string[] {
  const errors: string[] = [];
  if (!c.name.trim()) errors.push("Enter a name.");
  if (!c.relation.trim()) errors.push("Enter how they are related to you.");
  if (!/^(\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}$/.test(c.phone.trim())) errors.push("Enter a 10-digit mobile number.");
  return errors;
}

const SEEDED_AT = "2026-08-30T04:30:00.000Z";

const on = (granted: boolean) => ({ granted, updatedAt: SEEDED_AT });

/** Demo settings: everyone streams except Priya; Karthik has an emergency contact. */
export function seedPatientSettings(): PatientSettings[] {
  const base = (patientId: string, streaming: boolean, contact: EmergencyContact | null): PatientSettings => ({
    patientId,
    ownCare: on(true),
    populationShare: on(true),
    streaming: on(streaming),
    notifyDoctorOnUrgent: on(true),
    emergencyContact: contact,
  });
  return [
    base("ravi", true, { name: "Lakshmi Kumar", relation: "Wife", phone: "+91 90000 10001", updatedAt: SEEDED_AT }),
    base("priya", false, null),
    base("arjun", true, null),
    base("karthik", true, { name: "Revathi R", relation: "Mother", phone: "+91 90000 10004", updatedAt: SEEDED_AT }),
  ];
}
