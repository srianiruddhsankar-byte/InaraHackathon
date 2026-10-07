// MarQ Sense — the extra sensors of our band design (SIMULATED, synthetic,
// deterministic, generated on the fly and never stored raw).
//
// Built ON TOP of the existing samples from simulate.ts (same minutes, same
// on/off-wrist times, same steps) with its OWN random stream, so the heart
// rate, HRV, skin temperature and SpO₂ streams — and every story built on
// them — are exactly unchanged.
//
// Streams:
// - EDA / galvanic skin response (µS): sweat-gland activity (stress, heat, sweating).
// - Bioimpedance (Ω, wrist, 50 kHz) → body-water estimate (%).
// - Sweat biochemistry (sodium, potassium, glucose, lactate): research-grade
//   sensor, prototype. Only readable while the skin is sweating.
// - GPS: reduced to the area on the device; coordinates are never kept (toArea).
import { apparentAt } from "./weather";
import { seededRandom } from "./simulate";
import { dayOf, hourOf, type WeatherData, type WearableSample } from "./types";

export const SWEAT_LABEL = "Research-grade sensor, prototype";

/**
 * Body water from wrist impedance — a simple PROTOTYPE calibration (linear,
 * Z at 50 kHz). Real devices calibrate per person against reference methods.
 */
export const BODY_WATER = { intercept: 98, perOhm: 0.075 };

export function bodyWaterFromImpedance(ohm: number): number {
  return Math.round((BODY_WATER.intercept - BODY_WATER.perOhm * ohm) * 100) / 100;
}

export interface SenseSample {
  minute: number;
  worn: boolean;
  steps: number;
  /** Electrodermal activity (µS). Null = electrode contact lost. */
  eda: number | null;
  /** Wrist bioimpedance (Ω). Null = electrode contact lost. */
  bioimpedance: number | null;
  /** Sweat analytes; null = no sweat to sample (or contact lost). */
  sodium: number | null; // mmol/L
  potassium: number | null; // mmol/L
  glucose: number | null; // mmol/L
  lactate: number | null; // mmol/L
}

export interface SenseProfile {
  seed: number;
  /** Night EDA at rest (µS). */
  nightEda: number;
  /** Night wrist impedance (Ω). */
  impedance: number;
  sweat: { sodium: number; potassium: number; glucose: number; lactate: number };
  firmware: string;
  /** Battery at Day 30, 07:00 (%), before the demo clock moves. */
  battery: number;
  /** Karthik's illness from Day 26 (index 25): night EDA up (fever, sympathetic drive), impedance up (less fluid). */
  illness?: { startDay: number; eda: number[]; impedance: number[] };
}

export const SENSE_PROFILES: Record<string, SenseProfile> = {
  karthik: {
    seed: 0x5e45e + 4004,
    nightEda: 0.8,
    impedance: 480,
    sweat: { sodium: 38, potassium: 4.6, glucose: 0.08, lactate: 13 },
    firmware: "MarQ Sense FW 1.4.2",
    battery: 46,
    illness: { startDay: 25, eda: [0.25, 0.45, 0.6, 0.5, 0.4], impedance: [0, 6, 14, 24, 34] },
  },
  ravi: {
    seed: 0x5e45e + 1001,
    nightEda: 1.1,
    impedance: 510,
    sweat: { sodium: 46, potassium: 5.2, glucose: 0.14, lactate: 15 },
    firmware: "MarQ Sense FW 1.4.2",
    battery: 71,
  },
  priya: {
    seed: 0x5e45e + 2002,
    nightEda: 0.9,
    impedance: 560,
    sweat: { sodium: 36, potassium: 4.8, glucose: 0.08, lactate: 12 },
    firmware: "MarQ Sense FW 1.4.1",
    battery: 88,
  },
  arjun: {
    seed: 0x5e45e + 3003,
    nightEda: 0.9,
    impedance: 470,
    sweat: { sodium: 34, potassium: 4.4, glucose: 0.07, lactate: 12 },
    firmware: "MarQ Sense FW 1.4.2",
    battery: 63,
  },
};

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

/** Mean "feels like" over 12:00–17:00 of a day (the afternoon that dries you out). */
function afternoonFeelsLike(w: WeatherData, day: number): number {
  const vals: number[] = [];
  for (let h = 12; h < 17; h++) {
    const v = w.hourly.apparent_temperature[day * 24 + h];
    if (v !== null && v !== undefined) vals.push(v);
  }
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 30;
}

/**
 * The MarQ Sense streams for the same minutes as `base` (from simulateWearable).
 * Null when the patient has no device profile.
 */
export function simulateSense(patientId: string, base: WearableSample[], w: WeatherData): SenseSample[] | null {
  const p = SENSE_PROFILES[patientId];
  if (!p) return null;
  const rand = seededRandom(p.seed);
  const noise = () => {
    const u = Math.max(rand(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };
  const out: SenseSample[] = [];
  let currentDay = -1;
  let nightly = { eda: 0, z: 0, heat: 0 };
  let ill = { eda: 0, impedance: 0 };
  let contactGap = 0;

  for (const s of base) {
    const day = dayOf(s.minute);
    if (day !== currentDay) {
      currentDay = day;
      // Night-to-night variation; yesterday's hot afternoon dries you a little (mostly made up by drinking).
      const yesterday = day > 0 ? afternoonFeelsLike(w, day - 1) : 30;
      nightly = { eda: noise() * 0.06, z: noise() * 2, heat: Math.max(0, yesterday - 38) * 0.5 };
      const k = p.illness ? day - p.illness.startDay : -1;
      ill =
        p.illness && k >= 0
          ? { eda: p.illness.eda[Math.min(k, p.illness.eda.length - 1)], impedance: p.illness.impedance[Math.min(k, p.illness.impedance.length - 1)] }
          : { eda: 0, impedance: 0 };
    }
    const empty: SenseSample = { minute: s.minute, worn: s.worn, steps: s.steps, eda: null, bioimpedance: null, sodium: null, potassium: null, glucose: null, lactate: null };
    if (!s.worn) {
      out.push(empty);
      continue;
    }
    const h = hourOf(s.minute);
    const night = h < 5.5;
    const awake = h >= 6.5 && h < 22.75;
    const active = s.steps > 100;
    const apparent = apparentAt(w, s.minute) ?? 30;

    // Electrode contact lost now and then (loose band): EDA, impedance and sweat all drop out.
    if (contactGap === 0 && rand() < 0.002) contactGap = 3 + Math.floor(rand() * 8);
    if (contactGap > 0) {
      contactGap--;
      out.push(empty);
      continue;
    }

    let eda = night
      ? p.nightEda + nightly.eda + ill.eda + noise() * 0.04
      : p.nightEda * 3 + Math.max(0, apparent - 30) * 0.15 + ill.eda + noise() * 0.3 + (active ? 2 + rand() * 3 : 0);
    let z = p.impedance + nightly.z + nightly.heat + ill.impedance + noise() * 1.5 + (night ? 0 : -4);

    // Sweat: only while the skin is actually sweating (awake and active, or warm).
    const sweating = awake && (active || apparent >= 34);
    let sweat: Pick<SenseSample, "sodium" | "potassium" | "glucose" | "lactate"> = { sodium: null, potassium: null, glucose: null, lactate: null };
    if (sweating) {
      const rate = (active ? 1 : 0) + Math.max(0, apparent - 34) * 0.15; // higher sweat rate → a little more sodium
      sweat = {
        sodium: round(p.sweat.sodium + rate * 4 + noise() * 3, 1),
        potassium: round(p.sweat.potassium + noise() * 0.4, 1),
        glucose: round(Math.max(0.01, p.sweat.glucose + noise() * 0.015), 3),
        lactate: round(p.sweat.lactate + (active ? 8 : 0) + noise() * 2, 1),
      };
    }

    // Motion artefacts: electrodes slide while moving.
    if (active && rand() < 0.15) {
      eda = rand() < 0.5 ? 70 + rand() * 30 : eda * (2 + rand());
      z += (rand() - 0.5) * 300;
    } else if (rand() < 0.001) {
      // A rare impossible reading.
      eda = -0.5;
      z = 0;
    }
    out.push({ ...empty, eda: round(eda, 2), bioimpedance: round(z, 1), ...sweat });
  }
  return out;
}

// ---- GPS: area only ---------------------------------------------------------------

/** Public area centres (not anyone's location) used to name the area a fix falls in. */
const AREA_CENTRES: { area: string; city: string; lat: number; lon: number }[] = [
  { area: "Velachery", city: "Chennai", lat: 12.9791, lon: 80.2209 },
  { area: "Adyar", city: "Chennai", lat: 13.0063, lon: 80.2574 },
  { area: "T. Nagar", city: "Chennai", lat: 13.0418, lon: 80.2341 },
  { area: "Tambaram", city: "Chennai", lat: 12.9249, lon: 80.1275 },
  { area: "Anna Nagar", city: "Chennai", lat: 13.085, lon: 80.2101 },
  { area: "Mylapore", city: "Chennai", lat: 13.0339, lon: 80.2696 },
  { area: "Perambur", city: "Chennai", lat: 13.1167, lon: 80.2333 },
  { area: "Sholinganallur", city: "Chennai", lat: 12.901, lon: 80.2279 },
];

/** A fix further than this from every area centre isn't named (city only, if inside the city box). */
export const AREA_RADIUS_KM = 4;

export interface AreaFix {
  area: string | null;
  city: string | null;
}

function km(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = Math.PI / 180;
  const x = (bLon - aLon) * rad * Math.cos(((aLat + bLat) / 2) * rad);
  const y = (bLat - aLat) * rad;
  return Math.sqrt(x * x + y * y) * 6371;
}

/**
 * Reduce a GPS fix to the area it falls in, on the device. Only the area and
 * city names come out; the coordinates are dropped here and never stored or shared.
 */
export function toArea(fix: { lat: number; lon: number }): AreaFix {
  let best: (typeof AREA_CENTRES)[number] | null = null;
  let bestKm = Infinity;
  for (const c of AREA_CENTRES) {
    const d = km(fix.lat, fix.lon, c.lat, c.lon);
    if (d < bestKm) {
      best = c;
      bestKm = d;
    }
  }
  if (best && bestKm <= AREA_RADIUS_KM) return { area: best.area, city: best.city };
  const inChennai = fix.lat > 12.8 && fix.lat < 13.25 && fix.lon > 80.05 && fix.lon < 80.35;
  return { area: null, city: inChennai ? "Chennai" : null };
}
