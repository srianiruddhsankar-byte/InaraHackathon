"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { nanoid } from "nanoid";
import type {
  AccessLogEntry,
  FindingEdit,
  FindingEdits,
  Patient,
  Report,
  Session,
  ShareToken,
  TreatmentPlan,
  User,
} from "@/lib/types";
import { seedPatients, seedReports } from "@/lib/seed";
import { seedUsers } from "@/lib/users";
import { approvePlan as approvePlanVersion, savePlanDraft as savePlanDraftVersion, type PlanContent } from "@/lib/treatment";
import { addDoctorEdit, approve, isApproved } from "@/lib/versions";

interface InaraData {
  patients: Patient[];
  reports: Report[];
  shareTokens: ShareToken[];
  accessLog: AccessLogEntry[];
  users: User[];
  /** Append-only treatment plan versions (draft → approved). */
  treatmentPlans: TreatmentPlan[];
  /** Working finding edits per report (report id → finding id → edit) while the doctor reviews. */
  findingReviews: Record<string, FindingEdits>;
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

  /** Set (merge) the doctor's edit for one finding. No-op on approved reports. */
  setFindingEdit: (reportId: string, findingId: string, patch: Partial<FindingEdit>) => void;
  /** Clear one finding's edit (back to the AI finding). */
  clearFindingEdit: (reportId: string, findingId: string) => void;

  /** Append a doctor_edited version. No-op on approved reports. */
  saveDoctorEdit: (reportId: string, content: VersionContent, author?: string) => void;
  /** Append an approved version (missing fields default to the latest version). No-op if already approved. */
  approveReport: (reportId: string, author?: string, content?: Partial<VersionContent>) => void;

  /** Append a draft treatment plan version. Only for approved reports; no-op once the plan is approved. */
  savePlanDraft: (reportId: string, content: PlanContent, author?: string) => void;
  /** Append the approved treatment plan version. Only for approved reports. */
  approvePlan: (reportId: string, content: PlanContent, author?: string) => void;
}

export interface VersionContent {
  text: string;
  patientText?: string;
  prescription?: string;
  findingEdits?: FindingEdits;
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
    treatmentPlans: [],
    findingReviews: {},
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
      const isLocked = (reportId: string) => {
        const report = get().reports.find((r) => r.id === reportId);
        return !report || isApproved(report);
      };
      const planInput = (report: Report, content: PlanContent, author: string) => ({
        id: nanoid(),
        patientId: report.patientId,
        reportId: report.id,
        author,
        timestamp: new Date().toISOString(),
        content,
      });

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

        setFindingEdit: (reportId, findingId, patch) => {
          if (isLocked(reportId)) return;
          set((s) => {
            const current = s.findingReviews[reportId] ?? {};
            const edit: FindingEdit = { ...(current[findingId] ?? { included: true }), ...patch };
            return { findingReviews: { ...s.findingReviews, [reportId]: { ...current, [findingId]: edit } } };
          });
        },
        clearFindingEdit: (reportId, findingId) => {
          if (isLocked(reportId)) return;
          set((s) => {
            const rest = { ...(s.findingReviews[reportId] ?? {}) };
            delete rest[findingId];
            return { findingReviews: { ...s.findingReviews, [reportId]: rest } };
          });
        },

        saveDoctorEdit: (reportId, content, author = DEFAULT_DOCTOR) =>
          updateReport(reportId, (r) =>
            addDoctorEdit(r, { id: nanoid(), author, timestamp: new Date().toISOString(), ...content }),
          ),
        approveReport: (reportId, author = DEFAULT_DOCTOR, content = {}) =>
          updateReport(reportId, (r) =>
            approve(r, { id: nanoid(), author, timestamp: new Date().toISOString(), ...content }),
          ),

        savePlanDraft: (reportId, content, author = DEFAULT_DOCTOR) => {
          const report = get().reports.find((r) => r.id === reportId);
          if (!report || !isApproved(report)) return;
          set((s) => ({
            treatmentPlans: savePlanDraftVersion(s.treatmentPlans, planInput(report, content, author)),
          }));
        },
        approvePlan: (reportId, content, author = DEFAULT_DOCTOR) => {
          const report = get().reports.find((r) => r.id === reportId);
          if (!report || !isApproved(report)) return;
          set((s) => ({
            treatmentPlans: approvePlanVersion(s.treatmentPlans, planInput(report, content, author)),
          }));
        },
      };
    },
    {
      name: "inara-demo",
      storage: createJSONStorage(() => localStorage),
      // Bump when the seed or data shape changes; older saved data is replaced by fresh seed data.
      version: 4,
      migrate: () => initialData() as unknown as InaraState,
      partialize: ({ patients, reports, shareTokens, accessLog, users, treatmentPlans, findingReviews, session }) => ({
        patients,
        reports,
        shareTokens,
        accessLog,
        users,
        treatmentPlans,
        findingReviews,
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
