import { beforeEach, describe, expect, it } from "vitest";
import { useInaraStore } from "@/store/useInaraStore";
import { getFindings } from "../findings";
import { buildLabReport, MAX_THUMBNAIL_CHARS } from "../labReport";
import { findDocumentDate, ocrMatchName, ocrNumber, parseOcrText, type OcrLine } from "../ocr";
import { RAVI_PHOTO_OCR } from "../samplePhoto";
import { seedPatients, seedReports } from "../seed";
import { LOW_OCR_CONFIDENCE, orderedTestKeys, reviewUpload, submitBlockers, type ReviewInput } from "../upload";
import { ALL_PANELS } from "../workflow";
import realTesseract from "./fixtures/ravi_photo_tesseract.json";

const FALLBACK = { date: "2026-10-06", source: "today" as const };

function review(input: OcrLine[] | string, extra: Partial<ReviewInput> = {}) {
  return reviewUpload({ parsed: parseOcrText(input), sex: "M", fallbackDate: FALLBACK, ...extra });
}

const byKey = (r: ReturnType<typeof review>, key: string) => r.rows.find((x) => x.testKey === key)!;

describe("OCR helpers", () => {
  it("reads numbers with OCR slips", () => {
    expect(ocrNumber("6.l")).toBe("6.1");
    expect(ocrNumber("l8O")).toBe("180");
    expect(ocrNumber("<5")).toBe("<5");
    expect(ocrNumber("Hb")).toBeNull();
    expect(ocrNumber("A1c")).toBeNull();
    expect(ocrNumber("ll")).toBeNull(); // no real digit
  });

  it("matches names exactly, then with OCR swaps, then by close spelling", () => {
    expect(ocrMatchName("Hb A1c")).toEqual({ key: "hba1c", fuzzy: false });
    expect(ocrMatchName("S. Creatinlne")).toEqual({ key: "creatinine", fuzzy: true });
    expect(ocrMatchName("HbAlc")).toEqual({ key: "hba1c", fuzzy: true });
    expect(ocrMatchName("Ferrltin")).toEqual({ key: "ferritin", fuzzy: true });
    expect(ocrMatchName("Serum Amylase")).toBeNull();
    expect(ocrMatchName("TG")).toEqual({ key: "triglycerides", fuzzy: false });
  });

  it("finds the sample date in the page header", () => {
    expect(findDocumentDate(["INARA DIAGNOSTICS", "Patient: Ravi Kumar Sample collected: 15/03/2026"])).toBe("2026-03-15");
    expect(findDocumentDate(["Collection Date 15-Mar-2026"])).toBe("2026-03-15");
    expect(findDocumentDate(["No dates here"])).toBeUndefined();
  });
});

describe("parsing OCR text", () => {
  const text = [
    "CITY LAB · Final report",
    "Patient: Test Person Age: 52 Y Sample date: 15/03/2026",
    "TEST RESULT UNIT REFERENCE",
    "Hb A1c 6.l % 4.0 - 5.6",
    "S. Creatinlne 1.34 H mg/dL 0.7 - 1.3",
    "FBS 6.55H mmol/L 3.9 - 5.5",
    "LDL-C 150 (H) mg/dL < 130",
    "hs-CRP <5 mg/L < 5",
    "Vit B12 NA pg/mL 200 - 900",
    "Plt 250 103/uL. 150 - 400",
    "SGOT 24 UL < 40",
    "25 OH Vit D 82.5 nmol/L 75 - 250",
    "Serum Amylase 62 U/L 28 - 100",
    "*** End of report ***",
  ].join("\n");

  it("maps messy names (with typos), values, units and markers", () => {
    const r = review(text);
    expect(r.errors).toEqual([]);
    expect(byKey(r, "hba1c")).toMatchObject({ rawName: "Hb A1c", rawValue: "6.1", value: 6.1, unit: "%" });
    expect(byKey(r, "hba1c").ocrNote).toBe('Read "6.l" as 6.1');
    expect(byKey(r, "creatinine")).toMatchObject({ rawName: "S. Creatinlne", value: 1.34, flag: "high" });
    expect(byKey(r, "creatinine").message).toMatch(/Read "S. Creatinlne" as Creatinine/);
    expect(byKey(r, "fasting_glucose")).toMatchObject({ rawValue: "6.55 H", value: 118, status: "converted" });
    expect(byKey(r, "ldl")).toMatchObject({ rawValue: "150 (H)", value: 150 });
    expect(byKey(r, "crp")).toMatchObject({ value: 5, qualifier: "<", flag: "normal" });
    expect(byKey(r, "vitamin_b12")).toMatchObject({ status: "not_reported" });
    expect(byKey(r, "platelets")).toMatchObject({ rawUnit: "10^3/uL", value: 250 });
    expect(byKey(r, "ast")).toMatchObject({ rawUnit: "U/L", value: 24 });
    expect(byKey(r, "vitamin_d")).toMatchObject({ rawName: "25 OH Vit D", value: 33, status: "converted" });
    expect(r.rows.find((x) => x.rawName === "Serum Amylase")).toMatchObject({ status: "unknown" });
  });

  it("ignores titles, headers and notes, and reads the date from the page", () => {
    const r = review(text);
    expect(r.rows.map((x) => x.rawName)).not.toContain("Patient: Test Person Age:");
    expect(r.rows).toHaveLength(10);
    expect(r.reportDate).toBe("2026-03-15");
    expect(r.warnings.join(" ")).toMatch(/Ignored 4 lines/);
  });

  it("a photo with no readable results is an error", () => {
    expect(review("A blurry mess\nnothing here").errors[0]).toMatch(/No test results found/);
    expect(review("").errors[0]).toMatch(/No text could be read/);
  });
});

describe("low OCR confidence", () => {
  const lines: OcrLine[] = [
    { text: "Hgb 14.5 g/dL 13.0 - 17.0", confidence: 93 },
    { text: "MCV 88 fL 80 - 100", confidence: LOW_OCR_CONFIDENCE - 10 },
    { text: "K+ 46 mmol/L 3.5 - 5.1", confidence: 90 }, // lost decimal point: 4.6 → 46
    { text: "Hb A1c 6.l % 4.0 - 5.6", confidence: 95 }, // a character was fixed
  ];

  it("marks low-confidence, fixed or implausible rows for checking (still imported, not blocking)", () => {
    const r = review(lines);
    expect(byKey(r, "hb").status).toBe("mapped");
    expect(byKey(r, "mcv")).toMatchObject({ status: "low_confidence", value: 88, blocking: false });
    expect(byKey(r, "mcv").message).toMatch(/^Low OCR confidence — please check/);
    expect(byKey(r, "potassium")).toMatchObject({ status: "low_confidence", value: 46 });
    expect(byKey(r, "potassium").message).toMatch(/Value looks unusual/);
    expect(byKey(r, "hba1c").status).toBe("low_confidence");
    expect(r.summaryText).toBe("1 mapped · 3 low OCR confidence");
    expect(r.warnings).toContain("Low OCR confidence — please check: MCV, Potassium, HbA1c");
    expect(r.errors).toEqual([]);
    expect(submitBlockers(r, { verified: true, technician: "Anil" })).toEqual([]);
  });

  it("confirming or editing a row clears the mark", () => {
    const parsed = parseOcrText(lines);
    const rows = parsed.rows.map((x) =>
      x.rawName === "MCV" ? { ...x, confirmed: true } : x.rawName === "K+" ? { ...x, rawValue: "4.6", confirmed: true } : x,
    );
    const r = reviewUpload({ parsed, rows, sex: "M", fallbackDate: FALLBACK });
    expect(byKey(r, "mcv").status).toBe("mapped");
    expect(byKey(r, "potassium")).toMatchObject({ status: "mapped", value: 4.6 });
  });
});

describe("real tesseract output for the sample photo (fixture)", () => {
  const r = review(realTesseract as OcrLine[], { ordered: orderedTestKeys(ALL_PANELS) });

  it("reads most rows and flags the shaky ones instead of trusting them", () => {
    expect(r.errors).toEqual([]);
    expect(byKey(r, "fasting_glucose")).toMatchObject({ value: 118, status: "converted" }); // "6.55H" glued flag
    expect(byKey(r, "creatinine")).toMatchObject({ value: 1.34, status: "low_confidence" }); // "pmol/L" → µmol/L
    expect(byKey(r, "hba1c")).toMatchObject({ value: 61, status: "low_confidence" }); // "61H": decimal point lost
    expect(byKey(r, "hba1c").message).toMatch(/Value looks unusual/);
    expect(byKey(r, "tsh")).toMatchObject({ status: "needs_fixing" }); // "IU/mL" isn't a TSH unit
    expect(r.warnings).toContain("Ordered but not in file: Triglycerides"); // "TG" was read as "6"
  });
});

describe("sample photo (pre-extracted text)", () => {
  const ravi = seedPatients().find((p) => p.id === "ravi")!;
  const r = review(RAVI_PHOTO_OCR, { ordered: orderedTestKeys(ALL_PANELS) });

  it("parses with only warnings, the page date, and 2 low-confidence rows", () => {
    expect(r.errors).toEqual([]);
    expect(r.reportDate).toBe("2026-03-15");
    expect(r.summaryText).toBe("19 mapped · 3 converted · 1 unknown (skipped) · 2 low OCR confidence");
    expect(r.rows.filter((x) => x.status === "low_confidence").map((x) => x.testKey)).toEqual(["hba1c", "creatinine"]);
  });

  it("gives the same values as ravi_report.csv, so Ravi's story holds", () => {
    const report = buildLabReport({
      id: "ravi-2026-03",
      patient: ravi,
      previous: seedReports().filter((x) => x.patientId === "ravi"),
      date: r.reportDate,
      labName: "Inara Diagnostics",
      source: "photo",
      rows: r.rows,
      verifiedBy: "Anil Kumar",
      at: "2026-03-15T09:00:00.000Z",
      photoThumbnail: "data:image/jpeg;base64,AAAA",
    });
    expect(report).toMatchObject({ source: "photo", verifiedBy: "Anil Kumar", photoThumbnail: "data:image/jpeg;base64,AAAA" });
    expect(report.values).toHaveLength(24);
    const findings = getFindings(ravi, [...seedReports().filter((x) => x.patientId === "ravi"), report]);
    expect(findings[0]).toMatchObject({ screen: "diabetes", category: "suspected" });
    expect(findings.find((f) => f.screen === "kidney")?.title).toBe("Rapid eGFR decline");
  });
});

describe("storing a photo upload", () => {
  beforeEach(() => useInaraStore.getState().resetDemo());

  it("records source = photo and keeps only a small thumbnail", () => {
    const r = review(RAVI_PHOTO_OCR);
    const s = useInaraStore.getState();
    const id = s.submitLabResults("case-ravi-2026-03", {
      rows: r.rows,
      date: r.reportDate,
      source: "photo",
      verifiedBy: "Anil Kumar",
      photoThumbnail: "data:image/jpeg;base64,THUMB",
    })!;
    const report = useInaraStore.getState().reports.find((x) => x.id === id)!;
    expect(report).toMatchObject({ source: "photo", verifiedBy: "Anil Kumar", photoThumbnail: "data:image/jpeg;base64,THUMB" });
    expect(report.raw!.find((x) => x.name === "S. Creatinlne")).toMatchObject({ status: "low_confidence", testKey: "creatinine" });
  });

  it("drops a thumbnail that is too large for localStorage", () => {
    const report = buildLabReport({
      id: "x",
      patient: seedPatients()[0],
      previous: [],
      date: "2026-03-15",
      labName: "L",
      source: "photo",
      rows: review(RAVI_PHOTO_OCR).rows,
      verifiedBy: "A",
      at: "2026-03-15T09:00:00.000Z",
      photoThumbnail: "data:image/jpeg;base64," + "A".repeat(MAX_THUMBNAIL_CHARS),
    });
    expect(report.photoThumbnail).toBeUndefined();
    expect(report.source).toBe("photo");
  });
});
