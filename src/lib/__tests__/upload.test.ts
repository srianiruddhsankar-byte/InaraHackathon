import { describe, expect, it } from "vitest";
import { getFindings } from "../findings";
import { labHistoryRows } from "../labReport";
import { seedCases, seedPatients, seedReports } from "../seed";
import {
  attentionFirst,
  canSubmit,
  detectDelimiter,
  evaluateRow,
  orderedTestKeys,
  parseDate,
  parseLabCsv,
  parseValue,
  reviewUpload,
  submitBlockers,
  type ReviewInput,
  type UploadRow,
} from "../upload";
import { ALL_PANELS } from "../workflow";
import { sampleReview, uploadedRaviReport } from "./helpers";

const FALLBACK = { date: "2026-03-14", source: "sample_received" as const };

function review(csv: string, extra: Partial<ReviewInput> = {}) {
  return reviewUpload({ parsed: parseLabCsv(csv), sex: "M", fallbackDate: FALLBACK, ...extra });
}

function row(rawName: string, rawValue: string, rawUnit = ""): UploadRow {
  return { id: "r", line: 2, rawName, rawValue, rawUnit, rawDate: "", rawReference: "" };
}

describe("header detection", () => {
  it.each([
    ["test_name,value,unit,date"],
    ["Test,Result,Units,Sample Date"],
    ["PARAMETER,OBSERVED VALUE,UNIT,DATE"],
    ["Investigation,Result,Units,Sample Date,Reference Range,Method"],
    ["test name , result , units , date"],
  ])("%s", (header) => {
    const parsed = parseLabCsv(`${header}\nHbA1c,6.1,%,2026-03-15\n`);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({ rawName: "HbA1c", rawValue: "6.1", rawUnit: "%", rawDate: "2026-03-15" });
  });

  it("ignores extra columns and reads columns in any order", () => {
    const parsed = parseLabCsv("Method,Units,Result,Test Name,Ref Range\nHPLC,%,6.1,HbA1c,4-5.6\n");
    expect(parsed.rows[0]).toMatchObject({ rawName: "HbA1c", rawValue: "6.1", rawUnit: "%", rawReference: "4-5.6" });
    expect(parsed.hasDateColumn).toBe(false);
  });

  it("skips title rows above the header and footer notes below", () => {
    const parsed = parseLabCsv("City Lab Report\nPatient: Ravi\n\ntest,value,unit\nHbA1c,6.1,%\n\n*** End of report ***\n");
    expect(parsed.rows.map((r) => r.rawName)).toEqual(["HbA1c"]);
    expect(parsed.warnings.join(" ")).toMatch(/Skipped 2 title lines/);
    expect(parsed.warnings.join(" ")).toMatch(/Ignored 1 note line/);
  });

  it("handles a BOM and blank lines", () => {
    const parsed = parseLabCsv("﻿test,value,unit\n\n\nHbA1c,6.1,%\n\nLDL,150,mg/dL\n");
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows.map((r) => r.rawName)).toEqual(["HbA1c", "LDL"]);
  });

  it("falls back to test, value, unit when there is no header", () => {
    const parsed = parseLabCsv("HbA1c,6.1,%\nLDL,150,mg/dL\n");
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.warnings.join(" ")).toMatch(/No header row/);
  });
});

describe("delimiters", () => {
  it.each([
    [",", "test,value,unit\nHbA1c,6.1,%\nLDL,150,mg/dL\n"],
    [";", "test;value;unit\nHbA1c;6,1;%\nLDL;150;mg/dL\n"],
    ["\t", "test\tvalue\tunit\nHbA1c\t6.1\t%\nLDL\t150\tmg/dL\n"],
  ])("%j", (delimiter, csv) => {
    expect(detectDelimiter(csv)).toBe(delimiter);
    const r = review(csv);
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => x.value)).toEqual([6.1, 150]);
  });

  it("reads quoted thousands in a comma file", () => {
    const r = review('test,value,unit\nPlatelets,"1,250",10^3/µL\nHbA1c,6.1,%\n');
    expect(r.rows[0].value).toBe(1250);
  });
});

describe("value formats", () => {
  it.each([
    ["<5", { kind: "number", value: 5, qualifier: "<" }],
    [">300", { kind: "number", value: 300, qualifier: ">" }],
    ["5.2 H", { kind: "number", value: 5.2, flagHint: "H" }],
    ["5.2 (L)", { kind: "number", value: 5.2, flagHint: "L" }],
    ["180 (H)", { kind: "number", value: 180, flagHint: "H" }],
    ["1,250", { kind: "number", value: 1250 }],
    ["5,2", { kind: "number", value: 5.2 }],
    ["0,450", { kind: "number", value: 0.45 }],
    ["118.5", { kind: "number", value: 118.5 }],
  ])("%s", (raw, expected) => {
    expect(parseValue(raw)).toEqual(expected);
  });

  it.each(["", "—", "-", "NA", "N/A", "n/a", "pending", "Pending", "not done", "Not Done"])("%j = not reported", (raw) => {
    expect(parseValue(raw)).toEqual({ kind: "not_reported" });
  });

  it("anything else is invalid", () => {
    expect(parseValue("positive")).toEqual({ kind: "invalid" });
    expect(parseValue("6.1.2")).toEqual({ kind: "invalid" });
  });

  it("a censored value is stored as its number with a note", () => {
    const r = evaluateRow(row("hs-CRP", "<5", "mg/L"), "M");
    expect(r).toMatchObject({ status: "mapped", value: 5, flag: "normal" });
    expect(r.message).toMatch(/Reported as "<5" — stored as 5/);
  });
});

describe("missing values, units and dates", () => {
  it("missing value → Not reported (skipped, not an error)", () => {
    const r = review("test,value,unit\nHbA1c,,%\nLDL,150,mg/dL\nVit B12,NA,pg/mL\n");
    expect(r.rows.map((x) => x.status)).toEqual(["not_reported", "mapped", "not_reported"]);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toContain("Not reported: HbA1c, Vitamin B12");
  });

  it("missing unit with a plausible value → Unit assumed — please check", () => {
    const r = evaluateRow(row("HbA1c", "6.1"), "M");
    expect(r).toMatchObject({ status: "unit_assumed", value: 6.1, unit: "%", blocking: false });
    expect(r.message).toMatch(/Unit assumed \(%\) — please check/);
  });

  it("missing unit with an implausible value → Unit missing — please enter (warning, skipped)", () => {
    const r = evaluateRow(row("FBS", "6.55"), "M");
    expect(r).toMatchObject({ status: "needs_fixing", value: null, blocking: false });
    expect(r.message).toMatch(/Unit missing — please enter/);
    const rev = review("test,value,unit\nFBS,6.55,\nHbA1c,6.1,%\n");
    expect(rev.errors).toEqual([]);
    expect(rev.warnings.join(" ")).toMatch(/please enter.*Fasting glucose/);
  });

  it("entering the unit fixes the row", () => {
    expect(evaluateRow(row("FBS", "6.55", "mmol/L"), "M")).toMatchObject({ status: "converted", value: 118 });
  });

  it("no date column → sample-received date with a warning", () => {
    const r = review("test,value,unit\nHbA1c,6.1,%\n");
    expect(r.reportDate).toBe("2026-03-14");
    expect(r.warnings.join(" ")).toMatch(/No date column — used the sample-received date \(2026-03-14\)/);
  });

  it("empty date values → fallback (today) with a warning", () => {
    const r = review("test,value,unit,date\nHbA1c,6.1,%,\n", { fallbackDate: { date: "2026-10-06", source: "today" } });
    expect(r.reportDate).toBe("2026-10-06");
    expect(r.warnings.join(" ")).toMatch(/No readable dates.*today's date/);
  });

  it("reads Indian and ISO date formats; the lab can override", () => {
    expect(parseDate("15/03/2026")).toBe("2026-03-15");
    expect(parseDate("15-03-2026")).toBe("2026-03-15");
    expect(parseDate("15 Mar 2026")).toBe("2026-03-15");
    expect(parseDate("2026-03-15")).toBe("2026-03-15");
    expect(parseDate("31/02/2026")).toBeNull();
    const r = review("test,value,unit\nHbA1c,6.1,%\n", { reportDateOverride: "2026-03-15" });
    expect(r.reportDate).toBe("2026-03-15");
    expect(r.warnings.join(" ")).not.toMatch(/date/i);
  });
});

describe("unknown tests, duplicates and ordered tests", () => {
  it("unknown test → Unknown — skipped warning", () => {
    const r = review("test,value,unit\nSerum Amylase,62,U/L\nHbA1c,6.1,%\n");
    expect(r.rows[0]).toMatchObject({ status: "unknown", testKey: null, message: "Unknown — skipped" });
    expect(r.warnings).toContain("Unknown — skipped: Serum Amylase");
    expect(r.errors).toEqual([]);
  });

  it("the lab can map an unknown row by hand", () => {
    const r = evaluateRow({ ...row("Glyco Hb (HPLC)", "6.1", "%"), testKeyOverride: "hba1c" }, "M");
    expect(r).toMatchObject({ status: "mapped", testKey: "hba1c", loinc: "4548-4" });
  });

  it("duplicates keep the first row and warn", () => {
    const r = review("test,value,unit\nLDL,150,mg/dL\nHbA1c,6.1,%\nLDL-C,155,mg/dL\n");
    expect(r.rows.map((x) => x.status)).toEqual(["mapped", "mapped", "duplicate"]);
    expect(r.rows[2]).toMatchObject({ value: null, message: "Duplicate of row 2 — skipped" });
    expect(r.warnings).toContain("Duplicate rows — kept the first: LDL cholesterol");
  });

  it("ordered tests not in the file are listed", () => {
    const r = review("test,value,unit\nHbA1c,6.1,%\n", { ordered: orderedTestKeys(["metabolic", "thyroid"]) });
    expect(r.warnings).toContain("Ordered but not in file: Fasting glucose, TSH");
  });
});

describe("errors that block submit", () => {
  it("unreadable or empty file", () => {
    expect(parseLabCsv("").errors).toEqual(["The file is empty."]);
    expect(parseLabCsv("\u0000\u0001binary").errors[0]).toMatch(/can't be read/);
    expect(parseLabCsv("just some text with no columns").errors[0]).toMatch(/columns/);
  });

  it("no recognisable test rows", () => {
    const r = review("test,value,unit\nSerum Amylase,62,U/L\nLipase,40,U/L\n");
    expect(r.errors).toEqual(["No recognisable test rows — check the test names."]);
  });

  it("a non-numeric value blocks until the lab fixes it", () => {
    const parsed = parseLabCsv("test,value,unit\nHbA1c,six,%\nLDL,150,mg/dL\n");
    const bad = reviewUpload({ parsed, sex: "M", fallbackDate: FALLBACK });
    expect(bad.errors).toEqual(['Row 2 (HbA1c): "six" is not a number.']);
    expect(attentionFirst(bad.rows)[0].rawName).toBe("HbA1c");

    const fixed = reviewUpload({
      parsed,
      rows: parsed.rows.map((r) => (r.rawName === "HbA1c" ? { ...r, rawValue: "6.1" } : r)),
      sex: "M",
      fallbackDate: FALLBACK,
    });
    expect(fixed.errors).toEqual([]);
  });
});

describe("verification before submit", () => {
  const r = sampleReview();

  it("needs the checkbox and a technician name", () => {
    expect(canSubmit(r, { verified: false, technician: "Anil" })).toBe(false);
    expect(canSubmit(r, { verified: true, technician: "  " })).toBe(false);
    expect(submitBlockers(r, { verified: false, technician: "" })).toHaveLength(2);
    expect(canSubmit(r, { verified: true, technician: "Anil" })).toBe(true);
  });

  it("errors block even when verified", () => {
    const bad = review("test,value,unit\nHbA1c,six,%\n");
    expect(canSubmit(bad, { verified: true, technician: "Anil" })).toBe(false);
  });
});

describe("sample files", () => {
  it("ravi_report.csv: only warnings, story values, 4 conversions and 1 unknown", () => {
    const r = sampleReview("ravi_report.csv");
    expect(r.errors).toEqual([]);
    expect(r.reportDate).toBe("2026-03-15");
    expect(r.summaryText).toBe("20 mapped · 4 converted · 1 unknown (skipped)");
    expect(r.warnings).toEqual(["Unknown — skipped: Serum Amylase"]);
    const v = Object.fromEntries(r.rows.filter((x) => x.testKey).map((x) => [x.testKey, x.value]));
    expect(v).toMatchObject({
      hba1c: 6.1,
      fasting_glucose: 118,
      creatinine: 1.34,
      urine_acr: 45,
      ldl: 150,
      hdl: 42,
      triglycerides: 180,
      total_chol: 228,
      bun: 15,
      vitamin_d: 33,
    });
  });

  it("ravi_report_messy.csv: only warnings, every problem reported", () => {
    const r = sampleReview("ravi_report_messy.csv", "2026-03-15");
    expect(r.errors).toEqual([]);
    expect(r.summary).toMatchObject({ unknown: 1, duplicate: 1, not_reported: 1, unit_assumed: 2, needs_fixing: 0 });
    const w = r.warnings.join("\n");
    expect(w).toMatch(/title line/);
    expect(w).toMatch(/note line/);
    expect(w).toMatch(/No date column/);
    expect(w).toMatch(/Unknown — skipped: Serum Amylase/);
    expect(w).toMatch(/Duplicate rows — kept the first: LDL cholesterol/);
    expect(w).toMatch(/Not reported: Vitamin B12/);
    expect(w).toMatch(/Unit assumed — please check: HbA1c, Potassium/);
    const v = Object.fromEntries(r.rows.filter((x) => x.value !== null).map((x) => [x.testKey, x.value]));
    expect(v).toMatchObject({ hb: 14.5, creatinine: 1.34, fasting_glucose: 118, crp: 5, bun: 15, triglycerides: 180 });
  });

  it("both files give the same values (apart from what the messy one leaves out)", () => {
    const clean = uploadedRaviReport("ravi_report.csv").values;
    const messy = uploadedRaviReport("ravi_report_messy.csv", "2026-03-15").values;
    const strip = (vals: typeof clean) => vals.filter((x) => !["vitamin_b12", "crp"].includes(x.testKey));
    expect(strip(messy)).toEqual(strip(clean));
  });
});

describe("Ravi's story after uploading the sample", () => {
  it.each([
    ["ravi_report.csv", undefined],
    ["ravi_report_messy.csv", "2026-03-15"],
    // Messy file with no date: the sample-received date (demo day) still tells the same story.
    ["ravi_report_messy.csv", "2026-10-06"],
  ])("%s (%s): prediabetes first, rapid eGFR decline + A2, lipids watch", (file, date) => {
    const ravi = seedPatients().find((p) => p.id === "ravi")!;
    const reports = [...seedReports().filter((r) => r.patientId === "ravi"), uploadedRaviReport(file, date)];
    const findings = getFindings(ravi, reports);
    expect(findings[0]).toMatchObject({ category: "suspected", screen: "diabetes", severity: "watch" });
    expect(findings[0].title).toMatch(/prediabetes/i);
    const kidney = findings.find((f) => f.screen === "kidney")!;
    expect(kidney).toMatchObject({ category: "incidental", title: "Rapid eGFR decline" });
    expect(kidney.summary).toMatch(/A2/);
    expect(findings.find((f) => f.screen === "lipids")?.severity).toBe("watch");
  });
});

describe("the lab view", () => {
  it("never exposes findings, AI drafts or approvals", () => {
    const patients = seedPatients();
    const reports = [...seedReports(), uploadedRaviReport()];
    const cases = seedCases().map((c) => (c.id === "case-ravi-2026-03" ? { ...c, reportId: "ravi-2026-03", stage: "results_uploaded" as const } : c));
    const rows = labHistoryRows(reports, cases, patients);
    expect(rows[0]).toEqual({
      reportId: expect.any(String),
      patientName: expect.any(String),
      date: "2026-03-15",
      source: "CSV",
      testsCount: 24,
      stage: "results_uploaded",
    });
    for (const r of rows) expect(Object.keys(r).sort()).toEqual(["date", "patientName", "reportId", "source", "stage", "testsCount"]);
    const json = JSON.stringify(rows);
    for (const secret of ["prediabetes", "eGFR", "ai_draft", "approved", "Inara AI", "findings", "versions"]) {
      expect(json).not.toContain(secret);
    }
  });

  it("orders cover all 24 tests when every panel is ordered", () => {
    expect(orderedTestKeys(ALL_PANELS)).toHaveLength(24);
  });
});
