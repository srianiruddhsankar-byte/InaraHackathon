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
  | "platelets"
  | "ferritin"
  | "ast"
  | "alt"
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
  suspectedDisease: string;
}

export interface LabValue {
  testKey: TestKey;
  value: number;
  unit: string;
  flag: Flag;
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

/** A value exactly as the lab sent it, before normalisation. */
export interface RawLabValue {
  name: string;
  value: string | number;
  unit: string;
}

export interface Report {
  id: string;
  patientId: string;
  date: string; // ISO 8601 date
  labName: string;
  /** When the lab results arrived (ISO 8601). */
  receivedAt?: string;
  /** Rows as received from the lab; `values` is the normalised result. */
  raw?: RawLabValue[];
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
