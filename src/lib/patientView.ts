// What a patient may see: only doctor-approved report text and approved
// treatment plans. AI drafts, doctor edits, clinical summaries and plan
// drafts never pass through here.
import { approvedPlan } from "./treatment";
import type { Report, TreatmentPlan } from "./types";
import { approvedVersion } from "./versions";

export interface PatientReportView {
  reportId: string;
  date: string;
  labName: string;
  approvedBy: string;
  approvedAt: string;
  /** The approved plain-language explanation, verbatim. */
  explanation?: string;
  /** The doctor's approved prescription text, verbatim (older reports). */
  prescription?: string;
  /** The approved treatment plan for this report, verbatim. */
  plan?: TreatmentPlan;
}

/** The approved plan without doctor-only content (safety overrides, doctor notes). */
export function patientSafePlan(plan: TreatmentPlan): TreatmentPlan {
  return {
    ...plan,
    medications: plan.medications.map((m) => {
      const rest = { ...m };
      delete rest.override;
      return rest;
    }),
    doctorNotes: "",
  };
}

/** The patient's approved reports, newest first. */
export function patientVisibleReports(
  patientId: string,
  reports: Report[],
  plans: TreatmentPlan[],
): PatientReportView[] {
  return reports
    .filter((r) => r.patientId === patientId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .flatMap((r) => {
      const v = approvedVersion(r);
      if (!v) return [];
      const plan = approvedPlan(plans, r.id);
      return [
        {
          reportId: r.id,
          date: r.date,
          labName: r.labName,
          approvedBy: v.author,
          approvedAt: v.timestamp,
          explanation: v.patientText,
          prescription: v.prescription,
          plan: plan?.patientId === patientId ? patientSafePlan(plan) : undefined,
        },
      ];
    });
}
