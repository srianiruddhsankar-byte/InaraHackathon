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
  | "alt";

export interface Patient {
  id: string;
  name: string;
  age: number;
  sex: Sex;
  bloodGroup: string;
  allergies: string[];
  chronicConditions: string[];
  suspectedDisease: string;
}

export interface LabValue {
  testKey: TestKey;
  value: number;
  unit: string;
  flag: Flag;
}

export interface ReportVersion {
  id: string;
  status: ReportStatus;
  text: string;
  prescription?: string;
  author: string;
  timestamp: string; // ISO 8601
}

export interface Report {
  id: string;
  patientId: string;
  date: string; // ISO 8601 date
  labName: string;
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
