// Part 3b-2: dengue treatment safety and the outcome learning loop.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { useInaraStore } from "@/store/useInaraStore";
import { alertOrderPrefill } from "../caseContext";
import { getFindings } from "../findings";
import { FORMULARY } from "../formulary";
import { buildCheckContext, checkPrescription, isMedicationSavable, type MedLike } from "../prescriptionChecks";
import { seedPatients, seedReports } from "../seed";
import { suggestPlanItems, suggestReviewDate } from "../treatment";
import type { Patient, Report } from "../types";
import { deriveEpisode, escalate, openAlerts, simNow, type WearableEvent } from "../wearable/checkin";
import { seedPatientSettings, setConsent } from "../wearable/consent";
import {
  anonymiseOutcome,
  casesText,
  isOutcomeValid,
  learningUpdate,
  outcomeLabel,
  outcomeStats,
  pastIllnessEntry,
  per1000,
  precision,
  precisionText,
  recordOutcome,
  statsQuery,
  type AnonymisedOutcome,
  type DoctorOutcome,
} from "../wearable/outcomes";
import { POPULATION_FILE, prevalenceFor, resolveReference, type PopulationDb } from "../wearable/population";
import { patientStepsFor } from "../workflow";
import { karthikAlert, karthikDengue, karthikReview, patientData } from "./helpers";

const db: PopulationDb = JSON.parse(readFileSync(`public${POPULATION_FILE}`, "utf8"));
const settings = seedPatientSettings();
const karthikSettings = settings.find((s) => s.patientId === "karthik")!;
const karthik = seedPatients().find((p) => p.id === "karthik")!;
const med = (id: string): MedLike => ({ name: id, formularyId: id });
const DENGUE: DoctorOutcome = { kind: "confirmed", condition: "dengue", labConfirmed: true };

/** The episode after Karthik's check-in. */
function episode(log = karthikAlert().log) {
  return deriveEpisode(log, "karthik-2026-10-05")!;
}

function record(o: DoctorOutcome, consent = true, log = karthikAlert().log) {
  const s = consent ? karthikSettings : setConsent(karthikSettings, "populationShare", false, "2026-10-05T00:00:00.000Z");
  return recordOutcome(episode(log), o, { at: simNow(2), by: "Dr. Meera Nair", recordId: "pop-test-1", settings: s, patient: karthik });
}

describe("treatment safety in dengue", () => {
  const story = karthikDengue();
  const ctx = buildCheckContext(story.patient, story.reports, { suspectedDisease: story.ordered.suspectedDisease });
  const check = (id: string, c = ctx, p: Patient = story.patient) => checkPrescription(med(id), p, c, [], []);

  it("the check context knows about dengue and the platelets", () => {
    expect(ctx).toMatchObject({ dengue: "NS1 positive", platelets: 85, alt: 64 });
  });

  it("NSAIDs and aspirin are blocked: bleeding risk in dengue — use paracetamol (WHO)", () => {
    for (const id of ["ibuprofen", "diclofenac", "aceclofenac", "aspirin", "clopidogrel"]) {
      const block = check(id).find((a) => a.rule === "dengue_bleeding");
      expect(block, id).toMatchObject({ level: "block", source: "WHO 2009 dengue guidelines" });
      expect(block!.message).toMatch(/^Bleeding risk in dengue \(NS1 positive · platelets 85 ×10³\/µL\)/);
      expect(block!.message).toMatch(/use paracetamol for fever/);
    }
    // A block needs a doctor override with a reason, like every other block.
    const alerts = check("ibuprofen");
    expect(isMedicationSavable({}, alerts)).toBe(false);
    expect(isMedicationSavable({ override: { reason: "Severe arthritis pain, specialist advice", author: "Dr", timestamp: "", rules: ["dengue_bleeding"] } }, alerts)).toBe(true);
  });

  it("paracetamol stays allowed, with a max-dose note that mentions the raised ALT", () => {
    const alerts = check("paracetamol");
    expect(alerts.some((a) => a.level === "block")).toBe(false);
    const info = alerts.find((a) => a.rule === "paracetamol_dengue")!;
    expect(info.level).toBe("info");
    expect(info.message).toMatch(/max 4 g\/day; ALT 64 U\/L is raised, so check the dose/);
  });

  it("suspected dengue alone (before results) is enough", () => {
    const base = seedReports().filter((r) => r.patientId === "karthik");
    const c = buildCheckContext(karthik, base, { suspectedDisease: "Dengue (from wearable alert)" });
    expect(c).toMatchObject({ dengue: "dengue suspected", platelets: 260 });
    expect(check("ibuprofen", c, karthik).find((a) => a.rule === "dengue_bleeding")?.message).toMatch(/^Bleeding risk in dengue \(dengue suspected\)/);
    // Without the case's suspected disease (Karthik's own field is "None — wearable monitoring") it doesn't apply.
    expect(buildCheckContext(karthik, base).dengue).toBeUndefined();
  });

  it("platelets < 100 without dengue also blocks NSAIDs and aspirin", () => {
    const { patient, reports } = patientData("arjun");
    const latest = reports.at(-1)!;
    const low: Report = { ...latest, id: "arjun-low", date: "2026-04-01", values: latest.values.map((v) => (v.testKey === "platelets" ? { ...v, value: 85, flag: "low" as const } : v)) };
    const c = buildCheckContext(patient, [...reports, low]);
    expect(c.dengue).toBeUndefined();
    const block = checkPrescription(med("ibuprofen"), patient, c, [], []).find((a) => a.rule === "dengue_bleeding")!;
    expect(block.message).toMatch(/^Bleeding risk in low platelets \(platelets 85 ×10³\/µL\)/);
    expect(checkPrescription(med("aspirin"), patient, c, [], []).some((a) => a.rule === "dengue_bleeding")).toBe(true);
  });

  it("no dengue and normal platelets: no dengue rule (Arjun)", () => {
    const { patient, reports } = patientData("arjun");
    const c = buildCheckContext(patient, reports);
    for (const id of ["ibuprofen", "aspirin", "paracetamol"]) {
      expect(checkPrescription(med(id), patient, c, [], []).some((a) => a.rule.includes("dengue")), id).toBe(false);
    }
  });
});

describe("dengue plan suggestions", () => {
  const story = karthikDengue();
  const findings = getFindings(story.patient, story.reports, story.context).filter((f) => f.screen === "dengue");
  const plan = suggestPlanItems(findings);

  it("fluids, rest, warning signs and a repeat CBC within 1–2 days", () => {
    expect(plan.lifestyle.join("\n")).toMatch(/2\.5–3 litres a day/);
    expect(plan.lifestyle.join("\n")).toMatch(/Rest at home/);
    expect(plan.lifestyle.join("\n")).toMatch(/Come back to the hospital immediately if you have belly pain, vomiting, any bleeding.*dizziness.*much less urine/);
    expect(plan.followUpTests).toEqual([{ name: "Repeat CBC (platelets + haematocrit)", inWeeks: 0 }]);
    expect(suggestReviewDate("2026-10-05", plan.followUpTests)).toBe("2026-10-12");
  });

  it("never names a medicine", () => {
    const text = [...plan.lifestyle, ...plan.followUpTests.map((t) => t.name)].join(" ").toLowerCase();
    for (const drug of FORMULARY) expect(text, drug.genericName).not.toContain(drug.genericName.toLowerCase());
    expect(text).not.toMatch(/\b\d+\s?mg\b/);
  });
});

describe("recording the outcome", () => {
  it("labels and validation", () => {
    expect(outcomeLabel(DENGUE)).toBe("Confirmed: Dengue (lab-confirmed)");
    expect(outcomeLabel({ kind: "confirmed", condition: "dengue", labConfirmed: false })).toBe("Confirmed: Dengue");
    expect(outcomeLabel({ kind: "ruled_out", labConfirmed: false })).toBe("Ruled out");
    expect(outcomeLabel({ kind: "other", labConfirmed: false, otherText: "Typhoid" })).toBe("Other diagnosis: Typhoid");
    expect(isOutcomeValid({ kind: "confirmed", labConfirmed: true })).toBe(false);
    expect(isOutcomeValid({ kind: "other", labConfirmed: false, otherText: "  " })).toBe(false);
  });

  it("consent on: an outcome event and an anonymised record (no name or ID)", () => {
    const r = record(DENGUE)!;
    expect(r.event).toMatchObject({ type: "outcome", episodeId: "karthik-2026-10-05", outcome: DENGUE, population: "added to local population data", recordId: "pop-test-1" });
    expect(r.record).toEqual({ id: "pop-test-1", area: "Velachery", city: "Chennai", month: "2026-10", patternId: "dengue_like", condition: "dengue", confirmed: true, labConfirmed: true });
    expect(JSON.stringify(r.record)).not.toMatch(/karthik|Karthik R|9000000004|2026-10-05/);
    expect(r.pastIllness).toBe("Dengue fever (Oct 2026, lab-confirmed)");
  });

  it("consent off: nothing added, logged 'not added — consent off'", () => {
    const r = record(DENGUE, false)!;
    expect(r.record).toBeNull();
    expect(r.event).toMatchObject({ population: "not added — consent off" });
    expect("recordId" in r.event).toBe(false);
    // The patient's own history is still updated (their own care, not population data).
    expect(r.pastIllness).toBe("Dengue fever (Oct 2026, lab-confirmed)");
  });

  it("ruled out / other: the alert counts as not confirmed and no condition is added", () => {
    expect(record({ kind: "ruled_out", labConfirmed: false })!.record).toMatchObject({ confirmed: false, labConfirmed: false });
    const other = record({ kind: "other", labConfirmed: false, otherText: " Typhoid " })!;
    expect(other.event).toMatchObject({ outcome: { kind: "other", otherText: "Typhoid" } });
    expect(other.record).not.toHaveProperty("condition");
    expect(other.pastIllness).toBeNull();
    // Confirmed, but not what the pattern pointed to → the alert itself wasn't confirmed.
    expect(record({ kind: "confirmed", condition: "febrile_illness", labConfirmed: false })!.record).toMatchObject({ condition: "febrile_illness", confirmed: false });
  });

  it("closes the episode: one outcome only, no alerts, no check-in, no escalation", () => {
    const { log } = karthikAlert();
    const r = record(DENGUE, true, log)!;
    const closedLog: WearableEvent[] = [...log, { ...r.event, id: "out-1" } as WearableEvent];
    const ep = deriveEpisode(closedLog, "karthik-2026-10-05")!;
    expect(ep).toMatchObject({ closed: true, checkInDue: false });
    expect(ep.outcome?.outcome).toEqual(DENGUE);
    expect(record(DENGUE, true, closedLog)).toBeNull();
    expect(openAlerts(closedLog, ["karthik"])).toEqual([]);
    expect(openAlerts(log, ["karthik"])).toHaveLength(1);
    const ctx = { patient: { id: "karthik", name: "Karthik R" }, settings: karthikSettings, doctorName: "Dr. Meera Nair", cases: [] };
    expect(escalate(ep, simNow(48), ctx).events).toEqual([]);
  });
});

describe("local stats and precision", () => {
  const reference = resolveReference(db, karthik, settings)!;
  const q = statsQuery(reference, "dengue_like", "2026-10-05")!;
  const confirmed: AnonymisedOutcome = anonymiseOutcome(DENGUE, { id: "r1", area: "Velachery", city: "Chennai", date: "2026-10-05", patternId: "dengue_like" });

  it("precision and rate maths", () => {
    expect(precision(13, 16)).toBe(81);
    expect(precision(12, 15)).toBe(80);
    expect(precision(0, 0)).toBeNull();
    expect(per1000(6, 1240)).toBe(4.8);
    expect(per1000(7, 1240)).toBe(5.6);
    expect(per1000(1, 0)).toBe(0);
  });

  it("uses Karthik's reference level: Chennai, 1,240 consenting people", () => {
    expect(q).toEqual({ levelId: "chennai", people: 1240, month: "2026-10", condition: "dengue", patternId: "dengue_like" });
  });

  it("base data: Chennai, October — 6 dengue cases (4.8 per 1,000), dengue-like alerts 12 of 15 (80%)", () => {
    const s = outcomeStats(db, [], q)!;
    expect(s).toMatchObject({ levelName: "Chennai", cases: 6, per1000: 4.8, alerts: 15, confirmed: 12, precision: 80 });
  });

  it("a confirmed dengue outcome: 6 → 7 cases (4.8 → 5.6 per 1,000), 12 of 15 → 13 of 16 (81%)", () => {
    const u = learningUpdate(db, [confirmed], "r1", q)!;
    expect(u.before).toMatchObject({ cases: 6, per1000: 4.8, alerts: 15, confirmed: 12, precision: 80 });
    expect(u.after).toMatchObject({ cases: 7, per1000: 5.6, alerts: 16, confirmed: 13, precision: 81 });
    expect(precisionText(u.after)).toBe("Dengue-like alerts in Chennai: 13 of 16 confirmed — 81%");
    expect(casesText(u.after)).toBe("Dengue in Chennai, October: 7 cases — 5.6 per 1,000 people");
  });

  it("ruled out: one more alert, not confirmed, no new case", () => {
    const ruled = anonymiseOutcome({ kind: "ruled_out", labConfirmed: false }, { id: "r2", area: "Velachery", city: "Chennai", date: "2026-10-05", patternId: "dengue_like" });
    expect(outcomeStats(db, [ruled], q)).toMatchObject({ cases: 6, alerts: 16, confirmed: 12, precision: 75 });
  });

  it("records count at every level they belong to (Velachery, Chennai…), not elsewhere", () => {
    const velachery = { ...q, levelId: "velachery", people: 38 };
    expect(outcomeStats(db, [], velachery)).toMatchObject({ cases: 0, alerts: 1, confirmed: 1 });
    expect(outcomeStats(db, [confirmed], velachery)).toMatchObject({ cases: 1, alerts: 2, confirmed: 2, precision: 100 });
    const elsewhere = { ...confirmed, id: "r3", area: undefined, city: "Mumbai" };
    expect(outcomeStats(db, [elsewhere], q)).toMatchObject({ cases: 6, alerts: 15 });
    // Other months don't count towards October.
    expect(outcomeStats(db, [{ ...confirmed, month: "2026-09" }], q)).toMatchObject({ cases: 6, alerts: 16 });
  });

  it("the prevalence band for Chennai in October is unchanged ('high')", () => {
    expect(prevalenceFor(db, "chennai", "dengue", 9)?.band).toBe("high");
  });
});

describe("Karthik's history", () => {
  it("a confirmed dengue outcome adds 'Dengue fever (Oct 2026, lab-confirmed)'", () => {
    expect(pastIllnessEntry(DENGUE, "2026-10-05")).toBe("Dengue fever (Oct 2026, lab-confirmed)");
    expect(pastIllnessEntry({ kind: "confirmed", condition: "dengue", labConfirmed: false }, "2026-10-05")).toBe("Dengue fever (Oct 2026, clinically confirmed)");
    expect(pastIllnessEntry({ kind: "ruled_out", labConfirmed: false }, "2026-10-05")).toBeNull();
  });
});

describe("store: outcome → population data → history; the case carries on", () => {
  beforeEach(() => useInaraStore.getState().resetDemo());

  /** Karthik's alert in the store, ordered and uploaded (as in the demo). */
  function setUp() {
    const { log, alertCase, snapshot } = karthikAlert();
    useInaraStore.setState((s) => ({ wearableEvents: log, cases: [...s.cases, alertCase] }));
    const s = useInaraStore.getState();
    s.orderFromAlert(alertCase.id, alertOrderPrefill(snapshot, ["belly pain"]), "Dr. Meera Nair");
    const review = karthikReview();
    const reportId = s.submitLabResults(alertCase.id, { rows: review.rows, date: review.reportDate, source: "csv", verifiedBy: "A. Technician" })!;
    return { caseId: alertCase.id, reportId };
  }

  it("consent on: the overlay gets one anonymised record and Karthik's history is updated", () => {
    setUp();
    useInaraStore.getState().recordAlertOutcome("karthik-2026-10-05", DENGUE);
    const s = useInaraStore.getState();
    expect(s.populationOutcomes).toHaveLength(1);
    expect(s.populationOutcomes[0]).toMatchObject({ area: "Velachery", city: "Chennai", month: "2026-10", condition: "dengue", confirmed: true });
    expect(s.patients.find((p) => p.id === "karthik")!.pastIllnesses).toEqual([
      "Dengue fever (Oct 2023, admitted 3 days, recovered)",
      "Dengue fever (Oct 2026, lab-confirmed)",
    ]);
    expect(deriveEpisode(s.wearableEvents, "karthik-2026-10-05")!.closed).toBe(true);
    // A second outcome is ignored (append-only, one per episode).
    s.recordAlertOutcome("karthik-2026-10-05", { kind: "ruled_out", labConfirmed: false });
    expect(useInaraStore.getState().populationOutcomes).toHaveLength(1);
    expect(useInaraStore.getState().wearableEvents.filter((e) => e.type === "outcome")).toHaveLength(1);
  });

  it("consent off: no record, logged as not added", () => {
    setUp();
    useInaraStore.getState().setPatientConsent("karthik", "populationShare", false);
    useInaraStore.getState().recordAlertOutcome("karthik-2026-10-05", DENGUE);
    const s = useInaraStore.getState();
    expect(s.populationOutcomes).toEqual([]);
    expect(deriveEpisode(s.wearableEvents, "karthik-2026-10-05")!.outcome).toMatchObject({ population: "not added — consent off" });
  });

  it("the wearable case goes on to approval, treatment and follow-up; the patient tracker completes", () => {
    const { caseId, reportId } = setUp();
    const s = useInaraStore.getState();
    s.recordAlertOutcome("karthik-2026-10-05", DENGUE);
    s.markAnalysisRun(reportId);
    s.approveReport(reportId);
    const plan = suggestPlanItems(getFindings(karthik, useInaraStore.getState().reports.filter((r) => r.patientId === "karthik")));
    s.approvePlan(reportId, { medications: [], lifestyle: plan.lifestyle, followUpTests: plan.followUpTests, nextReviewDate: "2026-10-07", doctorNotes: "" });
    const c = useInaraStore.getState().cases.find((x) => x.id === caseId)!;
    expect(c.stage).toBe("follow_up_scheduled");
    expect(c.stageHistory.map((e) => e.stage)).toEqual([
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
    expect(patientStepsFor(c).map((x) => x.label)).toEqual([
      "Prodrome noticed a change",
      "Test ordered",
      "At the lab",
      "With your doctor",
      "Report ready",
      "Treatment plan ready",
      "Follow-up booked",
    ]);
  });

  it("Reset check-in removes the alert case, its report, the outcome record and the added history", () => {
    const { reportId } = setUp();
    useInaraStore.getState().recordAlertOutcome("karthik-2026-10-05", DENGUE);
    useInaraStore.getState().resetCheckIn("karthik");
    const s = useInaraStore.getState();
    expect(s.populationOutcomes).toEqual([]);
    expect(s.reports.some((r) => r.id === reportId)).toBe(false);
    expect(s.reports.filter((r) => r.patientId === "karthik")).toHaveLength(1);
    expect(s.patients.find((p) => p.id === "karthik")!.pastIllnesses).toEqual(["Dengue fever (Oct 2023, admitted 3 days, recovered)"]);
  });
});

describe("past dengue in the history lowers the thresholds next time", () => {
  it("a patient with no dengue history gets the 'past dengue' factor once a confirmed outcome is added", async () => {
    const { analyseWearable } = await import("../wearable/analyse");
    const { detectPatterns } = await import("../wearable/detect");
    const { WEATHER_FILE } = await import("../wearable/weather");
    const weather = JSON.parse(readFileSync(`public${WEATHER_FILE}`, "utf8"));
    const a = analyseWearable("karthik", karthikSettings, weather);
    if (a.status !== "ok") throw new Error(a.status);
    // Karthik without any dengue in his record.
    const fresh: Patient = { ...karthik, pastIllnesses: [], visitHistory: karthik.visitHistory.filter((v) => !/dengue/i.test(v.note)) };
    const run = (record: Patient) =>
      detectPatterns({ person: record, nights: a.nights, amplitude: a.amplitude, weather: a.weatherDays, population: db, record, settings, day: 30 });
    const pastFactor = (d: ReturnType<typeof run>) =>
      d.status === "ok" ? d.patterns.flatMap((p) => p.supportingFactors).some((f) => /^Past dengue in record/.test(f)) : false;
    expect(pastFactor(run(fresh))).toBe(false);
    const after: Patient = { ...fresh, pastIllnesses: [pastIllnessEntry(DENGUE, "2026-10-05")!] };
    expect(pastFactor(run(after))).toBe(true);
  });
});

describe("Karthik's full plan suggestions (all findings)", () => {
  it("dengue liver finding: recheck AST/ALT with the next count; review within a week", () => {
    const story = karthikDengue();
    const plan = suggestPlanItems(getFindings(story.patient, story.reports, story.context));
    expect(plan.followUpTests).toEqual([
      { name: "Repeat CBC (platelets + haematocrit)", inWeeks: 0 },
      { testKey: "ast", name: "AST", inWeeks: 0 },
      { testKey: "alt", name: "ALT", inWeeks: 0 },
    ]);
    expect(plan.lifestyle.join(" ")).not.toMatch(/weight loss/);
    expect(suggestReviewDate("2026-10-05", plan.followUpTests)).toBe("2026-10-12");
  });
});
