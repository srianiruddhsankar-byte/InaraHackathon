// Append-only report versions: ai_draft → doctor_edited → approved.
// These helpers never mutate or overwrite an existing version.
import type { Report, ReportVersion } from "./types";

export function latestVersion(report: Report): ReportVersion | undefined {
  return report.versions[report.versions.length - 1];
}

/** The approved version, if the report has been released to the patient. */
export function approvedVersion(report: Report): ReportVersion | undefined {
  return report.versions.find((v) => v.status === "approved");
}

export function isApproved(report: Report): boolean {
  return approvedVersion(report) !== undefined;
}

/** New report object with `version` appended; existing versions are kept as-is. */
export function appendVersion(report: Report, version: ReportVersion): Report {
  return { ...report, versions: [...report.versions, version] };
}

interface NewVersionInput {
  id: string;
  author: string;
  timestamp: string;
  text?: string;
  prescription?: string;
}

/** Append a doctor_edited version. Approved reports are locked and returned unchanged. */
export function addDoctorEdit(report: Report, input: NewVersionInput & { text: string }): Report {
  if (isApproved(report)) return report;
  return appendVersion(report, {
    id: input.id,
    status: "doctor_edited",
    text: input.text,
    prescription: input.prescription,
    author: input.author,
    timestamp: input.timestamp,
  });
}

/**
 * Append an approved version. Text and prescription default to the latest
 * version's. Already-approved reports are returned unchanged.
 */
export function approve(report: Report, input: NewVersionInput): Report {
  if (isApproved(report)) return report;
  const last = latestVersion(report);
  return appendVersion(report, {
    id: input.id,
    status: "approved",
    text: input.text ?? last?.text ?? "",
    prescription: input.prescription ?? last?.prescription,
    author: input.author,
    timestamp: input.timestamp,
  });
}
