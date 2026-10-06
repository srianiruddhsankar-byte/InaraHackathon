// Lab CSV upload: read a messy export, map every row to a canonical test and
// let the lab verify it before anything is sent. Pure functions only.
//
// Only real ERRORS block submit: an unreadable file, no recognisable test rows,
// or a value that still isn't a number. Everything else (unknown tests, missing
// units or dates, duplicates, tests not reported) is a warning the lab can see.
import Papa from "papaparse";
import { unitFactor, normaliseName } from "./normalise";
import { flagValue } from "./rules";
import { PLAUSIBLE, TEST_KEYS, TESTS } from "./tests";
import type { Flag, LabValue, PanelId, Sex, TestKey, UploadRowStatus } from "./types";
import { PANELS } from "./workflow";

export type Delimiter = "," | ";" | "\t";
type ColumnRole = "name" | "value" | "unit" | "date" | "reference";

/** Accepted header names per column (compared case-insensitively, ignoring _ - . and spacing). */
const HEADER_SYNONYMS: Record<ColumnRole, string[]> = {
  name: ["test", "test name", "test_name", "tests", "parameter", "parameters", "investigation", "investigations", "test description", "analyte"],
  value: ["value", "values", "result", "results", "observed value", "observed values", "result value", "test value"],
  unit: ["unit", "units", "uom"],
  date: ["date", "sample date", "collection date", "date of collection", "report date", "test date"],
  reference: ["reference", "ref range", "reference range", "ref", "normal range", "reference interval", "biological reference interval"],
};

function headerKey(s: string): string {
  return s.toLowerCase().replace(/[_\-.:]+/g, " ").replace(/\s+/g, " ").trim();
}

const HEADER_INDEX = new Map<string, ColumnRole>(
  (Object.entries(HEADER_SYNONYMS) as [ColumnRole, string[]][]).flatMap(([role, names]) =>
    names.map((n) => [headerKey(n), role] as const),
  ),
);

/** One row as the lab sent it (and as the lab edits it in the verification table). */
export interface UploadRow {
  id: string;
  /** Row number in the file (1 = first non-blank line). */
  line: number;
  rawName: string;
  rawValue: string;
  rawUnit: string;
  rawDate: string;
  rawReference: string;
  /** The lab picked the test by hand in the verification table (null = skip this row). */
  testKeyOverride?: TestKey | null;
}

export interface ParsedCsv {
  rows: UploadRow[];
  delimiter: Delimiter | null;
  hasDateColumn: boolean;
  /** Unreadable file, no header, no rows. */
  errors: string[];
  warnings: string[];
}

// ---- Values ----------------------------------------------------------------

export type ParsedValue =
  | { kind: "number"; value: number; qualifier?: "<" | ">" | "≤" | "≥"; flagHint?: "H" | "L" }
  | { kind: "not_reported" }
  | { kind: "invalid" };

const NOT_REPORTED = /^(?:-+|—|–|na|n\/a|n\.a\.?|nr|not reported|pending|awaited|not done|nd|test not done)$/i;

/**
 * Read a lab value: "<5", ">300", "5.2 H", "5.2 (L)", "1,250" (thousands),
 * "5,2" (decimal comma). "—", "NA", "N/A", "pending", "not done" or blank = not reported.
 */
export function parseValue(raw: string | number): ParsedValue {
  if (typeof raw === "number") return Number.isFinite(raw) ? { kind: "number", value: raw } : { kind: "invalid" };
  let s = raw.trim();
  if (s === "" || NOT_REPORTED.test(s)) return { kind: "not_reported" };

  let flagHint: "H" | "L" | undefined;
  const flag = s.match(/^(.*\d)\s*[([]?\s*(high|low|h|l)\s*[)\]]?\s*\**$/i);
  if (flag) {
    s = flag[1];
    flagHint = flag[2][0].toUpperCase() as "H" | "L";
  }
  s = s.replace(/\*+$/, "").trim();

  let qualifier: "<" | ">" | "≤" | "≥" | undefined;
  const q = s.match(/^(<=|>=|≤|≥|<|>)\s*/);
  if (q) {
    qualifier = ({ "<=": "≤", ">=": "≥" } as Record<string, "≤" | "≥">)[q[1]] ?? (q[1] as "<" | ">" | "≤" | "≥");
    s = s.slice(q[0].length);
  }

  let num: number;
  if (/^[+-]?[1-9]\d{0,2}(,\d{3})+(\.\d+)?$/.test(s)) num = Number(s.replace(/,/g, "")); // 1,250
  else if (/^[+-]?\d+,\d+$/.test(s)) num = Number(s.replace(",", ".")); // 5,2
  else if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) num = Number(s);
  else return { kind: "invalid" };

  const out: ParsedValue = { kind: "number", value: num };
  if (qualifier) out.qualifier = qualifier;
  if (flagHint) out.flagHint = flagHint;
  return out;
}

// ---- Dates -----------------------------------------------------------------

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function isoDate(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

/** "2026-03-15", "15/03/2026", "15-03-2026", "15.03.2026", "15 Mar 2026", "15-Mar-26" → ISO date. Day comes first (Indian lab format). */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return isoDate(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) return isoDate(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[\s-]([a-z]{3})[a-z]*[\s-,]+(\d{2}|\d{4})$/i);
  if (m) {
    const month = MONTHS.indexOf(m[2].toLowerCase()) + 1;
    if (month === 0) return null;
    return isoDate(m[3].length === 2 ? 2000 + +m[3] : +m[3], month, +m[1]);
  }
  return null;
}

// ---- File parsing ----------------------------------------------------------

function splitRows(text: string, delimiter: Delimiter): string[][] {
  const result = Papa.parse<string[]>(text, { delimiter, skipEmptyLines: "greedy" });
  return result.data.map((row) => row.map((c) => String(c ?? "").trim()));
}

/** The delimiter that gives the most rows with the same (2+) column count. */
export function detectDelimiter(text: string): Delimiter | null {
  let best: { d: Delimiter; score: number } | null = null;
  for (const d of [",", ";", "\t"] as Delimiter[]) {
    const counts = new Map<number, number>();
    for (const row of splitRows(text, d)) {
      const n = row.length;
      if (n >= 2) counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    const score = Math.max(0, ...counts.values());
    if (score > 0 && (!best || score > best.score)) best = { d, score };
  }
  return best?.d ?? null;
}

function columnsOf(cells: string[]): Partial<Record<ColumnRole, number>> {
  const cols: Partial<Record<ColumnRole, number>> = {};
  cells.forEach((cell, i) => {
    const role = HEADER_INDEX.get(headerKey(cell));
    if (role && cols[role] === undefined) cols[role] = i;
  });
  return cols;
}

/**
 * Parse a lab CSV export. Handles a BOM, comma/semicolon/tab, blank lines,
 * title rows above the header, extra columns and footer notes.
 */
export function parseLabCsv(text: string): ParsedCsv {
  const empty = (error: string): ParsedCsv => ({ rows: [], delimiter: null, hasDateColumn: false, errors: [error], warnings: [] });
  const clean = text.replace(/^﻿/, "");
  if (clean.trim() === "") return empty("The file is empty.");
  if (clean.includes("\u0000")) return empty("This file can't be read as text. Please upload a CSV file.");

  const delimiter = detectDelimiter(clean);
  if (!delimiter) return empty("Couldn't find any columns. Use commas, semicolons or tabs between columns.");
  const lines = splitRows(clean, delimiter);
  const warnings: string[] = [];

  // Header = first row (of the first 20) with a test column and a value column.
  let headerAt = lines.slice(0, 20).findIndex((cells) => {
    const c = columnsOf(cells);
    return c.name !== undefined && c.value !== undefined;
  });
  let cols: Partial<Record<ColumnRole, number>>;
  if (headerAt >= 0) {
    cols = columnsOf(lines[headerAt]);
    if (headerAt > 0) warnings.push(`Skipped ${headerAt} title line${headerAt === 1 ? "" : "s"} above the header.`);
  } else if (lines.some((cells) => normaliseName(cells[0] ?? ""))) {
    // No header at all: assume test, value, unit (the usual order).
    headerAt = -1;
    cols = { name: 0, value: 1, unit: 2 };
    warnings.push("No header row found — assumed the columns are: test, value, unit.");
  } else {
    return { ...empty("Couldn't find a header row with test name and value columns."), delimiter };
  }

  const rows: UploadRow[] = [];
  let notes = 0;
  const cell = (cells: string[], role: ColumnRole) => (cols[role] === undefined ? "" : (cells[cols[role]!] ?? ""));
  lines.slice(headerAt + 1).forEach((cells, i) => {
    if (cells.every((c) => c === "")) return;
    const c = columnsOf(cells);
    if (c.name !== undefined && c.value !== undefined) return; // repeated header
    const rawName = cell(cells, "name");
    const rawValue = cell(cells, "value");
    const rawUnit = cell(cells, "unit");
    // Footer notes / section titles: no value and no unit, and not a known test.
    if (!rawName || (!rawValue && !rawUnit && !normaliseName(rawName))) {
      notes++;
      return;
    }
    rows.push({
      id: `row-${rows.length + 1}`,
      line: headerAt + 2 + i,
      rawName,
      rawValue,
      rawUnit,
      rawDate: cell(cells, "date"),
      rawReference: cell(cells, "reference"),
    });
  });
  if (notes > 0) warnings.push(`Ignored ${notes} note line${notes === 1 ? "" : "s"} (no test value).`);

  const errors = rows.length === 0 ? ["No test rows found below the header."] : [];
  return { rows, delimiter, hasDateColumn: cols.date !== undefined, errors, warnings };
}

// ---- Row evaluation --------------------------------------------------------

export interface EvaluatedRow extends UploadRow {
  testKey: TestKey | null;
  loinc?: string;
  testName?: string;
  /** Value in the canonical unit; null when not imported. */
  value: number | null;
  unit: string | null;
  flag: Flag | null;
  status: UploadRowStatus;
  /** Short explanation for the lab, e.g. "Unit assumed (%) — please check". */
  message?: string;
  /** True only for problems that block submit (a value that isn't a number). */
  blocking: boolean;
}

export const STATUS_LABEL: Record<UploadRowStatus, string> = {
  mapped: "Mapped",
  converted: "Converted",
  unit_assumed: "Unit assumed",
  not_reported: "Not reported",
  unknown: "Unknown",
  needs_fixing: "Needs fixing",
  duplicate: "Duplicate",
};

/** Statuses that put a value into the report. */
const IMPORTED: UploadRowStatus[] = ["mapped", "converted", "unit_assumed"];

export function isImported(row: EvaluatedRow): boolean {
  return IMPORTED.includes(row.status);
}

export function needsAttention(row: EvaluatedRow): boolean {
  return row.status !== "mapped" && row.status !== "converted";
}

function round(value: number, decimals: number): number {
  const p = 10 ** decimals;
  return Math.round(value * p) / p;
}

/** Map and convert one row. Duplicates are handled by `evaluateRows`. */
export function evaluateRow(row: UploadRow, sex: Sex): EvaluatedRow {
  const base = { ...row, testKey: null, value: null, unit: null, flag: null, blocking: false };
  const key = row.testKeyOverride !== undefined ? row.testKeyOverride : normaliseName(row.rawName);
  if (!key) return { ...base, status: "unknown", message: row.testKeyOverride === null ? "Skipped by the lab" : "Unknown — skipped" };

  const def = TESTS[key];
  const mapped = { ...base, testKey: key, loinc: def.loinc, testName: def.name };
  const parsed = parseValue(row.rawValue);
  if (parsed.kind === "not_reported") return { ...mapped, status: "not_reported", message: "Not reported — skipped" };
  if (parsed.kind === "invalid") {
    return { ...mapped, status: "needs_fixing", blocking: true, message: `"${row.rawValue}" is not a number — fix it or enter NA` };
  }

  const notes: string[] = [];
  if (parsed.qualifier) notes.push(`Reported as "${row.rawValue.trim()}" — stored as ${parsed.value}`);
  let status: UploadRowStatus = "mapped";
  let factor = 1;
  const [min, max] = PLAUSIBLE[key];

  if (row.rawUnit.trim() === "") {
    if (parsed.value < min || parsed.value > max) {
      return { ...mapped, status: "needs_fixing", message: `Unit missing — please enter (expected ${def.unit})` };
    }
    status = "unit_assumed";
    notes.unshift(`Unit assumed (${def.unit}) — please check`);
  } else {
    const f = unitFactor(key, row.rawUnit, row.rawName);
    if (f === null) {
      return { ...mapped, status: "needs_fixing", message: `Unknown unit "${row.rawUnit}" — expected ${def.unit}` };
    }
    factor = f;
    if (f !== 1) {
      status = "converted";
      notes.unshift(`Converted from ${parsed.value} ${row.rawUnit}`);
    }
  }

  const value = round(parsed.value * factor, def.decimals);
  if (status !== "unit_assumed" && (value < min || value > max)) notes.push("Value looks unusual — please check");
  return {
    ...mapped,
    value,
    unit: def.unit,
    flag: flagValue(key, value, sex),
    status,
    message: notes.join(" · ") || undefined,
  };
}

/** Evaluate every row; a test that appears twice keeps the first row. */
export function evaluateRows(rows: UploadRow[], sex: Sex): EvaluatedRow[] {
  const firstLine = new Map<TestKey, number>();
  return rows.map((row) => {
    const r = evaluateRow(row, sex);
    if (!r.testKey) return r;
    const first = firstLine.get(r.testKey);
    if (first !== undefined) {
      return { ...r, status: "duplicate", value: null, flag: null, blocking: false, message: `Duplicate of row ${first} — skipped` };
    }
    firstLine.set(r.testKey, r.line);
    return r;
  });
}

// ---- Review: summary, warnings, errors -------------------------------------

/** Test keys covered by the ordered panels. */
export function orderedTestKeys(panels: PanelId[]): TestKey[] {
  const keys = new Set(PANELS.filter((p) => panels.includes(p.id)).flatMap((p) => p.tests.map((t) => t.key)));
  return TEST_KEYS.filter((k) => keys.has(k));
}

export type UploadSummary = Record<UploadRowStatus, number>;

export function summarise(rows: EvaluatedRow[]): UploadSummary {
  const s = Object.fromEntries(Object.keys(STATUS_LABEL).map((k) => [k, 0])) as UploadSummary;
  for (const r of rows) s[r.status]++;
  return s;
}

/** "21 mapped · 3 converted · 2 not reported · 1 unknown (skipped) · 1 unit assumed" */
export function summaryText(s: UploadSummary): string {
  const parts = [`${s.mapped} mapped`];
  if (s.converted) parts.push(`${s.converted} converted`);
  if (s.not_reported) parts.push(`${s.not_reported} not reported`);
  if (s.unknown) parts.push(`${s.unknown} unknown (skipped)`);
  if (s.duplicate) parts.push(`${s.duplicate} duplicate (skipped)`);
  if (s.unit_assumed) parts.push(`${s.unit_assumed} unit assumed`);
  if (s.needs_fixing) parts.push(`${s.needs_fixing} need${s.needs_fixing === 1 ? "s" : ""} fixing`);
  return parts.join(" · ");
}

export interface ReviewInput {
  parsed: ParsedCsv;
  /** The rows as currently edited by the lab (defaults to the parsed rows). */
  rows?: UploadRow[];
  sex: Sex;
  /** Tests the doctor ordered (for "Ordered but not in file"). */
  ordered?: TestKey[];
  /** Used when the file has no dates: the sample-received date, else today. */
  fallbackDate: { date: string; source: "sample_received" | "today" };
  /** The lab typed a report date by hand: use it, no date warning. */
  reportDateOverride?: string;
}

export interface UploadReview {
  rows: EvaluatedRow[];
  summary: UploadSummary;
  summaryText: string;
  reportDate: string;
  warnings: string[];
  /** Anything here blocks submit. */
  errors: string[];
}

const names = (rows: EvaluatedRow[]) => [...new Set(rows.map((r) => r.testName ?? r.rawName))].join(", ");

function resolveDate(input: ReviewInput, rows: EvaluatedRow[]): { date: string; warning?: string } {
  if (input.reportDateOverride) return { date: input.reportDateOverride };
  const { date: fallback, source } = input.fallbackDate;
  const label = source === "sample_received" ? "the sample-received date" : "today's date";
  if (!input.parsed.hasDateColumn) return { date: fallback, warning: `No date column — used ${label} (${fallback}). Please check.` };

  const raw = rows.filter((r) => r.testKey && r.rawDate.trim());
  const dates = raw.map((r) => parseDate(r.rawDate)).filter((d): d is string => !!d);
  if (dates.length === 0) return { date: fallback, warning: `No readable dates in the file — used ${label} (${fallback}). Please check.` };
  const date = dates[0];
  if (new Set(dates).size > 1) return { date, warning: `Rows have different dates — used ${date}. Please check.` };
  if (dates.length < raw.length) return { date, warning: `Some dates couldn't be read — used ${date}.` };
  return { date };
}

export function reviewUpload(input: ReviewInput): UploadReview {
  const rows = evaluateRows(input.rows ?? input.parsed.rows, input.sex);
  const summary = summarise(rows);
  const warnings = [...input.parsed.warnings];
  const errors = [...input.parsed.errors];
  const by = (status: UploadRowStatus) => rows.filter((r) => r.status === status);

  const date = resolveDate(input, rows);
  if (date.warning) warnings.push(date.warning);
  if (by("unknown").length) warnings.push(`Unknown — skipped: ${names(by("unknown"))}`);
  if (by("duplicate").length) warnings.push(`Duplicate rows — kept the first: ${names(by("duplicate"))}`);
  if (by("not_reported").length) warnings.push(`Not reported: ${names(by("not_reported"))}`);
  if (by("unit_assumed").length) warnings.push(`Unit assumed — please check: ${names(by("unit_assumed"))}`);
  const unitless = by("needs_fixing").filter((r) => !r.blocking);
  if (unitless.length) warnings.push(`Unit missing or unknown — please enter (otherwise skipped): ${names(unitless)}`);

  if (input.ordered?.length) {
    const present = new Set(rows.map((r) => r.testKey).filter(Boolean));
    const missing = input.ordered.filter((k) => !present.has(k));
    if (missing.length) warnings.push(`Ordered but not in file: ${missing.map((k) => TESTS[k].name).join(", ")}`);
  }

  if (errors.length === 0 && rows.length > 0 && !rows.some((r) => r.testKey)) {
    errors.push("No recognisable test rows — check the test names.");
  }
  for (const r of rows.filter((x) => x.blocking)) {
    errors.push(`Row ${r.line} (${r.testName ?? r.rawName}): "${r.rawValue}" is not a number.`);
  }

  return { rows, summary, summaryText: summaryText(summary), reportDate: date.date, warnings, errors };
}

/** Why submit is not allowed yet (empty = ready). */
export function submitBlockers(review: UploadReview, check: { verified: boolean; technician: string }): string[] {
  const out = [...review.errors];
  if (!review.rows.some(isImported)) out.push("No values to send.");
  if (!check.verified) out.push("Tick “I have verified these values against the original report”.");
  if (!check.technician.trim()) out.push("Enter the technician name.");
  return out;
}

export function canSubmit(review: UploadReview, check: { verified: boolean; technician: string }): boolean {
  return submitBlockers(review, check).length === 0;
}

/** The values that go into the report, in dictionary order. */
export function importedValues(rows: EvaluatedRow[]): LabValue[] {
  const imported = rows.filter(isImported);
  return TEST_KEYS.flatMap((key) => {
    const r = imported.find((x) => x.testKey === key);
    return r ? [{ testKey: key, value: r.value!, unit: r.unit!, flag: r.flag! }] : [];
  });
}

/** Rows needing attention first (blocking errors at the very top), then the rest in file order. */
export function attentionFirst(rows: EvaluatedRow[]): EvaluatedRow[] {
  const rank = (r: EvaluatedRow) => (r.blocking ? 0 : r.status === "needs_fixing" ? 1 : needsAttention(r) ? 2 : 3);
  return [...rows].sort((a, b) => rank(a) - rank(b) || a.line - b.line);
}
