import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { seedPatients } from "../seed";
import { TESTS } from "../tests";
import { normaliseName } from "../normalise";
import { analyseWearable } from "../wearable/analyse";
import { evaluateNights, type NightEvaluation } from "../wearable/baseline";
import { CONDITIONS, conditionById, GATES, PAST_DENGUE_FACTOR } from "../wearable/conditions";
import { seedPatientSettings, setConsent } from "../wearable/consent";
import { detectPatterns, pastDengue, type DetectInput } from "../wearable/detect";
import {
  ageBand,
  filterLevel,
  ladderFor,
  percentile,
  POPULATION_FILE,
  prevalenceFor,
  removeFromStat,
  resolveReference,
  type PopulationDb,
  type PopulationLevel,
} from "../wearable/population";
import type { DayNightAmplitude, NightSummary, WeatherData } from "../wearable/types";
import { WEATHER_FILE, type WeatherAdjustedDay } from "../wearable/weather";

const weather: WeatherData = JSON.parse(readFileSync(`public${WEATHER_FILE}`, "utf8"));
const population: PopulationDb = JSON.parse(readFileSync(`public${POPULATION_FILE}`, "utf8"));
const settings = seedPatientSettings();
const patients = seedPatients();
const patient = (id: string) => patients.find((p) => p.id === id)!;

function realInput(id: string, day: number): DetectInput {
  const p = patient(id);
  const a = analyseWearable(id, settings.find((s) => s.patientId === id), weather);
  if (a.status !== "ok") throw new Error(a.status);
  return { person: p, nights: a.nights, amplitude: a.amplitude, weather: a.weatherDays, population, record: p, settings, day };
}

// ---- Synthetic nights for rule tests --------------------------------------------------
// 14 steady baseline nights (HR 56, HRV 60, skin 34.4, SpO2 97, small wobble),
// then the scripted nights. Spreads end up at the floors (HR 1.5, HRV 3, temp 0.15, SpO2 0.5).
type Night = Partial<Pick<NightSummary, "restingHr" | "hrv" | "skinTemp" | "spo2" | "quality">>;
const USUAL = { restingHr: 56, hrv: 60, skinTemp: 34.4, spo2: 97 };

function nightsOf(script: Night[], usual: Night = {}): NightEvaluation[] {
  const base: Night[] = Array.from({ length: 14 }, (_, i) => ({ restingHr: 56 + ((i % 3) - 1) * 0.5, ...usual }));
  return evaluateNights(
    [...base, ...script].map((n, day) => {
      const quality = n.quality ?? 100;
      return { day, date: "", ...USUAL, ...n, quality, valid: quality >= 50 };
    }),
  );
}

const flatAmp = (days: number): DayNightAmplitude[] => Array.from({ length: days }, (_, day) => ({ day, hr: 30, skinTemp: -1 }));
const mildWeather = (days: number): WeatherAdjustedDay[] =>
  Array.from({ length: days }, (_, day) => ({ day, apparentTemp: 34, humidity: 60, observedHr: 80, expectedHr: 80, residual: 0 }));

function synth(script: Night[], over: Partial<DetectInput> = {}): ReturnType<typeof detectPatterns> {
  const nights = nightsOf(script);
  return detectPatterns({
    person: { id: "test", age: 30, sex: "M", city: "Chennai" },
    nights,
    amplitude: flatAmp(nights.length),
    weather: mildWeather(nights.length),
    population: null,
    record: { pastIllnesses: [], visitHistory: [] },
    settings,
    day: nights.length,
    ...over,
  });
}

const levelOf = (d: ReturnType<typeof detectPatterns>, id: string) =>
  d.status === "ok" ? (d.patterns.find((p) => p.id === id)?.level ?? "none") : "insufficient";

describe("condition library", () => {
  it("has the six conditions, each with rules, documented thresholds, questions and references", () => {
    expect(CONDITIONS.map((c) => c.id)).toEqual(["early_infection", "dengue_like", "respiratory", "heat_dehydration", "high_resting_hr", "poor_recovery"]);
    for (const c of CONDITIONS) {
      expect(c.signalRules.length, c.id).toBeGreaterThan(0);
      expect(c.questions.length, c.id).toBeGreaterThan(0);
      expect(c.references.length, c.id).toBeGreaterThan(0);
      for (const [name, th] of Object.entries(c.thresholds)) expect(th.reason.length, `${c.id}.${name}`).toBeGreaterThan(10);
    }
    expect(GATES.baselineNights.value).toBe(7);
    expect(GATES.nightQuality.value).toBe(60);
  });

  it("dengue labs include CBC with platelets, haematocrit and free-text NS1 / IgM", () => {
    const labs = conditionById("dengue_like").suggestedLabTests;
    expect(labs.map((l) => l.testKey)).toEqual(expect.arrayContaining(["platelets", "hct"]));
    expect(labs.filter((l) => !l.testKey && !l.panelId).map((l) => l.label)).toEqual(["Dengue NS1 antigen", "Dengue IgM"]);
  });

  it("haematocrit is in the test dictionary with aliases", () => {
    expect(TESTS.hct).toMatchObject({ unit: "%", loinc: "4544-3" });
    for (const name of ["HCT", "PCV", "Packed Cell Volume", "Hematocrit"]) expect(normaliseName(name)).toBe("hct");
  });
});

describe("rules: early infection", () => {
  it("positive: HR z ≥ 2 with warmer skin → watch on night 1, concerning once ≥ 2 nights and ≥ +10 bpm", () => {
    expect(levelOf(synth([{ restingHr: 60, skinTemp: 34.8 }]), "early_infection")).toBe("watch");
    expect(levelOf(synth([{ restingHr: 60, skinTemp: 34.8 }, { restingHr: 63, skinTemp: 34.9 }]), "early_infection")).toBe("watch"); // +7 bpm
    expect(levelOf(synth([{ restingHr: 62, skinTemp: 34.8 }, { restingHr: 67, skinTemp: 34.9 }]), "early_infection")).toBe("concerning");
  });

  it("low HRV is an alternative supporting sign", () => {
    expect(levelOf(synth([{ restingHr: 62, hrv: 50 }, { restingHr: 67, hrv: 48 }]), "early_infection")).toBe("concerning");
  });

  it("negative: raised HR alone (no supporting sign) or supporting sign alone → none", () => {
    expect(levelOf(synth([{ restingHr: 62 }, { restingHr: 67 }]), "early_infection")).toBe("none");
    expect(levelOf(synth([{ skinTemp: 35 }, { skinTemp: 35 }]), "early_infection")).toBe("none");
  });

  it("a flattened day–night rhythm is listed as a supporting factor", () => {
    const nights = nightsOf([{ restingHr: 60, skinTemp: 34.8 }]);
    const amplitude = flatAmp(nights.length).map((a, i) => (i === nights.length - 1 ? { ...a, hr: 15 } : a));
    const d = synth([{ restingHr: 60, skinTemp: 34.8 }], { amplitude });
    expect(d.status === "ok" && d.patterns[0].supportingFactors.join()).toMatch(/Flattened day–night rhythm/);
  });
});

describe("rules: dengue-like", () => {
  const fever = { skinTemp: 34.8 }; // z ≈ 2.7
  it("positive: fever ≥ 2 nights, then temp back to usual while HR keeps rising → concerning", () => {
    const d = synth([{ ...fever, restingHr: 60 }, { ...fever, restingHr: 63 }, { skinTemp: 34.4, restingHr: 66 }]);
    expect(levelOf(d, "dengue_like")).toBe("concerning");
  });

  it("negative: HR falls with the temperature (normal recovery) → none", () => {
    expect(levelOf(synth([{ ...fever, restingHr: 62 }, { ...fever, restingHr: 63 }, { skinTemp: 34.4, restingHr: 58 }]), "dengue_like")).toBe("none");
  });

  it("negative: only one fever night → none", () => {
    expect(levelOf(synth([{ restingHr: 60 }, { ...fever, restingHr: 63 }, { skinTemp: 34.4, restingHr: 66 }]), "dengue_like")).toBe("none");
  });

  it("past dengue in the record lowers the thresholds by 25%", () => {
    expect(PAST_DENGUE_FACTOR).toBe(0.75);
    // Skin z ≈ 1.33 (below 1.5, above 1.125) and HR z ≈ 1.7–1.8 on the last night (below 2, above 1.5).
    const script = [{ skinTemp: 34.6, restingHr: 57 }, { skinTemp: 34.6, restingHr: 58 }, { skinTemp: 34.4, restingHr: 58.7 }];
    expect(levelOf(synth(script), "dengue_like")).toBe("none");
    const withDengue = synth(script, { record: { pastIllnesses: ["Dengue fever (2023)"], visitHistory: [] } });
    expect(levelOf(withDengue, "dengue_like")).toBe("concerning");
    expect(withDengue.status === "ok" && withDengue.patterns[0].supportingFactors[0]).toMatch(/Past dengue.*lowered by 25%/);
  });

  it("finds past dengue in past illnesses or visit notes", () => {
    expect(pastDengue({ pastIllnesses: [], visitHistory: [{ date: "2023-10-01", note: "Admitted with dengue" } as never] })).toMatch(/dengue/);
    expect(pastDengue({ pastIllnesses: ["Typhoid (2019)"], visitHistory: [] })).toBeNull();
  });
});

describe("rules: respiratory", () => {
  it("positive: SpO₂ ≥ 3 points below usual with HR up on 2 nights → concerning; 1 night → watch", () => {
    expect(levelOf(synth([{ spo2: 93.8, restingHr: 58 }]), "respiratory")).toBe("watch");
    expect(levelOf(synth([{ spo2: 93.8, restingHr: 58 }, { spo2: 93.5, restingHr: 58 }]), "respiratory")).toBe("concerning");
  });

  it("below 94% counts even when the drop from usual is under 3 points", () => {
    const nights = nightsOf([{ spo2: 93.5, restingHr: 58 }], { spo2: 95.5 }); // usual 95.5 → only 2 points down
    expect(levelOf(synth([], { nights, day: nights.length }), "respiratory")).toBe("watch");
    expect(levelOf(synth([{ spo2: 95.5, restingHr: 58 }]), "respiratory")).toBe("none"); // 1.5 below usual 97, above 94
  });

  it("negative: low SpO₂ without a raised HR (likely sensor) → none", () => {
    expect(levelOf(synth([{ spo2: 93.5 }, { spo2: 93.5 }]), "respiratory")).toBe("none");
  });
});

describe("rules: heat strain / dehydration", () => {
  const hot = (residual: number) => (days: number) =>
    mildWeather(days).map((w, i) => (i === days - 2 ? { ...w, apparentTemp: 41, observedHr: 95 + residual, expectedHr: 95, residual } : w));

  it("positive: very hot afternoon with HR ≥ 5 above weather-expected, then a poor night → concerning", () => {
    const nights = nightsOf([{}, { restingHr: 60 }]);
    expect(levelOf(synth([{}, { restingHr: 60 }], { weather: hot(7)(nights.length) }), "heat_dehydration")).toBe("concerning");
  });

  it("negative: a hot afternoon fully explained by the weather → nothing at all", () => {
    const nights = nightsOf([{}, { restingHr: 60 }]);
    const d = synth([{}, {}], { weather: hot(0.5)(nights.length) });
    expect(d.status === "ok" && d.patterns).toEqual([]);
  });

  it("negative: heat residual on a mild day (< 40 °C) → none", () => {
    const nights = nightsOf([{}, { restingHr: 60 }]);
    const weather = mildWeather(nights.length).map((w, i) => (i === nights.length - 2 ? { ...w, residual: 8 } : w));
    expect(levelOf(synth([{}, { restingHr: 60 }], { weather }), "heat_dehydration")).toBe("none");
  });
});

describe("rules: high resting HR", () => {
  it("positive: night HR > 100 or z ≥ 4 without fever → watch, 2 nights → concerning", () => {
    expect(levelOf(synth([{ restingHr: 63 }]), "high_resting_hr")).toBe("watch");
    expect(levelOf(synth([{ restingHr: 63 }, { restingHr: 64 }]), "high_resting_hr")).toBe("concerning");
  });

  it("negative: a recent fever explains the high HR → none", () => {
    expect(levelOf(synth([{ restingHr: 63, skinTemp: 35 }, { restingHr: 64 }]), "high_resting_hr")).toBe("none");
  });
});

describe("rules: poor recovery", () => {
  const low = { hrv: 54 }; // z = −2
  it("positive: HRV z ≤ −1.5 for ≥ 4 nights with normal temp and HR → watch", () => {
    expect(levelOf(synth([low, low, low, low]), "poor_recovery")).toBe("watch");
    expect(levelOf(synth([low, low, low, low, low, low, low]), "poor_recovery")).toBe("concerning");
  });

  it("negative: only 3 nights, or with raised HR → none", () => {
    expect(levelOf(synth([low, low, low]), "poor_recovery")).toBe("none");
    expect(levelOf(synth([low, low, low, { ...low, restingHr: 60 }]), "poor_recovery")).toBe("none");
  });
});

describe("gates", () => {
  it("fewer than 7 valid baseline nights → insufficient data", () => {
    const nights = evaluateNights(Array.from({ length: 6 }, (_, day) => ({ day, date: "", ...USUAL, quality: 100, valid: true })));
    const d = detectPatterns({ ...realInput("karthik", 1), nights, day: 6, population: null });
    expect(d).toMatchObject({ status: "insufficient_data", reason: expect.stringMatching(/5\/7/) });
  });

  it("night quality under 60% → insufficient data, even with a clear signal", () => {
    expect(synth([{ restingHr: 70, skinTemp: 35, quality: 55 }])).toMatchObject({ status: "insufficient_data", reason: expect.stringMatching(/55% usable/) });
  });
});

describe("population: fallback ladder and consent", () => {
  it("Karthik: Velachery is too small → Chennai city data", () => {
    const ref = resolveReference(population, patient("karthik"), settings)!;
    expect(ref.level.name).toBe("Chennai");
    expect(ref.reason).toBe("Velachery has 38 people — using Chennai city data (1,240 people).");
    expect(ref.tried.map((t) => [t.name, t.used])).toEqual([["Velachery", false], ["Chennai", true]]);
    expect(ref.groupLabel).toBe("men 18–29");
  });

  it("ladder: area → city → state → national; no area on record → national", () => {
    expect(ladderFor(population, { area: "Velachery", city: "Chennai" }).map((l) => l.level)).toEqual(["area", "city", "state", "national"]);
    expect(ladderFor(population, {}).map((l) => l.name)).toEqual(["India"]);
    expect(resolveReference(population, patient("arjun"), settings)!.reason).toMatch(/Area not on record — using India national data/);
  });

  it("a level big enough overall but with too few people like them also goes up", () => {
    const big: PopulationLevel = { ...population.levels[0], groups: population.levels[0].groups.map((g) => ({ ...g, n: g.sex === "F" ? 200 : 5 })) };
    const db = { ...population, levels: [big, ...population.levels.slice(1)] };
    expect(resolveReference(db, patient("karthik"), settings)!.reason).toMatch(/Velachery has only 4 men 18–29 — using Chennai/); // 5 minus Karthik himself
  });

  it("Karthik's own data is never in his reference", () => {
    const chennai = population.levels.find((l) => l.id === "chennai")!;
    const raw = chennai.groups.find((g) => g.sex === "M" && g.ageBand === "18-29")!;
    const ref = resolveReference(population, patient("karthik"), settings)!;
    expect(ref.excludedSelf).toBe(true);
    expect(ref.group.n).toBe(raw.n - 1);
    expect(ref.people).toBe(chennai.groups.reduce((a, g) => a + g.n, 0) - 1);
    // Removing his low HR (56) nudges the mean up.
    expect(ref.group.restingHr.mean).toBeGreaterThan(raw.restingHr.mean);
  });

  it("only people with population-share consent count: withdrawing removes them", () => {
    const india = population.levels.find((l) => l.id === "india")!;
    const all = filterLevel(india, "arjun", "M", "50-59", settings);
    expect(all.withdrawn).toEqual([]);
    const off = settings.map((s) => (s.patientId === "ravi" ? setConsent(s, "populationShare", false, "2026-10-01T00:00:00Z") : s));
    const without = filterLevel(india, "arjun", "M", "50-59", off);
    expect(without.withdrawn).toEqual(["ravi"]);
    expect(without.people).toBe(all.people - 1);
    expect(without.group!.n).toBe(all.group!.n - 1);
  });

  it("removing values from a mean/SD is exact", () => {
    const values = [50, 60, 70, 80];
    const mean = 65;
    const sd = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / 3);
    const r = removeFromStat({ mean, sd }, 4, [80]);
    expect(r.n).toBe(3);
    expect(r.stat.mean).toBeCloseTo(60, 9);
    expect(r.stat.sd).toBeCloseTo(10, 9);
  });

  it("percentile and age bands", () => {
    expect(percentile(62, { mean: 62, sd: 7 })).toBe(50);
    expect(percentile(55, { mean: 62, sd: 7 })).toBe(16);
    expect(percentile(200, { mean: 62, sd: 7 })).toBe(99);
    expect([17, 26, 35, 52, 70].map(ageBand)).toEqual(["18-29", "18-29", "30-39", "50-59", "60+"]);
  });

  it("monthly prevalence: dengue in Chennai is high in October, moderate in September; Velachery falls back to Chennai", () => {
    expect(prevalenceFor(population, "chennai", "dengue", 9)!.band).toBe("high");
    expect(prevalenceFor(population, "chennai", "dengue", 8)!.band).toBe("moderate");
    expect(prevalenceFor(population, "velachery", "dengue", 10)).toMatchObject({ band: "high", levelName: "Chennai" });
  });
});

describe("detection on the simulated patients", () => {
  const top = (id: string, day: number) => {
    const d = detectPatterns(realInput(id, day));
    return d.status === "ok" ? (d.patterns[0] ? `${d.patterns[0].id}:${d.patterns[0].level}` : "none") : "insufficient";
  };

  it("Karthik's timeline: nothing to Day 25, early infection watch → concerning, then dengue-like on Day 30", () => {
    const timeline = Array.from({ length: 30 }, (_, i) => top("karthik", i + 1));
    // Days 1–7: building baseline; Day 10: watch off overnight.
    for (const day of [1, 2, 3, 4, 5, 6, 7, 10]) expect(timeline[day - 1], `day ${day}`).toBe("insufficient");
    for (let day = 8; day <= 25; day++) if (day !== 10) expect(timeline[day - 1], `day ${day}`).toBe("none");
    expect(timeline.slice(25)).toEqual([
      "early_infection:watch",
      "early_infection:watch",
      "early_infection:concerning",
      "early_infection:concerning",
      "dengue_like:concerning",
    ]);
  });

  it("Day 7 (hot humid afternoon) triggers nothing — the weather explains it", () => {
    const d = detectPatterns(realInput("karthik", 8)); // the night after the hot afternoon
    expect(d.status === "ok" && d.patterns).toEqual([]);
  });

  it("Day 30: dengue-like with evidence, past dengue + Chennai October as supporting factors, early infection below it", () => {
    const d = detectPatterns(realInput("karthik", 30));
    if (d.status !== "ok") throw new Error();
    const [first, second] = d.patterns;
    expect(first).toMatchObject({ id: "dengue_like", level: "concerning", populationLevel: "Chennai (city)" });
    expect(first.score).toBeGreaterThan(0.6);
    expect(first.score).toBeLessThan(1);
    expect(first.evidence.join(" | ")).toMatch(/Night HR still rising: 74 → 78 \(usual 56\)/);
    expect(first.supportingFactors.join(" | ")).toMatch(/Past dengue in record/);
    expect(first.supportingFactors.join(" | ")).toMatch(/Dengue high in Chennai in October/);
    expect(second).toMatchObject({ id: "early_infection", level: "concerning" });
    expect(second.evidence[0]).toBe("Night HR 78 vs usual 56 (+22)");
    expect(d.reference!.level.name).toBe("Chennai");
  });

  it("Ravi and Arjun: no pattern on any day", () => {
    for (const id of ["ravi", "arjun"]) for (let day = 1; day <= 30; day++) expect(["none", "insufficient"], `${id} day ${day}`).toContain(top(id, day));
  });
});
