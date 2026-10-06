import { describe, expect, it } from "vitest";
import { getFindings } from "../findings";
import { medicationNotes } from "../medContext";
import { applyFindingEdits, buildDrafts } from "../review";
import { computeTrends } from "../trends";
import type { CurrentMedication, Finding } from "../types";
import { patientData } from "./helpers";

const med = (name: string): CurrentMedication => ({ name, dose: "", frequency: "", since: "", prescribedBy: "" });

describe("medicationNotes", () => {
  it("Ravi: ibuprofen (NSAID) gets a kidney note", () => {
    const { patient, reports } = patientData("ravi");
    const notes = medicationNotes(getFindings(patient, reports), patient.currentMedications);
    const nsaid = notes.find((n) => n.medication === "Ibuprofen")!;
    expect(nsaid.findingId).toBe("ravi-kidney");
    expect(nsaid.text).toBe("Patient takes ibuprofen (NSAID) — NSAIDs can worsen kidney function; consider stopping.");
    expect(notes.some((n) => n.medication === "Amlodipine" && /albuminuria/.test(n.text))).toBe(true);
  });

  it("no note when the related finding is normal", () => {
    const { patient, reports } = patientData("arjun");
    expect(medicationNotes(getFindings(patient, reports), [med("Ibuprofen")])).toEqual([]);
  });

  it("no note for medicines unrelated to the findings", () => {
    const { patient, reports } = patientData("priya");
    expect(medicationNotes(getFindings(patient, reports), [med("Ibuprofen"), med("Amlodipine")])).toEqual([]);
  });

  it("Priya: iron with a thalassaemia-trait pattern gets a note", () => {
    const { patient, reports } = patientData("priya");
    const notes = medicationNotes(getFindings(patient, reports), [med("Ferrous sulphate")]);
    expect(notes[0].text).toMatch(/thalassaemia trait/);
  });

  it("statin with a lipid finding, steroid with a diabetes finding", () => {
    const findings = [
      { id: "l", screen: "lipids", severity: "watch", summary: "" },
      { id: "d", screen: "diabetes", severity: "watch", summary: "" },
    ] as Finding[];
    const notes = medicationNotes(findings, [med("Atorvastatin"), med("Prednisolone")]);
    expect(notes.map((n) => n.findingId).sort()).toEqual(["d", "l"]);
  });

  it("notes flow into the clinical draft, but not when the finding is excluded", () => {
    const { patient, reports } = patientData("ravi");
    const findings = getFindings(patient, reports);
    const trends = computeTrends(patient, reports);
    const values = reports[3].values;
    expect(buildDrafts(findings, undefined, trends, values, 4, patient.currentMedications).clinical).toMatch(
      /Medication considerations:[\s\S]*ibuprofen \(NSAID\)/,
    );
    const edits = { "ravi-kidney": { included: false } };
    expect(applyFindingEdits(findings, edits).some((f) => f.screen === "kidney")).toBe(false);
    expect(buildDrafts(findings, edits, trends, values, 4, patient.currentMedications).clinical).not.toMatch(/NSAID/);
  });
});
