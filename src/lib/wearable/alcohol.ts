// Transdermal alcohol from the MarQ Sense patch — SENSITIVE (pure, tested).
//
// Who may see it (canSeeAlcohol):
// - the patient: always their own (while streaming is on);
// - a doctor: only with an active full consent grant AND the patient's
//   separate "Share alcohol monitoring with my doctor" toggle (off by default)
//   AND the wearable shared for care;
// - nobody else (lab, admin, public health officer): never.
// Without permission it is not processed at all: the caller passes
// { alcohol: false } to the analysis and cleaning ignores the channel.
// Alcohol is never used in pattern detection, alerts, population data or
// surveillance — it is kept out of the daily sense values those read.
import type { PatientSettings } from "../types";
import { canProcessWearable, doctorCanView } from "./consent";
import type { CleanSenseSample } from "./senseClean";
import type { PlainCard } from "./senseView";
import { dayDate } from "./types";

/** Detected when ≥ 3 readings (15 min) are ≥ 2 mmol/L (above sensor noise) in one evening. */
export const ALCOHOL = { detectAt: 2, minReadings: 3, eveningFromHour: 18, eveningHours: 12, window: 7 };

/** One evening: 18:00 of `day` to 06:00 the next morning. */
export interface AlcoholEvening {
  day: number; // 0-based
  date: string;
  readings: number;
  detected: boolean;
  /** Highest reading that evening (mmol/L), only when detected. */
  peak: number | null;
}

export function alcoholEvenings(samples: CleanSenseSample[], days: number): AlcoholEvening[] {
  return Array.from({ length: days }, (_, day) => {
    const from = day * 1440 + ALCOHOL.eveningFromHour * 60;
    const to = from + ALCOHOL.eveningHours * 60;
    const vals = samples.filter((s) => s.minute >= from && s.minute < to && s.ethanol !== null).map((s) => s.ethanol as number);
    const above = vals.filter((v) => v >= ALCOHOL.detectAt);
    const detected = above.length >= ALCOHOL.minReadings;
    return { day, date: dayDate(day), readings: vals.length, detected, peak: detected ? Math.max(...above) : null };
  });
}

/** The last 7 evenings up to and including `day` (0-based). */
export function alcoholWeek(evenings: AlcoholEvening[], day: number): { detected: number; of: number } {
  const week = evenings.slice(Math.max(0, day - ALCOHOL.window + 1), day + 1).filter((e) => e.readings > 0);
  return { detected: week.filter((e) => e.detected).length, of: week.length };
}

export type AlcoholViewer =
  | { role: "patient"; patientId: string | undefined }
  | { role: "doctor"; hasGrant: boolean }
  | { role: "lab" | "admin" | "health_officer" };

/** The patient's separate alcohol-sharing toggle (missing in older saved settings = off). */
export function alcoholShared(settings: PatientSettings | undefined): boolean {
  return !!settings?.alcoholShare?.granted;
}

export function canSeeAlcohol(viewer: AlcoholViewer, settings: PatientSettings | undefined): boolean {
  if (!settings || !canProcessWearable(settings)) return false;
  switch (viewer.role) {
    case "patient":
      return viewer.patientId === settings.patientId;
    case "doctor":
      return viewer.hasGrant && doctorCanView(settings) && alcoholShared(settings);
    default:
      return false;
  }
}

/** Patient card: plain words, no numbers, and who can see it. */
export function alcoholCard(evenings: AlcoholEvening[] | null, day: number, shared: boolean): PlainCard {
  const who = shared
    ? "Shared with your doctor (you turned on “Share alcohol monitoring with my doctor”)."
    : "Only you can see this. Your doctor sees it only if you turn on “Share alcohol monitoring with my doctor” in Privacy & settings.";
  const base = { id: "alcohol", note: who } as const;
  if (!evenings) return { ...base, tone: "info", headline: "Alcohol: no readings", detail: "The band needs skin contact to pick up alcohol." };
  const w = alcoholWeek(evenings, day);
  if (w.of === 0) return { ...base, tone: "info", headline: "Alcohol: no readings this week", detail: "The band needs skin contact to pick up alcohol." };
  const what = "The band picks up alcohol through the skin for a few hours after a drink.";
  if (w.detected === 0) return { ...base, tone: "ok", headline: "Alcohol: none detected this week", detail: what };
  return {
    ...base,
    tone: "info",
    headline: `Alcohol: detected on ${w.detected} ${w.detected === 1 ? "evening" : "evenings"} this week`,
    detail: `${what} Alcohol can raise your heart rate at night and make sleep less restful.`,
  };
}
