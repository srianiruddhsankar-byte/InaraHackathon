// SIMULATED wearable data (synthetic — never real patient data). Deterministic:
// the same patient + weather always gives the same 30 days, so it is generated
// on the fly and never stored raw.
//
// Patterns: day–night rhythm (lower HR and HRV changes at night, warmer skin
// at night), activity bursts, noise, off-wrist gaps (charging), dropouts,
// motion artefacts and the occasional impossible reading. Daytime heart rate
// rises with the REAL apparent temperature, at a personal rate.
//
// Scripted for Karthik: from Day 26 a developing illness — night HR rising,
// HRV falling, skin temperature rising then falling while HR keeps rising,
// SpO2 normal. His hot humid afternoon (the hottest one in his baseline weeks)
// comes from the real weather.
import { apparentAt, hottestAfternoon } from "./weather";
import { hourOf, SAMPLE_MINUTES, SAMPLES_PER_DAY, WINDOW_DAYS, type WeatherData, type WearableSample } from "./types";

/** mulberry32: a tiny seeded random generator (0 ≤ x < 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normal noise (Box–Muller) from a uniform generator. */
function gaussian(rand: () => number): () => number {
  return () => {
    const u = Math.max(rand(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };
}

/** A scripted illness: per-day changes from `startDay` (0-based). */
export interface IllnessScript {
  startDay: number;
  nightHr: number[]; // bpm added at night
  dayHr: number[]; // bpm added by day (smaller → day–night rhythm flattens)
  hrvFactor: number[]; // × HRV
  skinTemp: number[]; // °C added
  activity: number[]; // × steps
}

export interface WearableProfile {
  seed: number;
  restingHr: number; // night resting HR, bpm
  hrv: number; // night RMSSD, ms
  skinTemp: number; // night skin temp, °C
  spo2: number; // night SpO2, %
  /** bpm per °C of apparent temperature (daytime, at rest). */
  heatSensitivity: number;
  /** Nights (0-based day) the watch was off the wrist all night. */
  offWristNights: number[];
  illness?: IllnessScript;
}

/** Karthik's illness starts on Day 26 (index 25) and builds over 5 days. */
export const KARTHIK_ILLNESS: IllnessScript = {
  startDay: 25,
  nightHr: [4, 8, 12, 17, 22],
  dayHr: [2, 4, 6, 8, 10],
  hrvFactor: [0.85, 0.74, 0.62, 0.52, 0.45],
  // Skin temp rises, then falls back (even below usual) while HR keeps rising.
  skinTemp: [0.4, 0.9, 1.1, 0.4, -0.3],
  activity: [0.8, 0.6, 0.4, 0.3, 0.3],
};

export const WEARABLE_PROFILES: Record<string, WearableProfile> = {
  karthik: { seed: 4004, restingHr: 58, hrv: 62, skinTemp: 34.4, spo2: 97.4, heatSensitivity: 2.2, offWristNights: [9], illness: KARTHIK_ILLNESS },
  ravi: { seed: 1001, restingHr: 66, hrv: 30, skinTemp: 34.1, spo2: 96.6, heatSensitivity: 1.0, offWristNights: [17] },
  priya: { seed: 2002, restingHr: 64, hrv: 45, skinTemp: 34.5, spo2: 97.8, heatSensitivity: 1.2, offWristNights: [] },
  arjun: { seed: 3003, restingHr: 60, hrv: 48, skinTemp: 34.3, spo2: 97.2, heatSensitivity: 1.2, offWristNights: [] },
};

/** Karthik's hot humid afternoon: the hottest afternoon of his baseline weeks (Day 5–20) in the real weather. */
export function scriptedHotAfternoon(w: WeatherData): number {
  return hottestAfternoon(w, 4, 19);
}

function illnessAt(script: IllnessScript | undefined, day: number) {
  const i = script ? day - script.startDay : -1;
  if (!script || i < 0) return { nightHr: 0, dayHr: 0, hrv: 1, skinTemp: 0, activity: 1 };
  const k = Math.min(i, script.nightHr.length - 1);
  return { nightHr: script.nightHr[k], dayHr: script.dayHr[k], hrv: script.hrvFactor[k], skinTemp: script.skinTemp[k], activity: script.activity[k] };
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** 30 days of 5-minute samples for one patient, or null if there is no device profile. */
export function simulateWearable(patientId: string, w: WeatherData, days = WINDOW_DAYS): WearableSample[] | null {
  const p = WEARABLE_PROFILES[patientId];
  if (!p) return null;
  const rand = seededRandom(p.seed);
  const noise = gaussian(rand);
  const samples: WearableSample[] = [];

  for (let day = 0; day < days; day++) {
    const ill = illnessAt(p.illness, day);
    // Daily routine with a little jitter.
    const wake = 6.25 + rand() * 0.75;
    const sleep = 22.75 + rand() * 0.75;
    const chargeStart = Math.floor((7.5 + rand() * 1.5) * 12); // sample index ~07:30–09:00
    const chargeLen = 6 + Math.floor(rand() * 9); // 30–70 min off the wrist
    // Natural night-to-night variation (sleep quality, meals, stress).
    const night = { hr: noise() * 1.1, hrv: noise() * 3.5, skin: noise() * 0.09, spo2: noise() * 0.2 };
    let bout = 0;
    let boutHr = 0;
    let gap = 0;

    for (let i = 0; i < SAMPLES_PER_DAY; i++) {
      const minute = (day * SAMPLES_PER_DAY + i) * SAMPLE_MINUTES;
      const h = hourOf(minute);
      const asleep = h < wake || h >= sleep;
      const circ = -Math.cos((2 * Math.PI * (h - 4)) / 24); // −1 at 04:00, +1 at 16:00
      const apparent = apparentAt(w, minute) ?? 30;

      // Off the wrist: daily charging, or a whole night without the watch.
      const offWrist = (i >= chargeStart && i < chargeStart + chargeLen) || (p.offWristNights.includes(day) && h < 5.5);
      if (offWrist) {
        samples.push({ minute, heartRate: null, hrvRmssd: null, spo2: null, skinTemp: round1(apparent - 2 + noise() * 0.3), steps: 0, worn: false });
        continue;
      }

      // Activity bursts (awake only), fewer when unwell.
      if (!asleep && bout === 0 && rand() < 0.035 * ill.activity) {
        bout = 2 + Math.floor(rand() * 7);
        boutHr = 28 + rand() * 22;
      }
      const active = bout > 0;
      if (bout > 0) bout--;
      const steps = asleep
        ? rand() < 0.05
          ? Math.round(5 + rand() * 20) // turning over
          : 0
        : active
          ? Math.round((400 + rand() * 500) * ill.activity)
          : Math.round(rand() * 80 * ill.activity);

      let hr: number;
      let hrv: number;
      let spo2: number;
      let skin: number;
      if (asleep) {
        hr = p.restingHr + night.hr + 2 * circ + ill.nightHr + noise() * 1.2;
        hrv = (p.hrv + night.hrv) * (1 - 0.08 * circ) * ill.hrv + noise() * 4;
        spo2 = p.spo2 + night.spo2 + noise() * 0.5;
        skin = p.skinTemp + night.skin + 0.15 * -circ + ill.skinTemp + noise() * 0.1;
      } else {
        hr = p.restingHr + 10 + 4 * circ + p.heatSensitivity * (apparent - 30) + ill.dayHr + noise() * 2;
        hrv = p.hrv * 0.6 * ill.hrv + noise() * 3;
        spo2 = p.spo2 + 0.8 + noise() * 0.5;
        skin = p.skinTemp - 1.3 + 0.06 * (apparent - 30) + ill.skinTemp * 0.8 + noise() * 0.15;
      }
      if (active) {
        hr += boutHr;
        hrv *= 0.45;
        skin += 0.3;
      }

      let sample: WearableSample = {
        minute,
        heartRate: Math.round(hr),
        hrvRmssd: Math.round(Math.max(5, hrv)),
        spo2: round1(Math.min(100, spo2)),
        skinTemp: round1(skin),
        steps,
        worn: true,
      };

      // Short dropouts (worn but no reading).
      if (gap === 0 && rand() < 0.004) gap = 1 + Math.floor(rand() * 3);
      if (gap > 0) {
        gap--;
        sample = { ...sample, heartRate: null, hrvRmssd: null, spo2: null };
      } else if (active && rand() < 0.08) {
        // Motion artefact: the optical sensor loses lock while moving.
        sample = { ...sample, heartRate: rand() < 0.5 ? 236 : 27, spo2: round1(82 + rand() * 6) };
      } else if (rand() < 0.002) {
        // A rare impossible reading.
        sample = { ...sample, spo2: 101.5, skinTemp: 41.2 };
      }
      samples.push(sample);
    }
  }
  return samples;
}
