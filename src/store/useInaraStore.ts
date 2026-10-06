"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { nanoid } from "nanoid";
import type {
  AccessLogEntry,
  Patient,
  Report,
  Session,
  ShareToken,
  User,
} from "@/lib/types";
import { seedPatients, seedReports } from "@/lib/seed";
import { seedUsers } from "@/lib/users";
import { addDoctorEdit, approve, isApproved } from "@/lib/versions";

interface InaraData {
  patients: Patient[];
  reports: Report[];
  shareTokens: ShareToken[];
  accessLog: AccessLogEntry[];
  users: User[];
  /** The one logged-in user (one role at a time), or null when logged out. */
  session: Session | null;
}

interface InaraActions {
  /** Start a session for a user already verified by src/lib/auth. Replaces any existing session. */
  login: (user: User) => void;
  logout: () => void;
  /** Restore the synthetic demo data to its initial state and log out. */
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
    users: seedUsers(),
    session: null,
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
        login: (user) =>
          set({ session: { userId: user.id, role: user.role, loggedInAt: new Date().toISOString() } }),
        logout: () => set({ session: null }),
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
      version: 3,
      migrate: () => initialData() as unknown as InaraState,
      partialize: ({ patients, reports, shareTokens, accessLog, users, session }) => ({
        patients,
        reports,
        shareTokens,
        accessLog,
        users,
        session,
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

/** The logged-in user, or undefined when logged out. */
export function useCurrentUser(): User | undefined {
  return useInaraStore((s) => (s.session ? s.users.find((u) => u.id === s.session!.userId) : undefined));
}
