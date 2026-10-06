import { describe, expect, it } from "vitest";
import { getFindings } from "../findings";
import { egfrDeclineComparison, getTargets, meetsTarget, targetFor } from "../targets";
import { computeTrends, findTrend } from "../trends";
import type { Finding, Patient, TargetOverride } from "../types";
import { patientData } from "./helpers";

function patient(over: Partial<Patient>): Patient {
  return {
    id: "t",
    name: "Test",
    age: 50,
    sex: "M",
    bloodGroup: "O+",
    phone: "",
    allergies: [],
    chronicConditions: [],
    currentMedications: [],
    visitHistory: [],
    suspectedDisease: "",
    ...over,
  };
}

const t = (p: Patient, key: Parameters<typeof targetFor>[1], findings: Finding[] = [], o: TargetOverride[] = []) =>
  targetFor(getTargets(p, findings, o), key)!;

describe("LDL targets", () => {
  it("heart disease (ASCVD) → <55 (ESC/EAS 2019)", () => {
    const ldl = t(patient({ chronicConditions: ["Coronary artery disease (stent 2022)"] }), "ldl");
    expect(ldl).toMatchObject({ label: "<55 mg/dL", source: "ESC/EAS 2019", kind: "guideline" });
    expect(meetsTarget(ldl, 54)).toBe(true);
    expect(meetsTarget(ldl, 55)).toBe(false);
  });

  it("diabetes, age 40–75 → <70 (ADA)", () => {
    const ldl = t(patient({ chronicConditions: ["Type 2 diabetes"] }), "ldl");
    expect(ldl).toMatchObject({ label: "<70 mg/dL", source: "ADA Standards of Care" });
  });

  it("diabetes + ASCVD → <55", () => {
    const ldl = t(patient({ chronicConditions: ["Type 2 diabetes", "Previous stroke"] }), "ldl");
    expect(ldl.label).toBe("<55 mg/dL");
    expect(ldl.reason).toMatch(/Diabetes with heart/);
  });

  it("diabetes outside 40–75 and no ASCVD → reference range", () => {
    expect(t(patient({ age: 30, chronicConditions: ["Type 1 diabetes"] }), "ldl").kind).toBe("reference");
  });

  it("prediabetes alone is not diabetes → reference range (Ravi)", () => {
    const { patient: ravi, reports } = patientData("ravi");
    const ldl = targetFor(getTargets(ravi, getFindings(ravi, reports)), "ldl")!;
    expect(ldl).toMatchObject({ kind: "reference", label: "≤129 mg/dL", populationRange: "≤129 mg/dL" });
  });

  it("diabetes-range values on the panel count as diabetes", () => {
    const f = { screen: "diabetes", pattern: "diabetes_range" } as Finding;
    expect(t(patient({}), "ldl", [f]).label).toBe("<70 mg/dL");
  });
});

describe("HbA1c targets (diabetes only)", () => {
  it("no diabetes → reference range", () => {
    expect(t(patient({}), "hba1c").kind).toBe("reference");
  });
  it("adult with diabetes → <7.0", () => {
    expect(t(patient({ chronicConditions: ["Type 2 diabetes"] }), "hba1c").label).toBe("<7 %");
  });
  it("age ≥65, healthy → <7.5", () => {
    expect(t(patient({ age: 70, chronicConditions: ["Type 2 diabetes"] }), "hba1c").label).toBe("<7.5 %");
  });
  it("age ≥65 with ≥3 chronic conditions → <8.0", () => {
    const p = patient({ age: 70, chronicConditions: ["Type 2 diabetes", "Hypertension", "Osteoarthritis"] });
    expect(t(p, "hba1c")).toMatchObject({ label: "<8 %", source: "ADA older adults" });
  });
});

describe("Hb target", () => {
  it("pregnant → anaemia cut-off 11 g/dL (WHO)", () => {
    const hb = t(patient({ sex: "F", age: 28, pregnant: true }), "hb");
    expect(hb).toMatchObject({ label: "≥11 g/dL", source: "WHO", kind: "guideline" });
    expect(meetsTarget(hb, 11.2)).toBe(true);
    expect(meetsTarget(hb, 10.8)).toBe(false);
  });
  it("not pregnant → population range", () => {
    expect(t(patient({ sex: "F" }), "hb")).toMatchObject({ kind: "reference", label: "12–15.5 g/dL" });
  });
  it("pregnancy also lowers the anaemia threshold in findings", () => {
    const { patient: priya, reports } = patientData("priya");
    const pregnantHb = { ...priya, pregnant: true };
    const latest = { ...reports[3], values: reports[3].values.map((v) => (v.testKey === "hb" ? { ...v, value: 11.5 } : v)) };
    const f = getFindings(pregnantHb, [...reports.slice(0, 3), latest]).find((x) => x.screen === "anaemia")!;
    expect(f.severity).toBe("normal");
  });
});

describe("overrides", () => {
  it("doctor override replaces the guideline target and keeps what it replaced", () => {
    const p = patient({ chronicConditions: ["Type 2 diabetes"] });
    const o: TargetOverride = {
      patientId: "t", testKey: "ldl", op: "<", value: 100, reason: "Statin intolerance", author: "Dr. X", timestamp: "2026-03-16T10:00:00Z",
    };
    const ldl = t(p, "ldl", [], [o]);
    expect(ldl).toMatchObject({ kind: "override", label: "<100 mg/dL", reason: "Statin intolerance" });
    expect(ldl.replaced?.label).toBe("<70 mg/dL");
    expect(ldl.override?.author).toBe("Dr. X");
  });
  it("ignores overrides for other patients", () => {
    const o = { patientId: "other", testKey: "ldl", op: "<", value: 100, reason: "", author: "", timestamp: "" } as TargetOverride;
    expect(t(patient({}), "ldl", [], [o]).kind).toBe("reference");
  });
});

describe("eGFR expected vs actual decline", () => {
  it("Ravi declines much faster than the ~1/yr expected after 40", () => {
    const { patient: ravi, reports } = patientData("ravi");
    const c = egfrDeclineComparison(52, findTrend(computeTrends(ravi, reports), "egfr"))!;
    expect(c.expectedPerYear).toBe(-1);
    expect(c.actualPerYear).toBeLessThan(-5);
    expect(c.text).toMatch(/× faster/);
  });
  it("no expected decline under 40", () => {
    const { patient: arjun, reports } = patientData("arjun");
    expect(egfrDeclineComparison(35, findTrend(computeTrends(arjun, reports), "egfr"))!.expectedPerYear).toBe(0);
  });
});
