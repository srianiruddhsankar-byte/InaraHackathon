"use client";

import { useEffect, useMemo } from "react";
import { analyseWearable, type WearableAnalysis } from "@/lib/wearable/analyse";
import { allEpisodes, buildSnapshot } from "@/lib/wearable/checkin";
import { canProcessWearable } from "@/lib/wearable/consent";
import { detectPatterns, type Detection } from "@/lib/wearable/detect";
import type { PatientSettings } from "@/lib/types";
import type { WeatherData } from "@/lib/wearable/types";
import { WINDOW_DAYS } from "@/lib/wearable/types";
import { useInaraStore } from "@/store/useInaraStore";
import { usePopulationStore } from "@/store/usePopulationStore";
import { useWeatherStore } from "@/store/useWeatherStore";

// Simulating 30 days of 5-minute samples is the slow part: cache it per
// patient + weather + consent so the banner, the panel and the check-in share one run.
const cache = new Map<string, WearableAnalysis>();

export function cachedAnalysis(patientId: string, settings: PatientSettings | undefined, weather: WeatherData, alcohol = false): WearableAnalysis {
  const key = `${patientId}|${weather.fetchedAt}|${canProcessWearable(settings)}|${alcohol}`;
  let a = cache.get(key);
  if (!a) {
    a = analyseWearable(patientId, settings, weather, undefined, undefined, { alcohol });
    cache.set(key, a);
  }
  return a;
}

/**
 * Today's wearable check (Day 30 = the latest night): loads the weather and
 * population data, runs the analysis and detection, and — when the top pattern
 * is concerning or a sensor red flag fires — starts the episode (check-in).
 * Nothing runs without streaming consent; alcohol only with `alcohol: true` (canSeeAlcohol).
 */
export function useWearableMonitor(patientId: string | undefined, options: { alcohol?: boolean } = {}) {
  const alcohol = !!options.alcohol;
  const patient = useInaraStore((s) => s.patients.find((p) => p.id === patientId));
  const allSettings = useInaraStore((s) => s.patientSettings);
  const events = useInaraStore((s) => s.wearableEvents);
  const startWearableEpisode = useInaraStore((s) => s.startWearableEpisode);
  const settings = allSettings.find((s) => s.patientId === patientId);
  const streaming = canProcessWearable(settings);
  const { weather, load: loadWeather } = useWeatherStore();
  const population = usePopulationStore();
  const loadPopulation = population.load;

  useEffect(() => {
    if (streaming) {
      void loadWeather();
      void loadPopulation();
    }
  }, [streaming, loadWeather, loadPopulation]);

  const analysis = useMemo(
    () => (streaming && patientId && weather ? cachedAnalysis(patientId, settings, weather, alcohol) : null),
    [streaming, patientId, settings, weather, alcohol],
  );
  const populationSettled = population.status === "ready" || population.status === "error";

  const today: Detection | null = useMemo(
    () =>
      patient && analysis?.status === "ok" && populationSettled
        ? detectPatterns({
            person: patient,
            nights: analysis.nights,
            amplitude: analysis.amplitude,
            weather: analysis.weatherDays,
            population: population.db,
            record: patient,
            settings: allSettings,
            day: WINDOW_DAYS,
            sense: analysis.sense?.days,
          })
        : null,
    [patient, analysis, populationSettled, population.db, allSettings],
  );

  const snapshot = useMemo(
    () =>
      patient && today && analysis?.status === "ok"
        ? buildSnapshot({ patient, detection: today, nights: analysis.nights, weather: analysis.weatherDays, day: WINDOW_DAYS })
        : null,
    [patient, today, analysis],
  );

  // Also re-runs after "Reset check-in" removes the episode, so the check-in is due again.
  const started = !!snapshot && events.some((e) => e.episodeId === snapshot.episodeId && e.type === "episode_started");
  useEffect(() => {
    if (snapshot && !started) startWearableEpisode(snapshot);
  }, [snapshot, started, startWearableEpisode]);

  const episode = useMemo(() => (patientId ? (allEpisodes(events, patientId)[0] ?? null) : null), [events, patientId]);
  const topLevel = today?.status === "ok" ? (today.patterns[0]?.level ?? "none") : null;

  return { analysis, today, topLevel, episode, streaming, populationDb: population.db, populationSettled };
}
