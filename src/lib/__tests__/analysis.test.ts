import { describe, expect, it } from "vitest";
import { runAnalysis } from "../analysis";
import { patientData } from "./helpers";

function analyse(id: string) {
  const { patient, reports } = patientData(id);
  return runAnalysis(patient, reports)!;
}

describe("runAnalysis", () => {
  it("Layer 0 maps every messy name to LOINC and converts units", () => {
    const a = analyse("ravi");
    // Ravi's Mar 2026 report comes from the sample CSV: 24 tests + Serum Amylase (unknown).
    expect(a.normalise).toMatchObject({ total: 25, mapped: 24, unknown: 1, converted: 4 });
    const glucose = a.normalise.rows.find((r) => r.testKey === "fasting_glucose")!;
    expect(glucose).toMatchObject({ rawName: "FBS", rawUnit: "mmol/L", value: 118, unit: "mg/dL", loinc: "1558-6" });
  });

  it("Layer 1 lists Ravi's out-of-range values", () => {
    const names = analyse("ravi").range.map((r) => r.testKey);
    expect(names).toEqual(expect.arrayContaining(["hba1c", "fasting_glucose", "urine_acr", "ldl"]));
    expect(names).not.toContain("hb");
  });

  it("Layer 2 scores eGFR stage, ACR stage and ADA category", () => {
    const scores = analyse("ravi").scores;
    expect(scores.find((s) => s.label.startsWith("eGFR"))?.interpretation).toBe("KDIGO G2");
    expect(scores.find((s) => s.label.startsWith("Albuminuria"))?.interpretation).toMatch(/^A2/);
    expect(scores.find((s) => s.label.startsWith("ADA"))?.interpretation).toBe("Prediabetes range");
    expect(analyse("priya").scores.find((s) => s.label === "Mentzer index")?.interpretation).toMatch(/thalassaemia/);
  });

  it("Layer 2.5 compares eGFR decline with the age-expected decline", () => {
    expect(analyse("ravi").egfrDecline?.text).toMatch(/Expected for age 52/);
  });

  it("Layer 3 lists moving trends including the rapid eGFR decline", () => {
    const egfr = analyse("ravi").trends.find((t) => t.key === "egfr")!;
    expect(egfr).toMatchObject({ label: "Rapid decline", secondary: "still within normal range" });
  });

  it("abnormal biomarkers include out-of-range values and eGFR drifting within range", () => {
    const ab = analyse("ravi").abnormal;
    expect(ab.find((b) => b.key === "hba1c")).toMatchObject({ reason: "Out of range", direction: "rising" });
    expect(ab.find((b) => b.key === "egfr")).toMatchObject({ reason: "Drifting within range", direction: "falling" });
  });

  it("Arjun has nothing abnormal and no medication notes", () => {
    const a = analyse("arjun");
    expect(a.abnormal).toEqual([]);
    expect(a.medNotes).toEqual([]);
    expect(a.range).toEqual([]);
  });

  it("Ravi's medication notes come from his current medicines", () => {
    expect(analyse("ravi").medNotes.map((n) => n.medication)).toContain("Ibuprofen");
  });
});
