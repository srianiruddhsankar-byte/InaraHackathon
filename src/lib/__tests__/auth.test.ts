import { describe, expect, it } from "vitest";
import {
  DEMO_OTP,
  homeFor,
  isAllowedDoctorDomain,
  loginDoctorOrLab,
  normalisePhone,
  requestOtp,
  verifyOtp,
} from "@/lib/auth";
import { seedUsers } from "@/lib/users";
import type { User } from "@/lib/types";

const users = seedUsers();

describe("isAllowedDoctorDomain", () => {
  it("accepts the allowlisted hospital domains, ignoring case", () => {
    expect(isAllowedDoctorDomain("dr.meera@inara-hospital.in")).toBe(true);
    expect(isAllowedDoctorDomain("DR.ARUN@CityCare.in")).toBe(true);
  });

  it("rejects unknown domains and malformed emails", () => {
    expect(isAllowedDoctorDomain("someone@gmail.com")).toBe(false);
    expect(isAllowedDoctorDomain("dr@fake-inara-hospital.in")).toBe(false);
    expect(isAllowedDoctorDomain("no-at-sign")).toBe(false);
  });
});

describe("loginDoctorOrLab", () => {
  it("logs in doctors and the lab with the right password", () => {
    const meera = loginDoctorOrLab(users, "dr.meera@inara-hospital.in", "demo123");
    expect(meera).toMatchObject({ ok: true, user: { id: "u-meera", role: "doctor" } });
    expect(loginDoctorOrLab(users, " Dr.Arun@citycare.in ", "demo123")).toMatchObject({ ok: true, user: { id: "u-arun" } });
    expect(loginDoctorOrLab(users, "lab@inara-diagnostics.in", "demo123")).toMatchObject({ ok: true, user: { role: "lab" } });
  });

  it("rejects a wrong password", () => {
    expect(loginDoctorOrLab(users, "dr.meera@inara-hospital.in", "wrong")).toEqual({ ok: false, error: "Incorrect password." });
  });

  it("rejects an unknown hospital domain", () => {
    const result = loginDoctorOrLab(users, "dr.house@gmail.com", "demo123");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not from a verified hospital/);
  });

  it("rejects a doctor account whose email is outside the allowlist", () => {
    const rogue: User = { id: "x", role: "doctor", name: "Dr. X", email: "x@unknown.org", password: "demo123" };
    const result = loginDoctorOrLab([...users, rogue], "x@unknown.org", "demo123");
    expect(result).toEqual({ ok: false, error: "Doctor accounts must use a verified hospital email." });
  });

  it("rejects an unknown email on an allowed domain and empty input", () => {
    expect(loginDoctorOrLab(users, "nobody@citycare.in", "demo123")).toEqual({ ok: false, error: "No account found for this email." });
    expect(loginDoctorOrLab(users, "", "")).toMatchObject({ ok: false });
  });

  it("never logs in a patient through email", () => {
    expect(loginDoctorOrLab(users, "ravi@example.com", "demo123").ok).toBe(false);
  });
});

describe("normalisePhone", () => {
  it("accepts common Indian formats", () => {
    expect(normalisePhone("9000000001")).toBe("+919000000001");
    expect(normalisePhone("+91 90000 00001")).toBe("+919000000001");
    expect(normalisePhone("09000000001")).toBe("+919000000001");
  });

  it("rejects invalid numbers", () => {
    expect(normalisePhone("12345")).toBeNull();
    expect(normalisePhone("1000000001")).toBeNull();
  });
});

describe("requestOtp", () => {
  it("returns the demo OTP for a registered patient", () => {
    expect(requestOtp(users, "9000000001")).toEqual({ ok: true, phone: "+919000000001", demoOtp: DEMO_OTP });
  });

  it("rejects invalid and unregistered numbers", () => {
    expect(requestOtp(users, "abc").ok).toBe(false);
    expect(requestOtp(users, "9876543210")).toEqual({ ok: false, error: "No patient record is linked to this number." });
  });
});

describe("verifyOtp", () => {
  it("logs the patient in with the correct code", () => {
    expect(verifyOtp(users, "+91 90000 00002", "123456")).toMatchObject({
      ok: true,
      user: { id: "u-priya", patientId: "priya" },
    });
  });

  it("rejects a wrong OTP", () => {
    expect(verifyOtp(users, "9000000001", "000000")).toEqual({ ok: false, error: "Incorrect OTP. Please try again." });
  });

  it("rejects an unregistered number even with the right code", () => {
    expect(verifyOtp(users, "9876543210", DEMO_OTP).ok).toBe(false);
  });
});

describe("homeFor", () => {
  it("sends each role to its own area", () => {
    expect(homeFor("doctor")).toBe("/doctor");
    expect(homeFor("patient")).toBe("/patient");
    expect(homeFor("lab")).toBe("/lab");
  });
});
