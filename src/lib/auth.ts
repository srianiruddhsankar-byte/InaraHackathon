// Simulated authentication. Pure functions over a list of users — no network, no real secrets.
import type { Role, User } from "./types";

export const ALLOWED_DOCTOR_DOMAINS = ["inara-hospital.in", "citycare.in"] as const;

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

  const user = users.find((u) => (u.role === "doctor" || u.role === "lab") && u.email?.toLowerCase() === normalised);
  if (!user) {
    if (normalised.includes("@") && !isAllowedDoctorDomain(normalised) && !normalised.endsWith("@inara-diagnostics.in")) {
      return { ok: false, error: "This email is not from a verified hospital or lab." };
    }
    return { ok: false, error: "No account found for this email." };
  }
  if (user.role === "doctor" && !isAllowedDoctorDomain(normalised)) {
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
  return `/${role}`;
}

export function roleLabel(role: Role): string {
  return { doctor: "Doctor", patient: "Patient", lab: "Lab" }[role];
}
