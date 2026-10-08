import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { useInaraStore } from "@/store/useInaraStore";
import { buildSurveillance } from "../surveillance/aggregate";
import { memberDayFrom, surveillanceSeed } from "../surveillance/seed";
import { seedPatients } from "../seed";
import { SPECIMEN_LABEL } from "../tests";
import type { PatientSettings } from "../types";
import { alcoholCard, alcoholEvenings, alcoholWeek, canSeeAlcohol, type AlcoholViewer } from "../wearable/alcohol";
import { analyseWearable, type WearableAnalysis } from "../wearable/analyse";
import { CONSENT_TEXT, seedPatientSettings, setConsent } from "../wearable/consent";
import { detectPatterns } from "../wearable/detect";
import type { PopulationDb } from "../wearable/population";
import { simulateSense, SWEAT_LABEL, type SenseSample } from "../wearable/sense";
import { cleanSense, evaluateSense, SENSE_LIMITS, type SenseDay } from "../wearable/senseClean";
import { cortisolTrend, stressCard, sweatCard } from "../wearable/senseView";
import { DAILY_SWEAT, SWEAT_ANALYTES, SWEAT_RATE, typicalSweatText } from "../wearable/sweatPanel";
import { sweatTrends } from "../wearable/sweatTrends";
import { simulateWearable } from "../wearable/simulate";
import type { WeatherData } from "../wearable/types";

const weather: WeatherData = JSON.parse(readFileSync("public/data/weather_chennai_2026-09-06_2026-10-05.json", "utf8"));
const population: PopulationDb = JSON.parse(readFileSync("public/data/population.json", "utf8"));
const settings = seedPatientSettings();
const settingsOf = (id: string, list: PatientSettings[] = settings) => list.find((s) => s.patientId === id)!;

type Ok = Extract<WearableAnalysis, { status: "ok" }>;
const cache = new Map<string, Ok>();
function analysis(id: string, alcohol = false): Ok {
  const key = `${id}|${alcohol}`;
  if (!cache.has(key)) {
    const a = analyseWearable(id, settingsOf(id), weather, undefined, undefined, { alcohol });
    if (a.status !== "ok") throw new Error(a.status);
    cache.set(key, a);
  }
  return cache.get(key)!;
}

// ---- Ranges -------------------------------------------------------------------------------

describe("sweat panel ranges", () => {
  it("covers the full panel as sweat (wearable) specimens, each with a typical range inside its impossible limits", () => {
    expect(Object.keys(SWEAT_ANALYTES).sort()).toEqual(["chloride", "cortisol", "ethanol", "glucose", "lactate", "potassium", "sodium", "uricAcid"]);
    expect(SPECIMEN_LABEL.sweat).toBe("Sweat (wearable)");
    for (const [key, a] of Object.entries(SWEAT_ANALYTES)) {
      expect(a.specimen, key).toBe("sweat");
      expect(a.typical.low, key).toBeGreaterThanOrEqual(a.limits.min);
      expect(a.typical.high, key).toBeLessThanOrEqual(a.limits.max);
      expect(a.typical.low, key).toBeLessThanOrEqual(a.typical.high);
      expect(a.sourcesToVerify.length, key).toBeGreaterThan(10);
      // Cleaning uses exactly these limits.
      expect(SENSE_LIMITS[key as keyof typeof SENSE_LIMITS], key).toEqual(a.limits);
    }
  });

  it("sweat ranges are not blood ranges (typical exercise sweat)", () => {
    expect(SWEAT_ANALYTES.sodium.typical).toEqual({ low: 20, high: 60 });
    expect(SWEAT_ANALYTES.chloride.typical).toEqual({ low: 15, high: 55 });
    expect(SWEAT_ANALYTES.potassium.typical).toEqual({ low: 3, high: 8 });
    expect(SWEAT_ANALYTES.glucose.typical.high).toBeLessThan(1); // blood glucose is ~4–6 mmol/L
    expect(SWEAT_ANALYTES.uricAcid.typical).toEqual({ low: 20, high: 100 });
    expect(SWEAT_ANALYTES.lactate.typical).toEqual({ low: 5, high: 40 });
    expect(SWEAT_ANALYTES.cortisol.typical).toEqual({ low: 8, high: 140 });
    expect(SWEAT_ANALYTES.ethanol.typical).toEqual({ low: 0, high: 0 });
  });

  it("every range is labelled as literature values to be verified", () => {
    for (const a of [...DAILY_SWEAT, "ethanol" as const]) expect(typicalSweatText(a)).toMatch(/literature values, prototype — to be verified/);
    expect(typicalSweatText("chloride")).toBe("15–55 mmol/L (typical sweat · literature values, prototype — to be verified)");
    expect(SWEAT_LABEL).toBe("Research-grade sweat sensor, prototype");
  });

  it("chloride: the clinical sweat-test (CF) cut-off is never used or shown", () => {
    const text = JSON.stringify(SWEAT_ANALYTES);
    expect(text).not.toMatch(/cystic|\bCF\b|fibrosis/i);
    expect(SWEAT_ANALYTES.chloride.typical.high).toBeLessThan(60);
    const cards = analysis("ravi").sense!.days.map((e) => sweatCard(e));
    for (const c of cards) expect(`${c.headline} ${c.detail}`).not.toMatch(/cystic|\bCF\b|fibrosis/i);
  });
});

// ---- Simulation ---------------------------------------------------------------------------

describe("sweat panel simulation", () => {
  const base = simulateWearable("karthik", weather)!;
  const sense = simulateSense("karthik", base, weather)!;

  it("is deterministic and reads the panel only while sweating; alcohol whenever the patch touches the skin", () => {
    expect(simulateSense("karthik", base, weather)).toEqual(sense);
    for (const s of sense) {
      if (!s.worn) expect([s.chloride, s.uricAcid, s.cortisol, s.ethanol, s.sweatRate]).toEqual([null, null, null, null, null]);
      if (s.sodium === null) expect(s.chloride).toBeNull();
      if (s.sweatRate === null) expect([s.uricAcid, s.cortisol]).toEqual([null, null]);
    }
    expect(sense.some((s) => s.ethanol !== null && s.sodium === null)).toBe(true);
    expect(sense.some((s) => s.worn && !s.sweatContact && s.eda !== null)).toBe(true); // patch lifts now and then
    expect(sense.some((s) => s.sweatRate !== null && s.sweatRate < SWEAT_RATE.min)).toBe(true); // low volume happens
  });

  it("Karthik: sweat cortisol rises with the illness (Day 26+); salt and the other analytes stay usual", () => {
    const days = analysis("karthik").sense!.days;
    expect(days[29].z.cortisol!).toBeGreaterThan(3);
    expect(days.slice(7, 25).every((e) => Math.abs(e.z.cortisol ?? 0) < 2)).toBe(true);
    for (const m of ["sodium", "chloride", "potassium", "glucose", "uricAcid", "lactate"] as const) {
      expect(days.every((e) => Math.abs(e.z[m] ?? 0) < 3), m).toBe(true);
    }
  });
});

// ---- Cleaning -----------------------------------------------------------------------------

const sample = (minute: number, over: Partial<SenseSample> = {}): SenseSample => ({
  minute,
  worn: true,
  steps: 0,
  eda: 0.8,
  bioimpedance: 480,
  sodium: 40,
  potassium: 4.5,
  glucose: 0.08,
  lactate: 12,
  chloride: 34,
  uricAcid: 40,
  cortisol: 30,
  ethanol: 0.1,
  sweatRate: 0.8,
  sweatContact: true,
  ...over,
});
const SWEAT_NULL = { sodium: null, potassium: null, glucose: null, lactate: null, chloride: null, uricAcid: null, cortisol: null };

describe("sweat panel cleaning", () => {
  it("keeps a good reading", () => {
    const r = cleanSense([sample(600)], { alcohol: true });
    expect(r.samples[0]).toMatchObject({ sodium: 40, chloride: 34, uricAcid: 40, cortisol: 30, ethanol: 0.1 });
  });

  it("low sweat volume (or no sweat rate) drops every sweat analyte, keeps EDA/impedance and alcohol", () => {
    const r = cleanSense([sample(600, { sweatRate: 0.05 }), sample(605, { sweatRate: null }), sample(610, { sweatRate: 9 })], { alcohol: true });
    for (const s of r.samples) expect(s).toMatchObject({ ...SWEAT_NULL, eda: 0.8, ethanol: 0.1 });
    expect(r.dropped.lowVolume).toBe(3);
  });

  it("sweat patch lifted: all sweat readings and alcohol dropped; EDA kept", () => {
    const r = cleanSense([sample(600, { sweatContact: false })], { alcohol: true });
    expect(r.samples[0]).toMatchObject({ ...SWEAT_NULL, ethanol: null, eda: 0.8 });
    expect(r.dropped.sweatOff).toBe(1);
  });

  it("electrode contact lost (no EDA and no impedance): the whole sample is dropped", () => {
    const r = cleanSense([sample(600, { eda: null, bioimpedance: null })], { alcohol: true });
    expect(r.samples).toHaveLength(0);
    expect(r.dropped.sensorOff).toBe(1);
  });

  it("impossible values are removed per channel, others kept", () => {
    const r = cleanSense([sample(600, { cortisol: 900, chloride: 400, uricAcid: 1 }), sample(605, { ethanol: 250 })], { alcohol: true });
    expect(r.samples[0]).toMatchObject({ cortisol: null, chloride: null, uricAcid: null, sodium: 40, lactate: 12 });
    expect(r.samples[1]).toMatchObject({ ethanol: null, sodium: 40 });
    expect(r.dropped.impossible).toBe(4);
  });

  it("motion: sweat analytes kept (exercise is when we sweat), alcohol readings dropped", () => {
    const r = cleanSense([sample(600, { steps: 400, ethanol: 9 })], { alcohol: true });
    expect(r.samples[0]).toMatchObject({ motion: true, sodium: 40, cortisol: 30, ethanol: null });
    expect(r.dropped.alcoholMotion).toBe(1);
  });

  it("alcohol is not processed unless asked; the other counters don't depend on it", () => {
    const raw = [sample(600, { ethanol: 9 }), sample(605, { sweatContact: false }), sample(610, { steps: 400 }), sample(615, { sweatRate: 0.01 })];
    const off = cleanSense(raw);
    const on = cleanSense(raw, { alcohol: true });
    expect(off.samples.every((s) => s.ethanol === null)).toBe(true);
    expect(off.dropped.alcoholMotion).toBe(0);
    expect({ ...off.dropped, alcoholMotion: 0 }).toEqual({ ...on.dropped, alcoholMotion: 0 });
  });

  it("alcohol evenings: ≥ 3 readings ≥ 2 mmol/L between 18:00 and 06:00", () => {
    const evening = (vals: number[]) => cleanSense(vals.map((v, i) => sample(21 * 60 + i * 5, { ethanol: v })), { alcohol: true }).samples;
    expect(alcoholEvenings(evening([3, 4, 5]), 1)[0]).toMatchObject({ detected: true, peak: 5, readings: 3 });
    expect(alcoholEvenings(evening([3, 4, 0.2]), 1)[0]).toMatchObject({ detected: false, peak: null });
    // 01:00 the next morning counts for the evening before.
    const late = cleanSense([0, 5, 10].map((m) => sample(1440 + 60 + m, { ethanol: 6 })), { alcohol: true }).samples;
    expect(alcoholEvenings(late, 2).map((e) => e.detected)).toEqual([true, false]);
  });
});

// ---- Alcohol consent gating ---------------------------------------------------------------

describe("alcohol consent gating", () => {
  const ravi = settingsOf("ravi");
  const shared = setConsent(ravi, "alcoholShare", true, "2026-10-05T08:00:00.000Z");
  const doctor = (hasGrant: boolean): AlcoholViewer => ({ role: "doctor", hasGrant });

  it("the toggle exists, is off by default for everyone, and older saved settings without it count as off", () => {
    expect(CONSENT_TEXT.alcoholShare.title).toBe("Share alcohol monitoring with my doctor");
    expect(settings.every((s) => s.alcoholShare?.granted === false)).toBe(true);
    const old: PatientSettings = { ...ravi };
    delete old.alcoholShare;
    expect(canSeeAlcohol(doctor(true), old)).toBe(false);
  });

  it("patient: always their own (while streaming); nobody else's", () => {
    expect(canSeeAlcohol({ role: "patient", patientId: "ravi" }, ravi)).toBe(true);
    expect(canSeeAlcohol({ role: "patient", patientId: "arjun" }, ravi)).toBe(false);
    expect(canSeeAlcohol({ role: "patient", patientId: "ravi" }, setConsent(ravi, "streaming", false, "x"))).toBe(false);
  });

  it("doctor: needs an active grant AND the alcohol toggle AND wearable shared for care", () => {
    expect(canSeeAlcohol(doctor(true), ravi)).toBe(false); // toggle off
    expect(canSeeAlcohol(doctor(false), shared)).toBe(false); // no grant
    expect(canSeeAlcohol(doctor(true), shared)).toBe(true);
    expect(canSeeAlcohol(doctor(true), setConsent(shared, "ownCare", false, "x"))).toBe(false);
  });

  it("lab, admin and public health officer: never", () => {
    for (const role of ["lab", "admin", "health_officer"] as const) expect(canSeeAlcohol({ role }, shared)).toBe(false);
  });

  it("without permission the analysis doesn't process alcohol at all", () => {
    expect(analysis("ravi").sense!.alcohol).toBeNull();
    const a = analysis("ravi", true).sense!.alcohol!;
    expect(a.filter((e) => e.detected).map((e) => e.day)).toEqual([2, 5, 9, 12, 16, 19, 23, 26, 29]);
    expect(alcoholWeek(a, 29)).toEqual({ detected: 3, of: 7 });
    expect(analysis("karthik", true).sense!.alcohol!.filter((e) => e.detected).map((e) => e.day)).toEqual([6, 13]);
  });

  it("never used in pattern detection or alerts: patterns are identical with alcohol processed", () => {
    const patients = seedPatients();
    for (const id of ["karthik", "ravi", "arjun"]) {
      const p = patients.find((x) => x.id === id)!;
      const run = (a: Ok, day: number) =>
        detectPatterns({ person: p, nights: a.nights, amplitude: a.amplitude, weather: a.weatherDays, population, record: p, settings, day, sense: a.sense!.days });
      expect(analysis(id, true).sense!.days).toEqual(analysis(id).sense!.days);
      for (const day of [20, 26, 28, 30]) expect(run(analysis(id, true), day), `${id} day ${day}`).toEqual(run(analysis(id), day));
    }
  });

  it("never in surveillance: member days and the officer's map carry no alcohol", () => {
    const k = analysis("karthik", true);
    const p = seedPatients().find((x) => x.id === "karthik")!;
    const d = detectPatterns({ person: p, nights: k.nights, amplitude: k.amplitude, weather: k.weatherDays, population, record: p, settings, day: 30, sense: k.sense!.days });
    const member = memberDayFrom(30, k.nights[29], d, k.sense!.days[29]);
    const view = buildSurveillance({ data: surveillanceSeed(), settings, outcomes: [], population, day: 30 });
    for (const text of [JSON.stringify(member), JSON.stringify(view)]) expect(text).not.toMatch(/alcohol|ethanol/i);
  });

  it("patient card: plain words, no numbers, says who can see it", () => {
    const a = analysis("ravi", true).sense!.alcohol!;
    const off = alcoholCard(a, 29, false);
    expect(off.headline).toBe("Alcohol: detected on 3 evenings this week");
    expect(off.note).toMatch(/^Only you can see this/);
    expect(`${off.headline} ${off.detail}`.replace("3 evenings", "")).not.toMatch(/\d/);
    expect(alcoholCard(a, 29, true).note).toMatch(/^Shared with your doctor/);
    expect(alcoholCard(analysis("arjun", true).sense!.alcohol!, 4, false).headline).toBe("Alcohol: none detected this week");
    for (const c of [off, alcoholCard(a, 29, true)]) expect(`${c.headline} ${c.detail}`).not.toMatch(/\byou have\b/i);
  });

  describe("store", () => {
    beforeEach(() => useInaraStore.getState().resetDemo());
    it("turning the toggle on is recorded in the consent log", () => {
      useInaraStore.getState().setPatientConsent("ravi", "alcoholShare", true);
      expect(settingsOf("ravi", useInaraStore.getState().patientSettings).alcoholShare?.granted).toBe(true);
      expect(useInaraStore.getState().consentLog).toEqual([expect.objectContaining({ patientId: "ravi", change: "alcoholShare", granted: true })]);
    });
  });
});

// ---- Patient cards and trends -------------------------------------------------------------

function senseDays(script: Partial<SenseDay>[]): SenseDay[] {
  return script.map((s, day) => ({
    day,
    date: "",
    nightEda: 0.8,
    bodyWater: 62,
    sodium: 40,
    potassium: 4.5,
    glucose: 0.08,
    lactate: 12,
    chloride: 34,
    uricAcid: 40,
    cortisol: 30 + ((day % 3) - 1) * 0.5,
    quality: 100,
    valid: true,
    sweatReadings: 100,
    ...s,
  }));
}

describe("sweat panel: patient cards", () => {
  it("salt card names chloride and says sweat isn't blood", () => {
    const c = sweatCard(analysis("karthik").sense!.days[29]);
    expect(c.detail).toMatch(/Chloride, the other half of salt, was about \d+ mmol\/L/);
    expect(c.detail).toMatch(/Sweat is not blood/);
  });

  it("stress card: a raised cortisol trend alone is enough, in words", () => {
    const calm = Array.from({ length: 14 }, () => ({}));
    const evals = evaluateSense(senseDays([...calm, { cortisol: 45 }, { cortisol: 48 }, { cortisol: 50 }]));
    expect(cortisolTrend(evals, evals.length - 1)).toMatchObject({ raised: true, raisedDays: 3 });
    const card = stressCard(evals, evals.length - 1);
    expect(card.headline).toBe("Stress: higher than usual this week");
    expect(card.detail).toMatch(/stress hormone in sweat \(cortisol\)/);
    expect(card.detail).not.toMatch(/ng\/mL|\bz\b|\d+\.\d/);
  });

  it("stories: Karthik's Day 30 stress card adds cortisol; Ravi and Arjun never have a raised cortisol trend", () => {
    const k = analysis("karthik").sense!.days;
    expect(stressCard(k, 29).detail).toMatch(/cortisol/);
    for (const id of ["ravi", "arjun"]) {
      const d = analysis(id).sense!.days;
      expect(d.every((_, i) => !cortisolTrend(d, i).raised), id).toBe(true);
    }
  });
});

describe("sweat panel: daily trends (trajectory view)", () => {
  it("covers the daily sweat analytes, never alcohol", () => {
    const t = sweatTrends(analysis("ravi", true).sense!.days, 30);
    expect(t.map((x) => x.analyte)).toEqual(DAILY_SWEAT);
    expect(JSON.stringify(t)).not.toMatch(/ethanol|alcohol/i);
  });

  it("Karthik Day 30: only sweat cortisol is rising and outside his usual; Day 20: nothing", () => {
    const days = analysis("karthik").sense!.days;
    const t30 = sweatTrends(days, 30);
    expect(t30.filter((x) => x.outsideUsual).map((x) => x.analyte)).toEqual(["cortisol"]);
    expect(t30.find((x) => x.analyte === "cortisol")).toMatchObject({ direction: "rising" });
    expect(t30.find((x) => x.analyte === "cortisol")!.change!.pct!).toBeGreaterThan(50);
    expect(sweatTrends(days, 20).filter((x) => x.outsideUsual)).toEqual([]);
  });

  it("Ravi and Arjun: stable, within their usual", () => {
    for (const id of ["ravi", "arjun"]) {
      const t = sweatTrends(analysis(id).sense!.days, 30);
      expect(t.every((x) => !x.outsideUsual && x.direction === "stable"), id).toBe(true);
    }
  });

  it("needs enough days for a baseline", () => {
    expect(sweatTrends(analysis("ravi").sense!.days, 10).every((x) => x.baseline === null && x.direction === null)).toBe(true);
  });
});
