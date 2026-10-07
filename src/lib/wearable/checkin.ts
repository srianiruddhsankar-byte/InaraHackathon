// Wearable check-ins, red flags, recommendations, escalation and notifications.
// Pure functions — the store only appends what these return.
//
// Flow for the current day (Day 30 in the demo):
//   top pattern "watch"      → no questions ("Prodrome is keeping a closer eye")
//   top pattern "concerning" → an episode starts with a symptom check-in
//   sensor red flag          → urgent straight away (no questions)
// Answers → recommendation (monitor / see_doctor / urgent) → notifications
// (only where consent allows; otherwise logged as "not sent") → a case at
// "alert_raised" for see_doctor / urgent (one per episode).
// Unanswered check-ins and a disconnected watch escalate on a simulated clock:
// reminder at 6 h, emergency contact at 12 h.
//
// Everything is an append-only event log; the current state is derived from it.
import { symptomList } from "../presenting";
import type { Case, ConsentKey, PatientSettings } from "../types";
import { createAlertCase } from "../workflow";
import type { NightEvaluation } from "./baseline";
import { conditionById, QUESTION_BANK, SUSPECTED_DISEASE, SYMPTOM_NAME, type ConditionId, type QuestionId, type Threshold } from "./conditions";
import type { Detection } from "./detect";
import type { DoctorOutcome, PopulationStatus } from "./outcomes";
import { dayDate, type NightSummary } from "./types";
import type { WeatherAdjustedDay } from "./weather";

export const CHECKIN = {
  maxQuestions: { value: 6, reason: "Short enough to answer when unwell; red-flag questions are never cut, so it can be longer." },
  reminderHours: { value: 6, reason: "A concerning pattern shouldn't wait more than a few hours for an answer." },
  contactHours: { value: 12, reason: "Half a day without a response during a concerning episode → someone should check in person." },
  recheckHours: { value: 12, reason: "'Monitor' means check again in 12 hours." },
  sensorSpo2: { value: 92, reason: "Night SpO₂ below 92% needs urgent assessment (BTS)." },
  sensorHr: { value: 120, reason: "A resting heart rate above 120 bpm during sleep is a red flag on its own." },
} satisfies Record<string, Threshold>;

/** The simulated clock starts on Day 30 at 07:00 IST, after the night's data has been analysed. */
export const SIM_START = "2026-10-05T01:30:00.000Z";

const HOUR = 3_600_000;

export function simNow(hours: number): string {
  return new Date(Date.parse(SIM_START) + hours * HOUR).toISOString();
}

export function addHours(iso: string, hours: number): string {
  return new Date(Date.parse(iso) + hours * HOUR).toISOString();
}

export function hoursBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / HOUR;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Mon 5 Oct, 07:00" in India time, whatever the viewer's time zone. */
export function formatIst(iso: string): string {
  const d = new Date(Date.parse(iso) + 5.5 * HOUR);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${hh}:${mm}`;
}

// ---- Questions ---------------------------------------------------------------------

export type Answer = "no" | "yes" | "a_little" | "a_lot";

export const ANSWER_LABEL: Record<Answer, string> = { no: "No", yes: "Yes", a_little: "A little", a_lot: "A lot" };

export const isYes = (a: Answer | undefined) => a !== undefined && a !== "no";

/**
 * Questions for the top 1–2 patterns: the top pattern's first, then the
 * second's, no duplicates. At most 6, except red-flag questions, which are
 * never cut (safety first).
 */
export function selectQuestions(patternIds: ConditionId[]): QuestionId[] {
  const out: QuestionId[] = [];
  for (const id of patternIds.slice(0, 2).flatMap((p) => conditionById(p).questionIds)) {
    if (out.includes(id)) continue;
    if (QUESTION_BANK[id].redFlag || out.length < CHECKIN.maxQuestions.value) out.push(id);
  }
  return out;
}

/** Sensor red flags on the night: SpO₂ < 92% or resting HR > 120 bpm. Plain words. */
export function sensorRedFlags(night: NightSummary | undefined): string[] {
  if (!night?.valid) return [];
  const flags: string[] = [];
  if (night.spo2 !== null && night.spo2 < CHECKIN.sensorSpo2.value) {
    flags.push(`blood oxygen during sleep was ${night.spo2.toFixed(0)}% (below ${CHECKIN.sensorSpo2.value}%)`);
  }
  if (night.restingHr !== null && night.restingHr > CHECKIN.sensorHr.value) {
    flags.push(`heart rate during sleep was ${night.restingHr.toFixed(0)} beats a minute (above ${CHECKIN.sensorHr.value})`);
  }
  return flags;
}

// ---- Episode snapshot (what was noticed, frozen when the episode starts) ------------------------

export interface EpisodeSnapshot {
  episodeId: string;
  patientId: string;
  patientName: string;
  /** 1-based day in the window. */
  day: number;
  date: string;
  patternId: ConditionId;
  patternName: string;
  patternLevel: "watch" | "concerning";
  secondPatternId?: ConditionId;
  /** Doctor-facing evidence, e.g. "Night HR 78 vs usual 56 (+22)". */
  evidence: string[];
  supportingFactors: string[];
  suggestedLabTests: string[];
  /** Patient-facing "what we noticed" — plain words, no z-scores. */
  noticed: string[];
  /** Patient-facing "what this can mean" — never a diagnosis. */
  explanation: string;
  sensorFlags: string[];
  questions: QuestionId[];
  pastIllnesses: string[];
}

/** Plain-language "what we noticed" from the night's numbers (no z-scores, no jargon). */
export function patientNoticed(nights: NightEvaluation[], i: number, weatherDay: WeatherAdjustedDay | undefined): string[] {
  const n = nights[i];
  if (!n) return [];
  const out: string[] = [];
  const hr = n.night.restingHr;
  const usualHr = n.baseline.restingHr?.median;
  if (hr !== null && usualHr !== undefined && hr - usualHr >= 5) {
    out.push(`Your heart rate during sleep was ${hr.toFixed(0)} beats a minute — usually it is about ${usualHr.toFixed(0)}.`);
  }
  if ((n.z.hrv ?? 0) <= -1.5) out.push("Your heart rate variability, a sign of how well your body is recovering, was lower than usual.");
  const raisedBefore = nights.slice(Math.max(0, i - 3), i).some((e) => (e.z.skinTemp ?? 0) >= 1.5);
  const skin = n.z.skinTemp ?? 0;
  if (skin >= 1.5) out.push("Your skin temperature at night was higher than usual.");
  else if (raisedBefore && skin < 1) out.push("Your skin temperature was raised for a few nights and has now come back down.");
  const spo2 = n.night.spo2;
  const usualSpo2 = n.baseline.spo2?.median;
  if (spo2 !== null && usualSpo2 !== undefined && (usualSpo2 - spo2 >= 3 || spo2 < 94)) {
    out.push(`Your blood oxygen during sleep was lower than usual (${spo2.toFixed(0)}%).`);
  }
  if (weatherDay?.residual !== null && weatherDay?.residual !== undefined && weatherDay.residual >= 5) {
    out.push("Your daytime heart rate was higher than the weather explains.");
  }
  return out;
}

export function episodeIdFor(patientId: string, day: number): string {
  return `${patientId}-${dayDate(day - 1)}`;
}

/**
 * The snapshot that starts an episode on `day`, or null when nothing needs a
 * check-in (top pattern not concerning and no sensor red flag).
 */
export function buildSnapshot(input: {
  patient: { id: string; name: string; pastIllnesses?: string[] };
  detection: Detection;
  nights: NightEvaluation[];
  weather: WeatherAdjustedDay[];
  day: number;
}): EpisodeSnapshot | null {
  const { patient, detection, nights, day } = input;
  const i = day - 1;
  const sensorFlags = sensorRedFlags(nights[i]?.night);
  const patterns = detection.status === "ok" ? detection.patterns : [];
  const top = patterns[0];
  if (!sensorFlags.length && top?.level !== "concerning") return null;
  // A sensor red flag with no pattern: treat as high resting HR / respiratory by what fired.
  const patternId: ConditionId = top?.id ?? (sensorFlags.some((f) => f.startsWith("blood oxygen")) ? "respiratory" : "high_resting_hr");
  const condition = conditionById(patternId);
  const second = patterns[1]?.id;
  return {
    episodeId: episodeIdFor(patient.id, day),
    patientId: patient.id,
    patientName: patient.name,
    day,
    date: dayDate(i),
    patternId,
    patternName: condition.name,
    patternLevel: "concerning",
    secondPatternId: second,
    evidence: top?.evidence ?? [],
    supportingFactors: top?.supportingFactors ?? [],
    suggestedLabTests: condition.suggestedLabTests.map((l) => l.label),
    noticed: patientNoticed(nights, i, input.weather[i]),
    explanation: condition.patientExplanation,
    sensorFlags,
    questions: sensorFlags.length ? [] : selectQuestions(second ? [patternId, second] : [patternId]),
    pastIllnesses: patient.pastIllnesses ?? [],
  };
}

/** What the patient sees for a "watch" day (no questions yet). */
export const WATCH_MESSAGE = "Prodrome is keeping a closer eye — we'll check again tomorrow.";

// ---- Recommendation ----------------------------------------------------------------

export type RecommendationLevel = "monitor" | "see_doctor" | "urgent";

export interface Recommendation {
  level: RecommendationLevel;
  headline: string;
  whatWeNoticed: string[];
  why: string;
  /** Red flags in plain words (answered yes, or from the sensor). */
  redFlags: string[];
  /** Other symptoms answered yes, e.g. "body or joint pain (a lot)". */
  symptoms: string[];
  /** For the doctor's appointment. */
  tellDoctor: string[];
  /** Monitor: hours until the next check. */
  recheckHours?: number;
}

export const HEADLINE: Record<RecommendationLevel, string> = {
  urgent: "Please see a doctor now",
  see_doctor: "Please see a doctor within 24 hours",
  monitor: "Keep an eye on how you feel — we'll check again in 12 hours",
};

const list = (items: string[]) => (items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

/**
 * Pure: pattern + answers (+ sensor flags) → recommendation.
 *  - any red flag (answer or sensor) → urgent
 *  - any other symptom → see_doctor
 *  - no symptoms: dengue-like → see_doctor (critical phase needs daily review, WHO); otherwise monitor
 */
export function recommend(snapshot: EpisodeSnapshot, answers: Partial<Record<QuestionId, Answer>>): Recommendation {
  const yes = snapshot.questions.filter((id) => isYes(answers[id]));
  const redFlags = [...snapshot.sensorFlags.map((f) => `your ${f}`), ...yes.filter((id) => QUESTION_BANK[id].redFlag).map((id) => QUESTION_BANK[id].short)];
  const symptoms = yes
    .filter((id) => !QUESTION_BANK[id].redFlag)
    .map((id) => {
      const a = answers[id]!;
      return a === "yes" ? QUESTION_BANK[id].short : `${QUESTION_BANK[id].short} (${ANSWER_LABEL[a].toLowerCase()})`;
    });
  let level: RecommendationLevel;
  let why: string;
  if (redFlags.length) {
    level = "urgent";
    why = `${snapshot.sensorFlags.length && !yes.length ? "Your watch showed that" : "You told us about"} ${list(redFlags)}. ${snapshot.explanation} Together with the changes in your watch readings, this needs a doctor now — please don't wait until tomorrow.`;
  } else if (symptoms.length) {
    level = "see_doctor";
    why = `You told us about ${list(symptoms)}. ${snapshot.explanation} A doctor can check you and may suggest a simple blood test.`;
  } else if (snapshot.patternId === "dengue_like") {
    level = "see_doctor";
    why = `It's good that you feel well. ${snapshot.explanation} Even without symptoms, a doctor should check you within a day while this settles.`;
  } else {
    level = "monitor";
    why = `You don't feel any of the things we asked about. ${snapshot.explanation} We'll keep watching your readings and ask again in 12 hours. If you start to feel unwell, contact your doctor.`;
  }
  const tellDoctor = [
    ...snapshot.noticed.map((n) => n.replace(/^Your /, "My ")),
    symptoms.length || redFlags.length ? `What I feel: ${list([...redFlags, ...symptoms])}.` : "I don't have any of the symptoms Prodrome asked about.",
    ...snapshot.pastIllnesses.map((p) => `Past illness: ${p}.`),
  ];
  return {
    level,
    headline: HEADLINE[level],
    whatWeNoticed: snapshot.noticed,
    why,
    redFlags,
    symptoms,
    tellDoctor,
    recheckHours: level === "monitor" ? CHECKIN.recheckHours.value : undefined,
  };
}

/** Every piece of text a patient sees for a recommendation (used by the wording tests). */
export function patientTexts(snapshot: EpisodeSnapshot, rec?: Recommendation): string[] {
  const questions = snapshot.questions.map((id) => QUESTION_BANK[id].text);
  return [...snapshot.noticed, snapshot.explanation, WATCH_MESSAGE, ...questions, ...(rec ? [rec.headline, rec.why, ...rec.tellDoctor] : [])];
}

// ---- Event log ---------------------------------------------------------------------

export type DoctorAction = "acknowledged" | "called" | "dismissed";
export type EscalationReason = "unanswered" | "disconnected" | "recheck";

export type WearableEvent = { id: string; episodeId: string; patientId: string; at: string; by: string } & (
  | { type: "episode_started"; snapshot: EpisodeSnapshot }
  | { type: "checkin_started"; round: number }
  | { type: "answer"; round: number; questionId: QuestionId; answer: Answer }
  | { type: "recommendation"; round: number; recommendation: Recommendation }
  | { type: "reminder"; reason: EscalationReason; key: string }
  | { type: "contact_escalation"; reason: EscalationReason; key: string }
  | { type: "watch_off" }
  | { type: "watch_on" }
  | { type: "doctor_action"; action: DoctorAction; note?: string }
  /** The doctor recorded what the alert turned out to be; closes the episode. */
  | { type: "outcome"; outcome: DoctorOutcome; population: PopulationStatus; recordId?: string }
);

/** Distributive Omit, so each event variant keeps its own fields. */
export type NewWearableEvent = WearableEvent extends infer E ? (E extends WearableEvent ? Omit<E, "id"> : never) : never;

export type Recipient = "patient" | "emergency_contact" | "doctor";

export interface NotificationEntry {
  id: string;
  episodeId: string;
  patientId: string;
  to: Recipient;
  toName: string;
  channel: "sms" | "in_app";
  message: string;
  at: string;
  /** The consent that allowed it ("patient_app" = the patient's own app, always allowed). */
  consent: ConsentKey | "patient_app";
  sent: boolean;
  /** "sent", "not sent — consent off", "not sent — no emergency contact". */
  status: string;
}

export type NewNotification = Omit<NotificationEntry, "id">;

export interface EpisodeState {
  episodeId: string;
  patientId: string;
  snapshot: EpisodeSnapshot;
  startedAt: string;
  /** Check-in round (1 = first; a monitor result starts round 2 after 12 h). 0 = no questions. */
  round: number;
  roundStartedAt: string | null;
  /** This round's answers (latest answer per question wins). */
  answers: Partial<Record<QuestionId, Answer>>;
  /** Latest recommendation (any round), with when it was given. */
  latest: { recommendation: Recommendation; at: string; round: number } | null;
  /** Questions are waiting for answers in the current round. */
  checkInDue: boolean;
  watchOffAt: string | null;
  doctorActions: Extract<WearableEvent, { type: "doctor_action" }>[];
  acknowledged: boolean;
  dismissed: boolean;
  /** The doctor's recorded outcome (first one wins — one per episode). */
  outcome: Extract<WearableEvent, { type: "outcome" }> | null;
  /** Closed by an outcome: no more alerts, check-ins or escalations. */
  closed: boolean;
  events: WearableEvent[];
}

const byTime = (a: { at: string }, b: { at: string }) => a.at.localeCompare(b.at);

/** Fold the log into the current state of one episode (null if it never started). */
export function deriveEpisode(log: WearableEvent[], episodeId: string): EpisodeState | null {
  const events = log.filter((e) => e.episodeId === episodeId).sort(byTime);
  const start = events.find((e) => e.type === "episode_started");
  if (!start || start.type !== "episode_started") return null;
  let round = 0;
  let roundStartedAt: string | null = null;
  let answers: Partial<Record<QuestionId, Answer>> = {};
  let latest: EpisodeState["latest"] = null;
  let watchOffAt: string | null = null;
  for (const e of events) {
    if (e.type === "checkin_started") {
      round = e.round;
      roundStartedAt = e.at;
      answers = {};
    } else if (e.type === "answer" && e.round === round) answers = { ...answers, [e.questionId]: e.answer };
    else if (e.type === "recommendation") latest = { recommendation: e.recommendation, at: e.at, round: e.round };
    else if (e.type === "watch_off") watchOffAt = e.at;
    else if (e.type === "watch_on") watchOffAt = null;
  }
  const doctorActions = events.filter((e): e is Extract<WearableEvent, { type: "doctor_action" }> => e.type === "doctor_action");
  const answeredThisRound = latest !== null && latest.round === round;
  const outcome = (events.find((e) => e.type === "outcome") as Extract<WearableEvent, { type: "outcome" }> | undefined) ?? null;
  return {
    episodeId,
    patientId: start.patientId,
    snapshot: start.snapshot,
    startedAt: start.at,
    round,
    roundStartedAt,
    answers,
    latest,
    checkInDue: round > 0 && !answeredThisRound && !outcome,
    watchOffAt,
    doctorActions,
    acknowledged: doctorActions.some((a) => a.action === "acknowledged" || a.action === "called"),
    dismissed: doctorActions.some((a) => a.action === "dismissed"),
    outcome,
    closed: !!outcome,
    events,
  };
}

/** All episodes in the log, newest first. */
export function allEpisodes(log: WearableEvent[], patientId?: string): EpisodeState[] {
  const ids = [...new Set(log.filter((e) => e.type === "episode_started" && (!patientId || e.patientId === patientId)).map((e) => e.episodeId))];
  return ids
    .map((id) => deriveEpisode(log, id)!)
    .filter(Boolean)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

// ---- Transitions (pure: return what to append) --------------------------------------------

export interface Ctx {
  patient: { id: string; name: string };
  settings: PatientSettings | undefined;
  doctorName: string;
  cases: Case[];
}

export interface Outcome {
  events: NewWearableEvent[];
  notifications: NewNotification[];
  newCase: Case | null;
}

const EMPTY: Outcome = { events: [], notifications: [], newCase: null };

function notify(
  ep: { episodeId: string; patientId: string },
  ctx: Ctx,
  to: Recipient,
  message: string,
  at: string,
  consent: ConsentKey | "patient_app",
): NewNotification {
  const base = { episodeId: ep.episodeId, patientId: ep.patientId, to, message, at, consent };
  if (to === "patient") return { ...base, toName: ctx.patient.name, channel: "in_app", sent: true, status: "sent" };
  if (to === "doctor") {
    const ok = consent !== "patient_app" && !!ctx.settings?.[consent].granted;
    return { ...base, toName: ctx.doctorName, channel: "in_app", sent: ok, status: ok ? "sent" : "not sent — consent off" };
  }
  const contact = ctx.settings?.emergencyContact;
  if (!contact) return { ...base, toName: "Emergency contact", channel: "sms", sent: false, status: "not sent — no emergency contact" };
  const ok = !!ctx.settings?.notifyContactOnUrgent.granted;
  return {
    ...base,
    toName: `${contact.name} (${contact.relation}) · ${contact.phone}`,
    channel: "sms",
    sent: ok,
    status: ok ? "sent" : "not sent — consent off",
  };
}

export const CHECKIN_PROMPT = "Prodrome noticed some changes — please answer a few quick questions.";

/** Start the episode (idempotent). Sensor red flags skip the questions and go straight to urgent. */
export function startEpisode(log: WearableEvent[], snapshot: EpisodeSnapshot, at: string, ctx: Ctx): Outcome {
  if (log.some((e) => e.episodeId === snapshot.episodeId && e.type === "episode_started")) return EMPTY;
  const ids = { episodeId: snapshot.episodeId, patientId: snapshot.patientId };
  const started: NewWearableEvent = { ...ids, at, by: "Prodrome", type: "episode_started", snapshot };
  if (snapshot.questions.length === 0) {
    const fin = finalize({ snapshot, round: 0, answers: {}, ...ids }, at, ctx);
    return { ...fin, events: [started, ...fin.events] };
  }
  return {
    events: [started, { ...ids, at, by: "Prodrome", type: "checkin_started", round: 1 }],
    notifications: [notify(ids, ctx, "patient", CHECKIN_PROMPT, at, "patient_app")],
    newCase: null,
  };
}

/** Record one answer; when the round is complete, add the recommendation and its notifications. */
export function answerQuestion(state: EpisodeState, questionId: QuestionId, answer: Answer, at: string, ctx: Ctx): Outcome {
  if (!state.checkInDue || !state.snapshot.questions.includes(questionId)) return EMPTY;
  const ids = { episodeId: state.episodeId, patientId: state.patientId };
  const ev: NewWearableEvent = { ...ids, at, by: ctx.patient.name, type: "answer", round: state.round, questionId, answer };
  const answers = { ...state.answers, [questionId]: answer };
  // A red flag answered "yes" → urgent immediately, without waiting for the rest.
  const redFlagYes = QUESTION_BANK[questionId].redFlag && isYes(answer);
  if (!redFlagYes && !state.snapshot.questions.every((q) => answers[q] !== undefined)) return { events: [ev], notifications: [], newCase: null };
  const fin = finalize({ snapshot: state.snapshot, round: state.round, answers, ...ids }, at, ctx);
  return { ...fin, events: [ev, ...fin.events] };
}

/** The yes answers as presenting symptoms, in the order asked: "Fever, body pain, belly pain" ("" = none). */
export function checkinSymptoms(questions: QuestionId[], answers: Partial<Record<QuestionId, Answer>>): string {
  return symptomList(questions.filter((id) => isYes(answers[id])).flatMap((id) => SYMPTOM_NAME[id] ?? []));
}

function finalize(
  s: { snapshot: EpisodeSnapshot; round: number; answers: Partial<Record<QuestionId, Answer>>; episodeId: string; patientId: string },
  at: string,
  ctx: Ctx,
): Outcome {
  const rec = recommend(s.snapshot, s.answers);
  const ids = { episodeId: s.episodeId, patientId: s.patientId };
  const name = s.snapshot.patientName;
  const notifications: NewNotification[] = [notify(ids, ctx, "patient", `${rec.headline}.`, at, "patient_app")];
  if (rec.level === "urgent") {
    const flags = rec.redFlags.length ? ` Red flags: ${list(rec.redFlags.map((f) => f.replace(/^your /, "")))}.` : "";
    notifications.push(
      notify(ids, ctx, "doctor", `Urgent wearable alert: ${name} — ${s.snapshot.patternName} (concerning).${flags} Patient advised to see a doctor now.`, at, "notifyDoctorOnUrgent"),
      notify(ids, ctx, "emergency_contact", `Prodrome alert: ${name}'s watch data and symptoms suggest seeing a doctor now. Please check on ${name.split(" ")[0]}.`, at, "notifyContactOnUrgent"),
    );
  } else if (rec.level === "see_doctor") {
    notifications.push(
      notify(ids, ctx, "doctor", `Wearable alert: ${name} — ${s.snapshot.patternName} (concerning). Patient advised to see a doctor within 24 hours.`, at, "ownCare"),
    );
  }
  const newCase =
    rec.level === "monitor"
      ? null
      : createAlertCase(ctx.cases, {
          episodeId: s.episodeId,
          patientId: s.patientId,
          suspectedDisease: SUSPECTED_DISEASE[s.snapshot.patternId],
          symptoms: checkinSymptoms(s.snapshot.questions, s.answers),
          urgency: rec.level === "urgent" ? "urgent" : "routine",
          note: `${rec.headline}. ${s.snapshot.patternName}${rec.redFlags.length ? ` · red flags: ${list(rec.redFlags.map((f) => f.replace(/^your /, "")))}` : ""}`,
          at,
        });
  return { events: [{ ...ids, at, by: "Prodrome", type: "recommendation", round: s.round, recommendation: rec }], notifications, newCase };
}

/**
 * Escalations due by `now` that haven't happened yet (each once, at its
 * scheduled time):
 *  - unanswered check-in: reminder at 6 h, emergency contact at 12 h
 *  - watch disconnected during a concerning / urgent episode: same ladder
 *  - after "monitor": a new check-in round at 12 h
 */
export function escalate(state: EpisodeState, now: string, ctx: Ctx): Outcome {
  if (state.dismissed || state.closed) return EMPTY;
  const ids = { episodeId: state.episodeId, patientId: state.patientId };
  const done = (type: "reminder" | "contact_escalation", key: string) => state.events.some((e) => e.type === type && e.key === key);
  const events: NewWearableEvent[] = [];
  const notifications: NewNotification[] = [];
  const first = state.snapshot.patientName.split(" ")[0];
  const name = state.snapshot.patientName;

  const ladder = (reason: EscalationReason, since: string, key: string, reminder: string, sms: string) => {
    const remindAt = addHours(since, CHECKIN.reminderHours.value);
    const contactAt = addHours(since, CHECKIN.contactHours.value);
    if (now >= remindAt && !done("reminder", key)) {
      events.push({ ...ids, at: remindAt, by: "Prodrome", type: "reminder", reason, key });
      notifications.push(notify(ids, ctx, "patient", reminder, remindAt, "patient_app"));
    }
    if (now >= contactAt && !done("contact_escalation", key)) {
      events.push({ ...ids, at: contactAt, by: "Prodrome", type: "contact_escalation", reason, key });
      notifications.push(notify(ids, ctx, "emergency_contact", sms, contactAt, "notifyContactOnUrgent"));
    }
  };

  if (state.checkInDue && state.roundStartedAt) {
    ladder(
      "unanswered",
      state.roundStartedAt,
      `unanswered-r${state.round}`,
      `Reminder: ${CHECKIN_PROMPT}`,
      `Prodrome alert: ${name} hasn't answered a health check-in for 12 hours after the watch noticed changes. Please check on ${first}.`,
    );
  }
  const serious = state.latest ? state.latest.recommendation.level !== "monitor" : state.snapshot.patternLevel === "concerning";
  if (state.watchOffAt && serious) {
    ladder(
      "disconnected",
      state.watchOffAt,
      `disconnected-${state.watchOffAt}`,
      "Reminder: your watch has been disconnected for 6 hours. Please put it back on so Prodrome can keep watching.",
      `Prodrome alert: ${name}'s watch has been disconnected for over 12 hours during a health alert. Please check on ${first}.`,
    );
  }
  const latest = state.latest;
  if (latest && latest.round === state.round && latest.recommendation.level === "monitor") {
    const at = addHours(latest.at, CHECKIN.recheckHours.value);
    if (now >= at) {
      const key = `recheck-r${state.round + 1}`;
      events.push({ ...ids, at, by: "Prodrome", type: "reminder", reason: "recheck", key });
      events.push({ ...ids, at, by: "Prodrome", type: "checkin_started", round: state.round + 1 });
      notifications.push(notify(ids, ctx, "patient", "Time for your follow-up check-in — a few quick questions.", at, "patient_app"));
    }
  }
  events.sort(byTime);
  notifications.sort(byTime);
  return { events, notifications, newCase: null };
}

// ---- Doctor's view ---------------------------------------------------------------------

export interface WearableAlert {
  episode: EpisodeState;
  level: Exclude<RecommendationLevel, "monitor">;
  at: string;
  hasRedFlag: boolean;
}

/** Open alerts (urgent first, then see_doctor; newest first within a level). Dismissed ones drop off. */
export function openAlerts(log: WearableEvent[], patientIds: string[]): WearableAlert[] {
  const alerts: WearableAlert[] = [];
  for (const ep of allEpisodes(log)) {
    if (!patientIds.includes(ep.patientId) || ep.dismissed || ep.closed || !ep.latest) continue;
    const level = ep.latest.recommendation.level;
    if (level === "monitor") continue;
    alerts.push({ episode: ep, level, at: ep.latest.at, hasRedFlag: ep.latest.recommendation.redFlags.length > 0 });
  }
  return alerts.sort((a, b) => (a.level !== b.level ? (a.level === "urgent" ? -1 : 1) : b.at.localeCompare(a.at)));
}
