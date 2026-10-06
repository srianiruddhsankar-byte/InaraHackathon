import { describe, expect, it } from "vitest";
import { seedCases, seedReports } from "../seed";
import { TEST_KEYS } from "../tests";
import type { Case, CaseStage } from "../types";
import {
  activeCase,
  advanceCase,
  advanceSteps,
  ALL_PANELS,
  canAdvance,
  createCase,
  dashboardGroup,
  doctorPhase,
  nextStage,
  PANELS,
  PATIENT_STEPS,
  patientStepLabel,
  STAGES,
  topBarPhase,
} from "../workflow";

const AT = "2026-04-01T10:00:00.000Z";
const by = (name = "Dr. Meera Nair", at = AT) => ({ by: name, at });

function newCase(overrides: Partial<Parameters<typeof createCase>[0]> = {}): Case {
  return createCase({
    id: "c1",
    patientId: "ravi",
    orderedBy: "Dr. Meera Nair",
    suspectedDisease: "Type 2 diabetes",
    panels: ["metabolic", "kidney"],
    urgency: "urgent",
    clinicalNote: "Check sugars",
    at: AT,
    ...overrides,
  });
}

/** A case moved forward to `stage` one valid step at a time. */
function caseAt(stage: CaseStage, overrides: Partial<Parameters<typeof createCase>[0]> = {}): Case {
  return advanceSteps(newCase(overrides), STAGES.slice(1, STAGES.indexOf(stage) + 1), by());
}

describe("stages", () => {
  it("are in the agreed order", () => {
    expect(STAGES).toEqual([
      "alert_raised",
      "ordered",
      "in_lab",
      "results_uploaded",
      "analysis_done",
      "under_review",
      "approved",
      "treatment_planned",
      "follow_up_scheduled",
    ]);
    expect(nextStage("alert_raised")).toBe("ordered");
    expect(nextStage("ordered")).toBe("in_lab");
    expect(nextStage("follow_up_scheduled")).toBeUndefined();
  });
});

describe("createCase", () => {
  it("starts at ordered with the order recorded in history", () => {
    const c = newCase();
    expect(c).toMatchObject({ stage: "ordered", urgency: "urgent", panels: ["metabolic", "kidney"] });
    expect(c.reportId).toBeUndefined();
    expect(c.stageHistory).toEqual([{ stage: "ordered", by: "Dr. Meera Nair", at: AT, note: "Check sugars" }]);
  });

  it("leaves out an empty note", () => {
    expect(newCase({ clinicalNote: "  " }).stageHistory[0]).not.toHaveProperty("note");
  });
});

describe("advanceCase", () => {
  it("moves to the next stage and records who and when", () => {
    const c = advanceCase(newCase(), "in_lab", { by: "CityCare Diagnostics", at: "2026-04-02T07:00:00.000Z", note: "Sample collected" });
    expect(c.stage).toBe("in_lab");
    expect(c.stageHistory.at(-1)).toEqual({
      stage: "in_lab",
      by: "CityCare Diagnostics",
      at: "2026-04-02T07:00:00.000Z",
      note: "Sample collected",
    });
  });

  it("does not allow skipping a stage", () => {
    const c = newCase();
    expect(canAdvance(c, "results_uploaded")).toBe(false);
    expect(advanceCase(c, "results_uploaded", by())).toBe(c);
    expect(advanceCase(caseAt("results_uploaded"), "approved", by()).stage).toBe("results_uploaded");
  });

  it("does not allow going backwards or repeating a stage", () => {
    const c = caseAt("approved");
    for (const s of STAGES.slice(0, STAGES.indexOf("approved") + 1)) expect(advanceCase(c, s, by())).toBe(c);
  });

  it("does nothing once the case is complete", () => {
    const done = caseAt("follow_up_scheduled");
    for (const s of STAGES) expect(advanceCase(done, s, by())).toBe(done);
  });

  it("keeps the full history, append-only and in order", () => {
    const original = newCase();
    const done = advanceSteps(original, STAGES.slice(2), by());
    expect(done.stageHistory.map((e) => e.stage)).toEqual(STAGES.slice(1)); // doctor orders start at "ordered"
    expect(original.stageHistory).toHaveLength(1); // not mutated
  });

  it("can link the report or plan when advancing", () => {
    const c = advanceCase(caseAt("in_lab"), "results_uploaded", by(), { reportId: "r1" });
    expect(c.reportId).toBe("r1");
  });

  it("advanceSteps skips invalid steps instead of jumping", () => {
    const c = caseAt("analysis_done");
    expect(advanceSteps(c, ["under_review", "approved"], by()).stage).toBe("approved");
    // Already under review: the first step is a no-op, the second is valid.
    expect(advanceSteps(caseAt("under_review"), ["under_review", "approved"], by()).stage).toBe("approved");
    // Not analysed yet: neither step is valid.
    expect(advanceSteps(caseAt("results_uploaded"), ["under_review", "approved"], by()).stage).toBe("results_uploaded");
  });
});

describe("activeCase", () => {
  const done = { ...caseAt("follow_up_scheduled", { id: "old", at: "2025-01-01T00:00:00.000Z" }), reportId: "r0" };
  const reviewing = { ...caseAt("under_review", { id: "rev", at: "2026-03-01T00:00:00.000Z" }), reportId: "r1" };
  const newOrder = newCase({ id: "new", at: "2026-04-01T00:00:00.000Z" });

  it("prefers the open case that has results", () => {
    expect(activeCase([done, reviewing, newOrder], "ravi")?.id).toBe("rev");
  });

  it("then the newest open order, then the newest case", () => {
    expect(activeCase([done, newOrder], "ravi")?.id).toBe("new");
    expect(activeCase([done], "ravi")?.id).toBe("old");
    expect(activeCase([done], "priya")).toBeUndefined();
  });
});

describe("phase labels", () => {
  it("maps every stage for doctor, dashboard and patient", () => {
    expect(STAGES.map(doctorPhase)).toEqual([
      "Wearable alert",
      "In lab",
      "In lab",
      "Results received",
      "Doctor review",
      "Doctor review",
      "Treatment phase",
      "Treatment phase",
      "Completed",
    ]);
    expect(STAGES.map(dashboardGroup)).toEqual([
      "wearable_alert",
      "awaiting_lab",
      "awaiting_lab",
      "needs_review",
      "needs_review",
      "needs_review",
      "treatment_pending",
      "treatment_pending",
      "completed",
    ]);
    expect(PATIENT_STEPS.map((s) => s.label)).toEqual([
      "Inara noticed a change",
      "Test ordered",
      "At the lab",
      "With your doctor",
      "Report ready",
      "Treatment plan ready",
      "Follow-up booked",
    ]);
    expect(PATIENT_STEPS.flatMap((s) => s.stages)).toEqual(STAGES);
  });

  it("patients see 'With your doctor' until the report is approved", () => {
    for (const s of ["results_uploaded", "analysis_done", "under_review"] as CaseStage[]) {
      expect(patientStepLabel(s)).toBe("With your doctor");
    }
    expect(patientStepLabel("approved")).toBe("Report ready");
  });

  it("builds the top-bar label per role", () => {
    const cases = seedCases();
    const patients = [
      { id: "ravi", name: "Ravi Kumar" },
      { id: "priya", name: "Priya S" },
      { id: "arjun", name: "Arjun M" },
    ];
    const ctx = { cases, patients, patientIds: ["ravi", "priya", "arjun"] };
    expect(topBarPhase({ ...ctx, role: "doctor", pathname: "/doctor/ravi" })).toBe("Doctor · Ravi Kumar · In lab");
    expect(topBarPhase({ ...ctx, role: "doctor", pathname: "/doctor/priya" })).toBe("Doctor · Priya S · Results received");
    expect(topBarPhase({ ...ctx, role: "doctor", pathname: "/doctor" })).toBe("Doctor · 2 need review");
    expect(topBarPhase({ ...ctx, role: "patient", pathname: "/patient", patientIds: ["ravi"] })).toBe("Patient · Test ordered");
    expect(topBarPhase({ ...ctx, role: "patient", pathname: "/patient", patientIds: ["priya"] })).toBe("Patient · With your doctor");
    expect(topBarPhase({ ...ctx, role: "lab", pathname: "/lab" })).toBe("Lab · 3 open orders");
    expect(topBarPhase({ ...ctx, role: "doctor", pathname: "/share/abc" })).toBeUndefined();
  });
});

describe("panels", () => {
  it("cover known tests, with GGT in the Liver panel", () => {
    expect(ALL_PANELS).toEqual(["metabolic", "kidney", "lipid", "cbc", "liver", "thyroid", "others"]);
    for (const p of PANELS) for (const t of p.tests) expect(TEST_KEYS).toContain(t.key);
    expect(PANELS.find((p) => p.id === "liver")!.tests.map((t) => t.key)).toEqual(["ast", "alt", "ggt"]);
  });
});

describe("seed cases", () => {
  const cases = seedCases();
  const reports = seedReports();

  it("one case per report (plus Ravi's open order), ordered by Dr. Meera with all panels", () => {
    expect(cases).toHaveLength(reports.length + 1);
    for (const r of reports) {
      const c = cases.find((x) => x.reportId === r.id)!;
      expect(c).toMatchObject({ patientId: r.patientId, orderedBy: "Dr. Meera Nair", panels: ALL_PANELS });
    }
  });

  it("Ravi's Mar 2026 case waits at ordered: Dr. Meera, Type 2 diabetes, all panels, 2026-03-10", () => {
    const open = activeCase(cases, "ravi")!;
    expect(open).toMatchObject({ stage: "ordered", orderedBy: "Dr. Meera Nair", suspectedDisease: "Type 2 diabetes", panels: ALL_PANELS });
    expect(open.reportId).toBeUndefined();
    expect(open.stageHistory).toEqual([expect.objectContaining({ stage: "ordered", at: "2026-03-10T10:00:00.000Z" })]);
    expect(cases.filter((c) => c.patientId === "ravi").map((c) => c.stage)).toEqual([
      "follow_up_scheduled",
      "follow_up_scheduled",
      "follow_up_scheduled",
      "ordered",
    ]);
  });

  it("past cases are completed; Priya's and Arjun's latest case is at results_uploaded", () => {
    for (const id of ["priya", "arjun"]) {
      const mine = cases.filter((c) => c.patientId === id);
      expect(mine.map((c) => c.stage)).toEqual([
        "follow_up_scheduled",
        "follow_up_scheduled",
        "follow_up_scheduled",
        "results_uploaded",
      ]);
      expect(activeCase(cases, id)?.reportId).toBe(`${id}-2026-03`);
    }
  });

  it("every seeded history is a valid, time-ordered walk through the stages", () => {
    for (const c of cases) {
      expect(c.origin).toBe("doctor_order");
      expect(c.stageHistory.map((e) => e.stage)).toEqual(STAGES.slice(1, STAGES.indexOf(c.stage) + 1));
      const times = c.stageHistory.map((e) => e.at);
      expect(times).toEqual([...times].sort());
    }
  });

  it("carries each patient's suspected disease", () => {
    expect(cases.find((c) => c.patientId === "priya")!.suspectedDisease).toMatch(/anaemia/i);
  });
});
