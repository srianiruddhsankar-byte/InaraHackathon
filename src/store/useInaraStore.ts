"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  AccessLogEntry,
  Patient,
  Report,
  ShareToken,
} from "@/lib/types";
import { seedPatients, seedReports } from "@/lib/seed";

export type Persona = "lab" | "doctor" | "patient";

interface InaraData {
  patients: Patient[];
  reports: Report[];
  shareTokens: ShareToken[];
  accessLog: AccessLogEntry[];
  persona: Persona;
}

interface InaraActions {
  setPersona: (persona: Persona) => void;
  /** Restore the synthetic demo data to its initial state. */
  resetDemo: () => void;
}

export type InaraState = InaraData & InaraActions;

function initialData(): InaraData {
  return {
    patients: seedPatients(),
    reports: seedReports(),
    shareTokens: [],
    accessLog: [],
    persona: "doctor",
  };
}

export const useInaraStore = create<InaraState>()(
  persist(
    (set) => ({
      ...initialData(),
      setPersona: (persona) => set({ persona }),
      resetDemo: () => set(initialData()),
    }),
    {
      name: "inara-demo",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);
