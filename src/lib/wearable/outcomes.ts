// The learning loop: the doctor records what an alert turned out to be, and —
// only with the patient's population-share consent — an anonymised outcome is
// added to the local population data (a store overlay on top of
// population.json). Local stats (cases per 1,000 people, alert precision per
// pattern) update from it. Pure functions only.
import type { PatientSettings } from "../types";
import type { EpisodeState, NewWearableEvent } from "./checkin";
import { conditionById, type ConditionId, type PrevalenceKey } from "./conditions";
import { ladderFor, type PopulationDb, type PopulationLevel } from "./population";

export type { LevelOutcomes } from "./population";

/** What the doctor recorded. One per episode, append-only (an "outcome" event in the wearable log). */
export interface DoctorOutcome {
  kind: "confirmed" | "ruled_out" | "other";
  /** "confirmed" only: the condition confirmed. */
  condition?: PrevalenceKey;
  /** "confirmed" only: confirmed by a lab test (e.g. NS1 positive), not only clinically. */
  labConfirmed: boolean;
  /** "other" only: the doctor's diagnosis, free text. */
  otherText?: string;
}

export const OUTCOME_CONDITIONS: { key: PrevalenceKey; label: string }[] = [
  { key: "dengue", label: "Dengue" },
  { key: "febrile_illness", label: "Viral infection" },
  { key: "respiratory", label: "Respiratory infection" },
  { key: "heat_illness", label: "Heat illness" },
];

export function conditionLabel(key: PrevalenceKey): string {
  return OUTCOME_CONDITIONS.find((c) => c.key === key)?.label ?? key;
}

/** The condition an alert pattern points to (pre-selected in the outcome form). */
export function conditionForPattern(patternId: ConditionId): PrevalenceKey | undefined {
  return conditionById(patternId).prevalenceKey;
}

/** "Confirmed: Dengue (lab-confirmed)", "Ruled out", "Other diagnosis: Typhoid". */
export function outcomeLabel(o: DoctorOutcome): string {
  if (o.kind === "ruled_out") return "Ruled out";
  if (o.kind === "other") return `Other diagnosis: ${o.otherText?.trim() || "—"}`;
  return `Confirmed: ${o.condition ? conditionLabel(o.condition) : "—"}${o.labConfirmed ? " (lab-confirmed)" : ""}`;
}

/** A recorded outcome must be complete: a condition when confirmed, text for "other". */
export function isOutcomeValid(o: DoctorOutcome): boolean {
  if (o.kind === "confirmed") return !!o.condition;
  if (o.kind === "other") return !!o.otherText?.trim();
  return true;
}

/** Did the alert's pattern turn out right? (Dengue-like alert + confirmed dengue = yes.) */
export function alertConfirmed(o: DoctorOutcome, patternId: ConditionId): boolean {
  return o.kind === "confirmed" && !!o.condition && o.condition === conditionForPattern(patternId);
}

/**
 * The anonymised record added to the population data: place, month, the alert
 * pattern and what it turned out to be. No name, no patient ID, no dates finer
 * than the month.
 */
export interface AnonymisedOutcome {
  /** Random id, not linked to the patient. */
  id: string;
  area?: string;
  city?: string;
  /** "2026-10" */
  month: string;
  patternId: ConditionId;
  /** The confirmed condition (counts towards local cases); absent if ruled out / other. */
  condition?: PrevalenceKey;
  /** The alert pattern was confirmed. */
  confirmed: boolean;
  labConfirmed: boolean;
}

export function anonymiseOutcome(
  o: DoctorOutcome,
  input: { id: string; area?: string; city?: string; date: string; patternId: ConditionId },
): AnonymisedOutcome {
  const record: AnonymisedOutcome = {
    id: input.id,
    month: input.date.slice(0, 7),
    patternId: input.patternId,
    confirmed: alertConfirmed(o, input.patternId),
    labConfirmed: o.kind === "confirmed" && o.labConfirmed,
  };
  if (input.area) record.area = input.area;
  if (input.city) record.city = input.city;
  if (o.kind === "confirmed" && o.condition) record.condition = o.condition;
  return record;
}

/** Population-share consent decides whether the outcome is added. */
export const POPULATION_STATUS = { added: "added to local population data", consentOff: "not added — consent off" } as const;
export type PopulationStatus = (typeof POPULATION_STATUS)[keyof typeof POPULATION_STATUS];

/** Share of alerts confirmed, in whole percent; null when there are no alerts yet. */
export function precision(confirmed: number, alerts: number): number | null {
  return alerts > 0 ? Math.round((confirmed / alerts) * 100) : null;
}

/** Cases per 1,000 people, 1 decimal. */
export function per1000(cases: number, people: number): number {
  return people > 0 ? Math.round((cases / people) * 10000) / 10 : 0;
}

export interface OutcomeStats {
  levelName: string;
  /** Consenting people the rate is over. */
  people: number;
  month: string;
  condition: PrevalenceKey;
  cases: number;
  per1000: number;
  patternId: ConditionId;
  alerts: number;
  confirmed: number;
  precision: number | null;
}

/** Does an anonymised record belong to this level (its area, city or any level above)? */
function inLevel(db: PopulationDb, r: AnonymisedOutcome, level: PopulationLevel): boolean {
  return ladderFor(db, { area: r.area, city: r.city }).some((l) => l.id === level.id);
}

/** Local stats at a level: base counts from population.json plus the overlay records. */
export function outcomeStats(
  db: PopulationDb,
  overlay: AnonymisedOutcome[],
  q: { levelId: string; people: number; month: string; condition: PrevalenceKey; patternId: ConditionId },
): OutcomeStats | null {
  const level = db.levels.find((l) => l.id === q.levelId);
  if (!level) return null;
  const base = level.outcomes ?? {};
  const mine = overlay.filter((r) => inLevel(db, r, level));
  const cases = (base.cases?.[q.condition]?.[q.month] ?? 0) + mine.filter((r) => r.condition === q.condition && r.month === q.month).length;
  const b = base.alerts?.[q.patternId] ?? { alerts: 0, confirmed: 0 };
  const forPattern = mine.filter((r) => r.patternId === q.patternId);
  const alerts = b.alerts + forPattern.length;
  const confirmed = b.confirmed + forPattern.filter((r) => r.confirmed).length;
  return {
    levelName: level.name,
    people: q.people,
    month: q.month,
    condition: q.condition,
    cases,
    per1000: per1000(cases, q.people),
    patternId: q.patternId,
    alerts,
    confirmed,
    precision: precision(confirmed, alerts),
  };
}

/** Before → after one record was added (before = the overlay without it). */
export function learningUpdate(
  db: PopulationDb,
  overlay: AnonymisedOutcome[],
  recordId: string,
  q: Parameters<typeof outcomeStats>[2],
): { before: OutcomeStats; after: OutcomeStats } | null {
  const after = outcomeStats(db, overlay, q);
  const before = outcomeStats(db, overlay.filter((r) => r.id !== recordId), q);
  return before && after ? { before, after } : null;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "October" for "2026-10". */
export function monthName(month: string): string {
  return MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? month;
}

/** "Dengue-like alerts in Chennai: 13 of 16 confirmed — 81%" */
export function precisionText(s: OutcomeStats): string {
  const name = conditionById(s.patternId).name.replace(/ pattern$/, "");
  return `${name} alerts in ${s.levelName}: ${s.confirmed} of ${s.alerts} confirmed${s.precision === null ? "" : ` — ${s.precision}%`}`;
}

/** "Dengue in Chennai, October: 7 cases — 5.6 per 1,000 people" */
export function casesText(s: OutcomeStats): string {
  return `${conditionLabel(s.condition)} in ${s.levelName}, ${monthName(s.month)}: ${s.cases} case${s.cases === 1 ? "" : "s"} — ${s.per1000.toFixed(1)} per 1,000 people`;
}

/** The illness added to the patient's history on a confirmed outcome, e.g. "Dengue fever (Oct 2026, lab-confirmed)". */
export function pastIllnessEntry(o: DoctorOutcome, date: string): string | null {
  if (o.kind !== "confirmed" || !o.condition) return null;
  const name = o.condition === "dengue" ? "Dengue fever" : conditionLabel(o.condition);
  const mon = MONTH_NAMES[Number(date.slice(5, 7)) - 1].slice(0, 3);
  return `${name} (${mon} ${date.slice(0, 4)}, ${o.labConfirmed ? "lab-confirmed" : "clinically confirmed"})`;
}

export interface RecordedOutcome {
  /** Appended to the wearable log; closes the episode. */
  event: NewWearableEvent;
  /** Added to the population overlay — only with population-share consent. */
  record: AnonymisedOutcome | null;
  /** Added to the patient's past illnesses on a confirmed outcome. */
  pastIllness: string | null;
}

/**
 * The doctor records the outcome of an alert episode. Null if the episode
 * already has one (one per episode, append-only) or the outcome is incomplete.
 */
export function recordOutcome(
  state: EpisodeState,
  o: DoctorOutcome,
  input: { at: string; by: string; recordId: string; settings: PatientSettings | undefined; patient: { area?: string; city?: string } },
): RecordedOutcome | null {
  if (state.closed || !isOutcomeValid(o)) return null;
  const clean: DoctorOutcome =
    o.kind === "confirmed"
      ? { kind: "confirmed", condition: o.condition, labConfirmed: o.labConfirmed }
      : o.kind === "other"
        ? { kind: "other", labConfirmed: false, otherText: o.otherText!.trim() }
        : { kind: "ruled_out", labConfirmed: false };
  const share = !!input.settings?.populationShare.granted;
  const record = share
    ? anonymiseOutcome(clean, { id: input.recordId, area: input.patient.area, city: input.patient.city, date: state.snapshot.date, patternId: state.snapshot.patternId })
    : null;
  const event: NewWearableEvent = {
    episodeId: state.episodeId,
    patientId: state.patientId,
    at: input.at,
    by: input.by,
    type: "outcome",
    outcome: clean,
    population: share ? POPULATION_STATUS.added : POPULATION_STATUS.consentOff,
    ...(record ? { recordId: record.id } : {}),
  };
  return { event, record, pastIllness: pastIllnessEntry(clean, state.snapshot.date) };
}

/**
 * Stats at the person's local reference level (the same level and consenting
 * people as the Local comparison, e.g. Chennai, 1,240) for an alert pattern.
 */
export function statsQuery(
  reference: { level: { id: string }; people: number } | null,
  patternId: ConditionId,
  date: string,
): Parameters<typeof outcomeStats>[2] | null {
  const condition = conditionForPattern(patternId);
  if (!reference || !condition) return null;
  return { levelId: reference.level.id, people: reference.people, month: date.slice(0, 7), condition, patternId };
}
