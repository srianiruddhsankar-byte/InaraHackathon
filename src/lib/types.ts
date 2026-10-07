// Core data model for Prodrome. All data is synthetic.

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
  | "wbc"
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
  | "crp"
  | "ns1"
  | "dengue_igm";

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
  /** The patient ID shown to the patient and typed by a doctor to request access (e.g. "BMQ-1001"). */
  publicId?: string;
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

/** Result of a qualitative test such as dengue NS1 antigen. */
export type QualResult = "Positive" | "Negative" | "Equivocal";

export interface LabValue {
  testKey: TestKey;
  /** Qualitative tests store a code here (Negative 0, Equivocal 0.5, Positive 1) and the word in `result`. */
  value: number;
  unit: string;
  flag: Flag;
  /** Set when the lab reported a bound ("<5"); `value` is the bound itself. */
  qualifier?: Qualifier;
  /** Qualitative tests only: the result as reported. */
  result?: QualResult;
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

/**
 * A patient's QR share code. The token is random and opaque — it never contains
 * patient data. One active code per patient; making a new one marks the old one
 * replaced (it stops working). Kept for the record, never deleted.
 */
export interface ShareToken {
  id: string;
  token: string;
  patientId: string;
  createdAt: string; // ISO 8601
  /** Set when the patient made a new code: this one no longer works. */
  replacedAt?: string;
  /** The patient's choice: doctors who get access see the emergency view only. */
  emergencyOnly: boolean;
}

export type AccessVia = "qr" | "patient_id";
export type AccessScope = "full" | "emergency";

/**
 * A doctor's request to open a patient's record (src/lib/recordAccess.ts).
 * pending → approved by the patient (OTP shown to them) → granted when the doctor
 * enters the OTP, until expiresAt. Declined / revoked / locked end it.
 */
export interface AccessRequest {
  id: string;
  patientId: string;
  doctorId: string;
  doctorName: string;
  hospital?: string;
  specialty?: string;
  via: AccessVia;
  /** Minutes of access once granted (30 or 60). */
  durationMin: number;
  /** 6-digit one-time code, revealed to the patient when they approve (simulated SMS / in-app). */
  otp: string;
  requestedAt: string; // ISO 8601
  approvedAt?: string;
  declinedAt?: string;
  /** Set on approval: the full record, or the emergency view only. */
  scope?: AccessScope;
  /** Wrong OTP entries; locked after MAX_OTP_ATTEMPTS. */
  otpAttempts: number;
  grantedAt?: string;
  expiresAt?: string;
  revokedAt?: string;
}

/** Append-only record of what happened with a patient's record access (requests, views, revokes). */
export interface AccessLogEntry {
  patientId: string;
  viewer: string;
  timestamp: string; // ISO 8601
  action: string;
  requestId?: string;
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

export type ScreenId = "diabetes" | "kidney" | "anaemia" | "liver" | "lipids" | "dengue";

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

/** What the wearable alert behind a case showed (doctor screens only). */
export interface WearableContext {
  episodeId: string;
  /** e.g. "Dengue-like pattern". */
  patternName: string;
  patternLevel: "watch" | "concerning";
  /** Date of the night that raised it (ISO date). */
  date: string;
  /** Key evidence lines, e.g. "Night HR 78 vs usual 56 (+22)". */
  evidence: string[];
  supportingFactors: string[];
  /** The patient's check-in answers, in the order asked. */
  answers: { question: string; answer: string; redFlag: boolean }[];
  /** Red flags reported (or measured), e.g. "belly pain". */
  redFlags: string[];
  /** What Prodrome advised, e.g. "Please see a doctor now". */
  recommendation?: string;
}

/** Extra context for the findings that comes from the case, not the report. */
export interface FindingsContext {
  /** The case's suspected disease; overrides the patient's own field. */
  suspectedDisease?: string;
  /** Present when the case started from a wearable alert. */
  wearable?: WearableContext;
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

export type Role = "doctor" | "patient" | "lab" | "admin" | "health_officer";

/** Staff account status, set by the hospital admin. Patients are always "verified". */
export type AccountStatus = "pending" | "verified" | "suspended";

/** How the current session was signed in: real Supabase Auth, or the simulated demo login. */
export type AuthMode = "supabase" | "demo";

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
  /** Staff accounts: verification status (missing = verified). Used by the offline demo login. */
  status?: AccountStatus;
  /** Doctors: medical council registration number. */
  councilRegNo?: string;
}

export interface Session {
  userId: string;
  role: Role;
  loggedInAt: string; // ISO 8601
  /** Missing = "demo" (sessions saved before real auth existed). */
  mode?: AuthMode;
  /** Supabase sessions: account status from the profiles table (authoritative over User.status). */
  status?: AccountStatus;
  /** Supabase sessions: "aal2" once the authenticator code was entered. */
  aal?: "aal1" | "aal2";
}

/** One status change by the hospital admin (append-only). */
export interface AccountAuditEntry {
  id: string;
  targetId: string;
  targetName: string;
  targetRole: Role;
  actorName: string;
  oldStatus: AccountStatus;
  newStatus: AccountStatus;
  reason: string;
  timestamp: string; // ISO 8601
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

export type PanelId = "metabolic" | "kidney" | "lipid" | "cbc" | "liver" | "thyroid" | "others" | "dengue";

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
