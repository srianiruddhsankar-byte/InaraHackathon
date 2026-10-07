// Consent-based access for every doctor (QR / patient ID + the patient's one-time code).
import { beforeEach, describe, expect, it } from "vitest";
import {
  accessState,
  activeGrant,
  approveRequest,
  BREAK_GLASS_MIN,
  breakGlassAccess,
  breakGlassNotices,
  canAccessRecord,
  consentBadge,
  createAccessRequest,
  currentShareToken,
  fullGrant,
  grantedPatientIds,
  ONGOING_CARE_DAYS,
  ongoingCareGrant,
  OTP_VALID_MIN,
  resolveTarget,
  resultsAwaitingConsent,
  revokeRequest,
  splitAlerts,
  verifyOtp,
} from "@/lib/recordAccess";
import { seedCases, seedPatients } from "@/lib/seed";
import { seedUsers } from "@/lib/users";
import { seedPatientSettings } from "@/lib/wearable/consent";
import { openAlerts } from "@/lib/wearable/checkin";
import type { AccessRequest } from "@/lib/types";
import { SEEDED_CARE_GRANTS, useInaraStore } from "@/store/useInaraStore";
import { karthikAlert, sampleReview } from "./helpers";

const users = seedUsers();
const arun = users.find((u) => u.id === "u-arun")!;
const meera = users.find((u) => u.id === "u-meera")!;
const T0 = "2026-10-07T10:00:00.000Z";
const at = (minutes: number) => new Date(Date.parse(T0) + minutes * 60_000).toISOString();
const msAt = (minutes: number) => Date.parse(at(minutes));
const DAY = 24 * 60;

function requested(doctor = arun, patientId = "ravi"): AccessRequest {
  const r = createAccessRequest({ id: `acc-${doctor.id}`, otp: "482913", at: T0, doctor, status: "verified", patientId, via: "qr" });
  if (!r.ok) throw new Error(r.error);
  return r.request;
}

describe("consent grants (pure)", () => {
  it("the patient chooses the duration when allowing: this visit (30 / 60 min) or ongoing care (30 days)", () => {
    const r = requested();
    expect(r.durationMin).toBe(0);
    expect(approveRequest(r, { at: at(1), scope: "full", consent: "visit", visitMin: 60 })?.durationMin).toBe(60);
    expect(approveRequest(r, { at: at(1), scope: "full", consent: "visit", visitMin: 45 })).toBeNull();
    const ongoing = approveRequest(r, { at: at(1), scope: "full", consent: "ongoing" })!;
    expect(ongoing).toMatchObject({ consent: "ongoing", durationMin: ONGOING_CARE_DAYS * DAY });
    const g = verifyOtp(ongoing, "482913", { at: at(2), doctorId: arun.id, status: "verified" });
    expect(g.ok && g.request.expiresAt).toBe(at(2 + ONGOING_CARE_DAYS * DAY));
  });

  it("a grant opens the record until it expires — visit and ongoing care", () => {
    const visit = verifyOtp(approveRequest(requested(), { at: at(1), scope: "full", consent: "visit", visitMin: 30 })!, "482913", {
      at: at(2),
      doctorId: arun.id,
      status: "verified",
    }).request;
    expect(canAccessRecord([visit], arun.id, "ravi", msAt(31))).toBe(true);
    expect(canAccessRecord([visit], arun.id, "ravi", msAt(32))).toBe(false);

    const ongoing = ongoingCareGrant({ id: "g", doctor: meera, patientId: "priya", at: T0 });
    expect(canAccessRecord([ongoing], meera.id, "priya", msAt(29 * DAY))).toBe(true);
    expect(canAccessRecord([ongoing], meera.id, "priya", msAt(30 * DAY))).toBe(false);
    expect(grantedPatientIds([ongoing], meera.id, msAt(1))).toEqual(["priya"]);
    expect(grantedPatientIds([ongoing], meera.id, msAt(30 * DAY))).toEqual([]);
    // Another doctor, or the same doctor for another patient: nothing.
    expect(canAccessRecord([ongoing], arun.id, "priya", msAt(1))).toBe(false);
    expect(canAccessRecord([ongoing], meera.id, "ravi", msAt(1))).toBe(false);
  });

  it("revoking closes access at once", () => {
    const g = ongoingCareGrant({ id: "g", doctor: meera, patientId: "ravi", at: T0 });
    const revoked = revokeRequest(g, at(5))!;
    expect(canAccessRecord([revoked], meera.id, "ravi", msAt(5))).toBe(false);
    expect(accessState(revoked, msAt(5))).toBe("revoked");
  });

  it("an emergency-only grant never opens the full record", () => {
    const r = verifyOtp(approveRequest(requested(), { at: at(1), scope: "emergency", consent: "visit" })!, "482913", {
      at: at(2),
      doctorId: arun.id,
      status: "verified",
    }).request;
    expect(activeGrant([r], arun.id, "ravi", msAt(3))).toBeDefined();
    expect(fullGrant([r], arun.id, "ravi", msAt(3))).toBeUndefined();
    expect(canAccessRecord([r], arun.id, "ravi", msAt(3))).toBe(false);
  });

  it("a wrong or expired one-time code never grants access", () => {
    const approved = approveRequest(requested(), { at: at(1), scope: "full", consent: "ongoing" })!;
    const wrong = verifyOtp(approved, "000000", { at: at(2), doctorId: arun.id, status: "verified" });
    expect(wrong.ok).toBe(false);
    expect(canAccessRecord([wrong.request], arun.id, "ravi", msAt(2))).toBe(false);
    const late = verifyOtp(approved, "482913", { at: at(1 + OTP_VALID_MIN + 1), doctorId: arun.id, status: "verified" });
    expect(late).toMatchObject({ ok: false, error: expect.stringContaining("expired") });
    expect(canAccessRecord([late.request], arun.id, "ravi", msAt(1 + OTP_VALID_MIN + 1))).toBe(false);
  });

  it("the share code alone never grants access", () => {
    const tokens = useInaraStore.getState().shareTokens;
    const token = currentShareToken(tokens, "karthik")!;
    const found = resolveTarget(token.token, "qr", { tokens, patients: seedPatients() });
    expect(found).toMatchObject({ ok: true, patientId: "karthik" });
    const r = requested(arun, "karthik");
    // Request only, approval without the code, or the share token typed as the code: no access.
    expect(canAccessRecord([r], arun.id, "karthik", msAt(1))).toBe(false);
    const approved = approveRequest(r, { at: at(1), scope: "full", consent: "visit" })!;
    expect(canAccessRecord([approved], arun.id, "karthik", msAt(2))).toBe(false);
    expect(verifyOtp(approved, token.token, { at: at(2), doctorId: arun.id, status: "verified" }).ok).toBe(false);
    // A grant with no code (seed / break-glass shape) can't be re-entered with an empty code.
    expect(verifyOtp({ ...approved, otp: "" }, "", { at: at(2), doctorId: arun.id, status: "verified" }).ok).toBe(false);
  });

  it("consent badge", () => {
    const fmt = { time: (iso: string) => iso.slice(11, 16), date: (iso: string) => iso.slice(0, 10) };
    expect(consentBadge(ongoingCareGrant({ id: "g", doctor: meera, patientId: "ravi", at: T0 }), fmt)).toBe("Consent: Ongoing care · until 2026-11-06");
    const visit = verifyOtp(approveRequest(requested(), { at: at(1), scope: "full", consent: "visit" })!, "482913", {
      at: at(2),
      doctorId: arun.id,
      status: "verified",
    }).request;
    expect(consentBadge(visit, fmt)).toBe("Consent: This visit · until 10:32");
  });
});

describe("break-glass emergency view (pure)", () => {
  const base = { id: "bg", at: T0, patientId: "karthik", status: "verified" as const };

  it("needs a verified doctor and a typed reason", () => {
    expect(breakGlassAccess({ ...base, doctor: arun, reason: "urgent" })).toMatchObject({ ok: false, error: expect.stringContaining("reason") });
    expect(breakGlassAccess({ ...base, doctor: users.find((u) => u.id === "u-test-pending"), status: "pending", reason: "Unconscious in the ER" }).ok).toBe(false);
    expect(breakGlassAccess({ ...base, doctor: users.find((u) => u.role === "lab"), reason: "Unconscious in the ER" }).ok).toBe(false);
  });

  it("opens the emergency view only, for a limited time, logged with the reason; the patient is told", () => {
    const res = breakGlassAccess({ ...base, doctor: arun, reason: "  Unconscious   in the ER " });
    if (!res.ok) throw new Error(res.error);
    expect(res.request).toMatchObject({ via: "break_glass", scope: "emergency", reason: "Unconscious in the ER", durationMin: BREAK_GLASS_MIN });
    expect(res.log).toMatchObject({ viewer: "Dr. Arun Rao", requestId: "bg", action: expect.stringContaining("Unconscious in the ER") });
    expect(activeGrant([res.request], arun.id, "karthik", msAt(1))).toBeDefined();
    expect(canAccessRecord([res.request], arun.id, "karthik", msAt(1))).toBe(false);
    expect(activeGrant([res.request], arun.id, "karthik", msAt(BREAK_GLASS_MIN))).toBeUndefined();
    expect(breakGlassNotices([res.request], "karthik")).toHaveLength(1);
    expect(breakGlassNotices([{ ...res.request, acknowledgedAt: at(2) }], "karthik")).toHaveLength(0);
  });
});

describe("dashboard without consent (pure)", () => {
  it("an alert without a grant shows only level, red flags and contact", () => {
    const alerts = openAlerts(karthikAlert().log, ["karthik"]);
    const { full, consentNeeded } = splitAlerts(alerts, [], { patients: seedPatients(), settings: seedPatientSettings(), users });
    expect(full).toHaveLength(0);
    expect(consentNeeded).toHaveLength(1);
    const a = consentNeeded[0];
    expect(Object.keys(a).sort()).toEqual(["at", "emergencyContact", "episodeId", "level", "patientId", "patientName", "patientPhone", "redFlags"]);
    expect(a).toMatchObject({ patientName: "Karthik R", level: "urgent", emergencyContact: { name: "Revathi R" } });
    expect(a.redFlags.join(" ")).toMatch(/belly/i);
    expect(JSON.stringify(a)).not.toMatch(/dengue|night HR|evidence|bpm/i);
    expect(splitAlerts(alerts, ["karthik"], { patients: seedPatients(), settings: seedPatientSettings(), users }).full).toHaveLength(1);
  });

  it("results for the doctor's own orders without a grant → ask to renew", () => {
    const cases = seedCases();
    const waiting = resultsAwaitingConsent(cases, "Dr. Meera Nair", ["ravi"]).map((c) => c.patientId).sort();
    expect(waiting).toEqual(["arjun", "priya"]);
    expect(resultsAwaitingConsent(cases, "Dr. Meera Nair", ["ravi", "priya", "arjun"])).toEqual([]);
    expect(resultsAwaitingConsent(cases, "Dr. Arun Rao", [])).toEqual([]);
  });
});

describe("store: consent for every doctor", () => {
  beforeEach(() => useInaraStore.getState().resetDemo());
  const loginAs = (id: string) => {
    const s = useInaraStore.getState();
    s.login(s.users.find((u) => u.id === id)!);
  };
  const state = () => useInaraStore.getState();

  it("seed: Dr. Meera has ongoing care for Ravi, Priya and Arjun — not Karthik; Dr. Arun has none", () => {
    const now = Date.now();
    expect(grantedPatientIds(state().accessRequests, "u-meera", now).sort()).toEqual([...SEEDED_CARE_GRANTS].sort());
    expect(canAccessRecord(state().accessRequests, "u-meera", "karthik", now)).toBe(false);
    expect(grantedPatientIds(state().accessRequests, "u-arun", now)).toEqual([]);
    for (const r of state().accessRequests) expect(r).toMatchObject({ consent: "ongoing", scope: "full" });
    expect(state().accessLog.filter((e) => e.action.startsWith("Ongoing care consent"))).toHaveLength(3);
  });

  it("no grant → no access anywhere: dashboard, record, lab report, AI analysis, approval, plan, orders", () => {
    loginAs("u-arun");
    const now = Date.now();
    expect(grantedPatientIds(state().accessRequests, "u-arun", now)).toEqual([]);
    for (const pid of ["ravi", "priya", "arjun", "karthik"]) expect(canAccessRecord(state().accessRequests, "u-arun", pid, now)).toBe(false);

    const priyaDraft = state().getLatestReport("priya")!;
    const before = JSON.stringify(state().reports);
    const casesBefore = JSON.stringify(state().cases);
    state().setFindingEdit(priyaDraft.id, "x", { included: false });
    state().markAnalysisRun(priyaDraft.id);
    state().markUnderReview(priyaDraft.id);
    state().saveDoctorEdit(priyaDraft.id, { text: "edited" }, "Dr. Arun Rao");
    state().approveReport(priyaDraft.id, "Dr. Arun Rao");
    expect(state().orderLabTest({ patientId: "priya", panels: ["cbc"], urgency: "routine", clinicalNote: "", symptoms: "", suspectedDisease: "" })).toBe("");
    expect(JSON.stringify(state().reports)).toBe(before);
    expect(JSON.stringify(state().cases)).toBe(casesBefore);
    expect(state().findingReviews[priyaDraft.id]).toBeUndefined();
    expect(state().analysisRuns[priyaDraft.id]).toBeUndefined();

    // An approved report: no plan without consent.
    const approved = state().getApprovedReports("ravi").at(-1)!;
    state().approvePlan(approved.id, { medications: [], lifestyle: [], followUpTests: [], nextReviewDate: "", doctorNotes: "" });
    expect(state().treatmentPlans).toHaveLength(0);
  });

  it("revoking Dr. Meera's grant closes Priya's record; with consent she can act", () => {
    loginAs("u-meera");
    const draft = state().getLatestReport("priya")!;
    state().markAnalysisRun(draft.id);
    expect(state().analysisRuns[draft.id]).toBeDefined();

    loginAs("u-priya");
    state().revokeAccess("acc-seed-priya");
    expect(state().accessLog.at(-1)).toMatchObject({ action: "Revoked by patient", requestId: "acc-seed-priya" });

    loginAs("u-meera");
    expect(canAccessRecord(state().accessRequests, "u-meera", "priya", Date.now())).toBe(false);
    state().approveReport(draft.id, "Dr. Meera Nair");
    expect(state().getApprovedReports("priya")).toHaveLength(3);
  });

  it("Ravi's results arrive after he revoked consent → 'ask the patient to renew'; renewal via OTP reopens", () => {
    loginAs("u-ravi");
    state().revokeAccess("acc-seed-ravi");
    loginAs("u-lab");
    const order = state().cases.find((c) => c.patientId === "ravi" && c.stage === "ordered")!;
    const review = sampleReview();
    expect(state().submitLabResults(order.id, { rows: review.rows, date: review.reportDate, source: "csv", verifiedBy: "A. Technician" })).toBeTruthy();

    loginAs("u-meera");
    const granted = grantedPatientIds(state().accessRequests, "u-meera", Date.now());
    expect(resultsAwaitingConsent(state().cases, "Dr. Meera Nair", granted).map((c) => c.patientId)).toContain("ravi");

    const res = state().requestRecordAccess("ravi", "renewal");
    if (!("id" in res)) throw new Error(res.error);
    loginAs("u-ravi");
    state().answerAccessRequest(res.id, true, { scope: "full", consent: "ongoing" });
    const otp = state().accessRequests.find((r) => r.id === res.id)!.otp;
    loginAs("u-meera");
    expect(state().enterAccessOtp(res.id, otp)).toBeNull();
    expect(canAccessRecord(state().accessRequests, "u-meera", "ravi", Date.now())).toBe(true);
    expect(resultsAwaitingConsent(state().cases, "Dr. Meera Nair", grantedPatientIds(state().accessRequests, "u-meera", Date.now()))).not.toContainEqual(
      expect.objectContaining({ patientId: "ravi" }),
    );
  });

  it("Karthik's alert: Dr. Meera requests access, Karthik allows ongoing care, the code opens his record", () => {
    useInaraStore.setState({ wearableEvents: karthikAlert().log.map((e, i) => ({ ...e, id: `w${i}` })) });
    loginAs("u-meera");
    const episodeId = karthikAlert().snapshot.episodeId;
    state().doctorAlertAction(episodeId, "acknowledged");
    expect(state().wearableEvents.some((e) => e.type === "doctor_action")).toBe(false); // no consent yet

    const res = state().requestRecordAccess("karthik", "alert");
    if (!("id" in res)) throw new Error(res.error);
    loginAs("u-karthik");
    state().answerAccessRequest(res.id, true, { scope: "full", consent: "ongoing" });
    const r = state().accessRequests.find((x) => x.id === res.id)!;
    loginAs("u-meera");
    expect(state().enterAccessOtp(res.id, r.otp)).toBeNull();
    expect(canAccessRecord(state().accessRequests, "u-meera", "karthik", Date.now())).toBe(true);
    expect(state().accessRequests.find((x) => x.id === res.id)).toMatchObject({ via: "alert", consent: "ongoing" });
    state().doctorAlertAction(episodeId, "acknowledged");
    expect(state().wearableEvents.some((e) => e.type === "doctor_action")).toBe(true);
  });

  it("break-glass: logged with the reason, emergency view only, the patient sees a notice", () => {
    loginAs("u-arun");
    expect(state().breakGlass("karthik", "help")).toMatch(/reason/);
    expect(state().breakGlass("karthik", "Collapsed at CityCare ER, unresponsive")).toBeNull();
    const bg = state().accessRequests.find((r) => r.via === "break_glass")!;
    expect(bg).toMatchObject({ doctorId: "u-arun", patientId: "karthik", scope: "emergency" });
    expect(state().accessLog.at(-1)?.action).toMatch(/Break-glass.*Collapsed at CityCare ER/);
    expect(canAccessRecord(state().accessRequests, "u-arun", "karthik", Date.now())).toBe(false);
    expect(breakGlassNotices(state().accessRequests, "karthik")).toHaveLength(1);

    loginAs("u-karthik");
    state().acknowledgeBreakGlass(bg.id);
    expect(breakGlassNotices(state().accessRequests, "karthik")).toHaveLength(0);
    state().revokeAccess(bg.id);
    expect(activeGrant(state().accessRequests, "u-arun", "karthik", Date.now())).toBeUndefined();
  });
});
