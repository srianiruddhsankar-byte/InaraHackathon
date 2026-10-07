import { beforeEach, describe, expect, it } from "vitest";
import {
  accessHistory,
  accessState,
  activeGrant,
  approveRequest,
  createAccessRequest,
  currentShareToken,
  declineRequest,
  emergencyView,
  formatCountdown,
  formatToken,
  issueShareToken,
  MAX_OTP_ATTEMPTS,
  newOtp,
  newShareToken,
  normaliseCode,
  OTP_VALID_MIN,
  promptsForPatient,
  remainingMs,
  REQUEST_VALID_MIN,
  resolveTarget,
  revokeRequest,
  setEmergencyOnly,
  TOKEN_ALPHABET,
  TOKEN_LENGTH,
  verifyOtp,
} from "@/lib/recordAccess";
import { seedPatients } from "@/lib/seed";
import { seedUsers } from "@/lib/users";
import { seedPatientSettings } from "@/lib/wearable/consent";
import type { AccessRequest, ShareToken } from "@/lib/types";
import { useInaraStore } from "@/store/useInaraStore";

const patients = seedPatients();
const ravi = patients.find((p) => p.id === "ravi")!;
const users = seedUsers();
const arun = users.find((u) => u.id === "u-arun")!;
const meera = users.find((u) => u.id === "u-meera")!;
const pendingDoctor = users.find((u) => u.id === "u-test-pending")!;

const T0 = "2026-10-07T10:00:00.000Z";
const at = (minutes: number) => new Date(Date.parse(T0) + minutes * 60_000).toISOString();
const msAt = (minutes: number) => Date.parse(at(minutes));

function request(): AccessRequest {
  const r = createAccessRequest({ id: "acc-1", otp: "482913", at: T0, doctor: arun, status: "verified", patientId: "ravi", via: "qr" });
  if (!r.ok) throw new Error(r.error);
  return r.request;
}

function granted(visitMin = 30, consent: "visit" | "ongoing" = "visit"): AccessRequest {
  const approved = approveRequest(request(), { at: at(1), scope: "full", consent, visitMin })!;
  const r = verifyOtp(approved, "482913", { at: at(2), doctorId: arun.id, status: "verified" });
  if (!r.ok) throw new Error(r.error);
  return r.request;
}

describe("share token", () => {
  it("is random and never contains patient data", () => {
    const tokens = Array.from({ length: 50 }, () => newShareToken());
    expect(new Set(tokens).size).toBe(50);
    for (const t of tokens) {
      expect(t).toHaveLength(TOKEN_LENGTH);
      expect([...t].every((c) => TOKEN_ALPHABET.includes(c))).toBe(true);
      for (const p of patients) {
        for (const data of [p.id, p.name, p.publicId ?? "", p.phone.replace(/\D/g, "")]) {
          expect(t).not.toContain(normaliseCode(data));
        }
      }
    }
  });

  it("depends only on random bytes", () => {
    const zeros = (n: number) => new Uint8Array(n);
    expect(newShareToken(zeros)).toBe(TOKEN_ALPHABET[0].repeat(TOKEN_LENGTH));
    expect(newOtp(zeros)).toBe("000000");
    expect(newOtp()).toMatch(/^\d{6}$/);
  });

  it("reads typed codes and links in any form", () => {
    expect(formatToken("K7QM2XPA9RTDH4WF")).toBe("K7QM-2XPA-9RTD-H4WF");
    expect(normaliseCode(" k7qm-2xpa 9rtd-h4wf ")).toBe("K7QM2XPA9RTDH4WF");
    expect(normaliseCode("https://demo.app/share/K7QM2XPA9RTDH4WF?x=1")).toBe("K7QM2XPA9RTDH4WF");
  });

  it("regenerating invalidates the old token", () => {
    let tokens: ShareToken[] = issueShareToken([], { id: "t1", token: "AAAABBBBCCCCDDDD", patientId: "ravi", at: T0 });
    tokens = setEmergencyOnly(tokens, "ravi", true);
    tokens = issueShareToken(tokens, { id: "t2", token: "EEEEFFFFGGGGHHHH", patientId: "ravi", at: at(5) });
    expect(currentShareToken(tokens, "ravi")?.token).toBe("EEEEFFFFGGGGHHHH");
    expect(currentShareToken(tokens, "ravi")?.emergencyOnly).toBe(true);
    expect(tokens).toHaveLength(2); // the old one is kept for the record

    const old = resolveTarget("AAAA-BBBB-CCCC-DDDD", "qr", { tokens, patients });
    expect(old).toEqual({ ok: false, error: expect.stringContaining("no longer valid") });
    expect(resolveTarget("eeee-ffff-gggg-hhhh", "qr", { tokens, patients })).toEqual({ ok: true, patientId: "ravi", via: "qr" });
    expect(resolveTarget("ZZZZZZZZZZZZZZZZ", "qr", { tokens, patients }).ok).toBe(false);
  });

  it("finds a patient by their patient ID", () => {
    const data = { tokens: [], patients };
    expect(resolveTarget("BMQ-1001", "patient_id", data)).toEqual({ ok: true, patientId: "ravi", via: "patient_id" });
    expect(resolveTarget("bmq1001", "patient_id", data)).toMatchObject({ ok: true, patientId: "ravi" });
    expect(resolveTarget("1001", "patient_id", data)).toMatchObject({ ok: true, patientId: "ravi" });
    expect(resolveTarget("ravi", "patient_id", data).ok).toBe(false); // internal ids are not patient IDs
    expect(resolveTarget("BMQ-9999", "patient_id", data).ok).toBe(false);
  });
});

describe("access request", () => {
  it("only verified doctors can ask", () => {
    const base = { id: "a", otp: "123456", at: T0, patientId: "ravi", via: "qr" as const };
    expect(createAccessRequest({ ...base, doctor: pendingDoctor, status: "pending" })).toEqual({ ok: false, error: expect.stringContaining("verification") });
    expect(createAccessRequest({ ...base, doctor: arun, status: "suspended" })).toEqual({ ok: false, error: expect.stringContaining("suspended") });
    expect(createAccessRequest({ ...base, doctor: users.find((u) => u.role === "lab"), status: "verified" }).ok).toBe(false);
    expect(createAccessRequest({ ...base, doctor: arun, status: "verified", via: "break_glass" }).ok).toBe(false);
    const ok = createAccessRequest({ ...base, doctor: arun, status: "verified" });
    expect(ok.ok && ok.request).toMatchObject({ doctorName: "Dr. Arun Rao", hospital: "CityCare Hospital", specialty: "Nephrology", otpAttempts: 0 });
  });

  it("waits for the patient, then for the code", () => {
    const r = request();
    expect(accessState(r, msAt(1))).toBe("pending");
    expect(promptsForPatient([r], "ravi", msAt(1))).toHaveLength(1);
    expect(verifyOtp(r, "482913", { at: at(1), doctorId: arun.id, status: "verified" })).toMatchObject({ ok: false, error: expect.stringContaining("Waiting") });
    expect(accessState(r, msAt(REQUEST_VALID_MIN + 1))).toBe("lapsed");

    const approved = approveRequest(r, { at: at(1), scope: "emergency", consent: "visit" })!;
    expect(accessState(approved, msAt(2))).toBe("approved");
    expect(approved.scope).toBe("emergency");
    expect(approveRequest(approved, { at: at(2), scope: "full", consent: "visit" })).toBeNull();
    expect(accessState(approved, msAt(1 + OTP_VALID_MIN + 1))).toBe("lapsed");
  });

  it("the patient can decline", () => {
    const declined = declineRequest(request(), at(1))!;
    expect(accessState(declined, msAt(1))).toBe("declined");
    expect(promptsForPatient([declined], "ravi", msAt(1))).toHaveLength(0);
  });

  it("a wrong OTP is refused and counts; too many lock the request", () => {
    let r = approveRequest(request(), { at: at(1), scope: "full", consent: "visit" })!;
    const wrong = verifyOtp(r, "000000", { at: at(2), doctorId: arun.id, status: "verified" });
    expect(wrong).toMatchObject({ ok: false, error: `Wrong code — ${MAX_OTP_ATTEMPTS - 1} tries left.` });
    expect(wrong.request.grantedAt).toBeUndefined();
    for (let i = 0; i < MAX_OTP_ATTEMPTS; i++) r = verifyOtp(r, "111111", { at: at(2), doctorId: arun.id, status: "verified" }).request;
    expect(accessState(r, msAt(2))).toBe("locked");
    expect(verifyOtp(r, "482913", { at: at(2), doctorId: arun.id, status: "verified" }).ok).toBe(false);
  });

  it("another doctor or an unverified doctor cannot use the code", () => {
    const r = approveRequest(request(), { at: at(1), scope: "full", consent: "visit" })!;
    expect(verifyOtp(r, "482913", { at: at(2), doctorId: meera.id, status: "verified" }).ok).toBe(false);
    expect(verifyOtp(r, "482913", { at: at(2), doctorId: arun.id, status: "suspended" })).toMatchObject({ ok: false, error: expect.stringContaining("verified") });
  });

  it("access lasts the chosen time and then ends by itself", () => {
    const r = granted(30);
    expect(r.expiresAt).toBe(at(32));
    expect(accessState(r, msAt(31))).toBe("active");
    expect(activeGrant([r], arun.id, "ravi", msAt(31))?.id).toBe(r.id);
    expect(remainingMs(r, msAt(31))).toBe(60_000);
    expect(formatCountdown(remainingMs(r, msAt(31)))).toBe("1:00");
    expect(accessState(r, msAt(32))).toBe("expired");
    expect(activeGrant([r], arun.id, "ravi", msAt(32))).toBeUndefined();
    expect(granted(60).expiresAt).toBe(at(62));
    expect(activeGrant([r], meera.id, "ravi", msAt(5))).toBeUndefined();
  });

  it("the patient can revoke at once; the code can't be reused", () => {
    const r = granted();
    const revoked = revokeRequest(r, at(10))!;
    expect(accessState(revoked, msAt(10))).toBe("revoked");
    expect(activeGrant([revoked], arun.id, "ravi", msAt(10))).toBeUndefined();
    expect(revokeRequest(revoked, at(11))).toBeNull();
    expect(verifyOtp(r, "482913", { at: at(3), doctorId: arun.id, status: "verified" }).ok).toBe(false);
  });

  it("the access log lists views per request", () => {
    const r = granted();
    const log = [
      { patientId: "ravi", viewer: "Dr. Arun Rao", timestamp: at(3), action: "Viewed Patient's Record", requestId: r.id },
      { patientId: "ravi", viewer: "Dr. Arun Rao", timestamp: at(4), action: "Viewed Lab Report", requestId: r.id },
      { patientId: "ravi", viewer: "Dr. Arun Rao", timestamp: at(5), action: "Viewed Lab Report", requestId: r.id },
      { patientId: "ravi", viewer: "Dr. Arun Rao", timestamp: at(2), action: "Access granted for 30 min", requestId: r.id },
    ];
    const [row] = accessHistory([r], log, "ravi", msAt(6));
    expect(row.state).toBe("active");
    expect(row.viewed).toEqual(["Patient's Record", "Lab Report"]);
  });
});

describe("emergency view", () => {
  it("holds only blood group, allergies, current medicines and the emergency contact", () => {
    const settings = seedPatientSettings().find((s) => s.patientId === "ravi");
    const v = emergencyView(ravi, settings);
    expect(Object.keys(v).sort()).toEqual(["age", "allergies", "bloodGroup", "emergencyContact", "medicines", "name", "sex"]);
    expect(v.bloodGroup).toBe("B+");
    expect(v.medicines.map((m) => m.name)).toContain("Amlodipine");
    expect(v.emergencyContact?.name).toBeTruthy();
    expect(JSON.stringify(v)).not.toMatch(/hba1c|creatinine|visit/i);
  });
});

describe("store: QR / patient ID access (both login modes)", () => {
  beforeEach(() => useInaraStore.getState().resetDemo());

  const loginAs = (id: string, auth?: Parameters<ReturnType<typeof useInaraStore.getState>["login"]>[1]) => {
    const s = useInaraStore.getState();
    s.login(s.users.find((u) => u.id === id)!, auth);
  };

  for (const mode of ["demo", "supabase"] as const) {
    it(`Dr. Arun gets time-limited access to Ravi (${mode} login)`, () => {
      const s = useInaraStore.getState();
      const token = currentShareToken(s.shareTokens, "ravi")!;
      expect(resolveTarget(token.token, "qr", { tokens: s.shareTokens, patients: s.patients })).toMatchObject({ ok: true, patientId: "ravi" });

      loginAs("u-arun", mode === "supabase" ? { mode, status: "verified", aal: "aal2" } : undefined);
      const res = useInaraStore.getState().requestRecordAccess("ravi", "qr");
      if (!("id" in res)) throw new Error(res.error);

      loginAs("u-ravi");
      useInaraStore.getState().answerAccessRequest(res.id, true, { scope: "full", consent: "visit" });
      const otp = useInaraStore.getState().accessRequests.find((r) => r.id === res.id)!.otp;

      loginAs("u-arun", mode === "supabase" ? { mode, status: "verified", aal: "aal2" } : undefined);
      expect(useInaraStore.getState().enterAccessOtp(res.id, otp === "000000" ? "111111" : "000000")).toMatch(/Wrong code/);
      expect(useInaraStore.getState().enterAccessOtp(res.id, otp)).toBeNull();
      useInaraStore.getState().logRecordView(res.id, "Lab Report");
      useInaraStore.getState().logRecordView(res.id, "Lab Report");

      const after = useInaraStore.getState();
      expect(activeGrant(after.accessRequests, "u-arun", "ravi", Date.now())).toBeDefined();
      expect(after.accessLog.filter((e) => e.action === "Viewed Lab Report")).toHaveLength(1);

      after.revokeAccess(res.id);
      expect(activeGrant(useInaraStore.getState().accessRequests, "u-arun", "ravi", Date.now())).toBeUndefined();
    });
  }

  it("a pending doctor (demo) or a suspended profile (Supabase) can't request", () => {
    loginAs("u-test-pending");
    expect(useInaraStore.getState().requestRecordAccess("ravi", "patient_id")).toEqual({ error: expect.stringContaining("verification") });
    loginAs("u-arun", { mode: "supabase", status: "suspended", aal: "aal2" });
    expect(useInaraStore.getState().requestRecordAccess("ravi", "patient_id")).toEqual({ error: expect.stringContaining("suspended") });
    expect(useInaraStore.getState().accessRequests.filter((r) => r.doctorId !== "u-meera")).toHaveLength(0);
  });

  it("making a new QR code stops the old one", () => {
    const old = currentShareToken(useInaraStore.getState().shareTokens, "ravi")!.token;
    useInaraStore.getState().regenerateShareToken("ravi");
    const s = useInaraStore.getState();
    expect(resolveTarget(old, "qr", { tokens: s.shareTokens, patients: s.patients }).ok).toBe(false);
    expect(currentShareToken(s.shareTokens, "ravi")!.token).not.toBe(old);
  });
});
