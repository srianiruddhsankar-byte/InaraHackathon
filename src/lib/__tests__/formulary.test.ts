import { describe, expect, it } from "vitest";
import { CATEGORIES, FOOD_TIMINGS, FORMULARY, FREQUENCIES, foodTimingLabel, formularyByCategory, searchFormulary } from "../formulary";

const ids = (q: string) => searchFormulary(q, 50).map((e) => e.id);

describe("formulary defaults", () => {
  it("has about 40 entries with unique ids", () => {
    expect(FORMULARY.length).toBeGreaterThanOrEqual(40);
    expect(new Set(FORMULARY.map((e) => e.id)).size).toBe(FORMULARY.length);
  });

  it.each(FORMULARY.map((e) => [e.id, e] as const))("%s has complete defaults", (_, e) => {
    expect(CATEGORIES).toContain(e.category);
    expect(e.defaultStrength).toBeTruthy();
    expect(e.defaultFrequency).toBeTruthy();
    expect(e.defaultDuration.trim()).not.toBe("");
    expect(e.defaultInstructions.trim()).not.toBe("");
  });

  it.each(FORMULARY.map((e) => [e.id, e] as const))("%s default strength is one of its strengths", (_, e) => {
    expect(e.strengths).toContain(e.defaultStrength);
  });

  it.each(FORMULARY.map((e) => [e.id, e] as const))("%s default frequency is a known code", (_, e) => {
    expect(FREQUENCIES.map((f) => f.code)).toContain(e.defaultFrequency);
    expect(e.defaultFrequencies).toContain(e.defaultFrequency);
  });

  it.each(FORMULARY.map((e) => [e.id, e] as const))("%s food timing is a known option", (_, e) => {
    expect(FOOD_TIMINGS.map((f) => f.value)).toContain(e.foodTiming);
  });
});

describe("food timing", () => {
  it('offers "With food"', () => {
    expect(FOOD_TIMINGS).toContainEqual({ value: "with food", label: "With food" });
    expect(foodTimingLabel("with food")).toBe("With food");
    expect(foodTimingLabel(undefined)).toBeUndefined();
  });
});

describe("searchFormulary", () => {
  it("matches by name, prefix matches first", () => {
    expect(ids("metf")[0]).toBe("metformin");
    expect(ids("AMLO")).toEqual(["amlodipine"]);
  });

  it('matches by class: "statin"', () => {
    expect(ids("statin")).toEqual(expect.arrayContaining(["atorvastatin", "rosuvastatin"]));
  });

  it('matches by class: "NSAID"', () => {
    const r = ids("NSAID");
    expect(r).toEqual(expect.arrayContaining(["ibuprofen", "diclofenac", "aceclofenac"]));
    expect(r).not.toContain("paracetamol");
  });

  it("matches by browse category", () => {
    expect(ids("antibiotics")).toEqual(expect.arrayContaining(["amoxicillin", "azithromycin"]));
  });

  it("returns nothing for an empty query or no match", () => {
    expect(searchFormulary("  ")).toEqual([]);
    expect(searchFormulary("zzzz")).toEqual([]);
  });

  it("respects the limit", () => {
    expect(searchFormulary("a", 3)).toHaveLength(3);
  });
});

describe("formularyByCategory", () => {
  it("covers every entry once, in category order, sorted by name", () => {
    const groups = formularyByCategory();
    expect(groups.map((g) => g.category)).toEqual([...CATEGORIES]);
    expect(groups.flatMap((g) => g.entries)).toHaveLength(FORMULARY.length);
    for (const g of groups) {
      expect(g.entries.length).toBeGreaterThan(0);
      expect(g.entries.every((e) => e.category === g.category)).toBe(true);
      const names = g.entries.map((e) => e.genericName);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    }
  });
});
