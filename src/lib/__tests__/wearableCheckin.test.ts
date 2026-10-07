import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { useInaraStore } from "@/store/useInaraStore";
import { seedCases, seedPatients } from "../seed";
import { analyseWearable } from "../wearable/analyse";
import {
  addHours,
  allEpisodes,
  answerQuestion,
  buildSnapshot,
  CHECKIN,
  deriveEpisode,
  escalate,
  formatIst,
  openAlerts,
  patientTexts,
  recommend,
  selectQuestions,
  sensorRedFlags,
  SIM_START,
  simNow,
  startEpisode,
  type Answer,
  type Ctx,
  type EpisodeSnapshot,
  type NewWearableEvent,
  type Outcome,
  type WearableEvent,
} from "../wearable/checkin";
import { QUESTION_BANK, type QuestionId } from "../wearable/conditions";
import { seedPatientSettings, setConsent } from "../wearable/consent";
import { detectPatterns } from "../wearable/detect";
import { POPULATION_FILE } from "../wearable/population";
import type { NightSummary } from "../wearable/types";
import { WEATHER_FILE } from "../wearable/weather";
import { activeCase, createAlertCase, patientStepsFor } from "../workflow";

const weather = JSON.parse(readFileSync(`public${WEATHER_FILE}`, "utf8"));
const population = JSON.parse(readFileSync(`public${POPULATION_FILE}`, "utf8"));
const settings = seedPatientSettings();
const karthik = seedPatients().find((p) => p.id === "karthik")!;

/** Karthik's real snapshot for a day (from the full pipeline). */
function snapshotFor(day: number) {
  const a = analyseWearable("karthik", settings.find((s) => s.patientId === "karthik"), weather);
  if (a.status !== "ok") throw new Error(a.status);
  const detection = detectPatterns({ person: karthik, nights: a.nights, amplitude: a.amplitude, weather: a.weatherDays, population, record: karthik, settings, day });
  return buildSnapshot({ patient: karthik, detection, nights: a.nights, weather: a.weatherDays, day });
}

const day30 = snapshotFor(30)!;

const ctx = (over: Partial<Ctx> = {}): Ctx => ({
  patient: { id: "karthik", name: "Karthik R" },
  settings: settings.find((s) => s.patientId === "karthik"),
  doctorName: "Dr. Meera Nair",
  cases: [],
  ...over,
});

/** Apply outcomes to an in-memory log (what the store does). */
let n = 0;
const append = (log: WearableEvent[], o: Outcome): WearableEvent[] => [...log, ...o.events.map((e: NewWearableEvent) => ({ ...e, id: `e${n++}` }) as WearableEvent)];

function answerAll(snapshot: EpisodeSnapshot, answers: Partial<Record<QuestionId, Answer>>, c = ctx()) {
  let log = append([], startEpisode([], snapshot, SIM_START, c));
  let last: Outcome = { events: [], notifications: [], newCase: null };
  for (const q of snapshot.questions) {
    const state = deriveEpisode(log, snapshot.episodeId)!;
    if (!state.checkInDue) break;
    last = answerQuestion(state, q, answers[q] ?? "no", SIM_START, c);
    log = append(log, last);
  }
  return { log, last, state: deriveEpisode(log, snapshot.episodeId)! };
}

const nightOf = (over: Partial<NightSummary>): NightSummary => ({ day: 29, date: "2026-10-05", restingHr: 60, hrv: 50, skinTemp: 34.4, spo2: 97, quality: 100, valid: true, ...over });

describe("when a check-in starts", () => {
  it("Day 30 (dengue-like concerning) starts a check-in; Day 26 (watch) and Day 20 (none) don't", () => {
    expect(day30).toMatchObject({ patternId: "dengue_like", patternLevel: "concerning", secondPatternId: "early_infection", episodeId: "karthik-2026-10-05" });
    expect(snapshotFor(26)).toBeNull();
    expect(snapshotFor(20)).toBeNull();
  });

  it("the patient's 'what we noticed' is plain words with real numbers", () => {
    expect(day30.noticed[0]).toBe("Your heart rate during sleep was 78 beats a minute — usually it is about 56.");
    expect(day30.noticed.join(" ")).toMatch(/skin temperature was raised for a few nights and has now come back down/);
  });
});

describe("question selection", () => {
  it("dengue-like + early infection: the 8 agreed questions, no duplicates, red flags never cut", () => {
    expect(day30.questions).toEqual(["fever", "body_pain", "belly_pain", "vomiting", "bleeding", "dizzy", "less_urine", "breathless"]);
    expect(new Set(day30.questions).size).toBe(day30.questions.length);
  });

  it("max 6 when nothing beyond that is a red flag", () => {
    const qs = selectQuestions(["poor_recovery", "heat_dehydration"]);
    expect(qs).toEqual(["sleep", "stress", "tired", "drank_less", "outdoors", "dizzy", "less_urine", "confusion"]);
    expect(qs.filter((q) => !QUESTION_BANK[q].redFlag).length).toBeLessThanOrEqual(CHECKIN.maxQuestions.value);
    expect(selectQuestions(["poor_recovery"])).toEqual(["sleep", "stress", "tired"]);
  });

  it("only the top 2 patterns are used", () => {
    expect(selectQuestions(["poor_recovery", "poor_recovery", "respiratory"])).toEqual(["sleep", "stress", "tired"]);
  });

  it("the bank covers all eight red flags", () => {
    const red = Object.values(QUESTION_BANK).filter((q) => q.redFlag).map((q) => q.id).sort();
    expect(red).toEqual(["belly_pain", "bleeding", "breathless", "chest_pain", "confusion", "dizzy", "less_urine", "vomiting"]);
  });
});

describe("recommendations", () => {
  const allRed: QuestionId[] = ["belly_pain", "vomiting", "bleeding", "dizzy", "less_urine", "breathless", "chest_pain", "confusion"];
  const anyRed = { ...day30, questions: [...day30.questions, "chest_pain", "confusion"] as QuestionId[] };

  it.each(allRed)("red flag '%s' = yes → urgent", (q) => {
    const rec = recommend(anyRed, { [q]: "yes" });
    expect(rec.level).toBe("urgent");
    expect(rec.redFlags).toEqual([QUESTION_BANK[q].short]);
    expect(rec.headline).toBe("Please see a doctor now");
  });

  it("a red flag answered yes ends the check-in at once (no scoring of the rest)", () => {
    let log = append([], startEpisode([], day30, SIM_START, ctx()));
    for (const q of ["fever", "body_pain"] as QuestionId[]) log = append(log, answerQuestion(deriveEpisode(log, day30.episodeId)!, q, "no", SIM_START, ctx()));
    const o = answerQuestion(deriveEpisode(log, day30.episodeId)!, "belly_pain", "yes", SIM_START, ctx());
    log = append(log, o);
    const s = deriveEpisode(log, day30.episodeId)!;
    expect(s.latest!.recommendation.level).toBe("urgent");
    expect(s.checkInDue).toBe(false);
  });

  it("sensor red flags: night SpO₂ < 92% or resting HR > 120 → urgent with no questions", () => {
    expect(sensorRedFlags(nightOf({ spo2: 91 }))).toHaveLength(1);
    expect(sensorRedFlags(nightOf({ restingHr: 121 }))).toHaveLength(1);
    expect(sensorRedFlags(nightOf({ spo2: 92, restingHr: 120 }))).toEqual([]);
    expect(sensorRedFlags(nightOf({ spo2: 85, valid: false }))).toEqual([]);
    const snap: EpisodeSnapshot = { ...day30, sensorFlags: sensorRedFlags(nightOf({ spo2: 90 })), questions: [] };
    const o = startEpisode([], snap, SIM_START, ctx());
    const rec = o.events.find((e) => e.type === "recommendation");
    expect(rec && rec.type === "recommendation" && rec.recommendation.level).toBe("urgent");
    expect(o.events.some((e) => e.type === "checkin_started")).toBe(false);
  });

  it("other symptoms → see a doctor within 24 h", () => {
    expect(recommend(day30, { fever: "yes" }).level).toBe("see_doctor");
    const rec = recommend(day30, { body_pain: "a_lot" });
    expect(rec).toMatchObject({ level: "see_doctor", symptoms: ["body or joint pain (a lot)"] });
  });

  it("no symptoms: dengue-like → still see a doctor (critical phase); other patterns → monitor, recheck in 12 h", () => {
    expect(recommend(day30, {}).level).toBe("see_doctor");
    const infection = { ...day30, patternId: "early_infection" as const };
    expect(recommend(infection, {})).toMatchObject({ level: "monitor", recheckHours: 12 });
    expect(recommend(infection, { body_pain: "a_little" }).level).toBe("see_doctor");
    expect(recommend(infection, { cough: "a_lot" }).level).toBe("monitor"); // not one of the questions asked
  });

  it("'what to tell the doctor' lists the readings, symptoms and past dengue", () => {
    const rec = recommend(day30, { fever: "yes" });
    expect(rec.tellDoctor[0]).toMatch(/^My heart rate during sleep was 78/);
    expect(rec.tellDoctor.join(" ")).toMatch(/What I feel: fever or chills/);
    expect(rec.tellDoctor.join(" ")).toMatch(/Past illness: Dengue fever \(Oct 2023/);
  });
});

describe("patient wording", () => {
  it("never says 'you have', never shows z-scores, never diagnoses", () => {
    const recs = [recommend(day30, {}), recommend(day30, { belly_pain: "yes" }), recommend(day30, { fever: "yes" }), recommend({ ...day30, patternId: "early_infection" }, {})];
    const texts = recs.flatMap((r) => patientTexts(day30, r));
    for (const t of texts) {
      expect(t, t).not.toMatch(/you have|you've got|diagnos/i);
      expect(t, t).not.toMatch(/\bz\b|z-score|z =|σ|SD\b/i);
    }
    expect(day30.explanation).toMatch(/can happen in some infections, including dengue/);
  });
});

describe("notifications and consent", () => {
  it("urgent: patient, doctor and emergency contact (SMS) are notified when consented, with the consent recorded", () => {
    const { last } = answerAll(day30, { belly_pain: "yes" });
    const byTo = Object.fromEntries(last.notifications.map((x) => [x.to, x]));
    expect(byTo.doctor).toMatchObject({ sent: true, consent: "notifyDoctorOnUrgent", channel: "in_app" });
    expect(byTo.emergency_contact).toMatchObject({ sent: true, consent: "notifyContactOnUrgent", channel: "sms", toName: expect.stringMatching(/Revathi R \(Mother\)/) });
    expect(byTo.emergency_contact.message).toBe("Prodrome alert: Karthik R's watch data and symptoms suggest seeing a doctor now. Please check on Karthik.");
    expect(byTo.patient).toMatchObject({ sent: true, consent: "patient_app" });
  });

  it("consent off → logged as 'not sent — consent off'", () => {
    let k = setConsent(settings.find((s) => s.patientId === "karthik")!, "notifyDoctorOnUrgent", false, "2026-10-01T00:00:00Z");
    k = setConsent(k, "notifyContactOnUrgent", false, "2026-10-01T00:00:00Z");
    const { last } = answerAll(day30, { belly_pain: "yes" }, ctx({ settings: k }));
    for (const to of ["doctor", "emergency_contact"]) {
      expect(last.notifications.find((x) => x.to === to)).toMatchObject({ sent: false, status: "not sent — consent off" });
    }
  });

  it("no emergency contact → 'not sent — no emergency contact'", () => {
    const k = { ...settings.find((s) => s.patientId === "karthik")!, emergencyContact: null };
    const { last } = answerAll(day30, { belly_pain: "yes" }, ctx({ settings: k }));
    expect(last.notifications.find((x) => x.to === "emergency_contact")!.status).toBe("not sent — no emergency contact");
  });

  it("see a doctor: the doctor's dashboard alert needs 'own care' consent", () => {
    const { last } = answerAll(day30, { fever: "yes" });
    expect(last.notifications.find((x) => x.to === "doctor")).toMatchObject({ consent: "ownCare", sent: true });
    expect(last.notifications.some((x) => x.to === "emergency_contact")).toBe(false);
  });
});

describe("escalation on the simulated clock", () => {
  const started = () => append([], startEpisode([], day30, SIM_START, ctx()));

  it("starts at Day 30, 07:00 IST", () => {
    expect(formatIst(simNow(0))).toBe("Mon 5 Oct, 07:00");
    expect(formatIst(simNow(6))).toBe("Mon 5 Oct, 13:00");
  });

  it("unanswered: nothing before 6 h, a reminder at 6 h, the emergency contact at 12 h — each once", () => {
    const log = started();
    expect(escalate(deriveEpisode(log, day30.episodeId)!, simNow(5.9), ctx()).events).toEqual([]);
    const at6 = escalate(deriveEpisode(log, day30.episodeId)!, simNow(6), ctx());
    expect(at6.events.map((e) => e.type)).toEqual(["reminder"]);
    expect(at6.notifications[0]).toMatchObject({ to: "patient", message: expect.stringMatching(/^Reminder/) });
    const log6 = append(log, at6);
    const at12 = escalate(deriveEpisode(log6, day30.episodeId)!, simNow(12), ctx());
    expect(at12.events.map((e) => e.type)).toEqual(["contact_escalation"]);
    expect(at12.notifications[0]).toMatchObject({ to: "emergency_contact", sent: true, at: simNow(12) });
    const log12 = append(log6, at12);
    expect(escalate(deriveEpisode(log12, day30.episodeId)!, simNow(30), ctx()).events).toEqual([]);
  });

  it("a big jump schedules both at their own times", () => {
    const o = escalate(deriveEpisode(started(), day30.episodeId)!, simNow(13), ctx());
    expect(o.events.map((e) => [e.type, e.at])).toEqual([
      ["reminder", simNow(6)],
      ["contact_escalation", simNow(12)],
    ]);
  });

  it("answered in time → no escalation", () => {
    const { log } = answerAll(day30, { fever: "yes" });
    expect(escalate(deriveEpisode(log, day30.episodeId)!, simNow(24), ctx()).events).toEqual([]);
  });

  it("watch disconnected > 6 h during an urgent episode → reminder, then contact at 12 h", () => {
    const { log } = answerAll(day30, { belly_pain: "yes" });
    const off = append(log, { events: [{ episodeId: day30.episodeId, patientId: "karthik", at: simNow(1), by: "Watch", type: "watch_off" }], notifications: [], newCase: null });
    expect(escalate(deriveEpisode(off, day30.episodeId)!, simNow(6.5), ctx()).events).toEqual([]);
    const o = escalate(deriveEpisode(off, day30.episodeId)!, simNow(13), ctx());
    expect(o.events.map((e) => [e.type, e.at])).toEqual([
      ["reminder", simNow(7)],
      ["contact_escalation", simNow(13)],
    ]);
    expect(o.notifications.at(-1)!.message).toMatch(/watch has been disconnected for over 12 hours/);
    const on = append(off, { events: [{ episodeId: day30.episodeId, patientId: "karthik", at: simNow(2), by: "Watch", type: "watch_on" }], notifications: [], newCase: null });
    expect(escalate(deriveEpisode(on, day30.episodeId)!, simNow(20), ctx()).events).toEqual([]);
  });

  it("monitor → a new check-in round 12 h later", () => {
    const snap = { ...day30, patternId: "early_infection" as const };
    const { log } = answerAll(snap, {});
    expect(deriveEpisode(log, snap.episodeId)!.latest!.recommendation.level).toBe("monitor");
    const o = escalate(deriveEpisode(log, snap.episodeId)!, addHours(SIM_START, 12), ctx());
    const next = deriveEpisode(append(log, o), snap.episodeId)!;
    expect(next).toMatchObject({ round: 2, checkInDue: true });
  });

  it("a dismissed episode never escalates", () => {
    const log = append(started(), { events: [{ episodeId: day30.episodeId, patientId: "karthik", at: SIM_START, by: "Dr. Meera Nair", type: "doctor_action", action: "dismissed", note: "Spoke to patient" }], notifications: [], newCase: null });
    expect(escalate(deriveEpisode(log, day30.episodeId)!, simNow(24), ctx()).events).toEqual([]);
  });
});

describe("one case per episode", () => {
  it("urgent / see_doctor creates a wearable case at 'alert_raised'; monitor doesn't", () => {
    const { last } = answerAll(day30, { belly_pain: "yes" });
    expect(last.newCase).toMatchObject({ stage: "alert_raised", origin: "wearable", episodeId: day30.episodeId, urgency: "urgent", panels: [] });
    expect(answerAll({ ...day30, patternId: "early_infection" }, {}).last.newCase).toBeNull();
  });

  it("no duplicate case for the same episode", () => {
    const input = { episodeId: "e1", patientId: "karthik", suspectedDisease: "Dengue", symptoms: "Fever", urgency: "urgent" as const, note: "", at: SIM_START };
    const first = createAlertCase([], input)!;
    expect(createAlertCase([first], input)).toBeNull();
    expect(createAlertCase([first], { ...input, episodeId: "e2" })).not.toBeNull();
  });

  it("starting the same episode twice does nothing the second time", () => {
    const log = append([], startEpisode([], day30, SIM_START, ctx()));
    expect(startEpisode(log, day30, SIM_START, ctx()).events).toEqual([]);
  });

  it("alert cases stay out of the lab case screens; the patient tracker starts with 'Prodrome noticed a change'", () => {
    const alert = answerAll(day30, { belly_pain: "yes" }).last.newCase!;
    expect(activeCase([...seedCases(), alert], "karthik")).toBeUndefined();
    expect(patientStepsFor(alert)[0].label).toBe("Prodrome noticed a change");
    expect(patientStepsFor({ origin: "doctor_order" })[0].label).toBe("Test ordered");
  });
});

describe("doctor alerts", () => {
  it("urgent first, then see_doctor; monitor and dismissed don't show", () => {
    const urgent = answerAll(day30, { belly_pain: "yes" }).log;
    const other = { ...day30, episodeId: "ravi-x", patientId: "ravi", patientName: "Ravi Kumar" };
    const seeDoc = answerAll(other, { fever: "yes" }).log;
    const alerts = openAlerts([...seeDoc, ...urgent], ["karthik", "ravi"]);
    expect(alerts.map((a) => [a.episode.patientId, a.level, a.hasRedFlag])).toEqual([
      ["karthik", "urgent", true],
      ["ravi", "see_doctor", false],
    ]);
    expect(openAlerts(urgent, ["ravi"])).toEqual([]);
    expect(allEpisodes(urgent, "karthik")).toHaveLength(1);
  });
});

describe("store: the Day 30 demo", () => {
  beforeEach(() => useInaraStore.getState().resetDemo());

  it("check-in → belly pain yes → urgent → notifications, alert case, doctor actions; reset check-in clears it", () => {
    const s = useInaraStore.getState();
    s.startWearableEpisode(day30);
    s.startWearableEpisode(day30); // idempotent
    let st = useInaraStore.getState();
    expect(allEpisodes(st.wearableEvents)).toHaveLength(1);
    expect(st.notifications.map((x) => x.message)).toEqual(["Prodrome noticed some changes — please answer a few quick questions."]);

    s.answerCheckIn(day30.episodeId, "fever", "yes");
    s.answerCheckIn(day30.episodeId, "body_pain", "a_little");
    s.answerCheckIn(day30.episodeId, "belly_pain", "yes");
    st = useInaraStore.getState();
    const ep = deriveEpisode(st.wearableEvents, day30.episodeId)!;
    expect(ep.latest!.recommendation.level).toBe("urgent");
    expect(st.cases.filter((c) => c.origin === "wearable")).toHaveLength(1);
    expect(st.notifications.filter((x) => x.sent).map((x) => x.to)).toEqual(["patient", "patient", "doctor", "emergency_contact"]);
    expect(openAlerts(st.wearableEvents, ["karthik"])).toHaveLength(1);

    s.doctorAlertAction(day30.episodeId, "acknowledged");
    s.doctorAlertAction(day30.episodeId, "called", "Advised to go to the hospital now");
    expect(deriveEpisode(useInaraStore.getState().wearableEvents, day30.episodeId)!.doctorActions.map((a) => a.note ?? a.action)).toEqual([
      "acknowledged",
      "Advised to go to the hospital now",
    ]);
    s.doctorAlertAction(day30.episodeId, "dismissed", "Seen in clinic");
    expect(openAlerts(useInaraStore.getState().wearableEvents, ["karthik"])).toEqual([]);

    s.resetCheckIn("karthik");
    st = useInaraStore.getState();
    expect(st.wearableEvents).toEqual([]);
    expect(st.notifications).toEqual([]);
    expect(st.cases.some((c) => c.origin === "wearable")).toBe(false);
    expect(st.simHours).toBe(0);
  });

  it("+6 h → reminder; +6 h more → emergency contact SMS; watch off + 12 h → contact again", () => {
    const s = useInaraStore.getState();
    s.startWearableEpisode(day30);
    s.advanceSimClock(6);
    expect(useInaraStore.getState().notifications.at(-1)!.message).toMatch(/^Reminder/);
    s.advanceSimClock(6);
    expect(useInaraStore.getState().notifications.at(-1)).toMatchObject({ to: "emergency_contact", sent: true });
    s.answerCheckIn(day30.episodeId, "belly_pain", "yes");
    s.setWatchWorn("karthik", false);
    s.advanceSimClock(12);
    const msgs = useInaraStore.getState().notifications.map((x) => x.message);
    expect(msgs.some((m) => /watch has been disconnected/.test(m))).toBe(true);
  });
});
