import { describe, expect, it } from "vitest";
import { normalise, normaliseName } from "../normalise";
import { flagValue } from "../rules";
import { seedPatients, seedReports } from "../seed";
import { patientData } from "./helpers";
import { TESTS } from "../tests";
import { computeTrends } from "../trends";
import type { TestKey } from "../types";

const NEW_KEYS: TestKey[] = ["tsh", "vitamin_d", "vitamin_b12", "uric_acid", "sodium", "potassium", "bun", "crp"];

describe("new biomarkers: dictionary", () => {
  it("each has a LOINC code, unit, range and plain description", () => {
    for (const key of NEW_KEYS) {
      const t = TESTS[key];
      expect(t.loinc, key).toMatch(/^\d+-\d$/);
      expect(t.unit, key).toBeTruthy();
      expect(t.description, key).toBeTruthy();
    }
  });

  it("every alias maps to its own test", () => {
    for (const key of NEW_KEYS) {
      for (const alias of TESTS[key].aliases) expect(normaliseName(alias), alias).toBe(key);
    }
  });

  it.each([
    ["S. Potassium", "potassium"],
    ["K+", "potassium"],
    ["Na+", "sodium"],
    ["Vit D", "vitamin_d"],
    ["25 OH Vit D", "vitamin_d"],
    ["Serum Urea", "bun"],
    ["BUN", "bun"],
    ["hs-CRP", "crp"],
    ["TSH 3rd Gen", "tsh"],
    ["Vit B12", "vitamin_b12"],
    ["S. Uric Acid", "uric_acid"],
  ])("%s → %s", (raw, key) => {
    expect(normaliseName(raw)).toBe(key);
  });
});

describe("new biomarkers: unit conversions", () => {
  it("vitamin D nmol/L ÷ 2.5 = ng/mL", () => {
    expect(normalise("25 OH Vit D", 50, "nmol/L")).toMatchObject({ testKey: "vitamin_d", value: 20, unit: "ng/mL", converted: true });
  });

  it("uric acid µmol/L ÷ 59.48 = mg/dL", () => {
    expect(normalise("S. Uric Acid", 357, "µmol/L")).toMatchObject({ testKey: "uric_acid", value: 6.0, unit: "mg/dL" });
  });

  it("urea mmol/L × 2.8 = BUN mg/dL", () => {
    expect(normalise("Serum Urea", 5, "mmol/L")).toMatchObject({ testKey: "bun", value: 14, unit: "mg/dL" });
    expect(normalise("BUN", 5, "mmol/L").value).toBe(14);
  });

  it("urea in mg/dL ÷ 2.14 = BUN, but BUN in mg/dL is kept as is", () => {
    expect(normalise("Serum Urea", 32, "mg/dL")).toMatchObject({ testKey: "bun", value: 15, converted: true });
    expect(normalise("BUN", 15, "mg/dL")).toMatchObject({ testKey: "bun", value: 15, converted: false });
  });

  it("treats mEq/L as mmol/L for sodium and potassium", () => {
    expect(normalise("Na+", 140, "mEq/L")).toMatchObject({ value: 140, converted: false });
    expect(normalise("K+", 4.2, "mEq/L")).toMatchObject({ value: 4.2, converted: false });
  });
});

describe("new biomarkers: flags", () => {
  it("flags low, normal and high values", () => {
    expect(flagValue("potassium", 5.6, "M")).toBe("high");
    expect(flagValue("potassium", 4.6, "M")).toBe("normal");
    expect(flagValue("potassium", 3.2, "F")).toBe("low");
    expect(flagValue("vitamin_d", 15, "F")).toBe("low");
    expect(flagValue("sodium", 130, "M")).toBe("low");
    expect(flagValue("tsh", 6.5, "F")).toBe("high");
    expect(flagValue("vitamin_b12", 150, "M")).toBe("low");
    expect(flagValue("bun", 28, "M")).toBe("high");
    expect(flagValue("crp", 12, "M")).toBe("high");
  });

  it("uses sex-specific uric acid ranges", () => {
    expect(flagValue("uric_acid", 6.5, "F")).toBe("high");
    expect(flagValue("uric_acid", 6.5, "M")).toBe("normal");
  });
});

describe("new biomarkers: seed", () => {
  const reports = seedReports();

  it("adds all 8 to every report, all within range", () => {
    for (const r of reports) {
      for (const key of NEW_KEYS) {
        const v = r.values.find((x) => x.testKey === key);
        expect(v?.flag, `${r.id} ${key}`).toBe("normal");
      }
    }
  });

  it("keeps Ravi's latest potassium at 4.6", () => {
    const latest = patientData("ravi").reports.at(-1)!;
    expect(latest.values.find((v) => v.testKey === "potassium")?.value).toBe(4.6);
  });

  it("gives Arjun nothing abnormal", () => {
    for (const r of reports.filter((r) => r.patientId === "arjun")) {
      expect(r.values.filter((v) => v.flag !== "normal"), r.id).toEqual([]);
    }
  });

  it("adds no trend flags (values are stable across the 4 years)", () => {
    for (const p of seedPatients()) {
      const trends = computeTrends(p, reports.filter((r) => r.patientId === p.id));
      for (const t of trends.filter((t) => NEW_KEYS.includes(t.testKey as TestKey))) {
        expect(t.direction, `${p.id} ${t.testKey}`).toBe("stable");
      }
    }
  });
});

describe("GGT", () => {
  it("is in the dictionary with LOINC 2324-2 in U/L", () => {
    expect(TESTS.ggt).toMatchObject({ loinc: "2324-2", unit: "U/L" });
    expect(TESTS.ggt.description).toBeTruthy();
  });

  it.each(["GGT", "Gamma GT", "GGTP", "S. GGT", "gamma gt", "Serum GGT"])("%s → ggt", (raw) => {
    expect(normaliseName(raw)).toBe("ggt");
  });

  it("normalises IU/L without conversion", () => {
    expect(normalise("Gamma GT", 45, "IU/L")).toMatchObject({ testKey: "ggt", value: 45, unit: "U/L" });
  });

  it("flags by sex: men <55, women <38", () => {
    expect(flagValue("ggt", 54, "M")).toBe("normal");
    expect(flagValue("ggt", 55, "M")).toBe("high");
    expect(flagValue("ggt", 37, "F")).toBe("normal");
    expect(flagValue("ggt", 38, "F")).toBe("high");
  });

  it("is seeded normal for every report (Ravi ~45, others ~20–25)", () => {
    const sex = Object.fromEntries(seedPatients().map((p) => [p.id, p.sex]));
    for (const r of seedReports()) {
      const v = r.values.find((x) => x.testKey === "ggt")!;
      expect(v.flag).toBe("normal");
      expect(flagValue("ggt", v.value, sex[r.patientId])).toBe("normal");
      if (r.patientId === "ravi") expect(v.value).toBeGreaterThanOrEqual(40);
      else expect(v.value).toBeLessThanOrEqual(25);
    }
  });
});
