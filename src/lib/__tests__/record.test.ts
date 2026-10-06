import { describe, expect, it } from "vitest";
import { getFindings } from "../findings";
import { mergePlanMedications, recordTimeline, sparklineKeys } from "../record";
import type { TreatmentPlan } from "../types";
import { patientData } from "./helpers";

describe("recordTimeline", () => {
  it("merges visits and reports, newest first", () => {
    const { patient, reports } = patientData("ravi");
    const tl = recordTimeline(patient, reports);
    expect(tl).toHaveLength(7);
    expect(tl[0]).toMatchObject({ kind: "report", date: "2026-03-15", status: "ai_draft" });
    expect(tl.map((e) => e.date)).toEqual([...tl.map((e) => e.date)].sort().reverse());
    expect(tl.filter((e) => e.kind === "visit")).toHaveLength(3);
  });
});

describe("sparklineKeys", () => {
  it("puts the tests behind the findings first", () => {
    const { patient, reports } = patientData("priya");
    expect(sparklineKeys(getFindings(patient, reports)).slice(0, 4)).toEqual(["hb", "mcv", "rbc", "ferritin"]);
    expect(sparklineKeys([])).toEqual(["hba1c", "fasting_glucose", "egfr", "urine_acr", "ldl", "hb"]);
  });
});

describe("mergePlanMedications", () => {
  const plan = (status: TreatmentPlan["status"]): TreatmentPlan => ({
    id: "p",
    patientId: "ravi",
    reportId: "r",
    medications: [
      { name: "New medicine", dose: "x", frequency: "daily", duration: "3 months", instructions: "after food" },
      { name: "amlodipine", dose: "10 mg", frequency: "once daily", duration: "", instructions: "" },
    ],
    lifestyle: [],
    followUpTests: [],
    nextReviewDate: "2026-06-15",
    doctorNotes: "",
    status,
    author: "Dr. Meera Nair",
    timestamp: "2026-03-16T10:00:00Z",
  });

  it("adds plan medicines and replaces same-named ones, keeping the rest", () => {
    const { patient } = patientData("ravi");
    const merged = mergePlanMedications(patient.currentMedications, plan("approved"));
    expect(merged.map((m) => m.name)).toEqual(["Ibuprofen", "New medicine", "amlodipine"]);
    expect(merged[1]).toMatchObject({ since: "2026-03-16", prescribedBy: "Dr. Meera Nair", frequency: "daily for 3 months", note: "after food" });
    expect(merged[2].dose).toBe("10 mg");
  });

  it("ignores draft plans", () => {
    const { patient } = patientData("ravi");
    expect(mergePlanMedications(patient.currentMedications, plan("draft"))).toBe(patient.currentMedications);
  });
});
