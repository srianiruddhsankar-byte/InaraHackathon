// Pattern detection: which conditions in the library (conditions.ts) a day's
// wearable data looks like. Pure — no React, no store. All thresholds come
// from the library; this file only applies them.
//
// Order of checks for a day:
// 1. Gates: < 7 valid baseline nights or night quality < 60% → "insufficient data".
// 2. Each condition's rules on the nightly z-scores, trends, SpO2, rhythm and the
//    weather residual (daytime HR minus what the weather explains — so a hot day
//    on its own can never trigger anything).
// 3. Score 0–1, level (none / watch / concerning), plain evidence, supporting factors.
// 4. Rank: level first; a more specific pattern above the general one it includes;
//    then score × local prevalence this month (prevalence never creates a pattern).
import type { Patient, PatientSettings } from "../types";
import { usualHrAmplitude, type NightEvaluation } from "./baseline";
import {
  CONDITIONS,
  GATES,
  PAST_DENGUE_FACTOR,
  PREVALENCE_LABEL,
  PREVALENCE_WEIGHT,
  t,
  type ConditionDef,
  type ConditionId,
  type LabSuggestion,
  type PatternLevel,
} from "./conditions";
import { prevalenceFor, resolveReference, type LocalPrevalence, type LocalReference, type PopulationDb } from "./population";
import { dayDate, type DayNightAmplitude, type NightMetric } from "./types";
import type { WeatherAdjustedDay } from "./weather";

export interface PatternResult {
  id: ConditionId;
  condition: ConditionDef;
  level: PatternLevel;
  /** 0–1: how strongly the data matches (never 1 — this is not certainty). */
  score: number;
  /** score × local prevalence weight, used for ranking only. */
  rankScore: number;
  /** Plain values, e.g. "Night HR 78 vs usual 56 (+22)". */
  evidence: string[];
  supportingFactors: string[];
  suggestedLabTests: LabSuggestion[];
  /** Population level used for local prevalence, e.g. "Chennai (city)". */
  populationLevel: string | null;
  prevalence: LocalPrevalence | null;
  /** % usable samples on the night being judged. */
  dataQuality: number;
}

export type Detection =
  | {
      status: "insufficient_data";
      day: number;
      reason: string;
      dataQuality: number;
      baselineNights: number;
      reference: LocalReference | null;
    }
  | {
      status: "ok";
      day: number;
      /** Patterns at watch or concerning, ranked (top first). Empty = nothing found. */
      patterns: PatternResult[];
      dataQuality: number;
      baselineNights: number;
      reference: LocalReference | null;
    };

export interface DetectInput {
  person: Pick<Patient, "id" | "age" | "sex" | "area" | "city">;
  nights: NightEvaluation[];
  amplitude: DayNightAmplitude[];
  weather: WeatherAdjustedDay[];
  population: PopulationDb | null;
  /** Medical record: past illnesses and visit history (e.g. past dengue). */
  record: Pick<Patient, "pastIllnesses" | "visitHistory">;
  /** Everyone's consent settings (population share filter). */
  settings: PatientSettings[];
  /** 1-based day in the window (Day 1 … Day 30). */
  day: number;
}

// ---- Small helpers -----------------------------------------------------------------

const UNIT: Record<NightMetric, string> = { restingHr: "", hrv: " ms", skinTemp: " °C", spo2: "%" };
const LABEL: Record<NightMetric, string> = { restingHr: "Night HR", hrv: "Night HRV", skinTemp: "Night skin temp", spo2: "Night SpO₂" };
const DECIMALS: Record<NightMetric, number> = { restingHr: 0, hrv: 0, skinTemp: 1, spo2: 1 };

const signed = (v: number, d: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}`;

/** "Night HR 78 vs usual 56 (+22)" */
export function metricEvidence(n: NightEvaluation, metric: NightMetric): string | null {
  const v = n.night[metric];
  const b = n.baseline[metric];
  if (v === null || !b) return null;
  const d = DECIMALS[metric];
  return `${LABEL[metric]} ${v.toFixed(d)}${UNIT[metric]} vs usual ${b.median.toFixed(d)} (${signed(v - b.median, d)})`;
}

const z = (n: NightEvaluation | undefined, m: NightMetric) => n?.z[m];
const ge = (v: number | undefined, x: number) => v !== undefined && v >= x;
const le = (v: number | undefined, x: number) => v !== undefined && v <= x;

/** Consecutive judged nights ending at index i where pred holds (a missing night breaks the run). */
function streak(nights: NightEvaluation[], i: number, pred: (n: NightEvaluation) => boolean): number {
  let s = 0;
  for (let k = i; k >= 0 && nights[k].judged && pred(nights[k]); k--) s++;
  return s;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Score: base by level + up to 0.15 for signal strength + 0.05 per supporting factor; capped at 0.95. */
export function scorePattern(level: PatternLevel, strength: number, factors: number): number {
  if (level === "none") return 0;
  const base = level === "concerning" ? 0.65 : 0.35;
  return Math.round(Math.min(0.95, base + 0.15 * clamp01(strength) + 0.05 * factors) * 100) / 100;
}

/** Past dengue in the record (past illnesses or visit notes): the text that mentions it. */
export function pastDengue(record: DetectInput["record"]): string | null {
  return record.pastIllnesses?.find((p) => /dengue/i.test(p)) ?? record.visitHistory.find((v) => /dengue/i.test(v.note))?.note ?? null;
}

interface RuleResult {
  level: PatternLevel;
  strength: number;
  evidence: string[];
  factors: string[];
}

const NONE: RuleResult = { level: "none", strength: 0, evidence: [], factors: [] };

interface Ctx {
  nights: NightEvaluation[];
  i: number;
  amplitude: DayNightAmplitude[];
  weather: WeatherAdjustedDay[];
  pastDengue: string | null;
}

// ---- One evaluator per condition (numbers from conditions.ts) ------------------------------

function earlyInfection(c: ConditionDef, x: Ctx): RuleResult {
  const hrZ = t(c, "hrZ");
  const hit = (n: NightEvaluation) => ge(z(n, "restingHr"), hrZ) && (ge(z(n, "skinTemp"), t(c, "skinZ")) || le(z(n, "hrv"), -t(c, "hrvZ")));
  const nightsHit = streak(x.nights, x.i, hit);
  if (nightsHit === 0) return NONE;
  const n = x.nights[x.i];
  const rise = n.night.restingHr! - n.baseline.restingHr!.median;
  const level: PatternLevel = nightsHit >= c.minNights && rise >= t(c, "concerningRise") ? "concerning" : "watch";
  const evidence = [
    metricEvidence(n, "restingHr")!,
    `${nightsHit} night${nightsHit > 1 ? "s" : ""} in a row with raised night HR`,
    ...(["skinTemp", "hrv"] as const).filter((m) => (m === "skinTemp" ? ge(z(n, m), t(c, "skinZ")) : le(z(n, m), -t(c, "hrvZ")))).map((m) => metricEvidence(n, m)!),
  ];
  const factors: string[] = [];
  const usual = usualHrAmplitude(x.amplitude, x.i);
  const amp = x.amplitude[x.i]?.hr;
  if (usual && amp !== null && amp !== undefined && amp < usual * t(c, "flattening")) {
    factors.push(`Flattened day–night rhythm: HR day − night ${amp.toFixed(0)} bpm vs usual ${usual.toFixed(0)}`);
  }
  return { level, strength: (z(n, "restingHr")! - hrZ) / (2 * hrZ), evidence, factors };
}

function dengueLike(c: ConditionDef, x: Ctx): RuleResult {
  const f = x.pastDengue ? PAST_DENGUE_FACTOR : 1;
  const feverZ = t(c, "feverZ") * f;
  const hrZ = t(c, "hrZ") * f;
  const n = x.nights[x.i];
  const prev = x.nights[x.i - 1];
  if (!n.judged || !prev?.judged) return NONE;
  const hrRising = ge(z(n, "restingHr"), hrZ) && n.night.restingHr! > prev.night.restingHr!;
  const earlier = x.nights.slice(Math.max(0, x.i - t(c, "feverLookback")), x.i).filter((e) => e.judged);
  const feverNights = earlier.filter((e) => ge(z(e, "skinTemp"), feverZ));
  if (!hrRising || feverNights.length < t(c, "feverNights")) return NONE;
  const skin = z(n, "skinTemp");
  const backToUsual = skin !== undefined && skin < t(c, "backToUsualZ");
  const falling = skin !== undefined && skin < z(prev, "skinTemp")!;
  if (!backToUsual && !falling) return NONE;
  const peak = Math.max(...feverNights.map((e) => e.night.skinTemp! - e.baseline.skinTemp!.median));
  const evidence = [
    `Skin temp raised on ${feverNights.length} of the previous ${earlier.length} nights (peak ${signed(peak, 1)} °C)`,
    `${metricEvidence(n, "skinTemp")} — ${backToUsual ? "fever phase has come down" : "starting to come down"}`,
    `Night HR still rising: ${prev.night.restingHr!.toFixed(0)} → ${n.night.restingHr!.toFixed(0)} (usual ${n.baseline.restingHr!.median.toFixed(0)})`,
  ];
  const factors = x.pastDengue ? [`Past dengue in record: ${x.pastDengue} — thresholds lowered by 25%`] : [];
  return { level: backToUsual ? "concerning" : "watch", strength: (z(n, "restingHr")! - hrZ) / (4 * hrZ), evidence, factors };
}

function respiratory(c: ConditionDef, x: Ctx): RuleResult {
  const low = (n: NightEvaluation) => {
    const s = n.night.spo2;
    const b = n.baseline.spo2;
    return s !== null && !!b && (b.median - s >= t(c, "spo2Drop") || s < t(c, "spo2Floor"));
  };
  const nightsHit = streak(x.nights, x.i, (n) => low(n) && ge(z(n, "restingHr"), t(c, "hrZ")));
  if (nightsHit === 0) return NONE;
  const n = x.nights[x.i];
  return {
    level: nightsHit >= t(c, "nights") ? "concerning" : "watch",
    strength: (n.baseline.spo2!.median - n.night.spo2!) / (2 * t(c, "spo2Drop")),
    evidence: [metricEvidence(n, "spo2")!, metricEvidence(n, "restingHr")!, `${nightsHit} night${nightsHit > 1 ? "s" : ""} with low oxygen`],
    factors: [],
  };
}

function heatDehydration(c: ConditionDef, x: Ctx): RuleResult {
  const strained = (w: WeatherAdjustedDay | undefined) =>
    !!w && w.apparentTemp !== null && w.residual !== null && w.apparentTemp >= t(c, "hotDay") && w.residual >= t(c, "residual");
  const afternoon = (w: WeatherAdjustedDay, label: string) =>
    `${label} afternoon: feels like ${w.apparentTemp!.toFixed(1)} °C, HR ${w.observedHr!.toFixed(0)} vs ${w.expectedHr!.toFixed(0)} expected for the weather (${signed(w.residual!, 0)})`;
  const n = x.nights[x.i];
  const yesterday = x.weather[x.i - 1];
  // Yesterday's hot afternoon, then a poor night: the full pattern.
  if (strained(yesterday) && n.judged) {
    const poorNight = ge(z(n, "restingHr"), t(c, "recoveryHrZ")) || le(z(n, "hrv"), -t(c, "recoveryHrvZ"));
    if (poorNight) {
      return {
        level: "concerning",
        strength: yesterday.residual! / (2 * t(c, "residual")),
        evidence: [afternoon(yesterday, "Yesterday"), `Poor recovery overnight: ${[metricEvidence(n, "restingHr"), metricEvidence(n, "hrv")].filter(Boolean).join("; ")}`],
        factors: [],
      };
    }
  }
  // Today's hot afternoon with HR beyond the weather: watch until we see the night.
  const today = x.weather[x.i];
  if (strained(today)) {
    return { level: "watch", strength: today.residual! / (2 * t(c, "residual")), evidence: [afternoon(today, "This")], factors: [] };
  }
  return NONE;
}

function highRestingHr(c: ConditionDef, x: Ctx): RuleResult {
  const recent = x.nights.slice(Math.max(0, x.i - t(c, "feverLookback") + 1), x.i + 1);
  if (recent.some((n) => ge(z(n, "skinTemp"), t(c, "feverZ")))) return NONE; // a recent fever explains it
  const high = (n: NightEvaluation) => (n.night.restingHr ?? 0) > t(c, "absHr") || ge(z(n, "restingHr"), t(c, "hrZ"));
  const nightsHit = streak(x.nights, x.i, high);
  if (nightsHit === 0) return NONE;
  const n = x.nights[x.i];
  return {
    level: nightsHit >= t(c, "nights") ? "concerning" : "watch",
    strength: z(n, "restingHr")! / (2 * t(c, "hrZ")),
    evidence: [metricEvidence(n, "restingHr")!, `No raised skin temperature in the last ${t(c, "feverLookback")} nights`],
    factors: [],
  };
}

function poorRecovery(c: ConditionDef, x: Ctx): RuleResult {
  const hit = (n: NightEvaluation) =>
    le(z(n, "hrv"), -t(c, "hrvZ")) && Math.abs(z(n, "skinTemp") ?? 0) < t(c, "normalSkinZ") && (z(n, "restingHr") ?? 0) < t(c, "normalHrZ");
  const nightsHit = streak(x.nights, x.i, hit);
  if (nightsHit < t(c, "nights")) return NONE;
  return {
    level: nightsHit >= t(c, "concerningNights") ? "concerning" : "watch",
    strength: -z(x.nights[x.i], "hrv")! / (2 * t(c, "hrvZ")),
    evidence: [metricEvidence(x.nights[x.i], "hrv")!, `${nightsHit} nights in a row with low HRV; temperature and HR normal`],
    factors: [],
  };
}

const EVALUATORS: Record<ConditionId, (c: ConditionDef, x: Ctx) => RuleResult> = {
  early_infection: earlyInfection,
  dengue_like: dengueLike,
  respiratory,
  heat_dehydration: heatDehydration,
  high_resting_hr: highRestingHr,
  poor_recovery: poorRecovery,
};

const LEVEL_RANK: Record<PatternLevel, number> = { none: 0, watch: 1, concerning: 2 };

export function rankPatterns(patterns: PatternResult[]): PatternResult[] {
  return [...patterns].sort((a, b) => {
    if (a.level !== b.level) return LEVEL_RANK[b.level] - LEVEL_RANK[a.level];
    if (a.condition.moreSpecificThan?.includes(b.id)) return -1;
    if (b.condition.moreSpecificThan?.includes(a.id)) return 1;
    return b.rankScore - a.rankScore;
  });
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// ---- Entry point -------------------------------------------------------------------

export function detectPatterns(input: DetectInput): Detection {
  const { nights, day } = input;
  const i = day - 1;
  const n = nights[i];
  const reference = input.population ? resolveReference(input.population, input.person, input.settings) : null;
  const dataQuality = n?.night.quality ?? 0;
  const baselineNights = n?.baselineNights ?? 0;

  if (!n || baselineNights < GATES.baselineNights.value) {
    const reason = `Building personal baseline: ${Math.min(baselineNights, GATES.baselineNights.value)}/${GATES.baselineNights.value} valid nights.`;
    return { status: "insufficient_data", day, reason, dataQuality, baselineNights, reference };
  }
  if (dataQuality < GATES.nightQuality.value || !n.judged) {
    const reason = `Night of Day ${day}: only ${dataQuality}% usable data (need ${GATES.nightQuality.value}%).`;
    return { status: "insufficient_data", day, reason, dataQuality, baselineNights, reference };
  }

  const month = new Date(`${dayDate(i)}T00:00:00Z`).getUTCMonth();
  const ctx: Ctx = { nights, i, amplitude: input.amplitude, weather: input.weather, pastDengue: pastDengue(input.record) };
  const populationLevel = reference ? `${reference.level.name} (${reference.level.level})` : null;

  const found: PatternResult[] = [];
  for (const c of CONDITIONS) {
    const r = EVALUATORS[c.id](c, ctx);
    if (r.level === "none") continue;
    const prevalence = reference && c.prevalenceKey ? prevalenceFor(input.population!, reference.level.id, c.prevalenceKey, month) : null;
    const factors = [...r.factors];
    // Local prevalence supports a pattern that is already there; it never creates one.
    if (prevalence && prevalence.band !== "low") {
      factors.push(`${PREVALENCE_LABEL[c.prevalenceKey!]} ${prevalence.band} in ${prevalence.levelName} in ${MONTHS[month]} — ${prevalence.note}`);
    }
    const score = scorePattern(r.level, r.strength, factors.length);
    found.push({
      id: c.id,
      condition: c,
      level: r.level,
      score,
      rankScore: Math.round(score * PREVALENCE_WEIGHT[prevalence?.band ?? "low"] * 100) / 100,
      evidence: r.evidence,
      supportingFactors: factors,
      suggestedLabTests: c.suggestedLabTests,
      populationLevel,
      prevalence,
      dataQuality,
    });
  }
  return { status: "ok", day, patterns: rankPatterns(found), dataQuality, baselineNights, reference };
}
