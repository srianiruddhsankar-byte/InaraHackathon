import { describe, expect, it } from "vitest";
import {
  adaCategory,
  ageAtDate,
  egfrCkdEpi2021,
  fib4,
  flagValue,
  isAnaemic,
  isHdlLow,
  isRapidEgfrDecline,
  isTriglyceridesHigh,
  kdigoAStage,
  kdigoGStage,
  ldlCategory,
  mentzer,
} from "../rules";

describe("flags", () => {
  it("uses sex-specific ranges", () => {
    expect(flagValue("hb", 12.5, "M")).toBe("low");
    expect(flagValue("hb", 12.5, "F")).toBe("normal");
    expect(flagValue("creatinine", 1.34, "M")).toBe("high");
    expect(flagValue("hba1c", 5.7, "M")).toBe("high");
    expect(flagValue("hba1c", 5.6, "M")).toBe("normal");
  });
});

describe("age at report date", () => {
  it("derives earlier ages from the reference date", () => {
    expect(ageAtDate(52, "2026-03-15")).toBe(52);
    expect(ageAtDate(52, "2023-03-15")).toBe(49);
    expect(ageAtDate(52, "2026-10-01")).toBe(52);
    expect(ageAtDate(52, "2027-03-15")).toBe(53);
  });
});

describe("kidney", () => {
  it("computes CKD-EPI 2021 eGFR", () => {
    expect(egfrCkdEpi2021(1.0, 49, "M")).toBeCloseTo(92.3, 0);
    expect(egfrCkdEpi2021(1.34, 52, "M")).toBeCloseTo(63.7, 0);
    // Female coefficient and kappa: Scr 0.7 at κ gives 142 × 0.9938^age × 1.012
    expect(egfrCkdEpi2021(0.7, 40, "F")).toBeCloseTo(142 * 0.9938 ** 40 * 1.012, 6);
  });

  it("maps KDIGO G stages at the boundaries", () => {
    expect([90, 89.9, 60, 59.9, 45, 44.9, 30, 29.9, 15, 14.9].map(kdigoGStage)).toEqual([
      "G1", "G2", "G2", "G3a", "G3a", "G3b", "G3b", "G4", "G4", "G5",
    ]);
  });

  it("maps KDIGO A stages", () => {
    expect([29, 30, 299, 300].map(kdigoAStage)).toEqual(["A1", "A2", "A2", "A3"]);
  });

  it("treats a decline of more than 5/yr as rapid", () => {
    expect(isRapidEgfrDecline(-5)).toBe(false);
    expect(isRapidEgfrDecline(-5.1)).toBe(true);
  });
});

describe("diabetes (ADA)", () => {
  it("categorises HbA1c and fasting glucose", () => {
    expect(adaCategory({ hba1c: 5.6 })).toBe("normal");
    expect(adaCategory({ hba1c: 5.7 })).toBe("prediabetes");
    expect(adaCategory({ hba1c: 6.4 })).toBe("prediabetes");
    expect(adaCategory({ hba1c: 6.5 })).toBe("diabetes");
    expect(adaCategory({ fastingGlucose: 99 })).toBe("normal");
    expect(adaCategory({ fastingGlucose: 100 })).toBe("prediabetes");
    expect(adaCategory({ fastingGlucose: 126 })).toBe("diabetes");
  });

  it("takes the worst of both markers", () => {
    expect(adaCategory({ hba1c: 5.4, fastingGlucose: 130 })).toBe("diabetes");
  });
});

describe("anaemia", () => {
  it("uses WHO thresholds", () => {
    expect(isAnaemic(12.9, "M")).toBe(true);
    expect(isAnaemic(12.9, "F")).toBe(false);
    expect(isAnaemic(11.9, "F")).toBe(true);
  });

  it("computes the Mentzer index", () => {
    expect(mentzer(64, 5.6).index).toBeCloseTo(11.43, 2);
    expect(mentzer(64, 5.6).suggests).toBe("thalassaemia_trait");
    expect(mentzer(70, 4.0).suggests).toBe("iron_deficiency");
    expect(mentzer(65, 5).suggests).toBe("indeterminate");
  });
});

describe("liver (FIB-4)", () => {
  it("computes the score and risk band", () => {
    expect(fib4(52, 24, 28, 250).score).toBeCloseTo(0.943, 3);
    expect(fib4(52, 24, 28, 250).risk).toBe("low");
    // (50 × 30) ÷ (200 × √25) = 1.5
    expect(fib4(50, 30, 25, 200).risk).toBe("indeterminate");
    // (60 × 40) ÷ (150 × √25) = 3.2
    expect(fib4(60, 40, 25, 150).risk).toBe("high");
  });
});

describe("lipids", () => {
  it("applies the CLAUDE.md thresholds", () => {
    expect([129, 130, 159, 160].map(ldlCategory)).toEqual(["normal", "borderline", "borderline", "high"]);
    expect(isHdlLow(39, "M")).toBe(true);
    expect(isHdlLow(42, "M")).toBe(false);
    expect(isHdlLow(48, "F")).toBe(true);
    expect(isTriglyceridesHigh(149)).toBe(false);
    expect(isTriglyceridesHigh(150)).toBe(true);
  });
});
