// MarQ Sense: the device panel and the patient's plain-language cards (pure, tested).
// Patients never see z-scores, and never a raw sweat number without saying what it means.
// Sweat glucose, potassium, uric acid, lactate and the cortisol numbers are doctor-only
// (research-grade, easy to misread); patients get cortisol only as part of the stress card,
// in words. Alcohol has its own card and consent (alcohol.ts).
import type { NightEvaluation } from "./baseline";
import { SENSE_PROFILES, SWEAT_LABEL } from "./sense";
import type { SenseEvaluation } from "./senseClean";

// ---- Hardware (from the MarQ Sense spec) ---------------------------------------------

export type SensorId = "ppg" | "accelerometer" | "thermistor" | "eda" | "bioimpedance" | "sweat" | "gps";

export const MARQ_SENSORS: { id: SensorId; name: string; hardware: string; measures: string; research?: boolean }[] = [
  { id: "ppg", name: "Optical heart sensor", hardware: "PPG (green + red/infrared LEDs, photodiode)", measures: "Heart rate, HRV, SpO₂" },
  { id: "accelerometer", name: "Motion sensor", hardware: "MEMS 3-axis accelerometer", measures: "Movement, steps, sleep, motion artefacts" },
  { id: "thermistor", name: "Skin temperature", hardware: "Thermistor (NTC)", measures: "Skin temperature" },
  { id: "eda", name: "Skin conductance", hardware: "Bioimpedance / GSR electrodes", measures: "EDA (stress, sweating)" },
  { id: "bioimpedance", name: "Body water", hardware: "Bioimpedance / GSR electrodes (50 kHz)", measures: "Body-water estimate (hydration)" },
  { id: "sweat", name: "Sweat biosensor", hardware: "On-skin sweat biosensor (amperometric / potentiometric)", measures: "Sweat panel: sodium, chloride, potassium, glucose, uric acid, lactate, cortisol; alcohol through the skin", research: true },
  { id: "gps", name: "Location", hardware: "GPS", measures: "Area only (e.g. “Velachery”) — exact coordinates are never stored or shared" },
];

export const MARQ_PLATFORM = [
  { label: "Microcontroller", value: "ESP32 / nRF52 (Bluetooth Low Energy)" },
  { label: "Battery", value: "Li-Po, rechargeable" },
  { label: "Charging", value: "Magnetic pogo-pin charging dock" },
  { label: "Band", value: "Silicone band" },
];

/** Battery use per hour of the demo clock (%). */
export const BATTERY_PER_HOUR = 2.5;

export interface SensorStatus {
  id: SensorId;
  name: string;
  hardware: string;
  measures: string;
  research?: boolean;
  ok: boolean;
  status: string;
}

export interface DeviceStatus {
  model: "MarQ Sense";
  firmware: string;
  battery: number;
  batteryLow: boolean;
  connected: boolean;
  lastSync: string;
  sensors: SensorStatus[];
}

export function deviceStatus(input: {
  patientId: string;
  /** The day shown (0-based night index). */
  night: NightEvaluation | undefined;
  sense: SenseEvaluation | undefined;
  /** Demo clock hours after Day 30, 07:00. */
  simHours: number;
  /** Set while the band is off the wrist (demo "Take watch off"). */
  watchOffAt?: string | null;
  area?: string;
}): DeviceStatus | null {
  const p = SENSE_PROFILES[input.patientId];
  if (!p) return null;
  const battery = Math.max(3, Math.round(p.battery - BATTERY_PER_HOUR * input.simHours));
  const connected = !input.watchOffAt;
  const nightQ = input.night?.night.quality ?? 0;
  const s = input.sense?.sense;
  const status = (id: SensorId): { ok: boolean; status: string } => {
    if (!connected) return { ok: false, status: "Not worn" };
    switch (id) {
      case "ppg":
        return input.night?.night.valid ? { ok: true, status: `OK · ${nightQ}% of last night usable` } : { ok: false, status: "Not enough signal last night" };
      case "accelerometer":
      case "thermistor":
        return { ok: true, status: "OK" };
      case "eda":
      case "bioimpedance":
        return s?.valid ? { ok: true, status: `OK · electrode contact ${s.quality}% of last night` } : { ok: false, status: "Poor electrode contact last night" };
      case "sweat":
        return s && s.sweatReadings > 0 ? { ok: true, status: `Sampling · ${s.sweatReadings} readings that day` } : { ok: true, status: "Waiting for sweat to sample" };
      case "gps":
        return { ok: true, status: input.area ? `Area: ${input.area}` : "Area not set" };
    }
  };
  return {
    model: "MarQ Sense",
    firmware: p.firmware,
    battery,
    batteryLow: battery < 20,
    connected,
    lastSync: connected ? "Just now" : `Before the band came off (${input.watchOffAt})`,
    sensors: MARQ_SENSORS.map((x) => ({ ...x, ...status(x.id) })),
  };
}

// ---- Patient cards ---------------------------------------------------------------------

export type CardTone = "ok" | "attention" | "info";

export interface PlainCard {
  id: "hydration" | "stress" | "sweat" | "alcohol";
  /** e.g. "Hydration: a bit low today — drink water". */
  headline: string;
  detail: string;
  tone: CardTone;
  note?: string;
}

export const HYDRATION_Z = { aBitLow: 1.5, low: 2.5 };
export const STRESS = { z: 1.5, nights: 3, window: 7 };
/** Sweat cortisol counts as a stress sign when raised (z ≥ 1.5) on ≥ 3 of the last 7 days with a reading. */
export const CORTISOL_STRESS = { z: 1.5, days: 3, window: 7, minDays: 3 };
/** Typical sweat sodium (mmol/L) — shown to patients next to any value. */
export const SWEAT_SODIUM_RANGE = { low: 20, high: 60 };

export function hydrationCard(e: SenseEvaluation | undefined): PlainCard {
  const zv = e?.z.bodyWater;
  if (!e || !e.sense.valid) {
    return { id: "hydration", tone: "info", headline: "Hydration: no reading last night", detail: "The band needs good skin contact at night to estimate your body water." };
  }
  if (zv === undefined) {
    return { id: "hydration", tone: "info", headline: "Hydration: still learning your usual", detail: "After about a week of nights, Prodrome can tell you when your body water is lower than usual." };
  }
  if (zv <= -HYDRATION_Z.low) {
    return {
      id: "hydration",
      tone: "attention",
      headline: "Hydration: low today — drink water",
      detail: "Your body-water estimate last night was clearly lower than usual for you. Drink water regularly through the day. If you also feel dizzy, or pass much less urine than usual, contact your doctor.",
    };
  }
  if (zv <= -HYDRATION_Z.aBitLow) {
    return { id: "hydration", tone: "attention", headline: "Hydration: a bit low today — drink water", detail: "Your body-water estimate last night was a little lower than usual for you. A few extra glasses of water today should help." };
  }
  return { id: "hydration", tone: "ok", headline: "Hydration: normal", detail: "Your body-water estimate last night was in your usual range." };
}

/** Night EDA over the last 7 days up to and including `day` (0-based). */
export function stressCard(evals: SenseEvaluation[], day: number): PlainCard {
  const week = evals.slice(Math.max(0, day - STRESS.window + 1), day + 1).filter((e) => e.z.nightEda !== undefined);
  if (week.length < 3) {
    return { id: "stress", tone: "info", headline: "Stress: still learning your usual", detail: "After about a week of nights, Prodrome can compare your night-time stress signals with your usual." };
  }
  const raised = week.filter((e) => (e.z.nightEda ?? 0) >= STRESS.z).length;
  const c = cortisolTrend(evals, day);
  const cortisolText = c.raised
    ? ` Your stress hormone in sweat (cortisol) was also higher than usual on ${c.raisedDays} of the last ${c.of} days.`
    : "";
  const why = "This can happen with stress, poor sleep, or when you are unwell.";
  if (raised >= STRESS.nights) {
    return {
      id: "stress",
      tone: "attention",
      headline: "Stress: higher than usual this week",
      detail: `Your skin's sweat response at night (a sign of stress) was higher than usual on ${raised} of the last ${week.length} nights.${cortisolText} ${why} Rest when you can.`,
    };
  }
  if (c.raised) {
    return {
      id: "stress",
      tone: "attention",
      headline: "Stress: higher than usual this week",
      detail: `Your stress hormone in sweat (cortisol) was higher than usual on ${c.raisedDays} of the last ${c.of} days. ${why} Rest when you can.`,
    };
  }
  if (raised > 0) {
    return { id: "stress", tone: "ok", headline: "Stress: a little higher on some nights", detail: `Higher than usual on ${raised} of the last ${week.length} nights — nothing to worry about on its own. ${why}` };
  }
  return { id: "stress", tone: "ok", headline: "Stress: about usual this week", detail: "Your night-time stress signals have been in your usual range." };
}

/** Sweat cortisol over the last 7 days up to `day` (0-based): raised on enough days = a stress trend. */
export function cortisolTrend(evals: SenseEvaluation[], day: number): { raised: boolean; raisedDays: number; of: number } {
  const week = evals.slice(Math.max(0, day - CORTISOL_STRESS.window + 1), day + 1).filter((e) => e.z.cortisol !== undefined);
  const raisedDays = week.filter((e) => (e.z.cortisol ?? 0) >= CORTISOL_STRESS.z).length;
  return { raised: week.length >= CORTISOL_STRESS.minDays && raisedDays >= CORTISOL_STRESS.days, raisedDays, of: week.length };
}

/** Salt in sweat (sodium, with chloride — the two halves of salt) for the day, always with its meaning. Other sweat values are never shown to patients. */
export function sweatCard(e: SenseEvaluation | undefined): PlainCard {
  const na = e?.sense.sodium ?? null;
  const cl = e?.sense.chloride ?? null;
  const range =
    `Most people's sweat has about ${SWEAT_SODIUM_RANGE.low}–${SWEAT_SODIUM_RANGE.high} mmol/L of salt (sodium).` +
    (cl !== null ? ` Chloride, the other half of salt, was about ${cl.toFixed(0)} mmol/L.` : "") +
    " Sweat is not blood — these numbers can't be compared with a blood test.";
  if (na === null) {
    return { id: "sweat", tone: "info", headline: "Salt in sweat: no reading that day", detail: "The sweat sensor needs a little sweat (a warm day or some activity) to take a reading.", note: SWEAT_LABEL };
  }
  if (na >= SWEAT_SODIUM_RANGE.high) {
    return {
      id: "sweat",
      tone: "attention",
      headline: "Salt in sweat: higher than most people",
      detail: `Sodium about ${na.toFixed(0)} mmol/L. ${range} On hot days you lose more salt, so drink regularly. If a doctor treats your blood pressure, heart or kidneys, ask them before adding salt.`,
      note: SWEAT_LABEL,
    };
  }
  return { id: "sweat", tone: "ok", headline: "Salt in sweat: in the usual range", detail: `Sodium about ${na.toFixed(0)} mmol/L. ${range}`, note: SWEAT_LABEL };
}
