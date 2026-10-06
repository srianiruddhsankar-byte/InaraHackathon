// Turns verified lab rows into a report with an AI draft, and builds the lab's
// own history view. Pure functions only. The lab view never includes findings
// or AI text — only patient, date, source, test count and stage.
import { getFindings } from "./findings";
import { activeMedications } from "./record";
import { buildDrafts } from "./review";
import { computeTrends } from "./trends";
import type { Case, CaseStage, Patient, RawLabValue, Report, ReportSource, ReportVersion } from "./types";
import { importedValues, type EvaluatedRow } from "./upload";

export const AI_AUTHOR = "Inara AI (template draft)";

/** The AI draft for the newest report in `history` (history = all reports up to and including it). */
export function aiDraftVersion(patient: Patient, history: Report[], id: string, timestamp: string): ReportVersion {
  const report = history.at(-1)!;
  const drafts = buildDrafts(
    getFindings(patient, history),
    undefined,
    computeTrends(patient, history),
    report.values,
    history.length,
    activeMedications(patient.currentMedications),
  );
  return { id, status: "ai_draft", text: drafts.clinical, patientText: drafts.patient, author: AI_AUTHOR, timestamp };
}

export interface LabReportInput {
  id: string;
  patient: Patient;
  /** The patient's earlier reports (the baseline for trends). */
  previous: Report[];
  date: string;
  labName: string;
  source: ReportSource;
  rows: EvaluatedRow[];
  verifiedBy: string;
  /** ISO 8601 — also used as the received time and the draft time. */
  at: string;
}

/** A new report from verified rows: raw rows kept, values normalised, one ai_draft version. */
export function buildLabReport(input: LabReportInput): Report {
  const raw: RawLabValue[] = input.rows.map((r) => ({
    name: r.rawName,
    value: r.rawValue,
    unit: r.rawUnit,
    status: r.status,
    testKey: r.testKey,
    normalised: r.value,
  }));
  const report: Report = {
    id: input.id,
    patientId: input.patient.id,
    date: input.date,
    labName: input.labName,
    receivedAt: input.at,
    raw,
    source: input.source,
    verifiedBy: input.verifiedBy.trim(),
    verifiedAt: input.at,
    values: importedValues(input.rows),
    versions: [],
  };
  const history = [...input.previous.filter((r) => r.date <= report.date), report];
  report.versions.push(aiDraftVersion(input.patient, history, `${input.id}-v1`, input.at));
  return report;
}

/** A free report id: "ravi-2026-03", or with a suffix if that month is taken. */
export function newReportId(patientId: string, date: string, taken: string[], suffix: string): string {
  const id = `${patientId}-${date.slice(0, 7)}`;
  return taken.includes(id) ? `${id}-${suffix}` : id;
}

export interface LabHistoryRow {
  reportId: string;
  patientName: string;
  date: string;
  source: "CSV" | "Photo";
  testsCount: number;
  stage: CaseStage | null;
}

/** What the lab may see about results it sent: no findings, no drafts, no approvals. Newest first. */
export function labHistoryRows(reports: Report[], cases: Case[], patients: Patient[]): LabHistoryRow[] {
  return reports
    .map((r) => ({
      reportId: r.id,
      patientName: patients.find((p) => p.id === r.patientId)?.name ?? "Unknown patient",
      date: r.date,
      source: r.source === "photo" ? ("Photo" as const) : ("CSV" as const),
      testsCount: r.values.length,
      stage: cases.find((c) => c.reportId === r.id)?.stage ?? null,
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || a.patientName.localeCompare(b.patientName));
}
