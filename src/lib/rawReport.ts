// The raw lab report: rows exactly as the lab sent them (after the lab's own
// verification), in the original order — duplicates, "NA" and unknown tests
// included. Nothing here is normalised, flagged or interpreted.
import { normaliseName } from "./normalise";
import { refText, reportSpecimenTitle, SPECIMEN_LABEL, TESTS } from "./tests";
import type { Report, Sex, TestKey } from "./types";
import { approvedVersion } from "./versions";

export interface RawRow {
  /** 1-based position in the lab's report. */
  line: number;
  name: string;
  /** The value exactly as sent ("<5", "5,2", "Pos", 6.1). */
  value: string | number;
  unit: string;
}

export function rawRows(report: Pick<Report, "raw">): RawRow[] {
  return (report.raw ?? []).map((r, i) => ({ line: i + 1, name: r.name, value: r.value, unit: r.unit }));
}

export interface RawDisplayRow extends RawRow {
  /** "Blood · serum", "Urine" — from the dictionary; undefined for an unknown test. */
  specimen?: string;
  /** "Ref: 4.0–5.6 %" for the patient's sex; undefined for an unknown test. */
  ref?: string;
}

/** The test a raw row is: the lab's own mapping when it verified the upload, else by name. */
function rowKey(r: { name: string; testKey?: TestKey | null }): TestKey | null {
  return r.testKey ?? normaliseName(r.name);
}

/** Raw rows for display, each with its specimen and reference range (the values stay exactly as sent). */
export function rawDisplayRows(report: Pick<Report, "raw">, sex: Sex): RawDisplayRow[] {
  return rawRows(report).map((row, i) => {
    const key = rowKey(report.raw![i]);
    return key ? { ...row, specimen: SPECIMEN_LABEL[TESTS[key].specimen], ref: refText(key, sex) } : row;
  });
}

/** "Blood + Urine report" from the tests in the report. */
export function rawSpecimenTitle(report: Pick<Report, "raw" | "values">): string {
  const keys = report.values.length
    ? report.values.map((v) => v.testKey)
    : (report.raw ?? []).flatMap((r) => rowKey(r) ?? []);
  return reportSpecimenTitle(keys);
}

/**
 * One CSV cell. Quoted when it contains a comma, quote, newline or edge spaces.
 * Cells that a spreadsheet would run as a formula (=, +, @, tab, or "-" not
 * starting a number) get a leading apostrophe.
 */
export function csvCell(value: string | number): string {
  let s = String(value);
  if (/^[=+@\t\r]/.test(s) || /^-(?![\d.])/.test(s)) s = `'${s}`;
  return /[",\n\r]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rawCsv(report: Pick<Report, "raw">): string {
  const lines = [["test", "value", "unit"], ...rawRows(report).map((r) => [r.name, r.value, r.unit])];
  return lines.map((cells) => cells.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export interface RawJson {
  reportId: string;
  patientId: string;
  date: string;
  labName: string;
  source: string;
  receivedAt?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  rows: { name: string; value: string | number; unit: string }[];
}

export function rawJson(report: Report): RawJson {
  return {
    reportId: report.id,
    patientId: report.patientId,
    date: report.date,
    labName: report.labName,
    source: report.source ?? "csv",
    ...(report.receivedAt ? { receivedAt: report.receivedAt } : {}),
    ...(report.verifiedBy ? { verifiedBy: report.verifiedBy } : {}),
    ...(report.verifiedAt ? { verifiedAt: report.verifiedAt } : {}),
    rows: rawRows(report).map(({ name, value, unit }) => ({ name, value, unit })),
  };
}

/** "ravi-2026-03-15-raw.csv" */
export function rawFileName(report: Pick<Report, "patientId" | "date">, ext: "csv" | "json"): string {
  return `${report.patientId}-${report.date}-raw.${ext}`;
}

/** Reports whose raw rows a patient may see: their own, approved only, newest first. */
export function patientRawReports(patientId: string, reports: Report[]): Report[] {
  return reports
    .filter((r) => r.patientId === patientId && approvedVersion(r))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** All of a patient's reports for the doctor, newest first. */
export function doctorRawReports(patientId: string, reports: Report[]): Report[] {
  return reports.filter((r) => r.patientId === patientId).sort((a, b) => b.date.localeCompare(a.date));
}
