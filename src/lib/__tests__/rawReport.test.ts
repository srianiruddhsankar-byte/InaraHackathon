import { describe, expect, it } from "vitest";
import { csvCell, doctorRawReports, patientRawReports, rawCsv, rawFileName, rawJson, rawRows } from "../rawReport";
import type { Report } from "../types";
import { patientData, uploadedRaviReport } from "./helpers";

describe("raw lab report", () => {
  it("keeps the lab's rows exactly, in order (messy upload: duplicates, NA, unknown tests)", () => {
    const report = uploadedRaviReport("ravi_report_messy.csv");
    const rows = rawRows(report);
    expect(rows.map((r) => r.name)).toEqual(report.raw!.map((r) => r.name));
    expect(rows.map((r) => r.value)).toEqual(report.raw!.map((r) => r.value));
    expect(rows[0].line).toBe(1);
    // More raw rows than normalised values: nothing was dropped or merged.
    expect(rows.length).toBeGreaterThan(report.values.length);
  });

  it("CSV quotes commas, quotes and edge spaces and keeps values like <5 and 5,2", () => {
    expect(csvCell("<5")).toBe("<5");
    expect(csvCell("5,2")).toBe('"5,2"');
    expect(csvCell('Hb "A1c"')).toBe('"Hb ""A1c"""');
    expect(csvCell(" padded")).toBe('" padded"');
    expect(csvCell(6.1)).toBe("6.1");
    expect(csvCell(-2)).toBe("-2");
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("-cmd")).toBe("'-cmd");
    const csv = rawCsv({ raw: [{ name: "Glucose, Fasting", value: "1,250", unit: "mg/dL" }, { name: "CRP", value: "<5", unit: "mg/L" }] });
    expect(csv).toBe('test,value,unit\r\n"Glucose, Fasting","1,250",mg/dL\r\nCRP,<5,mg/L\r\n');
  });

  it("JSON carries report details and the raw rows with their original types", () => {
    const report = uploadedRaviReport();
    const json = rawJson(report);
    expect(json).toMatchObject({ reportId: report.id, patientId: "ravi", date: report.date, labName: report.labName, source: "csv" });
    expect(json.rows).toEqual(report.raw!.map(({ name, value, unit }) => ({ name, value, unit })));
    expect(JSON.stringify(json)).not.toMatch(/ai_draft|findings|flag/);
    expect(rawFileName(report, "csv")).toBe(`ravi-${report.date}-raw.csv`);
  });

  it("patients only see raw rows of their own approved reports; doctors see all", () => {
    const { reports } = patientData("ravi"); // the 4th (uploaded) report is an AI draft
    const others = patientData("priya").reports;
    const mine = patientRawReports("ravi", [...reports, ...others]);
    expect(mine.map((r) => r.date)).toEqual(["2025-03-15", "2024-03-15", "2023-03-15"]);
    expect(doctorRawReports("ravi", reports)).toHaveLength(4);
    const priyaDraft = others.find((r: Report) => r.date === "2026-03-15")!;
    expect(patientRawReports("priya", others).map((r) => r.id)).not.toContain(priyaDraft.id);
  });
});
