// Doctor access to a patient's record via QR code or patient ID, with the patient's
// OTP consent and a time limit (pure, tested). The one way to share a record.
//
// Patient: shows a QR (random opaque token — never data) or tells their patient ID.
// Doctor: scans / types it and asks for 30 or 60 minutes → the patient approves in the
// app and sees a 6-digit code → the doctor enters it → access until expiresAt.
// Times are real time (ms), so access ends on its own on every device.
import { activeMedications } from "./record";
import type {
  AccessLogEntry,
  AccessRequest,
  AccessScope,
  AccessVia,
  AccountStatus,
  CurrentMedication,
  EmergencyContact,
  Patient,
  PatientSettings,
  ShareToken,
  User,
} from "./types";

export const ACCESS_DURATIONS = [30, 60] as const;
/** The patient's code works for this long after they approve. */
export const OTP_VALID_MIN = 10;
/** A request the patient hasn't answered lapses after this long. */
export const REQUEST_VALID_MIN = 30;
/** Wrong codes before the request is locked (the doctor must send a new one). */
export const MAX_OTP_ATTEMPTS = 5;

/** No 0/O, 1/I/L — easy to read out and type. */
export const TOKEN_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const TOKEN_LENGTH = 16;

type RandomBytes = (n: number) => Uint8Array;
const cryptoBytes: RandomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

const MIN = 60_000;
const ms = (iso: string | undefined) => (iso ? Date.parse(iso) : NaN);

// ---- Share codes ----

/** A new random share token (~79 bits). Built only from random bytes — no patient data. */
export function newShareToken(rand: RandomBytes = cryptoBytes): string {
  const n = TOKEN_ALPHABET.length;
  const limit = 256 - (256 % n); // reject the top bytes so every character is equally likely
  let out = "";
  while (out.length < TOKEN_LENGTH) {
    for (const b of rand(TOKEN_LENGTH * 2)) {
      if (b < limit && out.length < TOKEN_LENGTH) out += TOKEN_ALPHABET[b % n];
    }
  }
  return out;
}

/** "K7QM2XPA9RTDH4WF" → "K7QM-2XPA-9RTD-H4WF" (easier to read out). */
export function formatToken(token: string): string {
  return token.match(/.{1,4}/g)?.join("-") ?? token;
}

/** A typed or scanned code → the bare token: any case, spaces and dashes, or a …/share/<token> link. */
export function normaliseCode(input: string): string {
  const trimmed = input.trim();
  const fromLink = trimmed.match(/\/share\/([^/?#\s]+)/i)?.[1] ?? trimmed;
  return fromLink.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** A 6-digit one-time code. */
export function newOtp(rand: RandomBytes = cryptoBytes): string {
  const [a, b, c, d] = rand(4);
  const n = ((a << 24) >>> 0) + (b << 16) + (c << 8) + d;
  return String(n % 1_000_000).padStart(6, "0");
}

export function currentShareToken(tokens: ShareToken[], patientId: string): ShareToken | undefined {
  return tokens.filter((t) => t.patientId === patientId && !t.replacedAt).at(-1);
}

/**
 * Give the patient a new share code. The previous one is marked replaced (it stops
 * working at once) but kept for the record. The emergency-only choice carries over.
 */
export function issueShareToken(
  tokens: ShareToken[],
  input: { id: string; token: string; patientId: string; at: string; emergencyOnly?: boolean },
): ShareToken[] {
  const previous = currentShareToken(tokens, input.patientId);
  const next: ShareToken = {
    id: input.id,
    token: input.token,
    patientId: input.patientId,
    createdAt: input.at,
    emergencyOnly: input.emergencyOnly ?? previous?.emergencyOnly ?? false,
  };
  return [
    ...tokens.map((t) => (t.patientId === input.patientId && !t.replacedAt ? { ...t, replacedAt: input.at } : t)),
    next,
  ];
}

export function setEmergencyOnly(tokens: ShareToken[], patientId: string, emergencyOnly: boolean): ShareToken[] {
  const current = currentShareToken(tokens, patientId);
  return tokens.map((t) => (t === current ? { ...t, emergencyOnly } : t));
}

// ---- Finding the patient ----

export type Target = { ok: true; patientId: string; via: AccessVia } | { ok: false; error: string };

/** A scanned / typed QR code, or a typed patient ID → the patient it belongs to. */
export function resolveTarget(
  input: string,
  via: AccessVia,
  data: { tokens: ShareToken[]; patients: Patient[] },
): Target {
  const code = normaliseCode(input);
  if (!code) return { ok: false, error: via === "qr" ? "Enter the code under the patient's QR." : "Enter the patient ID." };
  if (via === "qr") {
    const token = data.tokens.find((t) => t.token === code);
    if (!token) return { ok: false, error: "Code not recognised. Check it, or ask the patient to show their QR again." };
    if (token.replacedAt) return { ok: false, error: "This QR code is no longer valid — the patient made a new one. Ask them to show it." };
    return { ok: true, patientId: token.patientId, via };
  }
  const patient = data.patients.find((p) => {
    const id = normaliseCode(p.publicId ?? "");
    return id && (id === code || id.replace(/^[A-Z]+/, "") === code);
  });
  return patient ? { ok: true, patientId: patient.id, via } : { ok: false, error: "No patient with this ID. Check it with the patient." };
}

// ---- Requests ----

/** Only verified doctors may ask for access (pending / suspended accounts are blocked). */
export function doctorMayRequest(doctor: User | undefined, status: AccountStatus): { ok: true } | { ok: false; error: string } {
  if (!doctor || doctor.role !== "doctor") return { ok: false, error: "Only doctors can request access to a record." };
  if (status !== "verified") {
    return {
      ok: false,
      error:
        status === "pending"
          ? "Your account is waiting for verification — you can't request patient records yet."
          : "Your account is suspended — you can't request patient records.",
    };
  }
  return { ok: true };
}

export type RequestResult = { ok: true; request: AccessRequest } | { ok: false; error: string };

export function createAccessRequest(input: {
  id: string;
  otp: string;
  at: string;
  doctor: User | undefined;
  status: AccountStatus;
  patientId: string;
  via: AccessVia;
  durationMin: number;
}): RequestResult {
  const allowed = doctorMayRequest(input.doctor, input.status);
  if (!allowed.ok) return allowed;
  if (!(ACCESS_DURATIONS as readonly number[]).includes(input.durationMin)) {
    return { ok: false, error: "Choose 30 or 60 minutes." };
  }
  if (!/^\d{6}$/.test(input.otp)) return { ok: false, error: "Could not create a one-time code." };
  const doctor = input.doctor!;
  return {
    ok: true,
    request: {
      id: input.id,
      patientId: input.patientId,
      doctorId: doctor.id,
      doctorName: doctor.name,
      ...(doctor.hospital ? { hospital: doctor.hospital } : {}),
      ...(doctor.specialty ? { specialty: doctor.specialty } : {}),
      via: input.via,
      durationMin: input.durationMin,
      otp: input.otp,
      requestedAt: input.at,
      otpAttempts: 0,
    },
  };
}

export type AccessState =
  | "pending" // waiting for the patient
  | "approved" // patient approved; waiting for the doctor's code
  | "declined"
  | "lapsed" // not answered in time, or the code expired before it was entered
  | "locked" // too many wrong codes
  | "active"
  | "expired"
  | "revoked";

export function accessState(r: AccessRequest, nowMs: number): AccessState {
  if (r.revokedAt) return "revoked";
  if (r.declinedAt) return "declined";
  if (r.grantedAt) return nowMs < ms(r.expiresAt) ? "active" : "expired";
  if (r.otpAttempts >= MAX_OTP_ATTEMPTS) return "locked";
  if (r.approvedAt) return nowMs < ms(r.approvedAt) + OTP_VALID_MIN * MIN ? "approved" : "lapsed";
  return nowMs < ms(r.requestedAt) + REQUEST_VALID_MIN * MIN ? "pending" : "lapsed";
}

/** States that still need someone to act (the patient, or the doctor's code). */
export const isOpenRequest = (s: AccessState) => s === "pending" || s === "approved";

/** The patient approves: their code is now shown to them. Only from "pending". */
export function approveRequest(r: AccessRequest, input: { at: string; scope: AccessScope }): AccessRequest | null {
  if (accessState(r, ms(input.at)) !== "pending") return null;
  return { ...r, approvedAt: input.at, scope: input.scope };
}

export function declineRequest(r: AccessRequest, at: string): AccessRequest | null {
  return isOpenRequest(accessState(r, ms(at))) ? { ...r, declinedAt: at } : null;
}

/** The patient ends access now (or withdraws an open request). */
export function revokeRequest(r: AccessRequest, at: string): AccessRequest | null {
  const s = accessState(r, ms(at));
  return s === "active" || isOpenRequest(s) ? { ...r, revokedAt: at } : null;
}

export type OtpResult = { ok: true; request: AccessRequest } | { ok: false; error: string; request: AccessRequest };

/** The doctor enters the patient's code. A wrong code counts towards the lock. */
export function verifyOtp(
  r: AccessRequest,
  code: string,
  input: { at: string; doctorId: string; status: AccountStatus },
): OtpResult {
  const fail = (error: string, request = r): OtpResult => ({ ok: false, error, request });
  if (r.doctorId !== input.doctorId) return fail("This request belongs to another doctor.");
  if (input.status !== "verified") return fail("Only verified doctors can open patient records.");
  const state = accessState(r, ms(input.at));
  switch (state) {
    case "pending":
      return fail("Waiting for the patient to approve. They will see the code on their phone.");
    case "declined":
      return fail("The patient declined this request.");
    case "revoked":
      return fail("The patient withdrew this request.");
    case "locked":
      return fail("Too many wrong codes — please send a new request.");
    case "lapsed":
      return fail("This request has expired — please send a new request.");
    case "active":
    case "expired":
      return fail("This code was already used.");
  }
  if (code.replace(/\D/g, "") !== r.otp) {
    const next = { ...r, otpAttempts: r.otpAttempts + 1 };
    const left = MAX_OTP_ATTEMPTS - next.otpAttempts;
    return fail(left > 0 ? `Wrong code — ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong codes — please send a new request.", next);
  }
  return {
    ok: true,
    request: { ...r, grantedAt: input.at, expiresAt: new Date(ms(input.at) + r.durationMin * MIN).toISOString() },
  };
}

// ---- Reading the state ----

const newestFirst = (a: AccessRequest, b: AccessRequest) => b.requestedAt.localeCompare(a.requestedAt);

/** The doctor's current access to this patient, if any. */
export function activeGrant(requests: AccessRequest[], doctorId: string, patientId: string, nowMs: number): AccessRequest | undefined {
  return requests
    .filter((r) => r.doctorId === doctorId && r.patientId === patientId && accessState(r, nowMs) === "active")
    .sort(newestFirst)[0];
}

/** The doctor's latest request for this patient that is still waiting (patient or code). */
export function openRequest(requests: AccessRequest[], doctorId: string, patientId: string, nowMs: number): AccessRequest | undefined {
  return requests
    .filter((r) => r.doctorId === doctorId && r.patientId === patientId && isOpenRequest(accessState(r, nowMs)))
    .sort(newestFirst)[0];
}

/** Requests the patient should see a prompt for (newest first). */
export function promptsForPatient(requests: AccessRequest[], patientId: string, nowMs: number): AccessRequest[] {
  return requests.filter((r) => r.patientId === patientId && isOpenRequest(accessState(r, nowMs))).sort(newestFirst);
}

/** Everyone with access right now, for one doctor (newest first). */
export function activeGrantsFor(requests: AccessRequest[], doctorId: string, nowMs: number): AccessRequest[] {
  return requests.filter((r) => r.doctorId === doctorId && accessState(r, nowMs) === "active").sort(newestFirst);
}

export function remainingMs(r: AccessRequest, nowMs: number): number {
  return r.expiresAt ? Math.max(0, ms(r.expiresAt) - nowMs) : 0;
}

/** 1 234 000 ms → "20:34". */
export function formatCountdown(remaining: number): string {
  const total = Math.ceil(remaining / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export interface AccessHistoryRow {
  request: AccessRequest;
  state: AccessState;
  /** Sections the doctor opened, in order (from the access log). */
  viewed: string[];
}

/** The patient's access log: every request, newest first, with what was viewed. */
export function accessHistory(requests: AccessRequest[], log: AccessLogEntry[], patientId: string, nowMs: number): AccessHistoryRow[] {
  return requests
    .filter((r) => r.patientId === patientId)
    .sort(newestFirst)
    .map((request) => ({
      request,
      state: accessState(request, nowMs),
      viewed: [
        ...new Set(
          log.filter((e) => e.requestId === request.id && e.action.startsWith("Viewed ")).map((e) => e.action.slice("Viewed ".length)),
        ),
      ],
    }));
}

// ---- Emergency view ----

export interface EmergencyView {
  name: string;
  age: number;
  sex: Patient["sex"];
  bloodGroup: string;
  allergies: string[];
  medicines: Pick<CurrentMedication, "name" | "dose" | "frequency">[];
  emergencyContact: Pick<EmergencyContact, "name" | "relation" | "phone"> | null;
}

/** Only what a doctor needs in an emergency: blood group, allergies, current medicines, emergency contact. */
export function emergencyView(patient: Patient, settings: PatientSettings | undefined): EmergencyView {
  const c = settings?.emergencyContact;
  return {
    name: patient.name,
    age: patient.age,
    sex: patient.sex,
    bloodGroup: patient.bloodGroup,
    allergies: [...patient.allergies],
    medicines: activeMedications(patient.currentMedications).map(({ name, dose, frequency }) => ({ name, dose, frequency })),
    emergencyContact: c ? { name: c.name, relation: c.relation, phone: c.phone } : null,
  };
}

export const STATE_LABEL: Record<AccessState, string> = {
  pending: "Waiting for your approval",
  approved: "Approved — code not used yet",
  declined: "Declined",
  lapsed: "Expired before use",
  locked: "Locked (wrong codes)",
  active: "Active",
  expired: "Ended",
  revoked: "Revoked",
};
