import { describe, expect, it } from "vitest";
import { getFindings } from "../findings";
import {
  applyFindingEdits,
  buildDrafts,
  chartKeysFor,
  findingChips,
  labRows,
  reviewStage,
  riskOf,
  sortDashboard,
  trendLabel,
} from "../review";
import { computeTrends, findTrend } from "../trends";
import type { TreatmentPlan } from "../types";
import { approve } from "../versions";
import { patientData } from "./helpers";

function ravi() {
  const { patient, reports } = patientData("ravi");
  const findings = getFindings(patient, reports);
  const trends = computeTrends(patient, reports);
  return { patient, reports, findings, trends, latest: reports.at(-1)! };
}

describe("applyFindingEdits", () => {
  it("drops excluded findings and applies rewording", () => {
    const { findings } = ravi();
    const kidney = findings.find((f) => f.screen === "kidney")!;
    const diabetes = findings.find((f) => f.screen === "diabetes")!;
    const kept = applyFindingEdits(findings, {
      [kidney.id]: { included: false },
      [diabetes.id]: { included: true, summary: "Doctor wording." },
    });
    expect(kept.find((f) => f.id === kidney.id)).toBeUndefined();
    expect(kept.find((f) => f.id === diabetes.id)?.summary).toBe("Doctor wording.");
    expect(kept.find((f) => f.id === diabetes.id)?.title).toBe(diabetes.title);
  });
});

describe("buildDrafts", () => {
  it("excluded findings don't appear in either draft", () => {
    const { findings, trends, latest, reports } = ravi();
    const kidney = findings.find((f) => f.screen === "kidney")!;
    const full = buildDrafts(findings, undefined, trends, latest.values, reports.length);
    expect(full.clinical).toMatch(/Rapid eGFR decline/);
    expect(full.patient).toMatch(/kidney/i);

    const edited = buildDrafts(findings, { [kidney.id]: { included: false } }, trends, latest.values, reports.length);
    expect(edited.clinical).not.toMatch(/eGFR|kidney|creatinine|urine ACR|albumin/i);
    expect(edited.patient).not.toMatch(/kidney|creatinine|albumin/i);
    expect(edited.clinical).toMatch(/prediabetes/);
  });

  it("uses the doctor's reworded text", () => {
    const { findings, trends, latest, reports } = ravi();
    const diabetes = findings.find((f) => f.screen === "diabetes")!;
    const d = buildDrafts(findings, { [diabetes.id]: { included: true, title: "Glucose rising — review" } }, trends, latest.values, reports.length);
    expect(d.clinical).toMatch(/Glucose rising — review/);
  });
});

describe("dashboard helpers", () => {
  it("reviewStage moves from awaiting review → plan pending → complete", () => {
    const { latest } = ravi();
    expect(reviewStage(latest, [])).toBe("awaiting_review");
    const approved = approve(latest, { id: "x", author: "Dr", timestamp: "2026-03-16T00:00:00Z" });
    expect(reviewStage(approved, [])).toBe("plan_pending");
    const plan = { reportId: latest.id, status: "approved" } as TreatmentPlan;
    expect(reviewStage(approved, [plan])).toBe("complete");
  });

  it("riskOf returns the highest severity", () => {
    expect(riskOf(ravi().findings)).toBe("high");
    const { patient, reports } = patientData("arjun");
    expect(riskOf(getFindings(patient, reports))).toBe("normal");
    const p = patientData("priya");
    expect(riskOf(getFindings(p.patient, p.reports))).toBe("watch");
  });

  it("sorts awaiting review first, then by severity", () => {
    const rows = sortDashboard([
      { name: "A", stage: "complete" as const, risk: "high" as const },
      { name: "B", stage: "awaiting_review" as const, risk: "normal" as const },
      { name: "C", stage: "awaiting_review" as const, risk: "high" as const },
      { name: "D", stage: "plan_pending" as const, risk: "watch" as const },
    ]);
    expect(rows.map((r) => r.name)).toEqual(["C", "B", "A", "D"]);
  });
});

describe("trend labels and chips", () => {
  it("labels Ravi's eGFR as rapid decline still within normal range", () => {
    const egfr = findTrend(ravi().trends, "egfr")!;
    expect(trendLabel(egfr)).toEqual({ main: "Rapid decline", secondary: "still within normal range", tone: "high" });
  });

  it("builds compact evidence chips with slope", () => {
    const { findings, trends } = ravi();
    const chips = findingChips(findings.find((f) => f.screen === "kidney")!, trends);
    expect(chips[0]).toMatch(/^eGFR 6\d · −\d+\.\d\/yr$/);
  });

  it("adds a Mentzer chip for Priya", () => {
    const { patient, reports } = patientData("priya");
    const f = getFindings(patient, reports)[0];
    expect(findingChips(f, computeTrends(patient, reports))).toContain("Mentzer 11.4");
  });

  it("charts the tests behind the findings first", () => {
    expect(chartKeysFor(ravi().findings).slice(0, 4)).toEqual(["hba1c", "fasting_glucose", "egfr", "urine_acr"]);
    const { patient, reports } = patientData("priya");
    expect(chartKeysFor(getFindings(patient, reports))).toEqual(["hb", "mcv", "rbc", "ferritin"]);
  });
});

describe("labRows", () => {
  it("shows change vs the previous report", () => {
    const { reports, patient } = ravi();
    const rows = labRows(reports[3], reports[2], patient.sex);
    const hba1c = rows.find((r) => r.testKey === "hba1c")!;
    expect(hba1c.delta).toBeCloseTo(0.2);
    expect(hba1c.range).toBe("4–5.6");
    expect(labRows(reports[0], undefined, patient.sex)[0].delta).toBeUndefined();
  });
});
