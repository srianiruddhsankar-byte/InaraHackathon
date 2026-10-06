"use client";

import { create } from "zustand";
import { POPULATION_FILE, type PopulationDb } from "@/lib/wearable/population";

interface PopulationState {
  db: PopulationDb | null;
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
  /** Load the synthetic population reference from /public/data. Runs once. */
  load: () => Promise<void>;
}

/** Synthetic area population data for the wearable view. Session-only — never put in localStorage. */
export const usePopulationStore = create<PopulationState>()((set, get) => ({
  db: null,
  status: "idle",
  load: async () => {
    if (get().status !== "idle") return;
    set({ status: "loading" });
    try {
      const res = await fetch(POPULATION_FILE);
      if (!res.ok) throw new Error(`Population file missing (${res.status})`);
      set({ db: (await res.json()) as PopulationDb, status: "ready", error: undefined });
    } catch (e) {
      set({ status: "error", error: e instanceof Error ? e.message : "Couldn't load population data" });
    }
  },
}));
