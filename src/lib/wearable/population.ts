// Area population reference (SYNTHETIC — /public/data/population.json, made by
// scripts/make-population.mjs). Pure functions.
//
// Levels: area (Velachery) → city (Chennai) → state (Tamil Nadu) → national
// (India). We use the most local level with enough people, else go up a level.
// Only people with population-share consent count, and a person is never part
// of their own reference.
import type { Patient, PatientSettings, Sex } from "../types";
import type { ConditionId, PrevalenceKey, Threshold } from "./conditions";

export const POPULATION_FILE = "/data/population.json";

export type AreaLevel = "area" | "city" | "state" | "national";
export type PrevalenceBand = "low" | "moderate" | "high";

export interface Stat {
  mean: number;
  sd: number;
}

export interface PopulationGroup {
  ageBand: string;
  sex: Sex;
  n: number;
  restingHr: Stat;
  hrv: Stat;
}

/** A demo patient counted in a level's totals, with the values they contributed. */
export interface PopulationMember {
  patientId: string;
  ageBand: string;
  sex: Sex;
  restingHr: number;
  hrv: number;
}

/** Learning-loop counts per level (SYNTHETIC base; doctor-recorded outcomes are added on top in the app). */
export interface LevelOutcomes {
  /** Confirmed cases by condition and month ("2026-10"). */
  cases?: Partial<Record<PrevalenceKey, Record<string, number>>>;
  /** Wearable alerts with a recorded outcome, per pattern. */
  alerts?: Partial<Record<ConditionId, { alerts: number; confirmed: number }>>;
}

export interface PopulationLevel {
  id: string;
  level: AreaLevel;
  name: string;
  parent: string | null;
  groups: PopulationGroup[];
  members: PopulationMember[];
  prevalence?: Partial<Record<PrevalenceKey, { months: PrevalenceBand[]; note: string }>>;
  outcomes?: LevelOutcomes;
}

export interface PopulationDb {
  source: string;
  generatedAt: string;
  note: string;
  ageBands: string[];
  levels: PopulationLevel[];
}

export const POPULATION_RULES = {
  minPeople: { value: 200, reason: "Fewer than 200 people at a level gives unstable local norms; go up a level." },
  minGroup: { value: 30, reason: "At least 30 people of the same age band and sex for a meaningful mean and SD." },
} satisfies Record<string, Threshold>;

export function ageBand(age: number): string {
  if (age < 30) return "18-29";
  if (age < 40) return "30-39";
  if (age < 50) return "40-49";
  if (age < 60) return "50-59";
  return "60+";
}

const SEX_WORD: Record<Sex, string> = { M: "men", F: "women" };

export function groupLabel(sex: Sex, band: string): string {
  return `${SEX_WORD[sex]} ${band.replace("-", "–")}`;
}

/** Remove individual values from a mean/SD summary exactly (via the sum and sum of squares). */
export function removeFromStat(stat: Stat, n: number, values: number[]): { stat: Stat; n: number } {
  if (values.length === 0) return { stat, n };
  const sum = stat.mean * n - values.reduce((a, v) => a + v, 0);
  const sumSq = stat.sd ** 2 * (n - 1) + n * stat.mean ** 2 - values.reduce((a, v) => a + v * v, 0);
  const m = n - values.length;
  if (m <= 1) return { stat: { mean: m === 1 ? sum : 0, sd: 0 }, n: m };
  const mean = sum / m;
  const variance = Math.max(0, (sumSq - m * mean * mean) / (m - 1));
  return { stat: { mean, sd: Math.sqrt(variance) }, n: m };
}

export interface FilteredLevel {
  level: PopulationLevel;
  /** Consenting people at this level, without the person themselves. */
  people: number;
  group: PopulationGroup | null;
  excludedSelf: boolean;
  /** Demo members removed because their population-share consent is off. */
  withdrawn: string[];
}

/**
 * Apply consent to a level: drop the person themselves (never in their own
 * reference) and any member whose population-share consent is off.
 */
export function filterLevel(level: PopulationLevel, personId: string, sex: Sex, band: string, settings: PatientSettings[]): FilteredLevel {
  const consented = (id: string) => !!settings.find((s) => s.patientId === id)?.populationShare.granted;
  const removed = level.members.filter((m) => m.patientId === personId || !consented(m.patientId));
  const total = level.groups.reduce((a, g) => a + g.n, 0);
  const g = level.groups.find((x) => x.sex === sex && x.ageBand === band) ?? null;
  let group: PopulationGroup | null = null;
  if (g) {
    const out = removed.filter((m) => m.sex === sex && m.ageBand === band);
    const hr = removeFromStat(g.restingHr, g.n, out.map((m) => m.restingHr));
    const hrv = removeFromStat(g.hrv, g.n, out.map((m) => m.hrv));
    group = { ...g, n: hr.n, restingHr: hr.stat, hrv: hrv.stat };
  }
  return {
    level,
    people: total - removed.length,
    group,
    excludedSelf: removed.some((m) => m.patientId === personId),
    withdrawn: removed.filter((m) => m.patientId !== personId).map((m) => m.patientId),
  };
}

/** The ladder for a person: their area (if known) → its city → state → national. */
export function ladderFor(db: PopulationDb, person: Pick<Patient, "area" | "city">): PopulationLevel[] {
  const byId = new Map(db.levels.map((l) => [l.id, l]));
  const find = (level: AreaLevel, name?: string) =>
    name ? db.levels.find((l) => l.level === level && l.name.toLowerCase() === name.toLowerCase()) : undefined;
  const start = find("area", person.area) ?? find("city", person.city) ?? db.levels.find((l) => l.level === "national");
  const chain: PopulationLevel[] = [];
  for (let l = start; l; l = l.parent ? byId.get(l.parent) : undefined) chain.push(l);
  return chain;
}

const LEVEL_WORD: Record<AreaLevel, string> = { area: "area", city: "city", state: "state", national: "national" };

export interface LocalReference {
  level: PopulationLevel;
  people: number;
  group: PopulationGroup;
  groupLabel: string;
  /** Why this level: e.g. "Velachery has 38 people — using Chennai city data (1,240 people)". */
  reason: string;
  /** Every level looked at, most local first. */
  tried: { name: string; level: AreaLevel; people: number; groupN: number; used: boolean }[];
  excludedSelf: boolean;
}

const fmtN = (n: number) => n.toLocaleString("en-IN");

/** Most local level with ≥ 200 consenting people and ≥ 30 in the person's age band and sex. */
export function resolveReference(
  db: PopulationDb,
  person: Pick<Patient, "id" | "age" | "sex" | "area" | "city">,
  settings: PatientSettings[],
): LocalReference | null {
  const band = ageBand(person.age);
  const label = groupLabel(person.sex, band);
  const levels = ladderFor(db, person).map((l) => filterLevel(l, person.id, person.sex, band, settings));
  const enough = (f: FilteredLevel) => f.people >= POPULATION_RULES.minPeople.value && (f.group?.n ?? 0) >= POPULATION_RULES.minGroup.value;
  const usedIndex = levels.findIndex(enough);
  if (usedIndex < 0) return null;
  const used = levels[usedIndex];
  const usedText = `${used.level.name} ${LEVEL_WORD[used.level.level]} data (${fmtN(used.people)} people)`;
  let reason: string;
  if (usedIndex === 0) {
    reason = `${used.level.name} has ${fmtN(used.people)} people — enough for a local reference.`;
  } else {
    const first = levels[0];
    const why =
      first.people < POPULATION_RULES.minPeople.value
        ? `${first.level.name} has ${fmtN(first.people)} people`
        : `${first.level.name} has only ${first.group?.n ?? 0} ${label}`;
    reason = `${why} — using ${usedText}.`;
  }
  if (!person.area && !person.city) reason = `Area not on record — using ${usedText}.`;
  return {
    level: used.level,
    people: used.people,
    group: used.group!,
    groupLabel: label,
    reason,
    tried: levels.slice(0, usedIndex + 1).map((f, i) => ({
      name: f.level.name,
      level: f.level.level,
      people: f.people,
      groupN: f.group?.n ?? 0,
      used: i === usedIndex,
    })),
    excludedSelf: levels.some((f) => f.excludedSelf),
  };
}

/** Standard normal CDF (Abramowitz–Stegun 7.1.26). */
function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/** Percentile (1–99) of a value among people like them, assuming a normal spread. */
export function percentile(value: number, stat: Stat): number {
  if (stat.sd <= 0) return 50;
  return Math.min(99, Math.max(1, Math.round(normalCdf((value - stat.mean) / stat.sd) * 100)));
}

export interface LocalPrevalence {
  band: PrevalenceBand;
  levelName: string;
  note: string;
}

/** This month's prevalence band for a condition: from the reference level, or the nearest level above with data. */
export function prevalenceFor(db: PopulationDb, fromLevelId: string, key: PrevalenceKey, month: number): LocalPrevalence | null {
  const byId = new Map(db.levels.map((l) => [l.id, l]));
  for (let l = byId.get(fromLevelId); l; l = l.parent ? byId.get(l.parent) : undefined) {
    const p = l.prevalence?.[key];
    if (p) return { band: p.months[month], levelName: l.name, note: p.note };
  }
  return null;
}
