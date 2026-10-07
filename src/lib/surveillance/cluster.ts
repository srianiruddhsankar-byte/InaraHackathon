// Cluster detection for regional surveillance (pure, tested).
//
// An area is flagged when the share of people with a fever-like pattern rises
// well above what is expected for it: its OWN recent baseline, scaled by the
// local seasonal prevalence (so a normal October rise in fevers is expected and
// does not trigger anything by itself). Works on aggregated counts only.
import type { Threshold } from "../wearable/conditions";
import type { PrevalenceBand } from "../wearable/population";

export const CLUSTER_RULES = {
  baselineDays: { value: 14, reason: "Two weeks of the area's own data is a stable 'usual' share." },
  baselineLag: {
    value: 7,
    reason: "The baseline ends a week before the day judged, so an outbreak that is building does not raise its own baseline.",
  },
  minBaselineDays: { value: 7, reason: "Fewer than 7 baseline days is too little to judge an area." },
  minBaselineShare: {
    value: 0.01,
    reason: "Floor of 1% so a near-zero baseline doesn't turn one or two fevers into a huge ratio.",
  },
  clusterRatio: { value: 2, reason: "At least twice the expected share: a clear rise, not day-to-day noise." },
  clusterMinPeople: { value: 3, reason: "At least 3 people — one or two fevers in an area are common." },
  sustainedDays: { value: 2, reason: "Two days in a row, so a single unusual day doesn't raise a public alert." },
  risingRatio: { value: 1.5, reason: "1.5× expected with at least 2 people: worth keeping an eye on." },
  risingMinPeople: { value: 2, reason: "At least 2 people for a 'rising' note." },
} satisfies Record<string, Threshold>;

/** How much more fever is expected in a month of this prevalence band (relative to "low"). */
export const SEASON_WEIGHT: Record<PrevalenceBand, number> = { low: 1, moderate: 1.5, high: 2 };

export interface ClusterDay {
  day: number;
  people: number;
  feverLike: number;
  dengueLike: number;
}

export type ClusterStatus = "insufficient" | "none" | "rising" | "cluster";

export interface ClusterResult {
  day: number;
  status: ClusterStatus;
  observedCount: number;
  observedShare: number;
  baselineShare: number;
  /** Expected share this month ÷ baseline month, from local seasonal prevalence. */
  seasonFactor: number;
  expectedShare: number;
  ratio: number;
  /** Consecutive days (ending today) that met the cluster rule. */
  daysMeeting: number;
  /** Most of the fever-like patterns are dengue-like. */
  dengueLike: boolean;
  /** e.g. "Dengue-like illness cluster". */
  label: string;
  /** Plain aggregate evidence lines (counts and shares only). */
  evidence: string[];
}

export interface ClusterInput {
  series: ClusterDay[];
  day: number;
  /** Local seasonal prevalence band for fever on a day (null = unknown → no seasonal adjustment). */
  seasonBand: (day: number) => PrevalenceBand | null;
  /** Dengue prevalence band on a day, for the label only. */
  dengueBand?: (day: number) => PrevalenceBand | null;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function meetsCluster(observed: number, count: number, expected: number): boolean {
  return count >= CLUSTER_RULES.clusterMinPeople.value && observed >= expected * CLUSTER_RULES.clusterRatio.value;
}

interface DayCalc {
  ok: boolean;
  observed: number;
  count: number;
  baseline: number;
  seasonFactor: number;
  expected: number;
  dengue: number;
}

function calcDay(input: ClusterInput, day: number): DayCalc {
  const byDay = new Map(input.series.map((d) => [d.day, d]));
  const today = byDay.get(day);
  const from = day - CLUSTER_RULES.baselineLag.value - CLUSTER_RULES.baselineDays.value + 1;
  const to = day - CLUSTER_RULES.baselineLag.value;
  const base: ClusterDay[] = [];
  for (let d = Math.max(1, from); d <= to; d++) {
    const x = byDay.get(d);
    if (x && x.people > 0) base.push(x);
  }
  if (!today || today.people <= 0 || base.length < CLUSTER_RULES.minBaselineDays.value) {
    return { ok: false, observed: 0, count: today?.feverLike ?? 0, baseline: 0, seasonFactor: 1, expected: 0, dengue: 0 };
  }
  const rawBaseline = base.reduce((a, d) => a + d.feverLike, 0) / base.reduce((a, d) => a + d.people, 0);
  const baseline = Math.max(rawBaseline, CLUSTER_RULES.minBaselineShare.value);
  const nowBand = input.seasonBand(day);
  const thenBand = input.seasonBand(base[Math.floor(base.length / 2)].day);
  const seasonFactor = nowBand && thenBand ? SEASON_WEIGHT[nowBand] / SEASON_WEIGHT[thenBand] : 1;
  return {
    ok: true,
    observed: today.feverLike / today.people,
    count: today.feverLike,
    baseline,
    seasonFactor,
    expected: baseline * seasonFactor,
    dengue: today.dengueLike,
  };
}

/** Judge one area on one day. */
export function detectCluster(input: ClusterInput): ClusterResult {
  const { day } = input;
  const c = calcDay(input, day);
  const empty = {
    day,
    observedCount: c.count,
    observedShare: c.observed,
    baselineShare: c.baseline,
    seasonFactor: c.seasonFactor,
    expectedShare: c.expected,
    ratio: 0,
    daysMeeting: 0,
    dengueLike: false,
    label: "",
    evidence: [] as string[],
  };
  if (!c.ok) return { ...empty, status: "insufficient", label: "Not enough history yet" };

  let daysMeeting = 0;
  for (let d = day; d >= 1; d--) {
    const x = d === day ? c : calcDay(input, d);
    if (!x.ok || !meetsCluster(x.observed, x.count, x.expected)) break;
    daysMeeting++;
  }
  const ratio = c.observed / c.expected;
  const status: ClusterStatus =
    daysMeeting >= CLUSTER_RULES.sustainedDays.value
      ? "cluster"
      : daysMeeting === 1 ||
          (ratio >= CLUSTER_RULES.risingRatio.value && c.count >= CLUSTER_RULES.risingMinPeople.value)
        ? "rising"
        : "none";
  const dengueLike = c.count > 0 && c.dengue * 2 >= c.count;
  const kind = dengueLike ? "Dengue-like illness" : "Fever-like illness";
  const label = status === "cluster" ? `${kind} cluster` : status === "rising" ? `${kind} rising` : "No unusual rise";
  const evidence = [
    `${c.count} people with a fever-like pattern (${pct(c.observed)} of people sharing data)`,
    `Usual share here: ${pct(c.baseline)} (days ${Math.max(1, day - 20)}–${day - 7})`,
    c.seasonFactor !== 1
      ? `Season: fevers are ${c.seasonFactor > 1 ? "more" : "less"} common this month (×${c.seasonFactor.toFixed(2)}) → expected ${pct(c.expected)}`
      : `Expected this month: ${pct(c.expected)}`,
    `${ratio.toFixed(1)}× the expected share${daysMeeting ? ` · rule met ${daysMeeting} day${daysMeeting === 1 ? "" : "s"} in a row` : ""}`,
  ];
  if (c.dengue) evidence.push(`${c.dengue} of ${c.count} show the dengue-like pattern (fever falling while heart rate keeps rising)`);
  const dengueBand = input.dengueBand?.(day);
  if (dengueLike && dengueBand) evidence.push(`Dengue is ${dengueBand === "high" ? "common" : dengueBand === "moderate" ? "seen" : "uncommon"} locally this month (${dengueBand})`);
  return { day, status, observedCount: c.count, observedShare: c.observed, baselineShare: c.baseline, seasonFactor: c.seasonFactor, expectedShare: c.expected, ratio, daysMeeting, dengueLike, label, evidence };
}
