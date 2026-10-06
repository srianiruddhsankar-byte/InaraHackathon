import { beforeEach, describe, expect, it } from "vitest";
import { useInaraStore } from "@/store/useInaraStore";
import { sampleReview } from "./helpers";

/** The lab uploads Ravi's sample CSV for his open order (as in the demo). Returns his new report. */
function uploadRavi() {
  const s = useInaraStore.getState();
  const order = s.cases.find((c) => c.patientId === "ravi" && c.stage === "ordered")!;
  const review = sampleReview();
  s.submitLabResults(order.id, { rows: review.rows, date: review.reportDate, source: "csv", verifiedBy: "A. Technician" });
  return useInaraStore.getState().getLatestReport("ravi")!;
}

describe("store", () => {
  beforeEach(() => useInaraStore.getState().resetDemo());

  it("loads seed data and exposes selectors", () => {
    const s = useInaraStore.getState();
    expect(s.getPatient("ravi")?.name).toBe("Ravi Kumar");
    expect(s.getReports("ravi")).toHaveLength(3);
    expect(s.getLatestReport("ravi")?.date).toBe("2025-03-15");
    expect(s.getApprovedReports("ravi")).toHaveLength(3);
    expect(s.getLatestReport("priya")?.date).toBe("2026-03-15");
  });

  it("saveDoctorEdit and approveReport append versions and keep the old ones", () => {
    const { saveDoctorEdit, approveReport } = useInaraStore.getState();
    const before = uploadRavi();
    const draft = before.versions[0];

    saveDoctorEdit(before.id, { text: "Edited text", prescription: "Metformin 500 mg" });
    approveReport(before.id);

    const after = useInaraStore.getState().getLatestReport("ravi")!;
    expect(after.versions.map((v) => v.status)).toEqual(["ai_draft", "doctor_edited", "approved"]);
    expect(after.versions[0]).toEqual(draft);
    expect(after.versions[2]).toMatchObject({ text: "Edited text", prescription: "Metformin 500 mg" });
    expect(useInaraStore.getState().getApprovedReports("ravi")).toHaveLength(4);
  });

  it("does not change a report that is already approved", () => {
    const { getReports, approveReport, saveDoctorEdit } = useInaraStore.getState();
    const approved = getReports("ravi")[0];
    approveReport(approved.id);
    saveDoctorEdit(approved.id, { text: "late edit" });
    expect(useInaraStore.getState().getReports("ravi")[0].versions).toEqual(approved.versions);
  });

  it("resetDemo restores the seed", () => {
    const { approveReport, resetDemo } = useInaraStore.getState();
    approveReport(uploadRavi().id);
    resetDemo();
    expect(useInaraStore.getState().getApprovedReports("ravi")).toHaveLength(3);
    expect(useInaraStore.getState().getReports("ravi")).toHaveLength(3);
    expect(useInaraStore.getState().cases.find((c) => c.id === "case-ravi-2026-03")?.stage).toBe("ordered");
  });

  it("login starts a single-role session and logout ends it", () => {
    const { users, login, logout } = useInaraStore.getState();
    const meera = users.find((u) => u.id === "u-meera")!;
    const ravi = users.find((u) => u.id === "u-ravi")!;

    login(meera);
    expect(useInaraStore.getState().session).toMatchObject({ userId: "u-meera", role: "doctor" });

    login(ravi);
    expect(useInaraStore.getState().session).toMatchObject({ userId: "u-ravi", role: "patient" });

    logout();
    expect(useInaraStore.getState().session).toBeNull();
  });

  it("resetDemo logs the user out", () => {
    const { users, login, resetDemo } = useInaraStore.getState();
    login(users[0]);
    resetDemo();
    expect(useInaraStore.getState().session).toBeNull();
    expect(useInaraStore.getState().users).toHaveLength(7);
  });
});

describe("store: doctor flow", () => {
  beforeEach(() => useInaraStore.getState().resetDemo());

  it("approving appends a version with both texts and finding edits, keeping old versions", () => {
    const s = useInaraStore.getState();
    const report = uploadRavi();
    s.setFindingEdit(report.id, "ravi-kidney", { included: false });
    const edits = useInaraStore.getState().findingReviews[report.id];
    s.approveReport(report.id, "Dr. Meera Nair", { text: "Clinical", patientText: "For patient", findingEdits: edits });

    const after = useInaraStore.getState().getLatestReport("ravi")!;
    expect(after.versions).toHaveLength(2);
    expect(after.versions[0]).toEqual(report.versions[0]);
    expect(after.versions[1]).toMatchObject({
      status: "approved",
      text: "Clinical",
      patientText: "For patient",
      author: "Dr. Meera Nair",
      findingEdits: { "ravi-kidney": { included: false } },
    });
  });

  it("an approved report can't be edited (versions or findings)", () => {
    const s = useInaraStore.getState();
    const report = s.getLatestReport("priya")!;
    s.approveReport(report.id);
    const locked = useInaraStore.getState().getLatestReport("priya")!;
    s.saveDoctorEdit(report.id, { text: "late" });
    s.approveReport(report.id, "Dr", { text: "again" });
    s.setFindingEdit(report.id, "priya-anaemia", { included: false });
    expect(useInaraStore.getState().getLatestReport("priya")!.versions).toEqual(locked.versions);
    expect(useInaraStore.getState().findingReviews[report.id]).toBeUndefined();
  });

  it("treatment plans need an approved report and approval appends a version", () => {
    const s = useInaraStore.getState();
    const report = uploadRavi();
    const content = { medications: [], lifestyle: ["Walk"], followUpTests: [], nextReviewDate: "2026-06-15", doctorNotes: "" };

    s.savePlanDraft(report.id, content);
    expect(useInaraStore.getState().treatmentPlans).toHaveLength(0); // report not approved yet

    s.approveReport(report.id);
    s.savePlanDraft(report.id, content);
    s.approvePlan(report.id, { ...content, lifestyle: ["Walk", "Less salt"] });
    s.savePlanDraft(report.id, content); // locked now

    const plans = useInaraStore.getState().treatmentPlans;
    expect(plans.map((p) => p.status)).toEqual(["draft", "approved"]);
    expect(plans[0].lifestyle).toEqual(["Walk"]);
    expect(plans[1].lifestyle).toEqual(["Walk", "Less salt"]);
  });

  it("resetDemo clears plans and finding edits", () => {
    const s = useInaraStore.getState();
    const report = uploadRavi();
    s.setFindingEdit(report.id, "ravi-kidney", { included: false });
    s.resetDemo();
    expect(useInaraStore.getState().findingReviews).toEqual({});
    expect(useInaraStore.getState().treatmentPlans).toEqual([]);
  });
});

describe("store: record and analysis", () => {
  beforeEach(() => useInaraStore.getState().resetDemo());

  it("approving a plan makes its medicines current medications", () => {
    const s = useInaraStore.getState();
    const report = uploadRavi();
    s.approveReport(report.id);
    const med = { name: "Doctor medicine", dose: "x", frequency: "daily", duration: "", instructions: "" };
    s.approvePlan(report.id, { medications: [med], lifestyle: [], followUpTests: [], nextReviewDate: "2026-06-15", doctorNotes: "" }, "Dr. Meera Nair");
    const meds = useInaraStore.getState().getPatient("ravi")!.currentMedications;
    expect(meds.map((m) => m.name)).toEqual(["Amlodipine", "Ibuprofen", "Doctor medicine"]);
    expect(meds[2].prescribedBy).toBe("Dr. Meera Nair");
  });

  it("caches analysis runs per report", () => {
    const s = useInaraStore.getState();
    s.markAnalysisRun("ravi-2026-03");
    expect(useInaraStore.getState().analysisRuns["ravi-2026-03"]).toBeTruthy();
  });

  it("sets, replaces and reverts target overrides", () => {
    const s = useInaraStore.getState();
    const base = { patientId: "ravi", testKey: "ldl" as const, op: "<" as const, reason: "r", author: "Dr" };
    s.setTargetOverride({ ...base, value: 100 });
    s.setTargetOverride({ ...base, value: 90 });
    expect(useInaraStore.getState().targetOverrides).toHaveLength(1);
    expect(useInaraStore.getState().targetOverrides[0].value).toBe(90);
    s.revertTargetOverride("ravi", "ldl");
    expect(useInaraStore.getState().targetOverrides).toEqual([]);
  });
});

describe("store: case workflow", () => {
  beforeEach(() => useInaraStore.getState().resetDemo());
  const stageOf = (reportId: string) => useInaraStore.getState().cases.find((c) => c.reportId === reportId)!.stage;
  const content = { medications: [], lifestyle: ["Walk"], followUpTests: [], nextReviewDate: "2026-06-15", doctorNotes: "" };

  it("existing actions move the case forward one stage at a time", () => {
    const s = useInaraStore.getState();
    const id = uploadRavi().id;
    expect(stageOf(id)).toBe("results_uploaded");

    s.approveReport(id); // analysis not run yet: report is approved but the case can't jump ahead
    expect(stageOf(id)).toBe("results_uploaded");
  });

  it("analysis → review → approval → treatment → follow-up", () => {
    const s = useInaraStore.getState();
    const id = uploadRavi().id;
    s.markAnalysisRun(id);
    expect(stageOf(id)).toBe("analysis_done");
    s.markUnderReview(id);
    expect(stageOf(id)).toBe("under_review");
    s.saveDoctorEdit(id, { text: "Edited" }, "Dr. Meera Nair");
    expect(stageOf(id)).toBe("under_review");
    s.approveReport(id, "Dr. Meera Nair");
    expect(stageOf(id)).toBe("approved");
    s.approvePlan(id, content, "Dr. Meera Nair");

    const c = useInaraStore.getState().cases.find((x) => x.reportId === id)!;
    expect(c.stage).toBe("follow_up_scheduled");
    expect(c.treatmentPlanId).toBe(useInaraStore.getState().treatmentPlans.at(-1)!.id);
    expect(c.stageHistory.map((e) => e.stage).slice(-6)).toEqual([
      "results_uploaded",
      "analysis_done",
      "under_review",
      "approved",
      "treatment_planned",
      "follow_up_scheduled",
    ]);
    expect(c.stageHistory.at(-1)).toMatchObject({ by: "Dr. Meera Nair", note: "Next review 2026-06-15" });
  });

  it("approving straight after analysis records under_review first", () => {
    const s = useInaraStore.getState();
    const id = s.getLatestReport("priya")!.id;
    s.markAnalysisRun(id);
    s.approveReport(id);
    const history = useInaraStore.getState().cases.find((c) => c.reportId === id)!.stageHistory.map((e) => e.stage);
    expect(history.slice(-3)).toEqual(["analysis_done", "under_review", "approved"]);
  });

  it("orderLabTest creates a case at ordered; resetDemo restores the seeded cases", () => {
    const s = useInaraStore.getState();
    const before = s.cases;
    const id = s.orderLabTest(
      { patientId: "arjun", suspectedDisease: "Thyroid check", panels: ["thyroid"], urgency: "urgent", clinicalNote: "Weight gain" },
      "Dr. Meera Nair",
    );
    const c = useInaraStore.getState().cases.find((x) => x.id === id)!;
    expect(c).toMatchObject({ stage: "ordered", panels: ["thyroid"], urgency: "urgent", orderedBy: "Dr. Meera Nair" });
    expect(c.stageHistory).toHaveLength(1);
    s.resetDemo();
    expect(useInaraStore.getState().cases).toEqual(before);
  });
});

describe("store: lab upload", () => {
  beforeEach(() => useInaraStore.getState().resetDemo());
  const raviCase = () => useInaraStore.getState().cases.find((c) => c.id === "case-ravi-2026-03")!;

  it("mark sample received moves an ordered case to in_lab", () => {
    useInaraStore.getState().markSampleReceived("case-ravi-2026-03");
    expect(raviCase().stage).toBe("in_lab");
    expect(raviCase().stageHistory.at(-1)).toMatchObject({ stage: "in_lab", note: "Sample received" });
  });

  it("submitting results creates the report with raw rows, source and an AI draft, and moves the case to results_uploaded", () => {
    const report = uploadRavi();
    expect(report).toMatchObject({ id: "ravi-2026-03", date: "2026-03-15", source: "csv", verifiedBy: "A. Technician" });
    expect(report.versions.map((v) => v.status)).toEqual(["ai_draft"]);
    expect(report.values).toHaveLength(24);
    expect(report.raw).toHaveLength(25);
    expect(report.raw!.find((r) => r.name === "Serum Amylase")).toMatchObject({ status: "unknown", testKey: null });
    expect(raviCase()).toMatchObject({ stage: "results_uploaded", reportId: "ravi-2026-03" });
    expect(raviCase().stageHistory.map((e) => e.stage)).toEqual(["ordered", "in_lab", "results_uploaded"]);
  });

  it("can't submit twice for the same order", () => {
    uploadRavi();
    const review = sampleReview();
    const again = useInaraStore
      .getState()
      .submitLabResults("case-ravi-2026-03", { rows: review.rows, date: review.reportDate, source: "csv", verifiedBy: "B" });
    expect(again).toBeNull();
    expect(useInaraStore.getState().getReports("ravi")).toHaveLength(4);
  });
});
