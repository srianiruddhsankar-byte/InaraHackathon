import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInaraStore } from "@/store/useInaraStore";
import { clockNow, clockToday } from "../clock";
import { suggestPlanItems } from "../treatment";
import { getFindings } from "../findings";
import { SIM_START, simNow } from "../wearable/checkin";
import { alertOrderPrefill } from "../caseContext";
import { karthikAlert, karthikReview } from "./helpers";

describe("clockNow", () => {
  it("is real time until the demo clock starts", () => {
    const real = Date.parse("2031-01-02T03:04:05.000Z");
    expect(clockNow({ simHours: 6, clockAnchor: null }, real)).toBe("2031-01-02T03:04:05.000Z");
  });

  it("runs from the simulated clock plus the real time since it started", () => {
    const anchor = Date.parse("2031-01-02T00:00:00.000Z");
    expect(clockNow({ simHours: 0, clockAnchor: anchor }, anchor)).toBe(SIM_START);
    expect(clockNow({ simHours: 0, clockAnchor: anchor }, anchor + 90_000)).toBe(new Date(Date.parse(SIM_START) + 90_000).toISOString());
    expect(clockNow({ simHours: 6, clockAnchor: anchor }, anchor + 60_000)).toBe(new Date(Date.parse(simNow(6)) + 60_000).toISOString());
    expect(clockToday({ simHours: 0, clockAnchor: anchor }, anchor)).toBe("2026-10-05");
  });
});

describe("one demo clock for the whole wearable → lab → treatment → outcome story", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // The real clock is years away from the story: every timestamp must still read on Day 30.
    vi.setSystemTime(new Date("2031-06-01T10:00:00.000Z"));
    useInaraStore.getState().resetDemo();
  });
  afterEach(() => vi.useRealTimers());

  it("every timestamp uses the demo clock and the timeline reads in order", () => {
    const tick = () => vi.advanceTimersByTime(60_000);
    const { snapshot } = karthikAlert();
    const s = useInaraStore.getState;
    s().startWearableEpisode(snapshot);
    tick();
    for (const q of snapshot.questions) {
      s().answerCheckIn(snapshot.episodeId, q, q === "fever" || q === "belly_pain" ? "yes" : q === "body_pain" ? "a_little" : "no");
      tick();
    }
    const alertCase = s().cases.find((c) => c.episodeId === snapshot.episodeId)!;
    s().orderFromAlert(alertCase.id, alertOrderPrefill(snapshot, ["belly pain"]));
    tick();
    s().markSampleReceived(alertCase.id);
    tick();
    const review = karthikReview();
    const reportId = s().submitLabResults(alertCase.id, { rows: review.rows, date: review.reportDate, source: "csv", verifiedBy: "A. Technician" })!;
    tick();
    s().markAnalysisRun(reportId);
    tick();
    s().approveReport(reportId);
    tick();
    const report = s().reports.find((r) => r.id === reportId)!;
    const findings = getFindings(s().patients.find((p) => p.id === "karthik")!, s().getReports("karthik"), { suspectedDisease: "Dengue (from wearable alert)" });
    const sug = suggestPlanItems(findings);
    s().approvePlan(reportId, { medications: [], lifestyle: sug.lifestyle, followUpTests: sug.followUpTests, nextReviewDate: s().today(), doctorNotes: "" });
    tick();
    s().advanceSimClock(6);
    s().recordAlertOutcome(snapshot.episodeId, { kind: "confirmed", condition: "dengue", labConfirmed: true });

    const c = s().cases.find((x) => x.id === alertCase.id)!;
    const stamps = [
      ...s().wearableEvents.filter((e) => e.episodeId === snapshot.episodeId).map((e) => e.at),
      ...c.stageHistory.map((h) => h.at),
      report.receivedAt!,
      ...report.versions.slice(1).map((v) => v.timestamp),
      ...s().treatmentPlans.map((p) => p.timestamp),
      s().analysisRuns[reportId],
    ];
    for (const at of stamps) {
      expect(at >= SIM_START, at).toBe(true);
      expect(at < "2026-10-06", at).toBe(true);
    }
    // In order: stage history, and alert → order → upload → approval → plan → outcome.
    const stageTimes = c.stageHistory.map((h) => h.at);
    expect([...stageTimes].sort()).toEqual(stageTimes);
    const outcome = s().wearableEvents.find((e) => e.type === "outcome")!;
    const plan = s().treatmentPlans.at(-1)!;
    expect(outcome.at > plan.timestamp).toBe(true);
    expect(plan.timestamp > report.versions.at(-1)!.timestamp).toBe(true);
    expect(report.versions.at(-1)!.timestamp > report.receivedAt!).toBe(true);
    expect(report.receivedAt! > alertCase.stageHistory[0].at).toBe(true);
  });

  it("without a demo clock, timestamps are real time; resets stop the clock", () => {
    const id = useInaraStore.getState().orderLabTest({ patientId: "arjun", panels: ["metabolic"], suspectedDisease: "Routine", urgency: "routine", clinicalNote: "" });
    const c = useInaraStore.getState().cases.find((x) => x.id === id)!;
    expect(c.stageHistory[0].at).toBe("2031-06-01T10:00:00.000Z");
    useInaraStore.getState().advanceSimClock(6);
    expect(useInaraStore.getState().now() < "2026-10-06").toBe(true);
    useInaraStore.getState().resetCheckIn("karthik");
    expect(useInaraStore.getState().clockAnchor).toBeNull();
  });
});
