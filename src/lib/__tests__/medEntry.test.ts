import { describe, expect, it } from "vitest";
import { findFormulary, FORMULARY } from "../formulary";
import {
  confirmDefaults,
  customMedication,
  DEFAULT_FIELDS,
  editMedication,
  formularyByCategory,
  hasUnconfirmedDefaults,
  isUnconfirmed,
  medicationFromFormulary,
  patientPreview,
  unconfirmedCount,
} from "../medEntry";
import { approvePlan, type PlanContent } from "../treatment";

const metformin = () => medicationFromFormulary(findFormulary("metformin")!);

describe("medicationFromFormulary", () => {
  it("fills every default from the formulary entry", () => {
    expect(metformin()).toEqual({
      name: "Metformin",
      formularyId: "metformin",
      dose: "500 mg",
      frequency: "BD",
      foodTiming: "with food",
      duration: "30 days",
      instructions: "Take with meals",
      unconfirmedDefaults: DEFAULT_FIELDS,
    });
  });

  it("flags every pre-filled field as unconfirmed", () => {
    const m = metformin();
    for (const f of DEFAULT_FIELDS) expect(isUnconfirmed(m, f)).toBe(true);
  });

  it("works for every formulary entry", () => {
    for (const e of FORMULARY) {
      const m = medicationFromFormulary(e);
      expect(m.dose).toBe(e.defaultStrength);
      expect(m.frequency).toBe(e.defaultFrequency);
      expect(m.duration).toBe(e.defaultDuration);
      expect(m.instructions).toBe(e.defaultInstructions);
      expect(m.foodTiming).toBe(e.foodTiming);
    }
  });
});

describe("customMedication", () => {
  it("gets no defaults and nothing to confirm", () => {
    const m = customMedication("Ayurvedic tonic");
    expect(m).toMatchObject({ name: "Ayurvedic tonic", dose: "", frequency: "", duration: "", instructions: "", custom: true });
    expect(m.formularyId).toBeUndefined();
    expect(m.foodTiming).toBeUndefined();
    expect(m.unconfirmedDefaults).toBeUndefined();
    expect(hasUnconfirmedDefaults([m])).toBe(false);
  });
});

describe("editMedication", () => {
  it("clears the flag only for the edited field", () => {
    const m = editMedication(metformin(), { dose: "850 mg" });
    expect(m.dose).toBe("850 mg");
    expect(isUnconfirmed(m, "dose")).toBe(false);
    expect(isUnconfirmed(m, "frequency")).toBe(true);
    expect(m.unconfirmedDefaults).toHaveLength(DEFAULT_FIELDS.length - 1);
  });

  it("editing a non-default field keeps all flags", () => {
    const m = editMedication(metformin(), { name: "Metformin SR" });
    expect(m.unconfirmedDefaults).toEqual(DEFAULT_FIELDS);
  });

  it("editing every default field leaves nothing to confirm", () => {
    const m = editMedication(metformin(), {
      dose: "1000 mg",
      frequency: "OD",
      foodTiming: "after food",
      duration: "90 days",
      instructions: "With dinner",
    });
    expect(m.unconfirmedDefaults).toBeUndefined();
    expect(hasUnconfirmedDefaults([m])).toBe(false);
  });

  it("does not mutate the original row", () => {
    const original = metformin();
    editMedication(original, { dose: "850 mg" });
    expect(original.dose).toBe("500 mg");
    expect(original.unconfirmedDefaults).toEqual(DEFAULT_FIELDS);
  });
});

describe("confirmDefaults / hasUnconfirmedDefaults", () => {
  it("confirming accepts all remaining defaults and keeps the values", () => {
    const m = confirmDefaults(metformin());
    expect(m.unconfirmedDefaults).toBeUndefined();
    expect(m.dose).toBe("500 mg");
    for (const f of DEFAULT_FIELDS) expect(isUnconfirmed(m, f)).toBe(false);
  });

  it("is true while any medicine is unconfirmed", () => {
    const pending = metformin();
    const done = confirmDefaults(metformin());
    expect(hasUnconfirmedDefaults([])).toBe(false);
    expect(hasUnconfirmedDefaults([done])).toBe(false);
    expect(hasUnconfirmedDefaults([done, pending])).toBe(true);
    expect(unconfirmedCount([done, pending, metformin()])).toBe(2);
  });

  it("blocks plan approval until defaults are confirmed", () => {
    const content = (meds: PlanContent["medications"]): PlanContent => ({
      medications: meds,
      lifestyle: [],
      followUpTests: [],
      nextReviewDate: "2026-06-15",
      doctorNotes: "",
    });
    const input = (meds: PlanContent["medications"]) => ({
      id: "p1",
      patientId: "ravi",
      reportId: "ravi-2026-03",
      author: "Dr. Meera Nair",
      timestamp: "2026-03-16T10:00:00Z",
      content: content(meds),
    });
    const none: never[] = [];
    expect(approvePlan(none, input([metformin()]))).toBe(none);
    expect(approvePlan([], input([confirmDefaults(metformin())]))).toHaveLength(1);
  });
});

describe("patientPreview", () => {
  it("joins the filled fields in plain words", () => {
    expect(patientPreview(metformin())).toBe("Metformin 500 mg · Twice daily · With food · 30 days · Take with meals");
  });

  it("skips empty fields and keeps free-text frequencies", () => {
    expect(patientPreview({ ...customMedication("Herbal tea"), frequency: "every morning" })).toBe("Herbal tea · every morning");
  });
});

describe("formularyByCategory (re-exported)", () => {
  it("is available from medEntry", () => {
    expect(formularyByCategory()[0].category).toBe("Diabetes");
  });
});
