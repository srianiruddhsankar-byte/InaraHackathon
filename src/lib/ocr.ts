// Photo upload: turn OCR text lines into the same upload rows as a CSV, so the
// same checks and verification table apply. Pure functions only — the OCR
// itself (tesseract.js) runs in the browser component.
//
// A result line looks like "S. Creatinine 118.5 µmol/L 62 - 115". We find the
// value token, take everything before it as the test name and the next token
// as the unit. OCR slips are tolerated: "6.l" → 6.1, "Creatinlne" → Creatinine,
// "pmol/L" → µmol/L. Every fix is noted on the row and flagged for checking.
import { nameIndex, nameKey, normaliseName, unitFactor } from "./normalise";
import { TESTS } from "./tests";
import type { TestKey } from "./types";
import { parseDate, parseQualitative, type ParsedCsv, type UploadRow } from "./upload";

export interface OcrLine {
  text: string;
  /** 0–100, as reported by the OCR engine. */
  confidence: number;
}

/** Characters OCR often reads instead of digits inside a number. */
const DIGIT_FIXES: Record<string, string> = { O: "0", o: "0", l: "1", I: "1", "|": "1" };

/** A number token, allowing OCR slips: "6.l" → "6.1", "l8O" → "180". Null if not number-like. */
export function ocrNumber(token: string): string | null {
  const m = token.match(/^([<>≤≥]|<=|>=)?([\dOolI|.,]+)$/);
  if (!m || !/\d/.test(m[2])) return null;
  const digits = m[2].replace(/[OolI|]/g, (c) => DIGIT_FIXES[c]);
  if (!/^\d[\d.,]*$/.test(digits) && !/^\.\d+$/.test(digits)) return null;
  return (m[1] ?? "") + digits;
}

const NOT_REPORTED_TOKEN = /^(?:-+|—|–|na|n\/a|nr|pending|awaited|nd)$/i;
const FLAG_TOKEN = /^[([]?(h|l|high|low)[)\]]?\*?$/i;
/** "%", "fL", or anything with a slash and a letter: "mg/dL", "10^3/µL", "U/L". */
const UNIT_TOKEN = /^(%|fl|[^\s]*\/[^\s]*[a-zµμ][^\s]*|[^\s]*[a-zµμ][^\s]*\/[^\s]*)$/i;
const RANGE_TOKEN = /^[<>≤≥]?\d/;

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/**
 * Match a test name read by OCR. Exact aliases first, then common OCR swaps
 * (1↔l, l↔i, 0↔o, rn↔m), then a close spelling (1 edit, or 2 for long names).
 */
export function ocrMatchName(raw: string): { key: TestKey; fuzzy: boolean } | null {
  const exact = normaliseName(raw);
  if (exact) return { key: exact, fuzzy: false };
  const k = nameKey(raw);
  if (k.length < 4) return null;
  const index = nameIndex();
  for (const v of [k.replace(/1/g, "l"), k.replace(/l/g, "i"), k.replace(/0/g, "o"), k.replace(/rn/g, "m")]) {
    const hit = index.get(v);
    if (hit) return { key: hit, fuzzy: true };
  }
  const limit = k.length >= 8 ? 2 : 1;
  let best: { key: TestKey; d: number } | null = null;
  let tie = false;
  for (const [alias, key] of index) {
    if (Math.abs(alias.length - k.length) > limit) continue;
    const d = levenshtein(k, alias);
    if (d > limit) continue;
    if (!best || d < best.d) {
      best = { key, d };
      tie = false;
    } else if (d === best.d && key !== best.key) tie = true;
  }
  return best && !tie ? { key: best.key, fuzzy: true } : null;
}

/** "Sample collected: 15/03/2026" → "2026-03-15". The first date next to a date-like label wins. */
export function findDocumentDate(lines: string[]): string | undefined {
  const label = /(sample|collect|collection|received|date|reported)[^0-9]{0,30}(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}[\s-][A-Za-z]{3}[a-z]*[\s-,]+\d{2,4})/i;
  for (const line of lines) {
    const m = line.match(label);
    const d = m && parseDate(m[2]);
    if (d) return d;
  }
  return undefined;
}

function cleanLine(text: string): string {
  return text
    .replace(/[|¦]/g, " ")
    .replace(/(\d)\s*[-–]\s*(\d)/g, "$1-$2") // "4.0 - 5.6" → one reference token
    .replace(/\s+/g, " ")
    .trim();
}

function isNotReported(tokens: string[], i: number): number {
  if (NOT_REPORTED_TOKEN.test(tokens[i])) return 1;
  if (/^not$/i.test(tokens[i]) && /^(done|reported)$/i.test(tokens[i + 1] ?? "")) return 2;
  return 0;
}

/** A qualitative result at token i ("Positive", "Non reactive", "Not detected"): how many tokens it takes. */
function isQualitativeToken(tokens: string[], i: number): number {
  if (tokens[i + 1] && parseQualitative(`${tokens[i]} ${tokens[i + 1]}`)) return 2;
  if (parseQualitative(tokens[i]) && tokens[i] !== "+") return 1;
  return 0;
}

/** Typical OCR damage to a unit token: trailing dots, a lost slash ("UL"), a lost caret ("103/uL"). */
function tidyUnit(token: string): string {
  return token
    .replace(/[.,;:]+$/, "")
    .replace(/^(I?U)L$/i, "$1/L")
    .replace(/^10(\d)\//, "10^$1/");
}

/** Fix µ read as p/y: "pmol/L" → "µmol/L" (only if that makes it a known unit for this test). */
function fixUnit(key: TestKey | null, raw: string, rawName: string): { unit: string; note?: string } {
  const unit = tidyUnit(raw);
  // A stray trailing dot isn't worth a note; a changed unit is.
  const note = (to: string) => (to !== raw.replace(/[.,;:]+$/, "") ? `Read unit "${raw}" as ${to}` : undefined);
  if (!key || !unit || unitFactor(key, unit, rawName) !== null) return { unit, note: key ? note(unit) : undefined };
  for (const micro of [unit.replace(/^[pyu]/i, "µ"), unit.replace(/[py](?=L\b|mol|g\/)/g, "µ")]) {
    if (micro !== unit && unitFactor(key, micro, rawName) !== null) return { unit: micro, note: note(micro) };
  }
  return { unit };
}

/** Split a flag glued to a number: "6.55H" → "6.55", "H". */
function splitGluedFlags(tokens: string[]): string[] {
  return tokens.flatMap((t) => {
    const m = t.match(/^([<>≤≥]?[\dOolI|.,]*\d[\dOolI|.,]*)([HL])$/);
    return m ? [m[1], m[2]] : [t];
  });
}

/** One OCR line → an upload row, or null for titles, headers and notes. */
function lineToRow(line: OcrLine, n: number): Omit<UploadRow, "id"> | null {
  const text = cleanLine(line.text);
  const tokens = splitGluedFlags(text.split(" ").filter(Boolean));
  if (tokens.length < 2) return null;

  // Candidate value positions: a number (or NA/pending) after at least one name word.
  const candidates: number[] = [];
  for (let i = 1; i < tokens.length; i++) {
    if (ocrNumber(tokens[i]) || isNotReported(tokens, i) || isQualitativeToken(tokens, i)) candidates.push(i);
  }
  if (candidates.length === 0) return null;

  // Prefer the split where the words before it name a known test ("25 OH Vit D 82.5").
  let at = candidates[0];
  let match: ReturnType<typeof ocrMatchName> = null;
  for (const i of candidates) {
    const m = ocrMatchName(tokens.slice(0, i).join(" ").replace(/[:.]+$/, ""));
    if (m) {
      at = i;
      match = m;
      break;
    }
  }
  const rawName = tokens.slice(0, at).join(" ").replace(/:+$/, "");
  const notes: string[] = [];

  let rawValue: string;
  let next: number;
  const nr = isNotReported(tokens, at);
  const qual = isQualitativeToken(tokens, at);
  if (qual) {
    // Qualitative result (NS1, IgM): the word(s) are the value; there is no unit.
    rawValue = tokens.slice(at, at + qual).join(" ");
    next = at + qual;
  } else if (nr) {
    rawValue = tokens.slice(at, at + nr).join(" ");
    next = at + nr;
  } else {
    const fixed = ocrNumber(tokens[at])!;
    if (fixed !== tokens[at]) notes.push(`Read "${tokens[at]}" as ${fixed}`);
    rawValue = fixed;
    next = at + 1;
    if (FLAG_TOKEN.test(tokens[next] ?? "")) rawValue += ` ${tokens[next++]}`;
  }

  let rawUnit = "";
  const t = qual ? "" : tidyUnit(tokens[next] ?? "");
  // A unit has a letter; one that starts with a digit ("10^3/µL") needs a slash, unlike a range ("150-400").
  if (UNIT_TOKEN.test(t) && (!RANGE_TOKEN.test(t) || t.includes("/"))) rawUnit = tokens[next++];
  const unit = fixUnit(match?.key ?? null, rawUnit, rawName);
  if (unit.note) notes.push(unit.note);

  // Unknown names only count as result rows when they look like one (a unit, no "Label:").
  if (!match && (!rawUnit || /:/.test(rawName) || !/[a-z]/i.test(rawName))) return null;
  if (match?.fuzzy) notes.unshift(`Read "${rawName}" as ${TESTS[match.key].name}`);

  const row: Omit<UploadRow, "id"> = {
    line: n,
    rawName,
    rawValue,
    rawUnit: unit.unit,
    rawDate: "",
    rawReference: tokens.slice(next).join(" "),
    ocrConfidence: Math.round(line.confidence),
  };
  if (match?.fuzzy) row.testKeyOverride = match.key;
  if (notes.length) row.ocrNote = notes.join(" · ");
  return row;
}

/**
 * Parse OCR output (lines with confidence, or plain text) into upload rows.
 * Same result shape as parseLabCsv, so the same review and table apply.
 */
export function parseOcrText(input: OcrLine[] | string, defaultConfidence = 100): ParsedCsv {
  const lines: OcrLine[] =
    typeof input === "string" ? input.split(/\r?\n/).map((text) => ({ text, confidence: defaultConfidence })) : input;
  const nonBlank = lines.filter((l) => l.text.trim() !== "");
  const base: ParsedCsv = { rows: [], delimiter: null, hasDateColumn: false, errors: [], warnings: [] };
  if (nonBlank.length === 0) return { ...base, errors: ["No text could be read from this photo. Try a sharper, well-lit photo."] };

  const rows: UploadRow[] = [];
  let skipped = 0;
  nonBlank.forEach((line, i) => {
    const row = lineToRow(line, i + 1);
    if (row) rows.push({ id: `row-${rows.length + 1}`, ...row });
    else skipped++;
  });

  const documentDate = findDocumentDate(nonBlank.map((l) => l.text));
  const warnings = ["Read from a photo — check every value against the original report."];
  if (skipped) warnings.push(`Ignored ${skipped} line${skipped === 1 ? "" : "s"} that aren't results (titles, headings, notes).`);
  const errors = rows.length === 0 ? ["No test results found in the photo. Try a sharper, well-lit photo, or upload the CSV."] : [];
  return { ...base, rows, documentDate, warnings, errors };
}
