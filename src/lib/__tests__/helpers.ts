import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildLabReport } from "../labReport";
import { seedPatients, seedReports } from "../seed";
import type { Patient, Report } from "../types";
import { ALL_PANELS } from "../workflow";
import { orderedTestKeys, parseLabCsv, reviewUpload, type UploadReview } from "../upload";

/** A file from public/samples. */
export function sampleFile(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../public/samples/${name}`, import.meta.url)), "utf8");
}

/** Ravi's sample upload, read and reviewed like the lab screen does. */
export function sampleReview(name = "ravi_report.csv", fallbackDate = "2026-03-15"): UploadReview {
  const ravi = seedPatients().find((p) => p.id === "ravi")!;
  return reviewUpload({
    parsed: parseLabCsv(sampleFile(name)),
    sex: ravi.sex,
    ordered: orderedTestKeys(ALL_PANELS),
    fallbackDate: { date: fallbackDate, source: "sample_received" },
  });
}

/** Ravi's Mar 2026 report as the lab would submit it from a sample file. */
export function uploadedRaviReport(name = "ravi_report.csv", fallbackDate?: string): Report {
  const ravi = seedPatients().find((p) => p.id === "ravi")!;
  const review = sampleReview(name, fallbackDate);
  return buildLabReport({
    id: `ravi-${review.reportDate.slice(0, 7)}`,
    patient: ravi,
    previous: seedReports().filter((r) => r.patientId === "ravi"),
    date: review.reportDate,
    labName: "Inara Diagnostics",
    source: "csv",
    rows: review.rows,
    verifiedBy: "A. Technician",
    at: `${review.reportDate}T09:00:00.000Z`,
  });
}

/**
 * A seed patient and their reports. Ravi's Mar 2026 report isn't seeded, so it
 * is built from the sample CSV upload — the same path the lab uses in the demo.
 */
export function patientData(id: string): { patient: Patient; reports: Report[] } {
  const patient = seedPatients().find((p) => p.id === id);
  if (!patient) throw new Error(`No seed patient ${id}`);
  const reports = seedReports().filter((r) => r.patientId === id);
  if (id === "ravi") reports.push(uploadedRaviReport());
  return { patient, reports };
}
