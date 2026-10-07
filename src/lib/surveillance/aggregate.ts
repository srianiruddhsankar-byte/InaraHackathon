// The public health officer's view (pure, tested). Input: aggregated area
// counts, consent settings and anonymised outcomes. Output: only area names,
// counts and rates — never names, patient IDs or locations finer than an area.
//
// Privacy rules:
// - Only people with population-share consent count. Demo members whose
//   consent is off are subtracted exactly from their area's counts.
// - k-anonymity: an area with fewer than K_ANONYMITY people is hidden entirely.
import type { PatientSettings } from "../types";
import type { Threshold } from "../wearable/conditions";
import type { AnonymisedOutcome } from "../wearable/outcomes";
import { prevalenceFor, type PopulationDb, type PrevalenceBand } from "../wearable/population";
import { dayDate } from "../wearable/types";
import { CHENNAI_AREAS, type SurveillanceArea } from "./areas";
import { detectCluster, type ClusterResult } from "./cluster";
import type { AreaDayCounts, MemberDay, SurveillanceData, WaterDay } from "./seed";

export const K_ANONYMITY = {
  value: 10,
  reason: "Areas with fewer than 10 people sharing data are hidden, so no one can be singled out.",
} satisfies Threshold;

export type MetricId = "raised_temp" | "hr_change" | "concerning" | "low_hydration" | "confirmed";

export const METRICS: { id: MetricId; label: string; short: string; unit: string }[] = [
  { id: "raised_temp", label: "% with raised night temperature", short: "Raised night temp", unit: "%" },
  { id: "hr_change", label: "Average night heart-rate change", short: "Night HR change", unit: "bpm" },
  { id: "concerning", label: "Active “concerning” patterns", short: "Concerning patterns", unit: "people" },
  { id: "low_hydration", label: "% with low hydration (MarQ Sense)", short: "Low hydration", unit: "%" },
  { id: "confirmed", label: "Confirmed outcomes per 1,000 (this month)", short: "Confirmed / 1,000", unit: "per 1,000" },
];

export interface AreaDayStat {
  day: number;
  date: string;
  people: number;
  raisedTempPct: number;
  hrChange: number;
  feverLike: number;
  feverLikePct: number;
  dengueLike: number;
  concerning: number;
  /** MarQ Sense: % of people whose night body-water estimate was low for them. */
  lowHydrationPct: number;
  /** Expected fever-like share (%) from the cluster rule; null before enough history. */
  expectedPct: number | null;
}

export interface VisibleArea {
  hidden: false;
  id: string;
  name: string;
  city: string;
  people: number;
  days: AreaDayStat[];
  /** Confirmed cases this month (base + recorded outcomes) and per 1,000 people. */
  confirmed: { month: string; count: number; per1000: number };
  cluster: ClusterResult;
  water: WaterDay[];
}

export interface HiddenArea {
  hidden: true;
  id: string;
  name: string;
  city: string;
  reason: string;
}

export type AreaView = VisibleArea | HiddenArea;

export interface SurveillanceView {
  day: number;
  date: string;
  month: string;
  areas: AreaView[];
  /** People sharing data across the visible areas. */
  people: number;
}

export interface SurveillanceInput {
  data: SurveillanceData;
  /** Consent settings: used only to subtract members whose population-share is off. */
  settings: PatientSettings[];
  /** Anonymised outcomes (store overlay): area + month + condition, nothing else. */
  outcomes: AnonymisedOutcome[];
  population: PopulationDb | null;
  day: number;
  areas?: SurveillanceArea[];
}

const round1 = (x: number) => Math.round(x * 10) / 10 || 0; // never "-0"

/** Chennai's seasonal band for a condition on a demo day (null without population data). */
function bandFor(db: PopulationDb | null, key: "febrile_illness" | "dengue", day: number): PrevalenceBand | null {
  if (!db) return null;
  const month = Number(dayDate(day - 1).slice(5, 7)) - 1;
  return prevalenceFor(db, "chennai", key, month)?.band ?? null;
}

function subtract(d: AreaDayCounts, out: (MemberDay | undefined)[], peopleOut: number): AreaDayCounts {
  const sum = (k: keyof MemberDay) => out.reduce((a, m) => a + (m?.[k] ?? 0), 0);
  return {
    day: d.day,
    people: d.people - peopleOut,
    raisedTemp: d.raisedTemp - sum("raisedTemp"),
    hrChangeSum: round1(d.hrChangeSum - sum("hrChange")),
    feverLike: d.feverLike - sum("feverLike"),
    dengueLike: d.dengueLike - sum("dengueLike"),
    concerning: d.concerning - sum("concerning"),
    lowHydration: d.lowHydration - sum("lowHydration"),
  };
}

export function buildSurveillance(input: SurveillanceInput): SurveillanceView {
  const { data, settings, outcomes, population, day } = input;
  const date = dayDate(day - 1);
  const month = date.slice(0, 7);
  const consented = (id: string) => !!settings.find((s) => s.patientId === id)?.populationShare.granted;
  const areas: AreaView[] = (input.areas ?? CHENNAI_AREAS).map((area) => {
    const seed = data.areas.find((a) => a.areaId === area.id);
    const base = { id: area.id, name: area.name, city: area.city };
    if (!seed) return { ...base, hidden: true, reason: "No data for this area." };
    const withdrawn = data.members.filter((m) => m.areaId === area.id && !consented(m.patientId));
    const people = seed.people - withdrawn.length;
    if (people < K_ANONYMITY.value) {
      return { ...base, hidden: true, reason: `Fewer than ${K_ANONYMITY.value} people share data here — hidden to protect privacy.` };
    }
    const counts = seed.days.map((d) => subtract(d, withdrawn.map((m) => m.days[d.day - 1]), withdrawn.length));
    const seasonBand = (d: number) => bandFor(population, "febrile_illness", d);
    const series = counts.map((c) => ({ day: c.day, people: c.people, feverLike: c.feverLike, dengueLike: c.dengueLike }));
    const days: AreaDayStat[] = counts.map((c) => {
      const cl = detectCluster({ series, day: c.day, seasonBand });
      return {
        day: c.day,
        date: dayDate(c.day - 1),
        people: c.people,
        raisedTempPct: round1((c.raisedTemp / c.people) * 100),
        hrChange: round1(c.hrChangeSum / c.people),
        feverLike: c.feverLike,
        feverLikePct: round1((c.feverLike / c.people) * 100),
        dengueLike: c.dengueLike,
        concerning: c.concerning,
        lowHydrationPct: round1((c.lowHydration / c.people) * 100),
        expectedPct: cl.status === "insufficient" ? null : round1(cl.expectedShare * 100),
      };
    });
    const baseCount = Object.values(seed.confirmed[month] ?? {}).reduce((a, n) => a + (n ?? 0), 0);
    const recorded = outcomes.filter(
      (o) => o.condition && o.month === month && o.area?.toLowerCase() === area.name.toLowerCase(),
    ).length;
    const count = baseCount + recorded;
    return {
      ...base,
      hidden: false,
      people,
      days: days.filter((d) => d.day <= day),
      confirmed: { month, count, per1000: round1((count / people) * 1000) },
      cluster: detectCluster({ series, day, seasonBand, dengueBand: (d) => bandFor(population, "dengue", d) }),
      water: seed.water.filter((w) => w.day <= day),
    };
  });
  const people = areas.reduce((a, x) => a + (x.hidden ? 0 : x.people), 0);
  return { day, date, month, areas, people };
}

/** The value an area shows on the map for a metric, on the view's day. */
export function metricValue(area: VisibleArea, metric: MetricId): number {
  const today = area.days.at(-1);
  if (!today) return 0;
  switch (metric) {
    case "raised_temp":
      return today.raisedTempPct;
    case "hr_change":
      return today.hrChange;
    case "concerning":
      return today.concerning;
    case "low_hydration":
      return today.lowHydrationPct;
    case "confirmed":
      return area.confirmed.per1000;
  }
}

/** Fixed colour scale limits per metric (so colours mean the same thing every day). */
export const METRIC_SCALE: Record<MetricId, { max: number; steps: number[] }> = {
  raised_temp: { max: 15, steps: [2, 5, 10] },
  hr_change: { max: 4, steps: [0.5, 1.5, 3] },
  concerning: { max: 6, steps: [1, 2, 4] },
  low_hydration: { max: 15, steps: [3, 6, 10] },
  confirmed: { max: 40, steps: [10, 20, 30] },
};

/** 0–3: which colour step a value falls in. */
export function metricLevel(metric: MetricId, value: number): number {
  return METRIC_SCALE[metric].steps.filter((s) => value >= s).length;
}
