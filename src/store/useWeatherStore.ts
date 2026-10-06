"use client";

import { create } from "zustand";
import type { WeatherData } from "@/lib/wearable/types";
import { fetchOpenMeteo, isUsableWeather, WEATHER_FILE } from "@/lib/wearable/weather";

type Origin = "saved" | "live";

interface WeatherState {
  weather: WeatherData | null;
  origin: Origin | null;
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
  /** Load the saved copy in /public/data (works offline). Runs once. */
  load: () => Promise<void>;
  /** Fetch fresh data from Open-Meteo for this session (the saved file is unchanged). */
  refresh: () => Promise<void>;
}

/** Real weather for the wearable view. Session-only — never put in localStorage. */
export const useWeatherStore = create<WeatherState>()((set, get) => ({
  weather: null,
  origin: null,
  status: "idle",
  load: async () => {
    if (get().status !== "idle") return;
    set({ status: "loading" });
    try {
      const res = await fetch(WEATHER_FILE);
      if (!res.ok) throw new Error(`Saved weather file missing (${res.status})`);
      const weather = (await res.json()) as WeatherData;
      if (!isUsableWeather(weather)) throw new Error("Saved weather file doesn't cover the demo window");
      set({ weather, origin: "saved", status: "ready", error: undefined });
    } catch (e) {
      set({ status: "error", error: e instanceof Error ? e.message : "Couldn't load weather" });
    }
  },
  refresh: async () => {
    const previous = get();
    set({ status: "loading" });
    try {
      const weather = await fetchOpenMeteo();
      if (!isUsableWeather(weather)) throw new Error("Open-Meteo returned an incomplete window");
      set({ weather, origin: "live", status: "ready", error: undefined });
    } catch (e) {
      // Keep showing the data we had.
      set({ weather: previous.weather, origin: previous.origin, status: previous.weather ? "ready" : "error", error: e instanceof Error ? e.message : "Refresh failed" });
      throw e;
    }
  },
}));
