"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { nanoid } from "nanoid";
import type {
  AccessLogEntry,
  Patient,
  Report,
  ShareToken,
} from "@/lib/types";
import { seedPatients, seedReports } from "@/lib/seed";
import { addDoctorEdit, approve, isApproved } from "@/lib/versions";

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

  // Selectors. They return new arrays, so in components select raw state
  // (e.g. `s.reports`) and derive with useMemo, or wrap with useShallow.
  getPatient: (patientId: string) => Patient | undefined;
  /** Reports for a patient, oldest first. */
  getReports: (patientId: string) => Report[];
  getLatestReport: (patientId: string) => Report | undefined;
  /** Only reports a doctor has approved — the only ones patients may see. */
  getApprovedReports: (patientId: string) => Report[];

  /** Append a doctor_edited version. No-op on approved reports. */
  saveDoctorEdit: (reportId: string, text: string, prescription?: string, author?: string) => void;
  /** Append an approved version (defaults to the latest text). No-op if already approved. */
  approveReport: (reportId: string, author?: string, text?: string, prescription?: string) => void;
}

export type InaraState = InaraData & InaraActions;

const DEFAULT_DOCTOR = "Dr. Meera Nair";

function initialData(): InaraData {
  return {
    patients: seedPatients(),
    reports: seedReports(),
    shareTokens: [],
    accessLog: [],
    persona: "doctor",
  };
}

export function selectReports(reports: Report[], patientId: string): Report[] {
  return reports
    .filter((r) => r.patientId === patientId)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export const useInaraStore = create<InaraState>()(
  persist(
    (set, get) => {
      const updateReport = (reportId: string, fn: (r: Report) => Report) =>
        set((s) => ({ reports: s.reports.map((r) => (r.id === reportId ? fn(r) : r)) }));

      return {
        ...initialData(),
        setPersona: (persona) => set({ persona }),
        resetDemo: () => set(initialData()),

        getPatient: (patientId) => get().patients.find((p) => p.id === patientId),
        getReports: (patientId) => selectReports(get().reports, patientId),
        getLatestReport: (patientId) => selectReports(get().reports, patientId).at(-1),
        getApprovedReports: (patientId) =>
          selectReports(get().reports, patientId).filter(isApproved),

        saveDoctorEdit: (reportId, text, prescription, author = DEFAULT_DOCTOR) =>
          updateReport(reportId, (r) =>
            addDoctorEdit(r, { id: nanoid(), author, timestamp: new Date().toISOString(), text, prescription }),
          ),
        approveReport: (reportId, author = DEFAULT_DOCTOR, text, prescription) =>
          updateReport(reportId, (r) =>
            approve(r, { id: nanoid(), author, timestamp: new Date().toISOString(), text, prescription }),
          ),
      };
    },
    {
      name: "inara-demo",
      storage: createJSONStorage(() => localStorage),
      // Bump when the seed or data shape changes; older saved data is replaced by fresh seed data.
      version: 2,
      migrate: () => initialData() as unknown as InaraState,
      partialize: ({ patients, reports, shareTokens, accessLog, persona }) => ({
        patients,
        reports,
        shareTokens,
        accessLog,
        persona,
      }),
    },
  ),
);

/** True once saved data has been loaded from localStorage (always false during SSR). */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useInaraStore.persist.onFinishHydration(onChange),
    () => useInaraStore.persist.hasHydrated(),
    () => false,
  );
}
