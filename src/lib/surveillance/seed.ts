// SYNTHETIC regional surveillance data: per area and per day, counts that are
// already aggregated over the people who agreed to share their wearable data
// anonymously (population-share consent). Deterministic, generated on the fly.
//
// Demo patients who live in a mapped area are listed under `members` with the
// values they added each day, so the app can take them out exactly when their
// consent is off (same idea as population.json). Members are used only for that
// subtraction — the officer's view never contains them.
//
// Story: a dengue-like cluster builds in Velachery from 1 Oct 2026 (Day 26),
// consistent with Karthik's own timeline (early infection Day 26 → dengue-like
// Day 30). Tambaram rises a little but stays below the cluster rule.
import type { NightEvaluation } from "../wearable/baseline";
import type { PrevalenceKey } from "../wearable/conditions";
import type { Detection } from "../wearable/detect";
import { seededRandom } from "../wearable/simulate";
import { WINDOW_DAYS } from "../wearable/types";

/** Patterns that count as "fever-like" for cluster detection. */
export const FEVER_PATTERNS = ["early_infection", "dengue_like"] as const;

/** One area on one day (day 1 = 2026-09-06 … day 30 = 2026-10-05). Counts of people, never people. */
export interface AreaDayCounts {
  day: number;
  /** Consenting people with a wearable in the area (members included). */
  people: number;
  /** People whose night skin temperature was raised (z ≥ 1.5 vs their own baseline). */
  raisedTemp: number;
  /** Sum of night resting HR change vs each person's own baseline (bpm). */
  hrChangeSum: number;
  /** People with a fever-like pattern (early infection or dengue-like, watch or concerning). */
  feverLike: number;
  /** …of whom the top pattern was dengue-like. */
  dengueLike: number;
  /** People with any pattern at "concerning". */
  concerning: number;
}

/** Simulated water-quality sample summary for an area and day. */
export interface WaterDay {
  day: number;
  /** Turbidity (NTU). BIS 10500: ≤ 1 acceptable, ≤ 5 permissible. */
  turbidityNtu: number;
  /** Residual free chlorine (mg/L). ≥ 0.2 at the tap. */
  chlorineMgL: number;
  samples: number;
  /** Samples with coliform bacteria detected (should be none). */
  coliformPositive: number;
}

export interface AreaSeed {
  areaId: string;
  people: number;
  /** Confirmed cases by month ("2026-10") and condition (base counts; doctor-recorded outcomes are added on top). */
  confirmed: Record<string, Partial<Record<PrevalenceKey, number>>>;
  days: AreaDayCounts[];
  water: WaterDay[];
}

/** What one consenting demo patient added to their area on one day. */
export interface MemberDay {
  day: number;
  raisedTemp: 0 | 1;
  hrChange: number;
  feverLike: 0 | 1;
  dengueLike: 0 | 1;
  concerning: 0 | 1;
}

export interface SurveillanceMember {
  patientId: string;
  areaId: string;
  days: MemberDay[];
}

export interface SurveillanceData {
  source: string;
  areas: AreaSeed[];
  members: SurveillanceMember[];
}

/**
 * What a person's analysed night and detection add to the area counts. Used to
 * check that the seeded member values match the real wearable pipeline (tested).
 */
export function memberDayFrom(day: number, night: NightEvaluation, detection: Detection): MemberDay {
  const judged = night.judged && detection.status === "ok";
  const usual = night.baseline.restingHr?.median;
  const fever = judged ? detection.patterns.filter((p) => (FEVER_PATTERNS as readonly string[]).includes(p.id)) : [];
  return {
    day,
    raisedTemp: judged && (night.z.skinTemp ?? 0) >= 1.5 ? 1 : 0,
    hrChange: judged && night.night.restingHr !== null && usual !== undefined ? Math.round(night.night.restingHr - usual) : 0,
    feverLike: fever.length ? 1 : 0,
    dengueLike: fever[0]?.id === "dengue_like" ? 1 : 0,
    concerning: judged && detection.patterns.some((p) => p.level === "concerning") ? 1 : 0,
  };
}

// Karthik (Velachery): Days 1–7 and 10 not judged (no baseline / no data); Days 26–30 the
// illness (raised temp 26–29, night HR +5 → +22, early infection → dengue-like on Day 30).
const KARTHIK_HR = [0, 0, 0, 0, 0, 0, 0, -2, 2, 0, -1, 0, 0, 1, 0, 0, 0, 2, 1, 2, 0, 0, 1, -1, 1, 5, 8, 11, 18, 22];
const KARTHIK: SurveillanceMember = {
  patientId: "karthik",
  areaId: "velachery",
  days: KARTHIK_HR.map((hrChange, i) => {
    const day = i + 1;
    return {
      day,
      raisedTemp: day >= 26 && day <= 29 ? 1 : 0,
      hrChange,
      feverLike: day >= 26 ? 1 : 0,
      dengueLike: day === 30 ? 1 : 0,
      concerning: day >= 28 ? 1 : 0,
    };
  }),
};

interface AreaPlan {
  areaId: string;
  people: number;
  seed: number;
  /** Background fever-like rate per person-day. */
  rate: number;
  confirmed: AreaSeed["confirmed"];
  /** Scripted fever-like counts (people other than members) that replace the random background. */
  script?: Record<number, { fever: number; dengue: number; concerning: number }>;
  /** Water: a monsoon-affected area (lower chlorine, more turbidity in October). */
  waterlogged?: boolean;
}

// Confirmed dengue per area adds up to Chennai's base counts in population.json
// (Sep 4, Oct 6); Velachery matches its 0 / 0 there.
const PLANS: AreaPlan[] = [
  {
    areaId: "velachery",
    people: 39,
    seed: 101,
    rate: 0.01,
    confirmed: { "2026-09": { dengue: 0 }, "2026-10": { dengue: 0 } },
    script: {
      24: { fever: 1, dengue: 0, concerning: 0 },
      25: { fever: 1, dengue: 0, concerning: 0 },
      26: { fever: 2, dengue: 0, concerning: 1 },
      27: { fever: 3, dengue: 1, concerning: 1 },
      28: { fever: 4, dengue: 1, concerning: 2 },
      29: { fever: 5, dengue: 2, concerning: 3 },
      30: { fever: 6, dengue: 4, concerning: 4 },
    },
    waterlogged: true,
  },
  { areaId: "adyar", people: 52, seed: 202, rate: 0.01, confirmed: { "2026-09": { dengue: 1 }, "2026-10": { dengue: 1 } } },
  { areaId: "t_nagar", people: 61, seed: 303, rate: 0.012, confirmed: { "2026-09": { dengue: 1 }, "2026-10": { dengue: 1 } } },
  {
    areaId: "tambaram",
    people: 44,
    seed: 404,
    rate: 0.012,
    confirmed: { "2026-09": { dengue: 1 }, "2026-10": { dengue: 2 } },
    script: {
      27: { fever: 2, dengue: 0, concerning: 0 },
      28: { fever: 2, dengue: 0, concerning: 1 },
      29: { fever: 2, dengue: 1, concerning: 1 },
      30: { fever: 2, dengue: 1, concerning: 1 },
    },
  },
  { areaId: "anna_nagar", people: 58, seed: 505, rate: 0.01, confirmed: { "2026-09": { dengue: 0 }, "2026-10": { dengue: 0 } } },
  { areaId: "mylapore", people: 33, seed: 606, rate: 0.01, confirmed: { "2026-09": { dengue: 1 }, "2026-10": { dengue: 1 } } },
  { areaId: "perambur", people: 27, seed: 707, rate: 0.012, confirmed: { "2026-09": { dengue: 0 }, "2026-10": { dengue: 0 } } },
  // Fewer than 10 consenting people: hidden on the map (k-anonymity).
  { areaId: "sholinganallur", people: 8, seed: 808, rate: 0.01, confirmed: { "2026-09": { dengue: 0 }, "2026-10": { dengue: 1 } } },
];

const MEMBERS: SurveillanceMember[] = [KARTHIK];

/** October in the demo window: Day 26 = 1 Oct 2026. */
export const FIRST_OCTOBER_DAY = 26;

const round1 = (x: number) => Math.round(x * 10) / 10;

function buildArea(plan: AreaPlan, members: SurveillanceMember[]): AreaSeed {
  const rand = seededRandom(plan.seed);
  const mine = members.filter((m) => m.areaId === plan.areaId);
  const others = plan.people - mine.length;
  const days: AreaDayCounts[] = [];
  const water: WaterDay[] = [];
  for (let day = 1; day <= WINDOW_DAYS; day++) {
    const october = day >= FIRST_OCTOBER_DAY;
    let fever = 0;
    let dengue = 0;
    let concerning = 0;
    const scripted = plan.script?.[day];
    if (scripted) {
      ({ fever, dengue, concerning } = scripted);
    } else {
      const rate = plan.rate * (october ? 1.25 : 1);
      for (let i = 0; i < others; i++) if (rand() < rate) fever++;
      fever = Math.min(fever, 2); // background never forms a cluster on its own
      for (let i = 0; i < fever; i++) {
        if (rand() < 0.3) concerning++;
        if (october && rand() < 0.3) dengue++;
      }
    }
    let raised = 0;
    for (let i = 0; i < fever; i++) if (rand() < 0.75) raised++;
    for (let i = 0; i < others - fever; i++) if (rand() < 0.004) raised++;
    let hr = 0;
    for (let i = 0; i < others - fever; i++) hr += (rand() - 0.5) * 3;
    for (let i = 0; i < fever; i++) hr += 6 + rand() * 8;
    const m = mine.map((x) => x.days[day - 1]);
    const sum = (k: keyof MemberDay) => m.reduce((a, d) => a + (d?.[k] ?? 0), 0);
    days.push({
      day,
      people: plan.people,
      raisedTemp: raised + sum("raisedTemp"),
      hrChangeSum: round1(hr + sum("hrChange")),
      feverLike: fever + sum("feverLike"),
      dengueLike: dengue + sum("dengueLike"),
      concerning: concerning + sum("concerning"),
    });
    const rainy = october && plan.waterlogged;
    water.push({
      day,
      turbidityNtu: round1((rainy ? 2.4 : 0.6) + rand() * (rainy ? 1.6 : 0.5)),
      chlorineMgL: Math.round(((rainy ? 0.12 : 0.3) + rand() * 0.15) * 100) / 100,
      samples: 4,
      coliformPositive: rainy && rand() < 0.6 ? 1 : 0,
    });
  }
  return { areaId: plan.areaId, people: plan.people, confirmed: plan.confirmed, days, water };
}

let cached: SurveillanceData | null = null;

/** The seeded surveillance data (same every time). */
export function surveillanceSeed(): SurveillanceData {
  if (!cached) {
    cached = {
      source: "SYNTHETIC aggregated wearable data for the BioMarQ: Prodrome prototype — not real data.",
      areas: PLANS.map((p) => buildArea(p, MEMBERS)),
      members: MEMBERS,
    };
  }
  return cached;
}
