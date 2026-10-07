// Authentication helpers. Pure functions — no network, no real secrets.
// The offline demo login runs over a list of users; real sign-in (Supabase Auth) lives in
// src/lib/supabaseAuth.ts and uses the validation and error classification here.
import type { Role, User } from "./types";

// Keep in sync with handle_new_user() in supabase/auth_profiles.sql.
export const ALLOWED_DOCTOR_DOMAINS = ["inara-hospital.in", "citycare.in"] as const;

/** The hospital behind each allowlisted email domain. */
export const HOSPITAL_BY_DOMAIN: Record<(typeof ALLOWED_DOCTOR_DOMAINS)[number], string> = {
  "inara-hospital.in": "Meridian Hospital",
  "citycare.in": "CityCare Hospital",
};

export function hospitalForEmail(email: string): string | undefined {
  const domain = email.trim().toLowerCase().split("@")[1];
  return (HOSPITAL_BY_DOMAIN as Record<string, string>)[domain ?? ""];
}

/** Simulated OTP: always this code, shown on screen as "Demo OTP". */
export const DEMO_OTP = "123456";

export type AuthResult = { ok: true; user: User } | { ok: false; error: string };
export type OtpRequestResult = { ok: true; phone: string; demoOtp: string } | { ok: false; error: string };

/** Doctor verification is simulated by a hospital email-domain allowlist. */
export function isAllowedDoctorDomain(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@")[1];
  return domain !== undefined && (ALLOWED_DOCTOR_DOMAINS as readonly string[]).includes(domain);
}

/**
 * Normalise an Indian mobile number to "+91XXXXXXXXXX".
 * Accepts "9000000001", "+91 90000 00001", "091-9000000001", etc. Returns null if invalid.
 */
export function normalisePhone(phone: string): string | null {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("091")) digits = digits.slice(3);
  else if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

export function loginDoctorOrLab(users: User[], email: string, password: string): AuthResult {
  const normalised = email.trim().toLowerCase();
  if (!normalised || !password) return { ok: false, error: "Enter your email and password." };

  const user = users.find((u) => u.role !== "patient" && u.email?.toLowerCase() === normalised);
  if (!user) {
    if (normalised.includes("@") && !isAllowedDoctorDomain(normalised) && !normalised.endsWith("@inara-diagnostics.in")) {
      return { ok: false, error: "This email is not from a verified hospital or lab." };
    }
    return { ok: false, error: "No account found for this email." };
  }
  if ((user.role === "doctor" || user.role === "admin" || user.role === "health_officer") && !isAllowedDoctorDomain(normalised)) {
    return { ok: false, error: "Doctor accounts must use a verified hospital email." };
  }
  if (user.password !== password) return { ok: false, error: "Incorrect password." };
  return { ok: true, user };
}

function findPatientByPhone(users: User[], phone: string): User | undefined {
  return users.find((u) => u.role === "patient" && u.phone === phone);
}

export function requestOtp(users: User[], phone: string): OtpRequestResult {
  const normalised = normalisePhone(phone);
  if (!normalised) return { ok: false, error: "Enter a valid 10-digit mobile number." };
  if (!findPatientByPhone(users, normalised)) return { ok: false, error: "No patient record is linked to this number." };
  return { ok: true, phone: normalised, demoOtp: DEMO_OTP };
}

export function verifyOtp(users: User[], phone: string, code: string): AuthResult {
  const normalised = normalisePhone(phone);
  const user = normalised ? findPatientByPhone(users, normalised) : undefined;
  if (!user) return { ok: false, error: "No patient record is linked to this number." };
  if (code.trim() !== DEMO_OTP) return { ok: false, error: "Incorrect OTP. Please try again." };
  return { ok: true, user };
}

/** Where each role lands after logging in. */
export function homeFor(role: Role): string {
  return role === "health_officer" ? "/health" : `/${role}`;
}

export function roleLabel(role: Role): string {
  return { doctor: "Doctor", patient: "Patient", lab: "Lab", admin: "Hospital admin", health_officer: "Public health officer" }[role];
}

// ---- Registration (doctors and labs; real sign-up only) ----

export interface RegistrationInput {
  role: "doctor" | "lab";
  name: string;
  email: string;
  password: string;
  /** Doctors only. */
  specialty?: string;
  /** Doctors only: medical council registration number, e.g. "TNMC 123456". */
  councilRegNo?: string;
}

export type RegistrationField = "name" | "email" | "password" | "specialty" | "councilRegNo";
export type RegistrationResult =
  | { ok: true; value: RegistrationInput & { hospital?: string } }
  | { ok: false; errors: Partial<Record<RegistrationField, string>> };

export const MIN_PASSWORD_LENGTH = 8;

/** Letters, digits, spaces, "/" or "-", 4–30 characters, at least 3 digits (same rule as the database). */
export function isValidCouncilRegNo(value: string): boolean {
  const v = value.trim();
  return /^[A-Za-z0-9 /-]{4,30}$/.test(v) && v.replace(/\D/g, "").length >= 3;
}

export function validateRegistration(input: RegistrationInput): RegistrationResult {
  const errors: Partial<Record<RegistrationField, string>> = {};
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (name.length < 2) errors.name = input.role === "doctor" ? "Enter your full name." : "Enter the lab's name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address.";
  else if (input.role === "doctor" && !isAllowedDoctorDomain(email)) {
    errors.email = `Use your hospital email (${ALLOWED_DOCTOR_DOMAINS.map((d) => "@" + d).join(", ")}).`;
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (input.role === "doctor") {
    if (!input.specialty?.trim()) errors.specialty = "Enter your specialty.";
    if (!isValidCouncilRegNo(input.councilRegNo ?? "")) {
      errors.councilRegNo = "Enter your medical council registration number (e.g. TNMC 123456).";
    }
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      role: input.role,
      name,
      email,
      password: input.password,
      ...(input.role === "doctor"
        ? {
            specialty: input.specialty!.trim(),
            councilRegNo: input.councilRegNo!.trim().toUpperCase(),
            hospital: hospitalForEmail(email),
          }
        : {}),
    },
  };
}

// ---- Real sign-in errors → what the login form does ----

/**
 * "network": Supabase can't be reached (offline, blocked, timed out) → offer the offline demo login.
 * "credentials": wrong email or password → never fall back.
 * "unconfirmed": email not confirmed yet. "other": anything else, shown as is.
 */
export type AuthErrorKind = "network" | "credentials" | "unconfirmed" | "other";

export function classifyAuthError(error: unknown): AuthErrorKind {
  const e = (error ?? {}) as { name?: string; message?: string; code?: string; status?: number };
  const name = e.name ?? "";
  const message = (e.message ?? String(error ?? "")).toLowerCase();
  if (e.code === "invalid_credentials" || message.includes("invalid login credentials")) return "credentials";
  if (e.code === "email_not_confirmed" || message.includes("email not confirmed")) return "unconfirmed";
  if (
    name === "AuthRetryableFetchError" ||
    name === "AbortError" ||
    name === "TimeoutError" ||
    (name === "TypeError" && message.includes("fetch")) ||
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("timed out") ||
    message.includes("load failed") ||
    (typeof e.status === "number" && (e.status === 0 || e.status >= 500))
  ) {
    return "network";
  }
  return "other";
}
