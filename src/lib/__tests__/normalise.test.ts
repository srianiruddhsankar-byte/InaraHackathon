import { describe, expect, it } from "vitest";
import { normalise, normaliseName } from "../normalise";
import { TEST_KEYS, TESTS } from "../tests";

describe("normaliseName", () => {
  it.each([
    ["Glycated Hb", "hba1c"],
    ["A1C", "hba1c"],
    ["HbA1c%", "hba1c"],
    ["FBS", "fasting_glucose"],
    ["Fasting Sugar", "fasting_glucose"],
    ["S. Creatinine", "creatinine"],
    ["Creat", "creatinine"],
    ["Haemoglobin", "hb"],
    ["Hgb", "hb"],
    ["SGOT", "ast"],
    ["SGPT", "alt"],
    ["Plt", "platelets"],
    ["  fasting   SUGAR ", "fasting_glucose"],
    ["s.creatinine", "creatinine"],
  ])("%s → %s", (raw, key) => {
    expect(normaliseName(raw)).toBe(key);
  });

  it("returns null for unknown names", () => {
    expect(normaliseName("Vitamin E")).toBeNull();
  });

  it("has no alias shared by two tests", () => {
    const seen = new Map<string, string>();
    for (const key of TEST_KEYS) {
      for (const alias of [key, TESTS[key].name, ...TESTS[key].aliases]) {
        const k = alias.toLowerCase().replace(/[^a-z0-9]/g, "");
        expect(seen.get(k) ?? key, `alias "${alias}"`).toBe(key);
        seen.set(k, key);
      }
    }
  });
});

describe("normalise", () => {
  it('maps "Glycated Hb" 6.1 % to hba1c', () => {
    const r = normalise("Glycated Hb", 6.1, "%");
    expect(r).toMatchObject({ testKey: "hba1c", value: 6.1, unit: "%", converted: false, warnings: [] });
  });

  it("converts glucose 6.5 mmol/L to 117 mg/dL", () => {
    const r = normalise("FBS", 6.5, "mmol/L");
    expect(r.testKey).toBe("fasting_glucose");
    expect(r.value).toBe(117);
    expect(r.unit).toBe("mg/dL");
    expect(r.converted).toBe(true);
  });

  it("converts creatinine 106 µmol/L to 1.2 mg/dL (any micro spelling)", () => {
    for (const unit of ["µmol/L", "μmol/l", "umol/L", "mcmol/L"]) {
      expect(normalise("Creat", 106, unit).value).toBeCloseTo(1.2, 2);
    }
  });

  it("accepts numeric strings", () => {
    expect(normalise("Plt", " 250 ", "10^3/µL").value).toBe(250);
  });

  it("warns on unknown test names", () => {
    const r = normalise("Vitamin E", 30, "ng/mL");
    expect(r.testKey).toBeNull();
    expect(r.warnings[0]).toMatch(/Unknown test name/);
  });

  it("warns on unknown units and does not import the value", () => {
    const r = normalise("HbA1c", 42, "mmol/mol");
    expect(r.testKey).toBe("hba1c");
    expect(r.value).toBeNull();
    expect(r.warnings[0]).toMatch(/unknown unit/);
  });

  it("warns on non-numeric values", () => {
    expect(normalise("Hb", "n/a", "g/dL").warnings[0]).toMatch(/not a number/);
  });

  it("assumes the canonical unit when none is given, with a warning", () => {
    const r = normalise("Hb", 13.2, "");
    expect(r.value).toBe(13.2);
    expect(r.warnings[0]).toMatch(/assumed g\/dL/);
  });
});
