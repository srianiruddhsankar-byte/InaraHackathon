import { describe, expect, it } from "vitest";
import { accessFor, afterLoginPath, applyStatusChange, areaFor, effectiveStatus, needsMfa, userFromProfile, type Profile } from "@/lib/access";
import { classifyAuthError, hospitalForEmail, isValidCouncilRegNo, loginDoctorOrLab, validateRegistration } from "@/lib/auth";
import { seedUsers } from "@/lib/users";
import type { Role, Session, User } from "@/lib/types";

const users = seedUsers();
const byId = (id: string) => users.find((u) => u.id === id)!;
const meera = byId("u-meera");
const pending = byId("u-test-pending");
const lab = byId("u-lab");
const admin = byId("u-admin");
const ravi = byId("u-ravi");

const demo = (u: User): Session => ({ userId: u.id, role: u.role, loggedInAt: "2026-10-07T00:00:00Z", mode: "demo" });
const real = (u: User, status: Session["status"], aal: Session["aal"]): Session => ({ ...demo(u), mode: "supabase", status, aal });

describe("role routing", () => {
  it("maps paths to areas", () => {
    expect(areaFor("/doctor/ravi")).toBe("doctor");
    expect(areaFor("/admin")).toBe("admin");
    expect(areaFor("/patient/settings")).toBe("patient");
    expect(areaFor("/login")).toBeNull();
    expect(areaFor("/doctorx")).toBeNull();
    expect(areaFor("/")).toBeNull();
  });

  it("public pages are always allowed", () => {
    expect(accessFor("/login", null, undefined)).toEqual({ kind: "allow" });
    expect(accessFor("/register", null, undefined)).toEqual({ kind: "allow" });
  });

  it("logged out → the area's login tab", () => {
    for (const area of ["doctor", "patient", "lab", "admin"] as Role[]) {
      expect(accessFor(`/${area}`, null, undefined)).toEqual({ kind: "login", redirect: `/login?tab=${area}` });
    }
  });

  it("each role only opens its own area", () => {
    const cases: [User, Role][] = [
      [meera, "doctor"],
      [ravi, "patient"],
      [lab, "lab"],
      [admin, "admin"],
    ];
    for (const [user, own] of cases) {
      for (const area of ["doctor", "patient", "lab", "admin"] as Role[]) {
        const access = accessFor(`/${area}`, demo(user), user);
        if (area === own) expect(access, `${user.id} → ${area}`).toEqual({ kind: "allow" });
        else expect(access, `${user.id} → ${area}`).toEqual({ kind: "login", redirect: `/login?tab=${area}` });
      }
    }
  });

  it("a session whose role disagrees with the user is not trusted", () => {
    expect(accessFor("/doctor", { ...demo(ravi), role: "doctor" }, ravi).kind).toBe("login");
  });
});

describe("account status gating", () => {
  it("demo login: a pending doctor is blocked with a clear message", () => {
    const access = accessFor("/doctor/ravi", demo(pending), pending);
    expect(access).toMatchObject({ kind: "blocked", status: "pending", title: "Account pending verification" });
    if (access.kind === "blocked") expect(access.message).toMatch(/can't see patient data/);
  });

  it("a suspended doctor or lab is blocked", () => {
    const suspended = { ...meera, status: "suspended" as const };
    expect(accessFor("/doctor", demo(suspended), suspended)).toMatchObject({ kind: "blocked", status: "suspended", title: "Account suspended" });
    const suspendedLab = { ...lab, status: "suspended" as const };
    const access = accessFor("/lab", demo(suspendedLab), suspendedLab);
    expect(access).toMatchObject({ kind: "blocked", status: "suspended" });
    if (access.kind === "blocked") expect(access.message).toMatch(/lab orders and patient results/);
  });

  it("real login: the profile status wins over the local user", () => {
    // Locally verified, but the admin suspended the real account.
    expect(effectiveStatus(real(meera, "suspended", "aal2"), meera)).toBe("suspended");
    expect(accessFor("/doctor", real(meera, "suspended", "aal2"), meera).kind).toBe("blocked");
    // Missing status on a real session = not trusted yet.
    expect(effectiveStatus(real(meera, undefined, "aal2"), meera)).toBe("pending");
    // Demo login reads the local user; a missing status means verified (older saved data).
    expect(effectiveStatus(demo(meera), { ...meera, status: undefined })).toBe("verified");
  });

  it("patients are never gated by staff status", () => {
    expect(effectiveStatus(demo(ravi), ravi)).toBe("verified");
    expect(accessFor("/patient", demo(ravi), ravi)).toEqual({ kind: "allow" });
  });
});

describe("2FA", () => {
  it("real verified doctor or admin without aal2 → authenticator step", () => {
    expect(accessFor("/doctor", real(meera, "verified", "aal1"), meera)).toEqual({ kind: "mfa", redirect: "/login/mfa" });
    expect(accessFor("/admin", real(admin, "verified", "aal1"), admin)).toEqual({ kind: "mfa", redirect: "/login/mfa" });
    expect(accessFor("/doctor", real(meera, "verified", "aal2"), meera)).toEqual({ kind: "allow" });
  });

  it("labs don't need 2FA; demo logins skip it", () => {
    expect(needsMfa(real(lab, "verified", "aal1"), lab)).toBe(false);
    expect(accessFor("/lab", real(lab, "verified", "aal1"), lab)).toEqual({ kind: "allow" });
    expect(needsMfa(demo(meera), meera)).toBe(false);
  });

  it("a pending doctor sees the status first (no data behind it either way)", () => {
    expect(accessFor("/doctor", real(pending, "pending", "aal1"), pending).kind).toBe("blocked");
    expect(afterLoginPath(real(pending, "pending", "aal1"), pending)).toBe("/doctor");
  });

  it("after the password: verified doctor → /login/mfa, else the home page", () => {
    expect(afterLoginPath(real(meera, "verified", "aal1"), meera)).toBe("/login/mfa");
    expect(afterLoginPath(real(meera, "verified", "aal2"), meera)).toBe("/doctor");
    expect(afterLoginPath(real(lab, "verified", "aal1"), lab)).toBe("/lab");
    expect(afterLoginPath(demo(admin), admin)).toBe("/admin");
  });
});

describe("userFromProfile", () => {
  const profile: Profile = {
    id: "0b6f…",
    role: "doctor",
    name: "Dr. Meera Nair",
    email: "dr.meera@inara-hospital.in",
    hospital: "Meridian Hospital",
    specialty: "Endocrinology",
    council_reg_no: "TNMC 104522",
    app_user_id: "u-meera",
    status: "suspended",
  };

  it("links a seeded account to its demo user (keeps her patients) with the real status", () => {
    const user = userFromProfile(profile, users);
    expect(user).toMatchObject({ id: "u-meera", patientIds: ["ravi", "priya", "arjun", "karthik"], status: "suspended" });
  });

  it("a newly registered doctor gets a new user with no patients", () => {
    const user = userFromProfile({ ...profile, app_user_id: null, name: "Dr. New", status: "pending" }, users);
    expect(user).toEqual({
      id: "sb-0b6f…",
      role: "doctor",
      name: "Dr. New",
      email: "dr.meera@inara-hospital.in",
      hospital: "Meridian Hospital",
      specialty: "Endocrinology",
      councilRegNo: "TNMC 104522",
      patientIds: [],
      status: "pending",
    });
  });

  it("never links to a demo user of another role", () => {
    expect(userFromProfile({ ...profile, role: "lab", app_user_id: "u-meera" }, users).id).toBe("sb-0b6f…");
  });
});

describe("applyStatusChange", () => {
  const base = { reason: "Checked with TNMC", actorName: "Admin", id: "a1", timestamp: "2026-10-07T10:00:00Z" };

  it("verifies a pending doctor and records old → new", () => {
    const result = applyStatusChange(users, { ...base, targetId: "u-test-pending", status: "verified" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.users.find((u) => u.id === "u-test-pending")?.status).toBe("verified");
    expect(result.entry).toMatchObject({ targetName: "Dr. Test Pending", oldStatus: "pending", newStatus: "verified", reason: "Checked with TNMC" });
    expect(users.find((u) => u.id === "u-test-pending")?.status).toBe("pending"); // input untouched
  });

  it("needs a reason, a real change and a doctor or lab", () => {
    expect(applyStatusChange(users, { ...base, targetId: "u-arun", status: "suspended", reason: " " })).toMatchObject({ ok: false });
    expect(applyStatusChange(users, { ...base, targetId: "u-arun", status: "verified" })).toMatchObject({ ok: false });
    expect(applyStatusChange(users, { ...base, targetId: "u-admin", status: "suspended" })).toMatchObject({ ok: false });
    expect(applyStatusChange(users, { ...base, targetId: "nobody", status: "suspended" })).toMatchObject({ ok: false });
  });
});

describe("demo accounts", () => {
  it("Dr. Test Pending and the admin can use the offline login", () => {
    expect(loginDoctorOrLab(users, "dr.test@inara-hospital.in", "demo123")).toMatchObject({ ok: true, user: { status: "pending" } });
    expect(loginDoctorOrLab(users, "admin@inara-hospital.in", "demo123")).toMatchObject({ ok: true, user: { role: "admin" } });
  });

  it("Meera, Arun and the lab are verified", () => {
    expect([meera, byId("u-arun"), lab].map((u) => u.status)).toEqual(["verified", "verified", "verified"]);
  });
});

describe("registration", () => {
  const doctor = {
    role: "doctor" as const,
    name: "Dr. Anita Menon",
    email: "Anita@CityCare.in",
    password: "longenough",
    specialty: "Cardiology",
    councilRegNo: "kmc 12345",
  };

  it("accepts a valid doctor and fills in the hospital", () => {
    expect(validateRegistration(doctor)).toEqual({
      ok: true,
      value: { ...doctor, email: "anita@citycare.in", councilRegNo: "KMC 12345", hospital: "CityCare Hospital" },
    });
  });

  it("doctors need an allowlisted hospital email, specialty and registration number", () => {
    const result = validateRegistration({ ...doctor, email: "anita@gmail.com", specialty: " ", councilRegNo: "AB" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(["councilRegNo", "email", "specialty"]);
  });

  it("labs only need a name, an email and a password", () => {
    expect(validateRegistration({ role: "lab", name: "City Diagnostics", email: "info@citydx.in", password: "longenough" }).ok).toBe(true);
    const short = validateRegistration({ role: "lab", name: "X", email: "bad", password: "short" });
    expect(short.ok).toBe(false);
    if (!short.ok) expect(Object.keys(short.errors).sort()).toEqual(["email", "name", "password"]);
  });

  it("registration numbers: letters, digits, space / -, at least 3 digits", () => {
    expect(isValidCouncilRegNo("TNMC 104522")).toBe(true);
    expect(isValidCouncilRegNo("MCI/2015/12345")).toBe(true);
    expect(isValidCouncilRegNo("TNMC")).toBe(false);
    expect(isValidCouncilRegNo("12;drop table")).toBe(false);
  });

  it("maps hospital domains", () => {
    expect(hospitalForEmail("x@inara-hospital.in")).toBe("Meridian Hospital");
    expect(hospitalForEmail("x@gmail.com")).toBeUndefined();
  });
});

describe("offline fallback decision", () => {
  it("network problems → offer the offline demo login", () => {
    expect(classifyAuthError({ name: "AuthRetryableFetchError", message: "Failed to fetch", status: 0 })).toBe("network");
    expect(classifyAuthError(new TypeError("Failed to fetch"))).toBe("network");
    expect(classifyAuthError({ name: "TimeoutError", message: "The operation was aborted due to timeout" })).toBe("network");
    expect(classifyAuthError({ message: "Service unavailable", status: 503 })).toBe("network");
  });

  it("a wrong password never falls back", () => {
    expect(classifyAuthError({ name: "AuthApiError", message: "Invalid login credentials", status: 400, code: "invalid_credentials" })).toBe("credentials");
    expect(classifyAuthError({ message: "Email not confirmed", status: 400, code: "email_not_confirmed" })).toBe("unconfirmed");
    expect(classifyAuthError({ message: "Something else", status: 422 })).toBe("other");
  });
});
