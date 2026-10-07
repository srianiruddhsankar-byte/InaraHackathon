import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { seedPatients } from "../seed";
import { analyseWearable, type WearableAnalysis } from "../wearable/analyse";
import { evaluateNights } from "../wearable/baseline";
import { conditionById } from "../wearable/conditions";
import { seedPatientSettings, setConsent } from "../wearable/consent";
import { detectPatterns, type DetectInput } from "../wearable/detect";
import type { PopulationDb } from "../wearable/population";
import { bodyWaterFromImpedance, simulateSense, toArea, type SenseSample } from "../wearable/sense";
import { analyseSense, cleanSense, evaluateSense, MIN_SWEAT_READINGS, senseDay, type SenseDay } from "../wearable/senseClean";
import { deviceStatus, hydrationCard, MARQ_PLATFORM, MARQ_SENSORS, stressCard, sweatCard } from "../wearable/senseView";
import { simulateWearable } from "../wearable/simulate";
import type { NightSummary, WeatherData } from "../wearable/types";
import type { WeatherAdjustedDay } from "../wearable/weather";

const weather: WeatherData = JSON.parse(readFileSync("public/data/weather_chennai_2026-09-06_2026-10-05.json", "utf8"));
const population: PopulationDb = JSON.parse(readFileSync("public/data/population.json", "utf8"));
const settings = seedPatientSettings();
const patients = seedPatients();

const analyses = new Map<string, Extract<WearableAnalysis, { status: "ok" }>>();
function analysis(id: string) {
  if (!analyses.has(id)) {
    const a = analyseWearable(id, settings.find((s) => s.patientId === id), weather);
    if (a.status !== "ok") throw new Error(a.status);
    analyses.set(id, a);
  }
  return analyses.get(id)!;
}

// ---- Simulation -------------------------------------------------------------------------

describe("MarQ Sense simulation", () => {
  const base = simulateWearable("karthik", weather)!;

  it("is deterministic and follows the base samples minute by minute (no reading when not worn)", () => {
    const a = simulateSense("karthik", base, weather)!;
    expect(simulateSense("karthik", base, weather)).toEqual(a);
    expect(a).toHaveLength(base.length);
    a.forEach((s, i) => {
      expect(s.minute).toBe(base[i].minute);
      expect(s.steps).toBe(base[i].steps);
      if (!base[i].worn) expect([s.eda, s.bioimpedance, s.sodium]).toEqual([null, null, null]);
    });
    expect(simulateSense("nobody", base, weather)).toBeNull();
  });

  it("leaves the existing streams untouched (the base samples are not changed by it)", () => {
    const copy = JSON.parse(JSON.stringify(base));
    simulateSense("karthik", base, weather);
    expect(base).toEqual(copy);
    expect(simulateWearable("karthik", weather)).toEqual(base);
  });

  it("reads sweat only while sweating, and has contact gaps, motion artefacts and rare impossible values", () => {
    const a = simulateSense("karthik", base, weather)!;
    const night = a.filter((s) => s.worn && (s.minute % 1440) / 60 < 5);
    expect(night.every((s) => s.sodium === null)).toBe(true);
    expect(a.some((s) => s.worn && s.eda === null && s.bioimpedance === null)).toBe(true); // contact lost
    expect(a.some((s) => (s.eda ?? 0) > 60)).toBe(true); // motion artefact
    expect(a.some((s) => s.eda !== null && s.eda < 0)).toBe(true); // impossible
  });

  it("estimates body water from impedance with a documented prototype calibration", () => {
    expect(bodyWaterFromImpedance(480)).toBe(62);
    expect(bodyWaterFromImpedance(520)).toBe(59);
  });

  it("consent: with streaming off neither the base nor the MarQ Sense streams are generated", () => {
    const source = vi.fn(simulateWearable);
    const senseSource = vi.fn(simulateSense);
    const off = setConsent(settings.find((s) => s.patientId === "karthik")!, "streaming", false, "2026-10-01T00:00:00Z");
    expect(analyseWearable("karthik", off, weather, source, senseSource)).toEqual({ status: "not_enabled" });
    expect(source).not.toHaveBeenCalled();
    expect(senseSource).not.toHaveBeenCalled();
  });
});

// ---- Cleaning ------------------------------------------------------------------------------

const sample = (minute: number, over: Partial<SenseSample> = {}): SenseSample => ({
  minute,
  worn: true,
  steps: 0,
  eda: 0.8,
  bioimpedance: 480,
  sodium: null,
  potassium: null,
  glucose: null,
  lactate: null,
  ...over,
});

describe("MarQ Sense cleaning", () => {
  it("drops not-worn and sensor-off (electrode contact lost) samples", () => {
    const r = cleanSense([sample(0), sample(5, { worn: false }), sample(10, { eda: null, bioimpedance: null })]);
    expect(r.samples).toHaveLength(1);
    expect(r.dropped).toEqual({ notWorn: 1, sensorOff: 1, impossible: 0 });
  });

  it("removes impossible values per channel and keeps the rest of the sample", () => {
    const r = cleanSense([
      sample(0, { eda: -0.5, bioimpedance: 480 }),
      sample(60, { eda: 75, bioimpedance: 0, sodium: 250, potassium: 4, glucose: 5, lactate: 0.2 }),
    ]);
    expect(r.dropped.impossible).toBe(6);
    expect(r.samples[0]).toMatchObject({ eda: null, bioimpedance: 480 });
    expect(r.samples[1]).toMatchObject({ eda: null, bioimpedance: null, sodium: null, potassium: 4, glucose: null, lactate: null });
  });

  it("motion: EDA and impedance are kept out of resting values and their smoothing; sweat readings are kept", () => {
    const r = cleanSense([sample(0), sample(5, { steps: 400, eda: 9, bioimpedance: 700, sodium: 45 }), sample(10)]);
    expect(r.samples[1]).toMatchObject({ motion: true, eda: 9, sodium: 45 });
    expect(r.samples[0].eda).toBe(0.8); // not pulled up by the moving sample
    const day = senseDay(r.samples, 0);
    expect(day.nightEda).toBe(0.8);
    expect(day.bodyWater).toBe(62);
  });

  it("3-point median smooths a single resting spike", () => {
    const r = cleanSense([sample(0), sample(5, { eda: 3 }), sample(10)]);
    expect(r.samples[1].eda).toBe(0.8);
  });

  it("a daily sweat value needs enough readings; a night needs enough electrode contact", () => {
    const daytime = (n: number) => Array.from({ length: n }, (_, i) => sample(600 + i * 5, { sodium: 40 + i }));
    expect(senseDay(cleanSense(daytime(MIN_SWEAT_READINGS - 1)).samples, 0).sodium).toBeNull();
    expect(senseDay(cleanSense(daytime(MIN_SWEAT_READINGS)).samples, 0).sodium).toBe(42.5);
    const fewNight = senseDay(cleanSense([sample(0), sample(5)]).samples, 0);
    expect(fewNight.valid).toBe(false);
  });

  it("real data: Karthik's night EDA rises and body water falls from the illness; Ravi and Arjun stay usual", () => {
    const k = analysis("karthik").sense!.days;
    expect(k[29].z.bodyWater!).toBeLessThan(-2.5);
    expect(k.slice(25).every((e) => (e.z.nightEda ?? 0) >= 1.5)).toBe(true);
    for (const id of ["ravi", "arjun"]) {
      for (const e of analysis(id).sense!.days) {
        expect(Math.abs(e.z.bodyWater ?? 0), `${id} day ${e.sense.day + 1}`).toBeLessThan(2);
        expect(e.z.nightEda ?? 0).toBeLessThan(1.5);
      }
    }
  });
});

// ---- Rules (synthetic) ----------------------------------------------------------------------

const USUAL = { restingHr: 56, hrv: 60, skinTemp: 34.4, spo2: 97 };
type Night = Partial<Pick<NightSummary, "restingHr" | "hrv" | "skinTemp" | "spo2">>;

function nights(script: Night[]) {
  const base: Night[] = Array.from({ length: 14 }, (_, i) => ({ restingHr: 56 + ((i % 3) - 1) * 0.5 }));
  return evaluateNights([...base, ...script].map((n, day) => ({ day, date: "", ...USUAL, ...n, quality: 100, valid: true })));
}

type SenseNight = Partial<Pick<SenseDay, "nightEda" | "bodyWater" | "sodium">>;
function senseOf(script: SenseNight[]) {
  const base: SenseNight[] = Array.from({ length: 14 }, (_, i) => ({ bodyWater: 62 + ((i % 3) - 1) * 0.05 }));
  return evaluateSense(
    [...base, ...script].map((s, day) => ({
      day,
      date: "",
      nightEda: 0.8,
      bodyWater: 62,
      sodium: 40,
      potassium: 4.5,
      glucose: 0.08,
      lactate: 12,
      quality: 100,
      valid: true,
      sweatReadings: 100,
      ...s,
    })),
  );
}

const weatherDays = (n: number, hotIndex: number | null, residual = 0): WeatherAdjustedDay[] =>
  Array.from({ length: n }, (_, day) => ({
    day,
    apparentTemp: day === hotIndex ? 41 : 34,
    humidity: 60,
    observedHr: 80 + (day === hotIndex ? residual : 0),
    expectedHr: 80,
    residual: day === hotIndex ? residual : 0,
  }));

function run(scriptN: Night[], scriptS: SenseNight[] | null, hotIndex: number | null, residual = 0) {
  const n = nights(scriptN);
  const input: DetectInput = {
    person: { id: "test", age: 30, sex: "M", city: "Chennai" },
    nights: n,
    amplitude: n.map((_, day) => ({ day, hr: 30, skinTemp: -1 })),
    weather: weatherDays(n.length, hotIndex, residual),
    population: null,
    record: { pastIllnesses: [], visitHistory: [] },
    settings,
    day: n.length,
    sense: scriptS ? senseOf(scriptS) : undefined,
  };
  const d = detectPatterns(input);
  return d.status === "ok" ? d.patterns : [];
}
const level = (p: ReturnType<typeof run>, id: string) => p.find((x) => x.id === id)?.level ?? "none";

describe("heat / dehydration with MarQ Sense", () => {
  const heat = conditionById("heat_dehydration");

  it("documents the new thresholds", () => {
    expect(heat.thresholds.bodyWaterZ.value).toBe(2);
    expect(heat.thresholds.bodyWaterDrop.value).toBe(1);
    expect(heat.thresholds.sweatSodium.value).toBe(60);
    expect(heat.references.join(" ")).toMatch(/Baker/);
  });

  // Day 15 (index 14) is hot, with HR fully explained by the weather; night of Day 16 (index 15) judged.
  const calm: Night[] = [{}, {}];

  it("hot afternoon + body water clearly down + high sweat sodium → concerning", () => {
    const p = run(calm, [{ sodium: 68 }, { bodyWater: 60.5 }], 14);
    expect(level(p, "heat_dehydration")).toBe("concerning");
    expect(p[0].evidence.join(" ")).toMatch(/Body water estimate 60\.5% vs usual 62\.0/);
    expect(p[0].evidence.join(" ")).toMatch(/sweat sodium 68 mmol\/L — high salt loss/);
  });

  it("hot afternoon + body water down, normal sweat sodium → watch", () => {
    expect(level(run(calm, [{ sodium: 42 }, { bodyWater: 60.5 }], 14), "heat_dehydration")).toBe("watch");
  });

  it("low body water without a hot afternoon never triggers it", () => {
    expect(level(run(calm, [{ sodium: 70 }, { bodyWater: 59 }], null), "heat_dehydration")).toBe("none");
  });

  it("a hot afternoon with body water in the usual range never triggers it", () => {
    expect(level(run(calm, [{ sodium: 70 }, { bodyWater: 61.9 }], 14), "heat_dehydration")).toBe("none");
  });

  it("a small dip (< 1 point) is not enough even if the z-score is large", () => {
    expect(level(run(calm, [{ sodium: 70 }, { bodyWater: 61.3 }], 14), "heat_dehydration")).toBe("none");
  });

  it("without MarQ Sense data the rule is exactly the old one", () => {
    expect(level(run(calm, null, 14), "heat_dehydration")).toBe("none");
    expect(level(run([{}, { restingHr: 62 }], null, 14, 8), "heat_dehydration")).toBe("concerning");
  });
});

describe("poor recovery / stress with MarQ Sense", () => {
  const lowHrv: Night[] = Array.from({ length: 5 }, () => ({ hrv: 50 }));

  it("documents the EDA thresholds", () => {
    const c = conditionById("poor_recovery");
    expect([c.thresholds.edaZ.value, c.thresholds.edaNights.value, c.thresholds.edaConcerningNights.value]).toEqual([1.5, 4, 5]);
  });

  it("5 nights of low HRV with raised EDA on 4 of them → concerning (stress response)", () => {
    const eda: SenseNight[] = [{}, { nightEda: 1.2 }, { nightEda: 1.2 }, { nightEda: 1.3 }, { nightEda: 1.2 }];
    const p = run(lowHrv, eda, null);
    const pr = p.find((x) => x.id === "poor_recovery")!;
    expect(pr.level).toBe("concerning");
    expect(pr.supportingFactors.join(" ")).toMatch(/Stress response/);
  });

  it("the same nights without raised EDA stay watch (7 nights needed)", () => {
    expect(level(run(lowHrv, [{}, {}, {}, {}, {}], null), "poor_recovery")).toBe("watch");
    expect(level(run(lowHrv, null, null), "poor_recovery")).toBe("watch");
  });

  it("raised EDA alone (HRV normal) never creates a pattern", () => {
    const eda: SenseNight[] = Array.from({ length: 5 }, () => ({ nightEda: 1.5 }));
    expect(run([{}, {}, {}, {}, {}], eda, null)).toEqual([]);
  });
});

// ---- Story invariants -------------------------------------------------------------------------

describe("stories are unchanged with MarQ Sense signals", () => {
  for (const id of ["karthik", "ravi", "arjun"]) {
    it(`${id}: the same patterns, levels and order on every day with or without the new signals`, () => {
      const a = analysis(id);
      const p = patients.find((x) => x.id === id)!;
      for (let day = 1; day <= 30; day++) {
        const input: DetectInput = { person: p, nights: a.nights, amplitude: a.amplitude, weather: a.weatherDays, population, record: p, settings, day };
        const brief = (d: ReturnType<typeof detectPatterns>) => (d.status === "ok" ? d.patterns.map((x) => `${x.id}:${x.level}`) : d.status);
        expect(brief(detectPatterns({ ...input, sense: a.sense!.days })), `${id} day ${day}`).toEqual(brief(detectPatterns(input)));
      }
    });
  }

  it("Karthik's Day 30 is still dengue-like (concerning) first", () => {
    const a = analysis("karthik");
    const p = patients.find((x) => x.id === "karthik")!;
    const d = detectPatterns({ person: p, nights: a.nights, amplitude: a.amplitude, weather: a.weatherDays, population, record: p, settings, day: 30, sense: a.sense!.days });
    expect(d.status === "ok" && d.patterns.map((x) => `${x.id}:${x.level}`)).toEqual(["dengue_like:concerning", "early_infection:concerning"]);
  });
});

// ---- Patient wording, device, GPS ------------------------------------------------------------

describe("patient cards (plain language)", () => {
  it("Karthik on Day 30: hydration low, stress higher than usual this week; Day 20: normal", () => {
    const k = analysis("karthik").sense!.days;
    expect(hydrationCard(k[29]).headline).toBe("Hydration: low today — drink water");
    expect(stressCard(k, 29).headline).toBe("Stress: higher than usual this week");
    expect(hydrationCard(k[19]).headline).toBe("Hydration: normal");
    expect(stressCard(k, 19).headline).not.toMatch(/higher than usual this week/);
  });

  it("'a bit low' between 1.5 and 2.5 SD below usual", () => {
    const e = senseOf([{ bodyWater: 61.3 }]).at(-1)!; // spread floored at 0.4 → z ≈ −1.75
    expect(hydrationCard(e).headline).toBe("Hydration: a bit low today — drink water");
  });

  it("sweat sodium is always shown with what it means; other sweat values never reach patients", () => {
    const cards = analysis("ravi").sense!.days.map((e) => sweatCard(e));
    for (const c of cards) {
      if (/\d/.test(c.detail)) expect(c.detail).toMatch(/Most people's sweat has about 20–60 mmol\/L/);
      expect(c.note).toBe("Research-grade sensor, prototype");
    }
    const high = sweatCard(senseOf([{ sodium: 72 }]).at(-1)!);
    expect(high.headline).toBe("Salt in sweat: higher than most people");
    const all = [...cards, high, ...analysis("karthik").sense!.days.flatMap((e, i, arr) => [hydrationCard(e), stressCard(arr, i)])];
    for (const c of all) {
      const text = `${c.headline} ${c.detail}`;
      expect(text).not.toMatch(/glucose|lactate|potassium|z-score|\bz\b|µS|Ω/i);
      expect(text).not.toMatch(/\byou have\b/i);
    }
  });
});

describe("MarQ Sense device", () => {
  const a = () => analysis("karthik");

  it("lists the hardware from the spec", () => {
    const hw = [...MARQ_SENSORS.map((s) => s.hardware), ...MARQ_PLATFORM.map((p) => p.value)].join(" | ");
    for (const part of ["GSR electrodes", "MEMS 3-axis accelerometer", "Thermistor", "amperometric / potentiometric", "PPG", "GPS", "ESP32 / nRF52", "Li-Po", "pogo-pin", "Silicone band"]) {
      expect(hw).toContain(part);
    }
  });

  it("battery drains with the demo clock; taking the band off disconnects it", () => {
    const s0 = deviceStatus({ patientId: "karthik", night: a().nights[29], sense: a().sense!.days[29], simHours: 0, area: "Velachery" })!;
    expect(s0).toMatchObject({ model: "MarQ Sense", battery: 46, connected: true, lastSync: "Just now" });
    expect(s0.sensors.find((x) => x.id === "gps")!.status).toBe("Area: Velachery");
    expect(s0.sensors.every((x) => x.ok)).toBe(true);
    const s12 = deviceStatus({ patientId: "karthik", night: a().nights[29], sense: a().sense!.days[29], simHours: 12, watchOffAt: "2026-10-05T07:00:00.000Z" })!;
    expect(s12.battery).toBe(16);
    expect(s12.batteryLow).toBe(true);
    expect(s12.connected).toBe(false);
    expect(s12.sensors.every((x) => x.status === "Not worn")).toBe(true);
    expect(deviceStatus({ patientId: "nobody", night: undefined, sense: undefined, simHours: 0 })).toBeNull();
  });
});

describe("GPS is reduced to the area", () => {
  it("names the area and drops the coordinates", () => {
    const fix = toArea({ lat: 12.9802, lon: 80.2185 });
    expect(fix).toEqual({ area: "Velachery", city: "Chennai" });
    expect(JSON.stringify(fix)).not.toMatch(/12\.98|80\.21|lat|lon/);
  });

  it("outside every area: city only (or nothing outside the city)", () => {
    expect(toArea({ lat: 13.2, lon: 80.1 })).toEqual({ area: null, city: "Chennai" });
    expect(toArea({ lat: 28.61, lon: 77.2 })).toEqual({ area: null, city: null });
  });

  it("no wearable or MarQ Sense sample carries coordinates", () => {
    const base = simulateWearable("karthik", weather)!;
    const sense = simulateSense("karthik", base, weather)!;
    expect(Object.keys(base[0])).not.toEqual(expect.arrayContaining(["lat"]));
    for (const s of [base[0], sense[0]]) expect(Object.keys(s).some((k) => /lat|lon|gps|coord/i.test(k))).toBe(false);
  });
});

describe("analyseSense summary", () => {
  it("reports drops and quality for the doctor's data-quality card", () => {
    const base = simulateWearable("arjun", weather)!;
    const r = analyseSense(simulateSense("arjun", base, weather)!, 30);
    expect(r.days).toHaveLength(30);
    expect(r.dropped.notWorn).toBeGreaterThan(0);
    expect(r.dropped.sensorOff).toBeGreaterThan(0);
    expect(r.dropped.impossible).toBeGreaterThan(0);
    expect(r.quality).toBeGreaterThan(90);
  });
});
