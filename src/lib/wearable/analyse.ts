// The wearable pipeline: consent gate → simulated samples → cleaning → nightly
// metrics → personal baseline → weather correction, plus the MarQ Sense streams
// (EDA, bioimpedance, sweat) built on the same samples. Pure (the sample source is
// injectable so tests can prove nothing runs without consent).
import type { PatientSettings } from "../types";
import { evaluateNights, type NightEvaluation } from "./baseline";
import { cleanSamples, dataQuality, dayNightAmplitude, nightSummaries, type CleanResult } from "./clean";
import { canProcessWearable } from "./consent";
import { simulateWearable } from "./simulate";
import { simulateSense, type SenseSample } from "./sense";
import { analyseSense, type SenseAnalysis } from "./senseClean";
import { WINDOW_DAYS, type DayNightAmplitude, type WeatherData, type WearableSample } from "./types";
import { fitHeatModel, heatPoints, weatherAdjustedDays, type HeatModel, type WeatherAdjustedDay } from "./weather";

/** Days used to learn the personal heat model (Day 1–21: before anything changes). */
export const HEAT_BASELINE_DAYS = 21;

export type WearableAnalysis =
  | { status: "not_enabled" }
  | { status: "no_device" }
  | {
      status: "ok";
      days: number;
      /** % of all samples usable for resting metrics. */
      quality: number;
      dropped: CleanResult["dropped"];
      total: number;
      nights: NightEvaluation[];
      amplitude: DayNightAmplitude[];
      heatModel: HeatModel | null;
      weatherDays: WeatherAdjustedDay[];
      /** MarQ Sense: EDA, body water, sweat (null without a MarQ Sense device). */
      sense: SenseAnalysis | null;
    };

export type SampleSource = (patientId: string, weather: WeatherData) => WearableSample[] | null;
export type SenseSource = (patientId: string, base: WearableSample[], weather: WeatherData) => SenseSample[] | null;

export function analyseWearable(
  patientId: string,
  settings: PatientSettings | undefined,
  weather: WeatherData,
  source: SampleSource = simulateWearable,
  senseSource: SenseSource = simulateSense,
): WearableAnalysis {
  // Consent first: with streaming off, no wearable data is generated or processed.
  if (!canProcessWearable(settings)) return { status: "not_enabled" };
  const raw = source(patientId, weather);
  if (!raw) return { status: "no_device" };

  const cleaned = cleanSamples(raw);
  const days = WINDOW_DAYS;
  const points = heatPoints(cleaned.samples, weather);
  const heatModel = fitHeatModel(points.filter((p) => p.day < HEAT_BASELINE_DAYS));
  const senseRaw = senseSource(patientId, raw, weather);
  return {
    status: "ok",
    days,
    quality: dataQuality(cleaned),
    dropped: cleaned.dropped,
    total: cleaned.total,
    nights: evaluateNights(nightSummaries(cleaned.samples, days)),
    amplitude: Array.from({ length: days }, (_, d) => dayNightAmplitude(cleaned.samples, d)),
    heatModel,
    weatherDays: weatherAdjustedDays(points, weather, heatModel, days),
    sense: senseRaw ? analyseSense(senseRaw, days) : null,
  };
}
