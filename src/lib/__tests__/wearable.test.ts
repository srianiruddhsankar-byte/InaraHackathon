import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useInaraStore } from "@/store/useInaraStore";
import { seedPatients } from "../seed";
import { seedUsers } from "../users";
import { analyseWearable } from "../wearable/analyse";
import { BASELINE, evaluateNights, robustBaseline, usualHrAmplitude, zScore } from "../wearable/baseline";
import { cleanSamples, dayNightAmplitude, isImpossible, MOTION_STEPS, nightSummary } from "../wearable/clean";
import { canProcessWearable, contactErrors, doctorCanView, seedPatientSettings, setConsent } from "../wearable/consent";
import { KARTHIK_ILLNESS, scriptedHotAfternoon, seededRandom, simulateWearable } from "../wearable/simulate";
import { SAMPLES_PER_DAY, WINDOW_DAYS, type NightSummary, type WeatherData, type WearableSample } from "../wearable/types";
import { expectedHr, fitHeatModel, isUsableWeather, WEATHER_FILE, type HeatPoint } from "../wearable/weather";

const weather: WeatherData = JSON.parse(readFileSync(`public${WEATHER_FILE}`, "utf8"));
const settings = seedPatientSettings();
const settingsOf = (id: string) => settings.find((s) => s.patientId === id);

function analysed(id: string) {
  const a = analyseWearable(id, settingsOf(id), weather);
  if (a.status !== "ok") throw new Error(`${id}: ${a.status}`);
  return a;
}

/** A worn, valid, resting sample at `minute`. */
function sample(minute: number, over: Partial<WearableSample> = {}): WearableSample {
  return { minute, heartRate: 56, hrvRmssd: 60, spo2: 97, skinTemp: 34.5, steps: 0, worn: true, ...over };
}

/** One night (00:00–05:00) of day `day`, 5-minute samples. */
function night(day: number, over: (i: number) => Partial<WearableSample> = () => ({})): WearableSample[] {
  return Array.from({ length: 60 }, (_, i) => sample(day * 1440 + i * 5, over(i)));
}

describe("weather file (real, Open-Meteo)", () => {
  it("covers the 30-day window hour by hour for Chennai", () => {
    expect(isUsableWeather(weather)).toBe(true);
    expect(weather.location).toMatchObject({ name: "Chennai", latitude: 13.08, longitude: 80.27 });
    expect(weather.hourly.time).toHaveLength(WINDOW_DAYS * 24);
    expect(weather.hourly.apparent_temperature.every((v) => typeof v === "number")).toBe(true);
  });
});

describe("simulation", () => {
  it("is deterministic and makes 5-minute samples for 30 days", () => {
    const a = simulateWearable("karthik", weather)!;
    expect(a).toHaveLength(WINDOW_DAYS * SAMPLES_PER_DAY);
    expect(simulateWearable("karthik", weather)).toEqual(a);
    expect(seededRandom(7)()).toBe(seededRandom(7)());
  });

  it("includes off-wrist gaps, dropouts, impossible values and motion", () => {
    const a = simulateWearable("arjun", weather)!;
    expect(a.some((s) => !s.worn)).toBe(true);
    expect(a.some((s) => s.worn && s.heartRate === null)).toBe(true);
    expect(a.some((s) => isImpossible(s))).toBe(true);
    expect(a.some((s) => s.steps > MOTION_STEPS)).toBe(true);
  });

  it("has a day–night rhythm: lower heart rate at night", () => {
    const amp = analysed("arjun").amplitude.filter((x) => x.hr !== null);
    expect(amp.every((x) => x.hr! > 10)).toBe(true);
  });

  it("no device profile → no data", () => {
    expect(simulateWearable("nobody", weather)).toBeNull();
  });
});

describe("cleaning", () => {
  it("drops not-worn samples and gaps", () => {
    const r = cleanSamples([sample(0), sample(5, { worn: false }), sample(10, { heartRate: null }), sample(15)]);
    expect(r.samples.map((s) => s.minute)).toEqual([0, 15]);
    expect(r.dropped).toEqual({ notWorn: 1, missing: 1, impossible: 0 });
  });

  it.each([
    [{ heartRate: 29 }],
    [{ heartRate: 221 }],
    [{ spo2: 69 }],
    [{ spo2: 100.5 }],
    [{ skinTemp: 29.9 }],
    [{ skinTemp: 40.1 }],
  ])("drops impossible values %j", (over) => {
    const r = cleanSamples([sample(0, over)]);
    expect(r.samples).toEqual([]);
    expect(r.dropped.impossible).toBe(1);
  });

  it("keeps edge values (HR 30/220, SpO2 70/100, temp 30/40)", () => {
    const r = cleanSamples([sample(0, { heartRate: 30, spo2: 70, skinTemp: 30 }), sample(60, { heartRate: 220, spo2: 100, skinTemp: 40 })]);
    expect(r.samples).toHaveLength(2);
  });

  it("marks motion samples (many steps) and keeps them out of smoothing", () => {
    const r = cleanSamples([sample(0), sample(5, { steps: MOTION_STEPS + 1, heartRate: 110 }), sample(10)]);
    expect(r.samples.map((s) => s.motion)).toEqual([false, true, false]);
    expect(r.samples[1].heartRate).toBe(110);
  });

  it("smooths a single-sample spike with a 3-point median", () => {
    const r = cleanSamples([sample(0), sample(5, { heartRate: 80 }), sample(10)]);
    expect(r.samples[1].heartRate).toBe(56);
  });
});

describe("nightly metrics", () => {
  it("uses only 00:00–05:00, low-motion samples", () => {
    const raw = [
      ...night(3, (i) => (i % 10 === 0 ? { steps: 300, heartRate: 95 } : {})),
      sample(3 * 1440 + 6 * 60, { heartRate: 100 }), // 06:00 — not night
    ];
    const n = nightSummary(cleanSamples(raw).samples, 3);
    expect(n).toMatchObject({ day: 3, restingHr: 56, hrv: 60, spo2: 97, skinTemp: 34.5, valid: true });
    expect(n.quality).toBe(90); // 6 of 60 samples were moving
  });

  it("a night with too little usable data is not valid", () => {
    const raw = night(2, (i) => (i < 40 ? { worn: false } : {}));
    const n = nightSummary(cleanSamples(raw).samples, 2);
    expect(n.quality).toBe(33);
    expect(n.valid).toBe(false);
  });

  it("day–night amplitude compares daytime (10–20h) with night", () => {
    const raw = [...night(1), ...Array.from({ length: 24 }, (_, i) => sample(1440 + 12 * 60 + i * 5, { heartRate: 80, skinTemp: 33.5 }))];
    expect(dayNightAmplitude(cleanSamples(raw).samples, 1)).toEqual({ day: 1, hr: 24, skinTemp: -1 });
  });

  it("Karthik's off-wrist night (Day 10) is not judged; the rest of his nights are good", () => {
    const a = analysed("karthik");
    expect(a.nights[9].night.valid).toBe(false);
    expect(a.nights.filter((n) => n.night.valid)).toHaveLength(29);
    expect(a.quality).toBeGreaterThan(75);
  });
});

describe("weather correction", () => {
  it("linear regression recovers slope and intercept", () => {
    const points: HeatPoint[] = Array.from({ length: 20 }, (_, i) => ({ day: 0, hour: 12, apparentTemp: 30 + i * 0.5, restingHr: 50 + 2 * (30 + i * 0.5) }));
    const m = fitHeatModel(points)!;
    expect(m.slope).toBeCloseTo(2, 6);
    expect(m.intercept).toBeCloseTo(50, 6);
    expect(m.r2).toBeCloseTo(1, 6);
    expect(expectedHr(m, 40)).toBeCloseTo(130, 6);
    expect(fitHeatModel(points.slice(0, 5))).toBeNull();
  });

  it("learns Karthik's personal heat effect (≈ 2.2 bpm per °C) from his baseline days", () => {
    const m = analysed("karthik").heatModel!;
    expect(m.slope).toBeGreaterThan(1.8);
    expect(m.slope).toBeLessThan(2.6);
    expect(m.r2).toBeGreaterThan(0.7);
  });

  it("the hot humid afternoon: high daytime HR, explained by the weather (small residual)", () => {
    const a = analysed("karthik");
    const hot = scriptedHotAfternoon(weather);
    expect(hot).toBeLessThan(KARTHIK_ILLNESS.startDay);
    const baselineDays = a.weatherDays.slice(0, 21).filter((d) => d.observedHr !== null);
    const usual = [...baselineDays.map((d) => d.observedHr!)].sort((x, y) => x - y)[Math.floor(baselineDays.length / 2)];
    const day = a.weatherDays[hot];
    expect(day.apparentTemp).toBeGreaterThan(40);
    expect(day.observedHr! - usual).toBeGreaterThan(4);
    expect(Math.abs(day.residual!)).toBeLessThan(2);
  });

  it("illness days: heart rate higher than the weather explains", () => {
    const a = analysed("karthik");
    for (const d of [27, 28, 29]) expect(a.weatherDays[d].residual!).toBeGreaterThan(5);
  });
});

describe("personal baseline", () => {
  it("needs at least 7 valid nights", () => {
    expect(robustBaseline([1, 2, 3, 4, 5, 6])).toBeNull();
    expect(robustBaseline([56, 57, 55, 56, 58, 56, 54])).toEqual({ median: 56, spread: 1.4826, n: 7 });
    expect(zScore(60, { median: 56, spread: 2, n: 7 })).toBe(2);
  });

  it("uses only previous valid nights (max 28) and doesn't judge before 7", () => {
    const nights: NightSummary[] = Array.from({ length: 12 }, (_, day) => ({
      day,
      date: "",
      restingHr: day === 11 ? 66 : 56 + (day % 3),
      hrv: 60,
      skinTemp: 34.5,
      spo2: 97,
      quality: day === 4 ? 10 : 100,
      valid: day !== 4,
    }));
    const e = evaluateNights(nights);
    expect(e[6].judged).toBe(false);
    expect(e[8]).toMatchObject({ judged: true, baselineNights: 7 }); // night 4 (invalid) skipped
    expect(e[11].z.restingHr).toBeGreaterThan(5);
    expect(BASELINE.maxNights).toBe(28);
  });

  it("Karthik's late nights: high HR z-scores, low HRV, skin temp up then down, SpO2 normal", () => {
    const n = analysed("karthik").nights;
    const z = (day: number) => n[day - 1].z;
    for (const day of [26, 27, 28, 29, 30]) {
      expect(z(day).restingHr!, `day ${day}`).toBeGreaterThan(2.5);
      expect(Math.abs(z(day).spo2!), `day ${day} SpO2`).toBeLessThan(2);
    }
    expect(z(30).restingHr!).toBeGreaterThan(z(28).restingHr!);
    expect(z(28).restingHr!).toBeGreaterThan(z(26).restingHr!);
    expect(z(30).restingHr!).toBeGreaterThan(8);
    expect(z(29).hrv!).toBeLessThan(-3);
    expect(z(28).skinTemp!).toBeGreaterThan(3); // rising
    expect(z(30).skinTemp!).toBeLessThan(0); // falling while HR keeps rising
    // Before the illness: nothing unusual.
    for (let day = 8; day <= 25; day++) if (z(day).restingHr !== undefined) expect(Math.abs(z(day).restingHr!)).toBeLessThan(2.5);
  });

  it("Karthik's day–night rhythm flattens during the illness", () => {
    const a = analysed("karthik");
    const usual = usualHrAmplitude(a.amplitude, 29)!;
    expect(a.amplitude[29].hr!).toBeLessThan(usual * 0.7);
  });

  it("Arjun stays near 0", () => {
    const zs = analysed("arjun").nights.flatMap((e) => Object.values(e.z));
    const abs = zs.map(Math.abs).sort((a, b) => a - b);
    expect(abs[Math.floor(abs.length / 2)]).toBeLessThan(1);
    expect(Math.max(...abs)).toBeLessThan(3);
  });
});

describe("consent", () => {
  it("streaming off → no wearable data is generated or processed", () => {
    const source = vi.fn(simulateWearable);
    const off = setConsent(settingsOf("karthik")!, "streaming", false, "2026-10-01T00:00:00Z");
    expect(analyseWearable("karthik", off, weather, source)).toEqual({ status: "not_enabled" });
    expect(analyseWearable("karthik", undefined, weather, source)).toEqual({ status: "not_enabled" });
    expect(source).not.toHaveBeenCalled();
    expect(analyseWearable("karthik", settingsOf("karthik"), weather, source).status).toBe("ok");
    expect(source).toHaveBeenCalledTimes(1);
  });

  it("Priya has streaming off; everyone else streams", () => {
    expect(analyseWearable("priya", settingsOf("priya"), weather)).toEqual({ status: "not_enabled" });
    expect(["ravi", "arjun", "karthik"].map((id) => canProcessWearable(settingsOf(id)))).toEqual([true, true, true]);
  });

  it("the doctor sees wearable data only if the patient allows use for their own care", () => {
    const k = settingsOf("karthik")!;
    expect(doctorCanView(k)).toBe(true);
    expect(doctorCanView(setConsent(k, "ownCare", false, "2026-10-01T00:00:00Z"))).toBe(false);
  });

  it("each consent is a separate choice with its own timestamp", () => {
    const k = setConsent(settingsOf("karthik")!, "populationShare", false, "2026-10-01T10:00:00Z");
    expect(k.populationShare).toEqual({ granted: false, updatedAt: "2026-10-01T10:00:00Z" });
    expect(k.streaming.granted).toBe(true);
    expect(k.ownCare.updatedAt).not.toBe("2026-10-01T10:00:00Z");
  });

  it("validates the emergency contact", () => {
    expect(contactErrors({ name: "Revathi R", relation: "Mother", phone: "+91 90000 10004" })).toEqual([]);
    expect(contactErrors({ name: "", relation: "", phone: "123" })).toHaveLength(3);
  });
});

describe("Karthik (seed)", () => {
  it("is a 26-year-old man in Velachery, Chennai, with past dengue, assigned to Dr. Meera", () => {
    const k = seedPatients().find((p) => p.id === "karthik")!;
    expect(k).toMatchObject({ name: "Karthik R", age: 26, sex: "M", city: "Chennai", area: "Velachery" });
    expect(k.pastIllnesses!.join(" ")).toMatch(/Dengue.*2023/);
    expect(k.visitHistory.some((v) => v.date.startsWith("2023") && /dengue/i.test(v.note))).toBe(true);
    const users = seedUsers();
    expect(users.find((u) => u.id === "u-meera")!.patientIds).toContain("karthik");
    expect(users.find((u) => u.id === "u-karthik")).toMatchObject({ phone: "+919000000004", patientId: "karthik" });
    expect(settingsOf("karthik")).toMatchObject({
      ownCare: { granted: true },
      populationShare: { granted: true },
      streaming: { granted: true },
      emergencyContact: { relation: "Mother" },
    });
  });
});

describe("store: consent", () => {
  beforeEach(() => useInaraStore.getState().resetDemo());

  it("changing a consent updates its timestamp and appends to the log; reset restores", () => {
    const s = useInaraStore.getState();
    s.setPatientConsent("karthik", "streaming", false);
    const k = useInaraStore.getState().patientSettings.find((p) => p.patientId === "karthik")!;
    expect(k.streaming.granted).toBe(false);
    expect(k.streaming.updatedAt > "2026-09-01").toBe(true);
    expect(useInaraStore.getState().consentLog).toEqual([expect.objectContaining({ patientId: "karthik", change: "streaming", granted: false })]);
    s.setEmergencyContact("priya", { name: "S Kumar", relation: "Father", phone: "+91 90000 10002" });
    expect(useInaraStore.getState().patientSettings.find((p) => p.patientId === "priya")!.emergencyContact).toMatchObject({ name: "S Kumar" });
    s.resetDemo();
    expect(useInaraStore.getState().patientSettings).toEqual(seedPatientSettings());
    expect(useInaraStore.getState().consentLog).toEqual([]);
  });
});
