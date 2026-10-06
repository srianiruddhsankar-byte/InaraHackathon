// Case workflow: a lab order moves through fixed stages, one step at a time.
// Cases that start from a wearable alert begin one step earlier, at
// "alert_raised" (origin "wearable"); doctor orders start at "ordered".
// Pure functions only — the store calls these and records who moved the case
// and when. Invalid moves (skipping or going backwards) return the case unchanged.
import type { Case, CaseOrigin, CaseStage, PanelId, Role, StageEvent, TestKey, Urgency } from "./types";

export const STAGES: CaseStage[] = [
  "alert_raised",
  "ordered",
  "in_lab",
  "results_uploaded",
  "analysis_done",
  "under_review",
  "approved",
  "treatment_planned",
  "follow_up_scheduled",
];

export const STAGE_LABEL: Record<CaseStage, string> = {
  alert_raised: "Alert raised",
  ordered: "Ordered",
  in_lab: "In lab",
  results_uploaded: "Results uploaded",
  analysis_done: "Analysis done",
  under_review: "Under review",
  approved: "Approved",
  treatment_planned: "Treatment planned",
  follow_up_scheduled: "Follow-up scheduled",
};

export interface Panel {
  id: PanelId;
  name: string;
  tests: { key: TestKey; name: string }[];
  /** Ordered for a specific question (e.g. dengue), not part of the routine full panel. */
  targeted?: boolean;
}

export const PANELS: Panel[] = [
  { id: "metabolic", name: "Metabolic", tests: [{ key: "hba1c", name: "HbA1c" }, { key: "fasting_glucose", name: "Fasting glucose" }] },
  {
    id: "kidney",
    name: "Kidney",
    tests: [
      { key: "creatinine", name: "Creatinine" },
      { key: "urine_acr", name: "Urine ACR" },
      { key: "bun", name: "Urea" },
      { key: "sodium", name: "Sodium" },
      { key: "potassium", name: "Potassium" },
    ],
  },
  {
    id: "lipid",
    name: "Lipid",
    tests: [
      { key: "total_chol", name: "Total cholesterol" },
      { key: "ldl", name: "LDL" },
      { key: "hdl", name: "HDL" },
      { key: "triglycerides", name: "Triglycerides" },
    ],
  },
  {
    id: "cbc",
    name: "CBC + iron + B12",
    tests: [
      { key: "hb", name: "Hb" },
      { key: "mcv", name: "MCV" },
      { key: "rbc", name: "RBC" },
      { key: "platelets", name: "Platelets" },
      { key: "ferritin", name: "Ferritin" },
      { key: "vitamin_b12", name: "Vitamin B12" },
    ],
  },
  { id: "liver", name: "Liver", tests: [{ key: "ast", name: "AST" }, { key: "alt", name: "ALT" }, { key: "ggt", name: "GGT" }] },
  { id: "thyroid", name: "Thyroid", tests: [{ key: "tsh", name: "TSH" }] },
  {
    id: "others",
    name: "Others",
    tests: [
      { key: "vitamin_d", name: "Vitamin D" },
      { key: "uric_acid", name: "Uric acid" },
      { key: "crp", name: "CRP" },
    ],
  },
  {
    id: "dengue",
    name: "Dengue panel",
    targeted: true,
    tests: [
      { key: "hb", name: "Hb" },
      { key: "wbc", name: "WBC" },
      { key: "platelets", name: "Platelets" },
      { key: "hct", name: "Haematocrit" },
      { key: "ns1", name: "NS1 antigen" },
      { key: "dengue_igm", name: "Dengue IgM" },
      { key: "ast", name: "AST" },
      { key: "alt", name: "ALT" },
    ],
  },
];

/** The routine full panel ("all panels"): every panel except targeted ones such as Dengue. */
export const ALL_PANELS: PanelId[] = PANELS.filter((p) => !p.targeted).map((p) => p.id);

export function panelName(id: PanelId): string {
  return PANELS.find((p) => p.id === id)?.name ?? id;
}

export function nextStage(stage: CaseStage): CaseStage | undefined {
  return STAGES[STAGES.indexOf(stage) + 1];
}

export function stageIndex(stage: CaseStage): number {
  return STAGES.indexOf(stage);
}

/** Only the very next stage is allowed. */
export function canAdvance(c: Case, to: CaseStage): boolean {
  return nextStage(c.stage) === to;
}

/**
 * Move a case to the next stage and record who and when. Returns the same
 * case object (unchanged) if `to` is not the next stage.
 */
export function advanceCase(
  c: Case,
  to: CaseStage,
  event: Omit<StageEvent, "stage">,
  patch: Partial<Pick<Case, "reportId" | "treatmentPlanId">> = {},
): Case {
  if (!canAdvance(c, to)) return c;
  const entry: StageEvent = { stage: to, by: event.by, at: event.at };
  if (event.note) entry.note = event.note;
  return { ...c, ...patch, stage: to, stageHistory: [...c.stageHistory, entry] };
}

/** Advance through several stages in order; each step is skipped if it isn't the next valid one. */
export function advanceSteps(c: Case, stages: CaseStage[], event: Omit<StageEvent, "stage">): Case {
  return stages.reduce((acc, s) => advanceCase(acc, s, event), c);
}

export interface NewCaseInput {
  id: string;
  /** Defaults to "doctor_order". */
  origin?: CaseOrigin;
  patientId: string;
  orderedBy: string;
  suspectedDisease: string;
  panels: PanelId[];
  urgency: Urgency;
  clinicalNote: string;
  at: string;
}

/** A new lab order at "ordered". */
export function createCase(input: NewCaseInput): Case {
  const { at, origin = "doctor_order", ...rest } = input;
  const event: StageEvent = { stage: "ordered", by: input.orderedBy, at };
  if (input.clinicalNote.trim()) event.note = input.clinicalNote.trim();
  return { ...rest, origin, panels: [...rest.panels], stage: "ordered", stageHistory: [event] };
}

export interface AlertCaseInput {
  episodeId: string;
  patientId: string;
  /** The wearable pattern, e.g. "Dengue-like pattern". */
  pattern: string;
  urgency: Urgency;
  note: string;
  at: string;
}

/**
 * A case raised by a wearable alert, at "alert_raised". One open case per
 * episode: returns null if this episode already has a case.
 */
export function createAlertCase(cases: Case[], input: AlertCaseInput): Case | null {
  if (cases.some((c) => c.episodeId === input.episodeId)) return null;
  const by = "Inara (wearable alert)";
  return {
    id: `case-alert-${input.episodeId}`,
    patientId: input.patientId,
    origin: "wearable",
    episodeId: input.episodeId,
    orderedBy: by,
    suspectedDisease: input.pattern,
    panels: [],
    urgency: input.urgency,
    clinicalNote: input.note,
    stage: "alert_raised",
    stageHistory: [{ stage: "alert_raised", by, at: input.at, note: input.note }],
  };
}

export interface AlertOrderInput {
  orderedBy: string;
  suspectedDisease: string;
  panels: PanelId[];
  urgency: Urgency;
  clinicalNote: string;
  at: string;
}

/**
 * The doctor orders tests from a wearable alert: the same case (origin
 * "wearable", same episode) moves alert_raised → ordered with the order details.
 * Returns the case unchanged if it isn't at "alert_raised" or no panel is chosen.
 */
export function orderFromAlert(c: Case, input: AlertOrderInput): Case {
  if (c.stage !== "alert_raised" || input.panels.length === 0) return c;
  const note = input.clinicalNote.trim();
  const moved = advanceCase(c, "ordered", { by: input.orderedBy, at: input.at, note: note || "Ordered from wearable alert" });
  return {
    ...moved,
    orderedBy: input.orderedBy,
    suspectedDisease: input.suspectedDisease.trim() || c.suspectedDisease,
    panels: [...input.panels],
    urgency: input.urgency,
    clinicalNote: note,
  };
}

export function isOpen(c: Case): boolean {
  return c.stage !== "follow_up_scheduled";
}

/** A wearable alert that hasn't become a lab order yet (no tests ordered). */
export function isAlertOnly(c: Case): boolean {
  return c.stage === "alert_raised";
}

/** When the case was ordered (its first history entry). */
export function orderedAt(c: Case): string {
  return c.stageHistory[0]?.at ?? "";
}

/** The latest history entry for a stage, if the case has reached it. */
export function stageEvent(c: Case, stage: CaseStage): StageEvent | undefined {
  return c.stageHistory.findLast((e) => e.stage === stage);
}

export function caseForReport(cases: Case[], reportId: string): Case | undefined {
  return cases.find((c) => c.reportId === reportId);
}

/**
 * The case the screens show for a patient: the open case that has results
 * (the one being worked on), else the newest open order, else the newest case.
 */
export function activeCase(cases: Case[], patientId: string): Case | undefined {
  // Wearable alerts without a lab order live in the Wearable view, not the lab case screens.
  const mine = cases
    .filter((c) => c.patientId === patientId && !isAlertOnly(c))
    .sort((a, b) => orderedAt(a).localeCompare(orderedAt(b)));
  const open = mine.filter(isOpen);
  return open.findLast((c) => !!c.reportId) ?? open.at(-1) ?? mine.at(-1);
}

// --- Phase labels per audience -------------------------------------------

export type DoctorPhase = "Wearable alert" | "In lab" | "Results received" | "Doctor review" | "Treatment phase" | "Completed";

export function doctorPhase(stage: CaseStage): DoctorPhase {
  switch (stage) {
    case "alert_raised":
      return "Wearable alert";
    case "ordered":
    case "in_lab":
      return "In lab";
    case "results_uploaded":
      return "Results received";
    case "analysis_done":
    case "under_review":
      return "Doctor review";
    case "approved":
    case "treatment_planned":
      return "Treatment phase";
    case "follow_up_scheduled":
      return "Completed";
  }
}

export type DashboardGroup = "wearable_alert" | "awaiting_lab" | "needs_review" | "treatment_pending" | "completed";

export const DASHBOARD_GROUPS: { id: DashboardGroup; label: string; hint: string }[] = [
  { id: "awaiting_lab", label: "Awaiting lab", hint: "Tests ordered — waiting for results." },
  { id: "needs_review", label: "Needs your review", hint: "Results are in — review and approve." },
  { id: "treatment_pending", label: "Treatment pending", hint: "Report approved — treatment plan to finish." },
  { id: "completed", label: "Completed", hint: "Plan released and follow-up booked." },
];

export function dashboardGroup(stage: CaseStage): DashboardGroup {
  switch (stage) {
    case "alert_raised":
      return "wearable_alert";
    case "ordered":
    case "in_lab":
      return "awaiting_lab";
    case "results_uploaded":
    case "analysis_done":
    case "under_review":
      return "needs_review";
    case "approved":
    case "treatment_planned":
      return "treatment_pending";
    case "follow_up_scheduled":
      return "completed";
  }
}

/** The patient's simplified steps. Results stay hidden until "Report ready" (approval). */
export const PATIENT_STEPS: { label: string; stages: CaseStage[] }[] = [
  { label: "Inara noticed a change", stages: ["alert_raised"] },
  { label: "Test ordered", stages: ["ordered"] },
  { label: "At the lab", stages: ["in_lab"] },
  { label: "With your doctor", stages: ["results_uploaded", "analysis_done", "under_review"] },
  { label: "Report ready", stages: ["approved"] },
  { label: "Treatment plan ready", stages: ["treatment_planned"] },
  { label: "Follow-up booked", stages: ["follow_up_scheduled"] },
];

export function patientStepIndex(stage: CaseStage): number {
  return PATIENT_STEPS.findIndex((s) => s.stages.includes(stage));
}

/** The friendly steps for this case: wearable cases start with "Inara noticed a change". */
export function patientStepsFor(c: Pick<Case, "origin">): { label: string; stages: CaseStage[] }[] {
  return c.origin === "wearable" ? PATIENT_STEPS : PATIENT_STEPS.slice(1);
}

export function patientStepLabel(stage: CaseStage): string {
  return PATIENT_STEPS[patientStepIndex(stage)].label;
}

/** Context for the top-bar phase label. */
export interface TopBarContext {
  role: Role;
  pathname: string;
  cases: Case[];
  patients: { id: string; name: string }[];
  /** Patients this user may see: a doctor's own patients, or the patient themself. */
  patientIds: string[];
}

/**
 * "Doctor · Ravi Kumar · Treatment phase", "Doctor · 3 need review",
 * "Patient · Report ready", "Lab · 3 open orders". Undefined off role pages.
 */
export function topBarPhase(ctx: TopBarContext): string | undefined {
  const { role, pathname, cases, patients, patientIds } = ctx;
  if (role === "doctor" && pathname.startsWith("/doctor")) {
    const id = pathname.split("/")[2];
    if (id) {
      const patient = patients.find((p) => p.id === id);
      const c = activeCase(cases, id);
      if (!patient) return "Doctor";
      return c ? `Doctor · ${patient.name} · ${doctorPhase(c.stage)}` : `Doctor · ${patient.name}`;
    }
    const review = patientIds.filter((pid) => {
      const c = activeCase(cases, pid);
      return c && dashboardGroup(c.stage) === "needs_review";
    }).length;
    return `Doctor · ${review} need${review === 1 ? "s" : ""} review`;
  }
  if (role === "patient" && pathname.startsWith("/patient")) {
    const c = patientIds[0] ? activeCase(cases, patientIds[0]) : undefined;
    return c ? `Patient · ${patientStepLabel(c.stage)}` : "Patient";
  }
  if (role === "lab" && pathname.startsWith("/lab")) {
    const open = cases.filter((c) => isOpen(c) && !isAlertOnly(c)).length;
    return `Lab · ${open} open order${open === 1 ? "" : "s"}`;
  }
  return undefined;
}
