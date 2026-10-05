import { describe, expect, it } from "vitest";
import { doctorDraft, patientExplanation } from "../draft";
import { getFindings } from "../findings";
import { computeTrends } from "../trends";
import { patientData } from "./helpers";

describe("doctorDraft", () => {
  it("leads with the suspected condition and lists incidental findings", () => {
    const { patient, reports } = patientData("ravi");
    const text = doctorDraft(getFindings(patient, reports), computeTrends(patient, reports));
    expect(text.indexOf("Suspected condition")).toBeLessThan(text.indexOf("Also detected"));
    expect(text).toMatch(/Rapid eGFR decline/);
    expect(text).toMatch(/Not a diagnosis/);
  });
});

describe("patientExplanation", () => {
  it("is plain language without diagnosis wording", () => {
    for (const id of ["ravi", "priya", "arjun"]) {
      const { patient, reports } = patientData(id);
      const text = patientExplanation(getFindings(patient, reports), reports.at(-1)!.values);
      expect(text).not.toMatch(/you have|diagnos|KDIGO|Mentzer|eGFR|FIB-4/i);
    }
  });

  it("is reassuring when everything is normal", () => {
    const { patient, reports } = patientData("arjun");
    const text = patientExplanation(getFindings(patient, reports), reports.at(-1)!.values);
    expect(text).toMatch(/15 of your 15 results are in the healthy range/);
    expect(text).toMatch(/Nothing in this report needs action/);
  });
});
