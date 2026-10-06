// Core data model for Inara. All data is synthetic.

export type Sex = "M" | "F";

export type Flag = "low" | "normal" | "high";

export type ReportStatus = "ai_draft" | "doctor_edited" | "approved";

export type TestKey =
  | "hba1c"
  | "fasting_glucose"
  | "total_chol"
  | "ldl"
  | "hdl"
  | "triglycerides"
  | "creatinine"
  | "urine_acr"
  | "hb"
  | "mcv"
  | "rbc"
  | "hct"
  | "platelets"
  | "ferritin"
  | "ast"
  | "alt"
  | "ggt"
  | "tsh"
  | "vitamin_d"
  | "vitamin_b12"
  | "uric_acid"
  | "sodium"
  | "potassium"
  | "bun"
  | "crp";

/** A medicine the patient is taking now (prescribed or self-reported). */
export interface CurrentMedication {
  name: string;
  dose: string;
  frequency: string;
  since: string; // ISO date or year
  prescribedBy: string;
  note?: string;
  /** Set when a doctor stops the medicine via an approved plan. Kept for history, never deleted. */
  stopped?: { date: string; by: string; reason: string };
}

export interface Visit {
  date: string; // ISO 8601 date
  doctor: string;
  reason: string;
  note: string;
}

/** One consent choice: on/off and when it was last changed. */
export interface ConsentChoice {
  granted: boolean;
  updatedAt: string; // ISO 8601
}

/** The separate consent choices (DPDP-style: each one asked and stored on its own). */
export type ConsentKey = "ownCare" | "populationShare" | "streaming" | "notifyDoctorOnUrgent" | "notifyContactOnUrgent";

export interface EmergencyContact {
  name: string;
  relation: string;
  phone: string;
  updatedAt: string; // ISO 8601
}

/** A patient's privacy and safety settings for wearable monitoring. */
export interface PatientSettings {
  patientId: string;
  /** (a) Use my data for my own care. */
  ownCare: ConsentChoice;
  /** (b) Add my data anonymously to the local population database. */
  populationShare: ConsentChoice;
  /** (c) Stream wearable data continuously. Off = no wearable data is processed. */
  streaming: ConsentChoice;
  /** Notify my doctor on urgent alerts. */
  notifyDoctorOnUrgent: ConsentChoice;
  /** Notify my emergency contact on urgent alerts. */
  notifyContactOnUrgent: ConsentChoice;
  emergencyContact: EmergencyContact | null;
}

/** Append-only record of every consent change. */
export interface ConsentLogEntry {
  patientId: string;
  change: ConsentKey | "emergencyContact";
  granted?: boolean;
  by: string;
  at: string; // ISO 8601
}

export interface Patient {
  id: string;
  name: string;
  age: number;
  sex: Sex;
  pregnant?: boolean;
  bloodGroup: string;
  phone: string;
  allergies: string[];
  chronicConditions: string[];
  currentMedications: CurrentMedication[];
  visitHistory: Visit[];
  /** Past illnesses that have resolved, e.g. "Dengue fever (2023, recovered)". */
  pastIllnesses?: string[];
  city?: string;
  area?: string;
  suspectedDisease: string;
}

/** A censored result: the lab reported "<5" or ">300" rather than an exact number. */
export type Qualifier = "<" | ">" | "≤" | "≥";

export interface LabValue {
  testKey: TestKey;
  value: number;
  unit: string;
  flag: Flag;
  /** Set when the lab reported a bound ("<5"); `value` is the bound itself. */
  qualifier?: Qualifier;
}

/** A doctor's change to one finding before it goes into the draft. */
export interface FindingEdit {
  /** False = excluded from the report. */
  included: boolean;
  title?: string;
  summary?: string;
  recommendation?: string;
}

/** Finding id → the doctor's edit. Findings without an entry are kept as-is. */
export type FindingEdits = Record<string, FindingEdit>;

export interface ReportVersion {
  id: string;
  status: ReportStatus;
  /** Clinical summary — doctors only. */
  text: string;
  /** Plain-language explanation — shown to the patient once approved. */
  patientText?: string;
  prescription?: string;
  /** The finding include/wording choices this version was written from. */
  findingEdits?: FindingEdits;
  author: string;
  timestamp: string; // ISO 8601
}

/** How one uploaded row was read (see src/lib/upload.ts). */
export type UploadRowStatus =
  | "mapped"
  | "converted"
  | "unit_assumed"
  | "not_reported"
  | "unknown"
  | "needs_fixing"
  | "duplicate"
  | "low_confidence";

/** A value exactly as the lab sent it, before normalisation. */
export interface RawLabValue {
  name: string;
  value: string | number;
  unit: string;
  /** Set for uploaded rows: how the row was read after the lab verified it. */
  status?: UploadRowStatus;
  testKey?: TestKey | null;
  /** The value in the canonical unit, or null if not imported. */
  normalised?: number | null;
}

export type ReportSource = "csv" | "photo";

export interface Report {
  id: string;
  patientId: string;
  date: string; // ISO 8601 date
  labName: string;
  /** When the lab results arrived (ISO 8601). */
  receivedAt?: string;
  /** Rows as received from the lab; `values` is the normalised result. */
  raw?: RawLabValue[];
  /** How the lab sent the results. */
  source?: ReportSource;
  /** The technician who confirmed the values against the original report. */
  verifiedBy?: string;
  /** Photo uploads only: a small compressed JPEG data URL (never the full image). */
  photoThumbnail?: string;
  verifiedAt?: string; // ISO 8601
  values: LabValue[];
  /** Append-only: ai_draft → doctor_edited → approved. Never overwrite. */
  versions: ReportVersion[];
}

export interface ShareToken {
  token: string; // random nanoid
  patientId: string;
  createdAt: string; // ISO 8601
  revoked: boolean;
  emergencyOnly: boolean;
}

export interface AccessLogEntry {
  patientId: string;
  viewer: string;
  timestamp: string; // ISO 8601
  action: string;
}

/** `Patient.age` is the patient's age on this date; ages at other report dates are derived from it. */
export const AGE_REFERENCE_DATE = "2026-03-15";

/** A doctor-set target that replaces the guideline target for one patient and test. */
export interface TargetOverride {
  patientId: string;
  testKey: TestKey;
  /** "<" = value should stay below `value`; ">" = above. */
  op: "<" | ">";
  value: number;
  reason: string;
  author: string;
  timestamp: string; // ISO 8601
}

/** Lab tests plus derived series (eGFR is computed from creatinine). */
export type TrendKey = TestKey | "egfr";

export type ScreenId = "diabetes" | "kidney" | "anaemia" | "liver" | "lipids";

export type FindingCategory = "suspected" | "incidental" | "normal";

export type Severity = "high" | "watch" | "normal";

export interface Finding {
  id: string;
  category: FindingCategory;
  /** Which screen produced it; absent for the generic "no concerns" finding. */
  screen?: ScreenId;
  disease: string;
  severity: Severity;
  title: string;
  summary: string;
  evidence: string[];
  recommendation?: string;
  guideline: string;
  /** Machine-readable sub-pattern, e.g. "thalassaemia_trait" for anaemia. */
  pattern?: string;
}

export interface Trend {
  testKey: TrendKey;
  slopePerYear: number;
  baselineMean: number;
  latest: number;
  /** latest − baselineMean, in the test's unit. */
  deviation: number;
  direction: "rising" | "falling" | "stable";
  driftingWithinRange: boolean;
}

// ---- Users, sessions and treatment plans ----

export type Role = "doctor" | "patient" | "lab";

export interface User {
  id: string;
  role: Role;
  name: string;
  email?: string;
  phone?: string;
  /** Demo only — never store real passwords like this. */
  password?: string;
  specialty?: string;
  hospital?: string;
  /** For patient users: the Patient record they own. */
  patientId?: string;
  /** For doctor users: the patients they treat. */
  patientIds?: string[];
}

export interface Session {
  userId: string;
  role: Role;
  loggedInAt: string; // ISO 8601
}

export type FoodTiming = "before food" | "with food" | "after food" | "any";

/** A doctor's decision to prescribe despite a blocking safety alert. Doctors only. */
export interface PrescriptionOverride {
  reason: string;
  author: string;
  timestamp: string; // ISO 8601
  /** The blocking rules that were overridden. */
  rules: string[];
}

export interface Medication {
  name: string;
  dose: string;
  /** A frequency code from the formulary (OD, BD, …) or free text. */
  frequency: string;
  duration: string;
  instructions: string;
  /** Formulary id; absent for custom medicines (no safety checks). */
  formularyId?: string;
  custom?: boolean;
  foodTiming?: FoodTiming;
  override?: PrescriptionOverride;
  /** Fields pre-filled from formulary defaults that the doctor has not yet confirmed or edited. */
  unconfirmedDefaults?: DefaultField[];
}

/** Medication fields that can be pre-filled from formulary defaults. */
export type DefaultField = "dose" | "frequency" | "foodTiming" | "duration" | "instructions";

/** A current medicine the doctor stops in a treatment plan. */
export interface StoppedMedication {
  name: string;
  dose: string;
  reason: string;
  author: string;
  timestamp: string; // ISO 8601
}

/** A canonical test (testKey set) or a free-text one such as "Hb electrophoresis". */
export interface FollowUpTest {
  testKey?: TestKey;
  name: string;
  inWeeks: number;
}

export type TreatmentPlanStatus = "draft" | "approved";

/** One version of a treatment plan. Append-only like report versions. */
export interface TreatmentPlan {
  id: string;
  patientId: string;
  reportId: string;
  medications: Medication[];
  /** Current medicines to stop ("Medicines to stop"). */
  stopMedications?: StoppedMedication[];
  lifestyle: string[];
  followUpTests: FollowUpTest[];
  nextReviewDate: string; // ISO 8601 date
  doctorNotes: string;
  status: TreatmentPlanStatus;
  author: string;
  timestamp: string; // ISO 8601
}

/** Where a case is in the workflow. Stages only move forward, one at a time (see src/lib/workflow.ts). */
export type CaseStage =
  /** A case that started from a wearable alert, before any test is ordered. */
  | "alert_raised"
  | "ordered"
  | "in_lab"
  | "results_uploaded"
  | "analysis_done"
  | "under_review"
  | "approved"
  | "treatment_planned"
  | "follow_up_scheduled";

export type PanelId = "metabolic" | "kidney" | "lipid" | "cbc" | "liver" | "thyroid" | "others";

export type Urgency = "routine" | "urgent";

/** One recorded stage change: who moved the case and when. */
export interface StageEvent {
  stage: CaseStage;
  by: string;
  at: string; // ISO 8601
  note?: string;
}

/** A lab order and everything that follows from it: results → review → approval → treatment → follow-up. */
export type CaseOrigin = "wearable" | "doctor_order";

export interface Case {
  id: string;
  patientId: string;
  /** How the case started: a doctor's lab order, or a wearable alert (stage "alert_raised"). */
  origin: CaseOrigin;
  /** Wearable cases: the alert episode that raised it (one case per episode). */
  episodeId?: string;
  orderedBy: string;
  suspectedDisease: string;
  panels: PanelId[];
  urgency: Urgency;
  clinicalNote: string;
  reportId?: string;
  treatmentPlanId?: string;
  stage: CaseStage;
  /** Append-only: one entry per stage reached, oldest first. */
  stageHistory: StageEvent[];
}
