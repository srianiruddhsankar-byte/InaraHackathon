import { describe, expect, it } from "vitest";
import { buildPatientRecord, printableReport } from "../patientView";
import { presentingFor, presentingLine, symptomList } from "../presenting";
import { rawDisplayRows, rawSpecimenTitle } from "../rawReport";
import { seedCases, seedPatients, seedReports } from "../seed";
import { groupBySpecimen, refRange, refText, reportSpecimenTitle, SPECIMEN_LABEL, TEST_KEYS, TESTS } from "../tests";
import { checkinSymptoms } from "../wearable/checkin";
import { createCase } from "../workflow";
import { karthikDengue } from "./helpers";

const patient = (id: string) => seedPatients().find((p) => p.id === id)!;

describe("symptoms and suspected disease are separate fields", () => {
  it("seeds both fields for every patient", () => {
    expect(presentingLine(presentingFor(patient("ravi")))).toBe("Symptoms: Increased thirst, tiredness · Suspected disease: Type 2 diabetes");
    expect(presentingLine(presentingFor(patient("priya")))).toBe("Symptoms: Fatigue · Suspected disease: Iron-deficiency anaemia");
    expect(presentingLine(presentingFor(patient("arjun")))).toBe("Symptoms: None (routine check-up) · Suspected disease: None");
  });

  it("the case wins over the patient's own fields", () => {
    const c = seedCases().find((x) => x.patientId === "priya")!;
    expect(c).toMatchObject({ symptoms: "Fatigue", suspectedDisease: "Iron-deficiency anaemia" });
    expect(presentingFor(patient("priya"), { symptoms: "Breathless", suspectedDisease: "" })).toEqual({
      symptoms: "Breathless",
      suspectedDisease: "Iron-deficiency anaemia",
    });
  });

  it("a new order keeps the symptoms the doctor typed", () => {
    const c = createCase({ id: "c", patientId: "ravi", orderedBy: "Dr", symptoms: " Thirst ", suspectedDisease: "Diabetes", panels: ["metabolic"], urgency: "routine", clinicalNote: "", at: "2026-01-01T00:00:00.000Z" });
    expect(c.symptoms).toBe("Thirst");
  });

  it("check-in yes answers become the symptoms (context questions are left out)", () => {
    expect(checkinSymptoms(["fever", "body_pain", "belly_pain", "vomiting", "drank_less"], { fever: "yes", body_pain: "a_little", belly_pain: "yes", vomiting: "no", drank_less: "yes" })).toBe(
      "Fever, body pain, belly pain",
    );
    expect(checkinSymptoms(["fever"], { fever: "no" })).toBe("");
    expect(symptomList([])).toBe("");
  });

  it("Karthik's wearable case: symptoms from his check-in, suspected disease Dengue", () => {
    const { ordered } = karthikDengue();
    expect(presentingLine(ordered)).toBe("Symptoms: Fever, body pain, belly pain · Suspected disease: Dengue");
  });
});

describe("specimen types", () => {
  it("every test has a specimen", () => {
    for (const k of TEST_KEYS) expect(SPECIMEN_LABEL[TESTS[k].specimen]).toBeTruthy();
    expect(TESTS.hba1c.specimen).toBe("whole_blood");
    expect(TESTS.creatinine.specimen).toBe("serum");
    expect(TESTS.urine_acr.specimen).toBe("urine");
    expect(TESTS.ns1.specimen).toBe("serum");
  });

  it("report title and grouping", () => {
    expect(reportSpecimenTitle(["hb", "urine_acr", "creatinine"])).toBe("Blood + Urine report");
    expect(reportSpecimenTitle(["hb", "ns1"])).toBe("Blood report");
    const groups = groupBySpecimen(["creatinine", "urine_acr", "hb", "fasting_glucose"] as const, (k) => k);
    expect(groups.map((g) => [g.label, g.items])).toEqual([
      ["Blood · whole blood", ["hb"]],
      ["Blood · plasma", ["fasting_glucose"]],
      ["Blood · serum", ["creatinine"]],
      ["Urine", ["urine_acr"]],
    ]);
  });
});

describe("reference ranges", () => {
  it("formats 'Ref: …' with the test's precision, by sex, plus a target", () => {
    expect(refText("hba1c", "M")).toBe("Ref: 4.0–5.6 %");
    expect(refText("hb", "F")).toBe("Ref: 12.0–15.5 g/dL");
    expect(refText("hb", "M")).toBe("Ref: 13.0–17.0 g/dL");
    expect(refRange("ldl", "M")).toBe("≤129 mg/dL");
    expect(refRange("hdl", "F")).toBe("≥50 mg/dL");
    expect(refText("ns1", "M")).toBe("Ref: Negative");
    expect(refText("ldl", "M", "<100 mg/dL")).toBe("Ref: ≤129 mg/dL · Target: <100 mg/dL");
  });

  it("the raw report keeps the values as sent and adds specimen + reference", () => {
    const report = seedReports().find((r) => r.id === "priya-2023-03")!;
    const rows = rawDisplayRows(report, "F");
    const hb = rows.find((r) => r.ref?.includes("g/dL") && r.specimen === "Blood · whole blood")!;
    expect(hb.ref).toBe("Ref: 12.0–15.5 g/dL");
    expect(rows.map((r) => r.value)).toEqual(report.raw!.map((r) => r.value));
    expect(rawSpecimenTitle(report)).toBe("Blood + Urine report");
  });

  it("the patient's results and the printed report show 'Ref:' and the specimen", () => {
    const p = patient("priya");
    const record = buildPatientRecord({ patient: p, reports: seedReports(), plans: [], cases: seedCases() });
    const hb = record.latest!.results.find((r) => r.testKey === "hb")!;
    expect(hb.ref).toBe("Ref: 12.0–15.5 g/dL");
    expect(hb.specimen).toBe("Blood · whole blood");
    expect(record.latest!.presenting).toBe("Symptoms: Fatigue · Suspected disease: Iron-deficiency anaemia");
    const print = printableReport(p, record);
    expect(print.sections[0].heading).toMatch(/^Latest report · Blood \+ Urine report/);
    expect(print.sections.flatMap((s) => s.lines).some((l) => l.startsWith("Haemoglobin (Blood · whole blood):") && l.includes("Ref: 12.0–15.5 g/dL"))).toBe(true);
  });
});
