"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { nanoid } from "nanoid";
import type {
  AccessLogEntry,
  Case,
  CaseStage,
  ConsentKey,
  ConsentLogEntry,
  EmergencyContact,
  PatientSettings,
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
import { advanceSteps, caseForReport, createCase, orderFromAlert, type AlertOrderInput, type NewCaseInput } from "@/lib/workflow";
import { findingsContextFor } from "@/lib/caseContext";
import { buildLabReport, newReportId } from "@/lib/labReport";
import type { EvaluatedRow } from "@/lib/upload";
import { seedPatientSettings, setConsent } from "@/lib/wearable/consent";
import {
  allEpisodes,
  answerQuestion,
  deriveEpisode,
  escalate,
  simNow,
  startEpisode,
  type Answer,
  type Ctx,
  type DoctorAction,
  type EpisodeSnapshot,
  type NotificationEntry,
  type Outcome,
  type WearableEvent,
} from "@/lib/wearable/checkin";
import type { QuestionId } from "@/lib/wearable/conditions";
import { recordOutcome, type AnonymisedOutcome, type DoctorOutcome } from "@/lib/wearable/outcomes";

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
  /** Wearable consent, emergency contact and urgent-alert settings per patient. */
  patientSettings: PatientSettings[];
  /** Append-only log of every consent change. */
  consentLog: ConsentLogEntry[];
  /** Append-only wearable record: episodes, check-ins, answers, recommendations, escalations, doctor actions. */
  wearableEvents: WearableEvent[];
  /** Append-only log of simulated notifications (sent, or "not sent — consent off"). */
  notifications: NotificationEntry[];
  /**
   * Anonymised alert outcomes added to the local population data (overlay on top
   * of population.json) — only from patients with population-share consent.
   */
  populationOutcomes: AnonymisedOutcome[];
  /** Simulated clock: hours after Day 30, 07:00 IST (demo "+6 h"). */
  simHours: number;
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
  /** Doctor orders tests from a wearable alert: the alert's case moves alert_raised → ordered (same case). */
  orderFromAlert: (caseId: string, input: Omit<AlertOrderInput, "at" | "orderedBy">, orderedBy?: string) => void;
  /** Patient: change one consent choice (timestamped and logged). */
  setPatientConsent: (patientId: string, key: ConsentKey, granted: boolean) => void;
  /** Patient: set the emergency contact (timestamped and logged). */
  setEmergencyContact: (patientId: string, contact: Omit<EmergencyContact, "updatedAt">) => void;
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

  /** Start a wearable episode (check-in) from today's concerning pattern. Idempotent per episode. */
  startWearableEpisode: (snapshot: EpisodeSnapshot) => void;
  /** Patient answers one check-in question; the last answer (or a red flag) gives the recommendation. */
  answerCheckIn: (episodeId: string, questionId: QuestionId, answer: Answer) => void;
  /** Demo: move the simulated clock forward and apply reminders / escalations that are now due. */
  advanceSimClock: (hours: number) => void;
  /** Demo: the patient's watch comes off (disconnected) or goes back on, during their latest episode. */
  setWatchWorn: (patientId: string, worn: boolean) => void;
  /** Doctor: acknowledge, log a call, or dismiss with a reason. */
  doctorAlertAction: (episodeId: string, action: DoctorAction, note?: string) => void;
  /**
   * Doctor: record what the alert turned out to be (one per episode). Closes the
   * episode; adds an anonymised record to the population data if the patient's
   * population-share consent is on; a confirmed condition goes into their history.
   */
  recordAlertOutcome: (episodeId: string, outcome: DoctorOutcome) => void;
  /** Demo: clear this patient's check-ins, notifications, alert cases (and their reports), outcomes, and reset the clock. */
  resetCheckIn: (patientId: string) => void;
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
  /** Photo uploads: a small compressed thumbnail — never the full image. */
  photoThumbnail?: string;
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
    patientSettings: seedPatientSettings(),
    consentLog: [],
    wearableEvents: [],
    notifications: [],
    populationOutcomes: [],
    simHours: 0,
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

      /** Who and what the wearable check-in logic needs for one patient. */
      const wearableCtx = (patientId: string): Ctx => {
        const s = get();
        const patient = s.patients.find((p) => p.id === patientId);
        const doctor = s.users.find((u) => u.role === "doctor" && u.patientIds?.includes(patientId));
        return {
          patient: { id: patientId, name: patient?.name ?? patientId },
          settings: s.patientSettings.find((p) => p.patientId === patientId),
          doctorName: doctor?.name ?? DEFAULT_DOCTOR,
          cases: s.cases,
        };
      };
      /** Append a pure outcome (events, notifications, maybe a new case) to the record. */
      const applyOutcome = (o: Outcome) => {
        if (!o.events.length && !o.notifications.length && !o.newCase) return;
        set((s) => ({
          wearableEvents: [...s.wearableEvents, ...o.events.map((e) => ({ ...e, id: nanoid() }) as WearableEvent)],
          notifications: [...s.notifications, ...o.notifications.map((n) => ({ ...n, id: nanoid() }))],
          cases: o.newCase ? [...s.cases, o.newCase] : s.cases,
        }));
      };

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

        startWearableEpisode: (snapshot) =>
          applyOutcome(startEpisode(get().wearableEvents, snapshot, simNow(get().simHours), wearableCtx(snapshot.patientId))),
        answerCheckIn: (episodeId, questionId, answer) => {
          const state = deriveEpisode(get().wearableEvents, episodeId);
          if (!state) return;
          applyOutcome(answerQuestion(state, questionId, answer, simNow(get().simHours), wearableCtx(state.patientId)));
        },
        advanceSimClock: (hours) => {
          set((s) => ({ simHours: s.simHours + hours }));
          const now = simNow(get().simHours);
          // Repeat until nothing new is due (a recheck can start a round whose reminder is also due).
          for (let pass = 0; pass < 5; pass++) {
            let changed = false;
            for (const ep of allEpisodes(get().wearableEvents)) {
              const o = escalate(ep, now, wearableCtx(ep.patientId));
              if (o.events.length) {
                applyOutcome(o);
                changed = true;
              }
            }
            if (!changed) break;
          }
        },
        setWatchWorn: (patientId, worn) => {
          const ep = allEpisodes(get().wearableEvents, patientId).find((e) => !e.dismissed);
          if (!ep || (worn ? !ep.watchOffAt : !!ep.watchOffAt)) return;
          const at = simNow(get().simHours);
          applyOutcome({
            events: [{ episodeId: ep.episodeId, patientId, at, by: "Watch", type: worn ? "watch_on" : "watch_off" }],
            notifications: [],
            newCase: null,
          });
        },
        doctorAlertAction: (episodeId, action, note) => {
          const ep = deriveEpisode(get().wearableEvents, episodeId);
          if (!ep || ep.dismissed) return;
          const at = simNow(get().simHours);
          const by = actor(DEFAULT_DOCTOR);
          applyOutcome({
            events: [{ episodeId, patientId: ep.patientId, at, by, type: "doctor_action", action, ...(note?.trim() ? { note: note.trim() } : {}) }],
            notifications: [],
            newCase: null,
          });
        },
        recordAlertOutcome: (episodeId, outcome) => {
          const { wearableEvents, patientSettings, patients, simHours } = get();
          const ep = deriveEpisode(wearableEvents, episodeId);
          const patient = patients.find((p) => p.id === ep?.patientId);
          if (!ep || !patient) return;
          const result = recordOutcome(ep, outcome, {
            at: simNow(simHours),
            by: actor(DEFAULT_DOCTOR),
            recordId: `pop-${nanoid(10)}`,
            settings: patientSettings.find((x) => x.patientId === patient.id),
            patient,
          });
          if (!result) return;
          applyOutcome({ events: [result.event], notifications: [], newCase: null });
          set((s) => ({
            populationOutcomes: result.record ? [...s.populationOutcomes, result.record] : s.populationOutcomes,
            patients: result.pastIllness
              ? s.patients.map((p) =>
                  p.id === patient.id && !(p.pastIllnesses ?? []).includes(result.pastIllness!)
                    ? { ...p, pastIllnesses: [...(p.pastIllnesses ?? []), result.pastIllness!] }
                    : p,
                )
              : s.patients,
          }));
        },
        resetCheckIn: (patientId) =>
          set((s) => {
            const mine = s.wearableEvents.filter((e) => e.patientId === patientId);
            const recordIds = new Set(mine.flatMap((e) => (e.type === "outcome" && e.recordId ? [e.recordId] : [])));
            const removedCases = s.cases.filter((c) => c.patientId === patientId && c.origin === "wearable");
            const reportIds = new Set(removedCases.flatMap((c) => (c.reportId ? [c.reportId] : [])));
            const seed = seedPatients().find((p) => p.id === patientId);
            return {
              wearableEvents: s.wearableEvents.filter((e) => e.patientId !== patientId),
              notifications: s.notifications.filter((n) => n.patientId !== patientId),
              cases: s.cases.filter((c) => !removedCases.includes(c)),
              reports: s.reports.filter((r) => !reportIds.has(r.id)),
              treatmentPlans: s.treatmentPlans.filter((t) => !reportIds.has(t.reportId)),
              populationOutcomes: s.populationOutcomes.filter((r) => !recordIds.has(r.id)),
              patients: s.patients.map((p) => (p.id === patientId && seed ? { ...p, pastIllnesses: seed.pastIllnesses } : p)),
              simHours: 0,
            };
          }),
        setPatientConsent: (patientId, key, granted) => {
          const at = new Date().toISOString();
          const by = actor(patientId);
          set((s) => ({
            patientSettings: s.patientSettings.map((p) => (p.patientId === patientId ? setConsent(p, key, granted, at) : p)),
            consentLog: [...s.consentLog, { patientId, change: key, granted, by, at }],
          }));
        },
        setEmergencyContact: (patientId, contact) => {
          const at = new Date().toISOString();
          const by = actor(patientId);
          set((s) => ({
            patientSettings: s.patientSettings.map((p) =>
              p.patientId === patientId ? { ...p, emergencyContact: { ...contact, updatedAt: at } } : p,
            ),
            consentLog: [...s.consentLog, { patientId, change: "emergencyContact", by, at }],
          }));
        },
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
            photoThumbnail: input.photoThumbnail,
            context: findingsContextFor(c, get().wearableEvents),
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
        orderFromAlert: (caseId, input, orderedBy) => {
          const at = new Date().toISOString();
          const by = orderedBy ?? actor(DEFAULT_DOCTOR);
          set((s) => ({
            cases: s.cases.map((c) => (c.id === caseId ? orderFromAlert(c, { ...input, orderedBy: by, at }) : c)),
          }));
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
      version: 12,
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
        patientSettings,
        consentLog,
        wearableEvents,
        notifications,
        populationOutcomes,
        simHours,
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
        patientSettings,
        consentLog,
        wearableEvents,
        notifications,
        populationOutcomes,
        simHours,
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
