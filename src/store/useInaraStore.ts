"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { nanoid } from "nanoid";
import type {
  AccessLogEntry,
  AccessRequest,
  AccessScope,
  AccessVia,
  AccountAuditEntry,
  AccountStatus,
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
import { clockNow, clockToday } from "@/lib/clock";
import { seedCases, seedPatients, seedReports } from "@/lib/seed";
import { seedUsers } from "@/lib/users";
import { applyStatusChange, effectiveStatus } from "@/lib/access";
import {
  approveRequest,
  createAccessRequest,
  declineRequest,
  issueShareToken,
  newOtp,
  newShareToken,
  revokeRequest,
  setEmergencyOnly,
  verifyOtp,
} from "@/lib/recordAccess";
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
import {
  authoriseAlert,
  dismissAlert,
  editAlertMessage,
  withdrawAlert,
  type AlertResult,
  type Officer,
  type PublicHealthAlert,
} from "@/lib/surveillance/alerts";

interface InaraData {
  patients: Patient[];
  reports: Report[];
  /** Patients' QR share codes (random tokens; a new one replaces the old). */
  shareTokens: ShareToken[];
  /** Doctors' requests to open a record: approval, OTP, time-limited access, revoke. */
  accessRequests: AccessRequest[];
  /** Append-only log of record access (requests, views, revokes). */
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
  /** Append-only log of account status changes made by the hospital admin (offline demo login). */
  accountAuditLog: AccountAuditEntry[];
  /** Regional public health alerts: proposed by the system, authorised / withdrawn by the officer (each with its own log). */
  publicHealthAlerts: PublicHealthAlert[];
  /** Simulated clock: hours after Day 30, 07:00 IST (demo "+6 h"). */
  simHours: number;
  /** Real time (ms) when the demo clock started; null = real time (see src/lib/clock.ts). */
  clockAnchor: number | null;
  /** The one logged-in user (one role at a time), or null when logged out. */
  session: Session | null;
}

interface InaraActions {
  /** Now, from the one demo clock (simulated once it has started, else real time). */
  now: () => string;
  /** Today (yyyy-MM-dd, India time) from the same clock. */
  today: () => string;
  /**
   * Start a session for a user already verified by src/lib/auth (demo) or Supabase Auth.
   * Replaces any existing session. Real logins pass their profile status and 2FA level.
   */
  login: (user: User, auth?: Pick<Session, "mode" | "status" | "aal">) => void;
  /** Update the current real session after re-reading the profile or finishing 2FA. */
  updateSessionAuth: (patch: Pick<Session, "status" | "aal">) => void;
  /** Add or update a user (e.g. a newly registered doctor signing in for the first time). */
  upsertUser: (user: User) => void;
  /** Offline demo admin: verify / suspend a doctor or lab, with an audit entry. Returns an error or null. */
  setAccountStatus: (targetId: string, status: AccountStatus, reason: string) => string | null;
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
  /** Patient: make a new QR share code (the old one stops working). */
  regenerateShareToken: (patientId: string) => void;
  /** Patient: doctors who get access see only the emergency view. */
  setShareEmergencyOnly: (patientId: string, emergencyOnly: boolean) => void;
  /** Doctor: ask the patient for access. Returns the request id, or an error. */
  requestRecordAccess: (patientId: string, via: AccessVia, durationMin: number) => { id: string } | { error: string };
  /** Patient: approve (their code is shown) or decline a request. */
  answerAccessRequest: (requestId: string, approve: boolean, scope?: AccessScope) => void;
  /** Doctor: enter the patient's code. Returns null on success, else the error. */
  enterAccessOtp: (requestId: string, code: string) => string | null;
  /** Patient: end access now (or withdraw an open request). */
  revokeAccess: (requestId: string) => void;
  /** Doctor with temporary access: record which part of the record was opened (once per request + section). */
  logRecordView: (requestId: string, section: string) => void;
  /** System: add new alert proposals (ids already present are ignored). */
  proposeHealthAlerts: (alerts: PublicHealthAlert[]) => void;
  /** Public health officer: edit a proposal's message. Returns an error or null. */
  editHealthAlert: (alertId: string, message: string) => string | null;
  /** Public health officer: authorise (publish) a proposal with its final message. Returns an error or null. */
  authoriseHealthAlert: (alertId: string, message: string) => string | null;
  /** Public health officer: withdraw a published alert. Returns an error or null. */
  withdrawHealthAlert: (alertId: string, reason: string) => string | null;
  /** Public health officer: dismiss a proposal. Returns an error or null. */
  dismissHealthAlert: (alertId: string, reason: string) => string | null;
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
const DEFAULT_LAB = "Meridian Diagnostics";
const SEED_AT = "2026-03-15T09:00:00.000Z";

function initialData(): InaraData {
  return {
    patients: seedPatients(),
    reports: seedReports(),
    shareTokens: seedPatients().reduce<ShareToken[]>(
      (tokens, p) => issueShareToken(tokens, { id: nanoid(), token: newShareToken(), patientId: p.id, at: SEED_AT }),
      [],
    ),
    accessRequests: [],
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
    accountAuditLog: [],
    publicHealthAlerts: [],
    simHours: 0,
    clockAnchor: null,
    session: null,
  };
}

/** Persist version. Bump when the seed or data shape changes (also guards the shared workspace). */
export const STORE_SCHEMA = 16;

/** Everything saved and shared between devices — all data except the session (each device logs in on its own). */
export const SHARED_KEYS = [
  "patients",
  "reports",
  "shareTokens",
  "accessRequests",
  "accessLog",
  "users",
  "treatmentPlans",
  "findingReviews",
  "analysisRuns",
  "targetOverrides",
  "cases",
  "patientSettings",
  "consentLog",
  "wearableEvents",
  "notifications",
  "populationOutcomes",
  "accountAuditLog",
  "publicHealthAlerts",
  "simHours",
  "clockAnchor",
] as const satisfies readonly Exclude<keyof InaraData, "session">[];

export type SharedState = Pick<InaraData, (typeof SHARED_KEYS)[number]>;

export function sharedData(s: InaraData): SharedState {
  return Object.fromEntries(SHARED_KEYS.map((k) => [k, s[k]])) as SharedState;
}

export function selectReports(reports: Report[], patientId: string): Report[] {
  return reports
    .filter((r) => r.patientId === patientId)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export const useInaraStore = create<InaraState>()(
  persist(
    (set, get) => {
      const now = () => clockNow(get());
      /** Start the demo clock (once): from now on every timestamp uses it. */
      const startClock = () => {
        if (get().clockAnchor === null) set({ clockAnchor: Date.now() });
      };
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
          const next = advanceSteps(c, stages, { by, at: now() });
          return next === c ? {} : { cases: s.cases.map((x) => (x.id === c.id ? next : x)) };
        });
      const planInput = (report: Report, content: PlanContent, author: string) => ({
        id: nanoid(),
        patientId: report.patientId,
        reportId: report.id,
        author,
        timestamp: now(),
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

      /** The logged-in user as an officer (role + effective status), for the alert rules. */
      const officer = (): Officer => {
        const { session, users } = get();
        const user = session ? users.find((u) => u.id === session.userId) : undefined;
        if (!session || !user) return { name: "", role: "patient", status: "pending" };
        return { name: user.name, role: user.role, status: effectiveStatus(session, user) };
      };
      /** Apply a pure alert step; returns its error or null. */
      const alertStep = (alertId: string, step: (a: PublicHealthAlert, o: Officer, at: string) => AlertResult): string | null => {
        const alert = get().publicHealthAlerts.find((a) => a.id === alertId);
        if (!alert) return "Alert not found.";
        const result = step(alert, officer(), now());
        if (!result.ok) return result.error;
        if (result.alert !== alert) {
          set((s) => ({ publicHealthAlerts: s.publicHealthAlerts.map((a) => (a.id === alertId ? result.alert : a)) }));
        }
        return null;
      };

      return {
        ...initialData(),
        now,
        today: () => clockToday(get()),
        login: (user, auth) =>
          set({
            session: { userId: user.id, role: user.role, loggedInAt: new Date().toISOString(), mode: "demo", ...auth },
          }),
        updateSessionAuth: (patch) => set((s) => (s.session ? { session: { ...s.session, ...patch } } : {})),
        upsertUser: (user) =>
          set((s) => {
            const existing = s.users.find((u) => u.id === user.id);
            if (existing && JSON.stringify(existing) === JSON.stringify(user)) return {};
            return {
              users: existing ? s.users.map((u) => (u.id === user.id ? user : u)) : [...s.users, user],
            };
          }),
        setAccountStatus: (targetId, status, reason) => {
          const result = applyStatusChange(get().users, {
            targetId,
            status,
            reason,
            actorName: actor("Hospital admin"),
            id: nanoid(),
            timestamp: new Date().toISOString(),
          });
          if (!result.ok) return result.error;
          set((s) => ({ users: result.users, accountAuditLog: [...s.accountAuditLog, result.entry] }));
          return null;
        },
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
            addDoctorEdit(r, { id: nanoid(), author, timestamp: now(), ...content }),
          );
          advanceReportCase(reportId, ["under_review"], author);
        },
        approveReport: (reportId, author = DEFAULT_DOCTOR, content = {}) => {
          if (isLocked(reportId)) return;
          updateReport(reportId, (r) =>
            approve(r, { id: nanoid(), author, timestamp: now(), ...content }),
          );
          // Approving means the draft was reviewed: under_review (if not yet), then approved.
          advanceReportCase(reportId, ["under_review", "approved"], author);
        },
        markUnderReview: (reportId) => advanceReportCase(reportId, ["under_review"], actor(DEFAULT_DOCTOR)),

        startWearableEpisode: (snapshot) => {
          if (get().wearableEvents.some((e) => e.episodeId === snapshot.episodeId && e.type === "episode_started")) return;
          startClock();
          applyOutcome(startEpisode(get().wearableEvents, snapshot, now(), wearableCtx(snapshot.patientId)));
        },
        answerCheckIn: (episodeId, questionId, answer) => {
          const state = deriveEpisode(get().wearableEvents, episodeId);
          if (!state) return;
          applyOutcome(answerQuestion(state, questionId, answer, now(), wearableCtx(state.patientId)));
        },
        advanceSimClock: (hours) => {
          startClock();
          set((s) => ({ simHours: s.simHours + hours }));
          const at = now();
          // Repeat until nothing new is due (a recheck can start a round whose reminder is also due).
          for (let pass = 0; pass < 5; pass++) {
            let changed = false;
            for (const ep of allEpisodes(get().wearableEvents)) {
              const o = escalate(ep, at, wearableCtx(ep.patientId));
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
          const at = now();
          applyOutcome({
            events: [{ episodeId: ep.episodeId, patientId, at, by: "Watch", type: worn ? "watch_on" : "watch_off" }],
            notifications: [],
            newCase: null,
          });
        },
        doctorAlertAction: (episodeId, action, note) => {
          const ep = deriveEpisode(get().wearableEvents, episodeId);
          if (!ep || ep.dismissed) return;
          const at = now();
          const by = actor(DEFAULT_DOCTOR);
          applyOutcome({
            events: [{ episodeId, patientId: ep.patientId, at, by, type: "doctor_action", action, ...(note?.trim() ? { note: note.trim() } : {}) }],
            notifications: [],
            newCase: null,
          });
        },
        recordAlertOutcome: (episodeId, outcome) => {
          const { wearableEvents, patientSettings, patients } = get();
          const ep = deriveEpisode(wearableEvents, episodeId);
          const patient = patients.find((p) => p.id === ep?.patientId);
          if (!ep || !patient) return;
          const result = recordOutcome(ep, outcome, {
            at: now(),
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
        regenerateShareToken: (patientId) => {
          const at = new Date().toISOString();
          set((s) => ({
            shareTokens: issueShareToken(s.shareTokens, { id: nanoid(), token: newShareToken(), patientId, at }),
            accessLog: [...s.accessLog, { patientId, viewer: actor(patientId), timestamp: at, action: "Made a new QR code (old code stopped working)" }],
          }));
        },
        setShareEmergencyOnly: (patientId, emergencyOnly) =>
          set((s) => ({ shareTokens: setEmergencyOnly(s.shareTokens, patientId, emergencyOnly) })),
        requestRecordAccess: (patientId, via, durationMin) => {
          const { session, users } = get();
          const doctor = session ? users.find((u) => u.id === session.userId) : undefined;
          const at = new Date().toISOString();
          const result = createAccessRequest({
            id: `acc-${nanoid(10)}`,
            otp: newOtp(),
            at,
            doctor,
            status: session && doctor ? effectiveStatus(session, doctor) : "pending",
            patientId,
            via,
            durationMin,
          });
          if (!result.ok) return { error: result.error };
          const r = result.request;
          set((s) => ({
            accessRequests: [...s.accessRequests, r],
            accessLog: [
              ...s.accessLog,
              { patientId, viewer: r.doctorName, timestamp: at, action: `Requested ${durationMin} min access (${via === "qr" ? "QR code" : "patient ID"})`, requestId: r.id },
            ],
          }));
          return { id: r.id };
        },
        answerAccessRequest: (requestId, yes, scope = "full") => {
          const r = get().accessRequests.find((x) => x.id === requestId);
          if (!r) return;
          const at = new Date().toISOString();
          const next = yes ? approveRequest(r, { at, scope }) : declineRequest(r, at);
          if (!next) return;
          set((s) => ({
            accessRequests: s.accessRequests.map((x) => (x.id === requestId ? next : x)),
            accessLog: [
              ...s.accessLog,
              {
                patientId: r.patientId,
                viewer: r.doctorName,
                timestamp: at,
                action: yes ? `Patient approved (${scope === "emergency" ? "emergency view only" : "full record"})` : "Patient declined",
                requestId,
              },
            ],
          }));
        },
        enterAccessOtp: (requestId, code) => {
          const { session, users, accessRequests } = get();
          const r = accessRequests.find((x) => x.id === requestId);
          const doctor = session ? users.find((u) => u.id === session.userId) : undefined;
          if (!r || !session || !doctor) return "Request not found.";
          const at = new Date().toISOString();
          const result = verifyOtp(r, code, { at, doctorId: doctor.id, status: effectiveStatus(session, doctor) });
          if (result.request !== r) {
            set((s) => ({
              accessRequests: s.accessRequests.map((x) => (x.id === requestId ? result.request : x)),
              accessLog: [
                ...s.accessLog,
                {
                  patientId: r.patientId,
                  viewer: r.doctorName,
                  timestamp: at,
                  action: result.ok ? `Access granted for ${r.durationMin} min` : "Wrong code entered",
                  requestId,
                },
              ],
            }));
          }
          return result.ok ? null : result.error;
        },
        revokeAccess: (requestId) => {
          const r = get().accessRequests.find((x) => x.id === requestId);
          if (!r) return;
          const at = new Date().toISOString();
          const next = revokeRequest(r, at);
          if (!next) return;
          set((s) => ({
            accessRequests: s.accessRequests.map((x) => (x.id === requestId ? next : x)),
            accessLog: [...s.accessLog, { patientId: r.patientId, viewer: r.doctorName, timestamp: at, action: "Revoked by patient", requestId }],
          }));
        },
        logRecordView: (requestId, section) => {
          const { accessRequests, accessLog } = get();
          const r = accessRequests.find((x) => x.id === requestId);
          const action = `Viewed ${section}`;
          if (!r || accessLog.some((e) => e.requestId === requestId && e.action === action)) return;
          set((s) => ({
            accessLog: [...s.accessLog, { patientId: r.patientId, viewer: r.doctorName, timestamp: new Date().toISOString(), action, requestId }],
          }));
        },
        proposeHealthAlerts: (alerts) => {
          const fresh = alerts.filter((a) => !get().publicHealthAlerts.some((x) => x.id === a.id));
          if (fresh.length) set((s) => ({ publicHealthAlerts: [...s.publicHealthAlerts, ...fresh] }));
        },
        editHealthAlert: (alertId, message) => alertStep(alertId, (a, o, at) => editAlertMessage(a, message, o, at)),
        authoriseHealthAlert: (alertId, message) => alertStep(alertId, (a, o, at) => authoriseAlert(a, o, at, message)),
        withdrawHealthAlert: (alertId, reason) => alertStep(alertId, (a, o, at) => withdrawAlert(a, o, reason, at)),
        dismissHealthAlert: (alertId, reason) => alertStep(alertId, (a, o, at) => dismissAlert(a, o, reason, at)),
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
              clockAnchor: null,
            };
          }),
        setPatientConsent: (patientId, key, granted) => {
          const at = now();
          const by = actor(patientId);
          set((s) => ({
            patientSettings: s.patientSettings.map((p) => (p.patientId === patientId ? setConsent(p, key, granted, at) : p)),
            consentLog: [...s.consentLog, { patientId, change: key, granted, by, at }],
          }));
        },
        setEmergencyContact: (patientId, contact) => {
          const at = now();
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
              c.id === caseId ? advanceSteps(c, ["in_lab"], { by, at: now(), note: "Sample received" }) : c,
            ),
          }));
        },
        submitLabResults: (caseId, input) => {
          const { cases, patients, reports } = get();
          const c = cases.find((x) => x.id === caseId);
          const patient = patients.find((p) => p.id === c?.patientId);
          if (!c || !patient || c.reportId || (c.stage !== "ordered" && c.stage !== "in_lab")) return null;
          const by = actor(DEFAULT_LAB);
          const at = now();
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
          const c = createCase({ ...input, id, orderedBy: orderedBy ?? actor(DEFAULT_DOCTOR), at: now() });
          set((s) => ({ cases: [...s.cases, c] }));
          return id;
        },
        orderFromAlert: (caseId, input, orderedBy) => {
          const at = now();
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
          set((s) => ({ analysisRuns: { ...s.analysisRuns, [reportId]: now() } }));
          advanceReportCase(reportId, ["analysis_done"], actor(DEFAULT_DOCTOR));
        },
        setTargetOverride: (input) =>
          set((s) => ({
            targetOverrides: [
              ...s.targetOverrides.filter((o) => !(o.patientId === input.patientId && o.testKey === input.testKey)),
              { ...input, timestamp: now() },
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
      version: STORE_SCHEMA,
      migrate: () => initialData() as unknown as InaraState,
      partialize: (s) => ({ ...sharedData(s), session: s.session }),
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
export function useSession(): Session | null {
  return useInaraStore((s) => s.session);
}

export function useCurrentUser(): User | undefined {
  return useInaraStore((s) => (s.session ? s.users.find((u) => u.id === s.session!.userId) : undefined));
}
