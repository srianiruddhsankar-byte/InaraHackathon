"use client";

import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { buildSurveillance, type SurveillanceView, type VisibleArea } from "@/lib/surveillance/aggregate";
import { newProposals } from "@/lib/surveillance/alerts";
import { AIR_QUALITY_FILE, type AirQualityData } from "@/lib/surveillance/environment";
import { surveillanceSeed } from "@/lib/surveillance/seed";
import { WINDOW_DAYS } from "@/lib/wearable/types";
import { useInaraStore } from "@/store/useInaraStore";
import { usePopulationStore } from "@/store/usePopulationStore";
import { useWeatherStore } from "@/store/useWeatherStore";

interface AirState {
  air: AirQualityData | null;
  status: "idle" | "loading" | "ready" | "error";
  load: () => Promise<void>;
}

/** Real air quality (Open-Meteo, saved copy in /public/data). Session-only. */
export const useAirQualityStore = create<AirState>()((set, get) => ({
  air: null,
  status: "idle",
  load: async () => {
    if (get().status !== "idle") return;
    set({ status: "loading" });
    try {
      const res = await fetch(AIR_QUALITY_FILE);
      if (!res.ok) throw new Error(String(res.status));
      set({ air: (await res.json()) as AirQualityData, status: "ready" });
    } catch {
      set({ status: "error" });
    }
  },
}));

/**
 * The officer's data. Reads ONLY consent settings (to drop people who withdrew)
 * and anonymised outcomes from the store — never patients, reports or wearable
 * events. Everything shown comes out of buildSurveillance (area-level only).
 */
export function useSurveillance(day: number): { view: SurveillanceView | null; today: SurveillanceView | null; loading: boolean } {
  const settings = useInaraStore((s) => s.patientSettings);
  const outcomes = useInaraStore((s) => s.populationOutcomes);
  const alerts = useInaraStore((s) => s.publicHealthAlerts);
  const propose = useInaraStore((s) => s.proposeHealthAlerts);
  const now = useInaraStore((s) => s.now);
  const population = usePopulationStore();
  const loadPopulation = population.load;
  const loadWeather = useWeatherStore((s) => s.load);
  const loadAir = useAirQualityStore((s) => s.load);

  useEffect(() => {
    void loadPopulation();
    void loadWeather();
    void loadAir();
  }, [loadPopulation, loadWeather, loadAir]);

  const settled = population.status === "ready" || population.status === "error";
  const data = useMemo(() => surveillanceSeed(), []);
  const db = population.db;
  const view = useMemo(
    () => (settled ? buildSurveillance({ data, settings, outcomes, population: db, day }) : null),
    [settled, data, settings, outcomes, db, day],
  );
  const today = useMemo(
    () => (settled ? buildSurveillance({ data, settings, outcomes, population: db, day: WINDOW_DAYS }) : null),
    [settled, data, settings, outcomes, db],
  );

  // The system proposes an alert for each area with a cluster today (Day 30). Idempotent by id.
  useEffect(() => {
    if (!today) return;
    const visible = today.areas.filter((a): a is VisibleArea => !a.hidden);
    const fresh = newProposals(visible, alerts, today.date, now());
    if (fresh.length) propose(fresh);
  }, [today, alerts, propose, now]);

  return { view, today, loading: !settled };
}
