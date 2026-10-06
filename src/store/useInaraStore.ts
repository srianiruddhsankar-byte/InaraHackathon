"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { nanoid } from "nanoid";
import type {
  AccessLogEntry,
  Case,
  CaseStage,
  FindingEdit,
  FindingEdits,
  Patient,
  Report,
  ReportSource,
  Session,
  ShareToken,
  TargetOverride,
  TestKey,
  TreatmentPlan,
  User,
} from "@/lib/types";
import { seedCases, seedPatients, seedReports } from "@/lib/seed";
import { seedUsers } from "@/lib/users";
import { mergePlanMedications } from "@/lib/record";
import { approvePlan as approvePlanVersion, approvedPlan, savePlanDraft as savePlanDraftVersion, type PlanContent } from "@/lib/treatment";
import { addDoctorEdit, approve, isApproved } from "@/lib/versions";
import { advanceSteps, caseForReport, createCase, type NewCaseInput } from "@/lib/workflow";
import { buildLabReport, newReportId } from "@/lib/labReport";
import type { EvaluatedRow } from "@/lib/upload";

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
  /** Report id → when the doctor ran the layered analysis (cached so it isn't replayed). */
  analysisRuns: Record<string, string>;
  /** Doctor-set targets that replace guideline targets (one per patient + test). */
  targetOverrides: TargetOverride[];
  /** Lab orders and their workflow stage (see src/lib/workflow.ts). */
  cases: Case[];
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

  /** Record that the analysis was run for a report. */
  markAnalysisRun: (reportId: string) => void;
  /** Set (or replace) a doctor's target for one patient + test. */
  setTargetOverride: (input: Omit<TargetOverride, "timestamp">) => void;
  /** Remove the override, going back to the guideline target. */
  revertTargetOverride: (patientId: string, testKey: TestKey) => void;

  /** Append a draft treatment plan version. Only for approved reports; no-op once the plan is approved. */
  savePlanDraft: (reportId: string, content: PlanContent, author?: string) => void;
  /** Append the approved treatment plan version (approved reports only); its medicines become current medications. */
  approvePlan: (reportId: string, content: PlanContent, author?: string) => void;

  /** Doctor orders lab tests: creates a case at "ordered". Returns the new case id. */
  orderLabTest: (input: Omit<NewCaseInput, "id" | "at" | "orderedBy">, orderedBy?: string) => string;
  /** Lab: the sample arrived — moves an "ordered" case to "in_lab". */
  markSampleReceived: (caseId: string) => void;
  /**
   * Lab: send verified results for an open order. Creates the report (raw rows
   * kept) with an AI draft and moves the case to "results_uploaded". Returns the
   * new report id, or null if the case can't take results.
   */
  submitLabResults: (caseId: string, input: LabSubmission) => string | null;
  /** The doctor opened the draft for review: moves the report's case to "under_review" (if it's the next stage). */
  markUnderReview: (reportId: string) => void;
}

export interface VersionContent {
  text: string;
  patientText?: string;
  prescription?: string;
  findingEdits?: FindingEdits;
}

export interface LabSubmission {
  rows: EvaluatedRow[];
  date: string;
  source: ReportSource;
  verifiedBy: string;
}

export type InaraState = InaraData & InaraActions;

const DEFAULT_DOCTOR = "Dr. Meera Nair";
const DEFAULT_LAB = "Inara Diagnostics";

function initialData(): InaraData {
  return {
    patients: seedPatients(),
    reports: seedReports(),
    shareTokens: [],
    accessLog: [],
    users: seedUsers(),
    treatmentPlans: [],
    findingReviews: {},
    analysisRuns: {},
    targetOverrides: [],
    cases: seedCases(),
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
      /** Name of the logged-in user, for the case history. */
      const actor = (fallback: string) => {
        const { session, users } = get();
        return (session && users.find((u) => u.id === session.userId)?.name) || fallback;
      };
      /**
       * Move the report's case forward through `stages`, in order. Each step only
       * happens if it is the next valid stage, so nothing is skipped or undone.
       */
      const advanceReportCase = (reportId: string, stages: CaseStage[], by: string) =>
        set((s) => {
          const c = caseForReport(s.cases, reportId);
          if (!c) return {};
          const next = advanceSteps(c, stages, { by, at: new Date().toISOString() });
          return next === c ? {} : { cases: s.cases.map((x) => (x.id === c.id ? next : x)) };
        });
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

        saveDoctorEdit: (reportId, content, author = DEFAULT_DOCTOR) => {
          if (isLocked(reportId)) return;
          updateReport(reportId, (r) =>
            addDoctorEdit(r, { id: nanoid(), author, timestamp: new Date().toISOString(), ...content }),
          );
          advanceReportCase(reportId, ["under_review"], author);
        },
        approveReport: (reportId, author = DEFAULT_DOCTOR, content = {}) => {
          if (isLocked(reportId)) return;
          updateReport(reportId, (r) =>
            approve(r, { id: nanoid(), author, timestamp: new Date().toISOString(), ...content }),
          );
          // Approving means the draft was reviewed: under_review (if not yet), then approved.
          advanceReportCase(reportId, ["under_review", "approved"], author);
        },
        markUnderReview: (reportId) => advanceReportCase(reportId, ["under_review"], actor(DEFAULT_DOCTOR)),
        markSampleReceived: (caseId) => {
          const by = actor(DEFAULT_LAB);
          set((s) => ({
            cases: s.cases.map((c) =>
              c.id === caseId ? advanceSteps(c, ["in_lab"], { by, at: new Date().toISOString(), note: "Sample received" }) : c,
            ),
          }));
        },
        submitLabResults: (caseId, input) => {
          const { cases, patients, reports } = get();
          const c = cases.find((x) => x.id === caseId);
          const patient = patients.find((p) => p.id === c?.patientId);
          if (!c || !patient || c.reportId || (c.stage !== "ordered" && c.stage !== "in_lab")) return null;
          const by = actor(DEFAULT_LAB);
          const at = new Date().toISOString();
          const report = buildLabReport({
            id: newReportId(patient.id, input.date, reports.map((r) => r.id), nanoid(4)),
            patient,
            previous: selectReports(reports, patient.id),
            date: input.date,
            labName: by,
            source: input.source,
            rows: input.rows,
            verifiedBy: input.verifiedBy,
            at,
          });
          const received = c.stage === "ordered" ? advanceSteps(c, ["in_lab"], { by, at, note: "Sample received" }) : c;
          const next = {
            ...advanceSteps(received, ["results_uploaded"], { by, at, note: `Verified by ${report.verifiedBy}` }),
            reportId: report.id,
          };
          set((s) => ({
            reports: [...s.reports, report],
            cases: s.cases.map((x) => (x.id === c.id ? next : x)),
          }));
          return report.id;
        },
        orderLabTest: (input, orderedBy) => {
          const id = `case-${nanoid(8)}`;
          const c = createCase({ ...input, id, orderedBy: orderedBy ?? actor(DEFAULT_DOCTOR), at: new Date().toISOString() });
          set((s) => ({ cases: [...s.cases, c] }));
          return id;
        },

        savePlanDraft: (reportId, content, author = DEFAULT_DOCTOR) => {
          const report = get().reports.find((r) => r.id === reportId);
          if (!report || !isApproved(report)) return;
          set((s) => ({
            treatmentPlans: savePlanDraftVersion(s.treatmentPlans, planInput(report, content, author)),
          }));
        },
        approvePlan: (reportId, content, author = DEFAULT_DOCTOR) => {
          const report = get().reports.find((r) => r.id === reportId);
          if (!report || !isApproved(report) || approvedPlan(get().treatmentPlans, reportId)) return;
          set((s) => {
            const treatmentPlans = approvePlanVersion(s.treatmentPlans, planInput(report, content, author));
            const plan = approvedPlan(treatmentPlans, reportId)!;
            const c = caseForReport(s.cases, reportId);
            let cases = s.cases;
            if (c) {
              const at = plan.timestamp;
              let next = advanceSteps(c, ["treatment_planned"], { by: author, at });
              if (next !== c) next = { ...next, treatmentPlanId: plan.id };
              if (plan.nextReviewDate) {
                next = advanceSteps(next, ["follow_up_scheduled"], { by: author, at, note: `Next review ${plan.nextReviewDate}` });
              }
              cases = s.cases.map((x) => (x.id === c.id ? next : x));
            }
            return {
              cases,
              treatmentPlans,
              patients: s.patients.map((p) =>
                p.id === report.patientId
                  ? { ...p, currentMedications: mergePlanMedications(p.currentMedications, plan) }
                  : p,
              ),
            };
          });
        },

        markAnalysisRun: (reportId) => {
          set((s) => ({ analysisRuns: { ...s.analysisRuns, [reportId]: new Date().toISOString() } }));
          advanceReportCase(reportId, ["analysis_done"], actor(DEFAULT_DOCTOR));
        },
        setTargetOverride: (input) =>
          set((s) => ({
            targetOverrides: [
              ...s.targetOverrides.filter((o) => !(o.patientId === input.patientId && o.testKey === input.testKey)),
              { ...input, timestamp: new Date().toISOString() },
            ],
          })),
        revertTargetOverride: (patientId, testKey) =>
          set((s) => ({
            targetOverrides: s.targetOverrides.filter((o) => !(o.patientId === patientId && o.testKey === testKey)),
          })),
      };
    },
    {
      name: "inara-demo",
      storage: createJSONStorage(() => localStorage),
      // Bump when the seed or data shape changes; older saved data is replaced by fresh seed data.
      version: 8,
      migrate: () => initialData() as unknown as InaraState,
      partialize: ({
        patients,
        reports,
        shareTokens,
        accessLog,
        users,
        treatmentPlans,
        findingReviews,
        analysisRuns,
        targetOverrides,
        cases,
        session,
      }) => ({
        patients,
        reports,
        shareTokens,
        accessLog,
        users,
        treatmentPlans,
        findingReviews,
        analysisRuns,
        targetOverrides,
        cases,
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
