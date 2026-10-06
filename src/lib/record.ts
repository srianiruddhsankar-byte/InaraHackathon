// Patient record helpers: timeline of visits and reports, sparkline keys,
// and updating current medications when a treatment plan is approved.
import { chartKeysFor } from "./review";
import type { CurrentMedication, Finding, Patient, Report, ReportStatus, TreatmentPlan, TrendKey } from "./types";
import { latestVersion } from "./versions";

export type TimelineEntry =
  | { kind: "report"; date: string; reportId: string; title: string; status: ReportStatus; abnormalCount: number }
  | { kind: "visit"; date: string; title: string; doctor: string; note: string };

/** Visits and lab reports merged, newest first (a report sorts before a visit on the same day). */
export function recordTimeline(patient: Patient, reports: Report[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...reports
      .filter((r) => r.patientId === patient.id)
      .map(
        (r): TimelineEntry => ({
          kind: "report",
          date: r.date,
          reportId: r.id,
          title: `Lab report · ${r.labName}`,
          status: latestVersion(r)?.status ?? "ai_draft",
          abnormalCount: r.values.filter((v) => v.flag !== "normal").length,
        }),
      ),
    ...patient.visitHistory.map(
      (v): TimelineEntry => ({ kind: "visit", date: v.date, title: v.reason, doctor: v.doctor, note: v.note }),
    ),
  ];
  return entries.sort((a, b) => b.date.localeCompare(a.date) || (a.kind === "report" ? 1 : -1));
}

const DEFAULT_SPARK_KEYS: TrendKey[] = ["hba1c", "fasting_glucose", "egfr", "urine_acr", "ldl", "hb"];

/** Key values to show as sparklines: tests behind the findings first, then defaults (max `n`). */
export function sparklineKeys(findings: Finding[], n = 6): TrendKey[] {
  const keys = [...chartKeysFor(findings)];
  for (const k of DEFAULT_SPARK_KEYS) if (!keys.includes(k)) keys.push(k);
  return keys.slice(0, n);
}

function sameMedicine(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Current medications after a plan is approved: each plan medicine is added
 * (or replaces the same-named entry, e.g. a dose change). Nothing else is removed.
 */
export function mergePlanMedications(current: CurrentMedication[], plan: TreatmentPlan): CurrentMedication[] {
  if (plan.status !== "approved") return current;
  const since = plan.timestamp.slice(0, 10);
  const fromPlan: CurrentMedication[] = plan.medications.map((m) => ({
    name: m.name,
    dose: m.dose,
    frequency: [m.frequency, m.duration && `for ${m.duration}`].filter(Boolean).join(" "),
    since,
    prescribedBy: plan.author,
    note: m.instructions || undefined,
  }));
  const kept = current.filter((c) => !fromPlan.some((p) => sameMedicine(p.name, c.name)));
  return [...kept, ...fromPlan];
}
