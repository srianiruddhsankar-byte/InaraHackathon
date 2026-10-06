import { describe, expect, it } from "vitest";
import { getFindings } from "../findings";
import { approvePlan, planVersions, savePlanDraft, suggestPlanItems, suggestReviewDate, type PlanContent } from "../treatment";
import { patientData } from "./helpers";

function suggestionsFor(id: string) {
  const { patient, reports } = patientData(id);
  return suggestPlanItems(getFindings(patient, reports));
}

const DOSE = /\b\d+(\.\d+)?\s?(mg|mcg|µg|ml|iu|units?|tablets?|tabs?)\b|metformin|statin|ferrous|iron tablet|supplement of/i;

describe("suggestPlanItems", () => {
  it("never returns medications or doses", () => {
    for (const id of ["ravi", "priya", "arjun"]) {
      const s = suggestionsFor(id);
      expect(Object.keys(s).sort()).toEqual(["followUpTests", "lifestyle"]);
      for (const text of [...s.lifestyle, ...s.followUpTests.map((t) => t.name)]) {
        expect(text).not.toMatch(DOSE);
      }
    }
  });

  it("suggests HbA1c and creatinine + urine ACR follow-up for Ravi", () => {
    const s = suggestionsFor("ravi");
    const keys = s.followUpTests.map((t) => t.testKey);
    expect(keys).toEqual(expect.arrayContaining(["hba1c", "creatinine", "urine_acr"]));
    expect(s.followUpTests.find((t) => t.testKey === "hba1c")?.inWeeks).toBe(12);
    expect(s.lifestyle.some((l) => /salt/i.test(l))).toBe(true);
    expect(s.lifestyle.some((l) => /NSAID/i.test(l))).toBe(true);
  });

  it("suggests Hb electrophoresis and a CBC for Priya", () => {
    const s = suggestionsFor("priya");
    const names = s.followUpTests.map((t) => t.name);
    expect(names).toContain("Hb electrophoresis");
    expect(s.followUpTests.find((t) => /CBC/.test(t.name))?.inWeeks).toBe(8);
  });

  it("suggests nothing for Arjun (all normal)", () => {
    expect(suggestionsFor("arjun")).toEqual({ lifestyle: [], followUpTests: [] });
  });

  it("deduplicates repeated lifestyle advice", () => {
    const s = suggestionsFor("ravi");
    expect(new Set(s.lifestyle).size).toBe(s.lifestyle.length);
  });
});

describe("suggestReviewDate", () => {
  it("is a week after the latest follow-up test", () => {
    expect(suggestReviewDate("2026-03-16", [{ name: "HbA1c", inWeeks: 12 }])).toBe("2026-06-15");
  });
});

describe("plan versions", () => {
  const content: PlanContent = {
    medications: [
      { name: "Doctor-typed med", dose: "as typed", frequency: "daily", duration: "3 months", instructions: "" },
      { name: "  ", dose: "", frequency: "", duration: "", instructions: "" },
    ],
    lifestyle: ["Walk daily", ""],
    followUpTests: [{ testKey: "hba1c", name: "HbA1c", inWeeks: 12 }],
    nextReviewDate: "2026-06-15",
    doctorNotes: "",
  };
  const input = (id: string, timestamp: string) => ({
    id,
    patientId: "ravi",
    reportId: "ravi-2026-03",
    author: "Dr. Meera Nair",
    timestamp,
    content,
  });

  it("approving a plan appends a version and keeps the draft", () => {
    let plans = savePlanDraft([], input("p1", "2026-03-16T10:00:00Z"));
    const draft = plans[0];
    plans = approvePlan(plans, input("p2", "2026-03-16T11:00:00Z"));
    expect(plans.map((p) => p.status)).toEqual(["draft", "approved"]);
    expect(plans[0]).toBe(draft);
    expect(plans[1].medications).toHaveLength(1); // blank row dropped
    expect(plans[1].lifestyle).toEqual(["Walk daily"]);
  });

  it("an approved plan is locked", () => {
    const approved = approvePlan([], input("p1", "2026-03-16T10:00:00Z"));
    expect(savePlanDraft(approved, input("p2", "2026-03-16T11:00:00Z"))).toBe(approved);
    expect(approvePlan(approved, input("p3", "2026-03-16T12:00:00Z"))).toBe(approved);
    expect(planVersions(approved, "ravi-2026-03")).toHaveLength(1);
  });
});
