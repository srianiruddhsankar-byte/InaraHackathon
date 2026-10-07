// Real staff sign-in with Supabase Auth: password, profile (role + status) and TOTP 2FA.
// Thin wrappers around supabase-js; the decisions (routing, status gating, fallback) are pure
// functions in src/lib/auth.ts and src/lib/access.ts. The client is passed in (see sync/client.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyAuthError, type AuthErrorKind, type RegistrationInput } from "./auth";
import type { Profile } from "./access";
import type { AccountStatus } from "./types";

const PROFILE_COLUMNS = "id,role,name,email,hospital,specialty,council_reg_no,app_user_id,status,created_at";

export type Aal = "aal1" | "aal2";
type Failure = { ok: false; kind: AuthErrorKind | "no_profile"; error: string };

function failure(error: unknown): Failure {
  const kind = classifyAuthError(error);
  const message = (error as { message?: string } | null)?.message;
  return {
    ok: false,
    kind,
    error: {
      network: "Can't reach the sign-in server.",
      credentials: "Incorrect email or password.",
      unconfirmed: "Please confirm your email address first (check your inbox).",
      other: message || "Sign-in failed. Please try again.",
    }[kind],
  };
}

export async function fetchOwnProfile(client: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data, error } = await client.from("profiles").select(PROFILE_COLUMNS).eq("id", userId).maybeSingle();
  if (error) throw error;
  return (data as Profile | null) ?? null;
}

export async function currentAal(client: SupabaseClient): Promise<Aal> {
  const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  return data.currentLevel === "aal2" ? "aal2" : "aal1";
}

export type SignInResult = { ok: true; profile: Profile; aal: Aal } | Failure;

export async function signInStaff(client: SupabaseClient, email: string, password: string): Promise<SignInResult> {
  try {
    const { data, error } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) return failure(error);
    const profile = await fetchOwnProfile(client, data.user.id);
    if (!profile) {
      await signOutStaff(client);
      return { ok: false, kind: "no_profile", error: "This login has no staff account. Register as a doctor or lab first." };
    }
    return { ok: true, profile, aal: await currentAal(client) };
  } catch (e) {
    return failure(e);
  }
}

/** Best effort: end the real session on this device only. */
export async function signOutStaff(client: SupabaseClient | null): Promise<void> {
  if (!client) return;
  try {
    await client.auth.signOut({ scope: "local" });
  } catch {
    // Offline: the local session is cleared anyway.
  }
}

export type RefreshResult = { kind: "ok"; profile: Profile; aal: Aal } | { kind: "signed_out" } | { kind: "network" };

/** Re-read the profile and 2FA level for the saved session (status changes apply without logging out). */
export async function refreshStaffSession(client: SupabaseClient): Promise<RefreshResult> {
  const { data } = await client.auth.getSession(); // local; refreshes the token if needed
  if (!data.session) return { kind: "signed_out" };
  try {
    const profile = await fetchOwnProfile(client, data.session.user.id);
    if (!profile) return { kind: "signed_out" };
    return { kind: "ok", profile, aal: await currentAal(client) };
  } catch (e) {
    return classifyAuthError(e) === "network" ? { kind: "network" } : { kind: "signed_out" };
  }
}

export type RegisterResult = { ok: true; needsConfirmation: boolean } | Failure;

export async function registerStaff(
  client: SupabaseClient,
  value: RegistrationInput & { hospital?: string },
): Promise<RegisterResult> {
  try {
    const { data, error } = await client.auth.signUp({
      email: value.email,
      password: value.password,
      options: {
        data: {
          role: value.role,
          name: value.name,
          specialty: value.specialty ?? null,
          council_reg_no: value.councilRegNo ?? null,
          hospital: value.hospital ?? null,
        },
      },
    });
    if (error) {
      if (/already registered|already exists/i.test(error.message)) {
        return { ok: false, kind: "other", error: "An account with this email already exists. Log in instead." };
      }
      if (/database error/i.test(error.message)) {
        return { ok: false, kind: "other", error: "The server rejected these details. Check your email domain and registration number." };
      }
      return failure(error);
    }
    // Signing up may log the new account in (when email confirmation is off). Log out so they
    // start from the normal login, which shows their status.
    if (data.session) await signOutStaff(client);
    return { ok: true, needsConfirmation: !data.session };
  } catch (e) {
    return failure(e);
  }
}

// ---- 2FA (TOTP authenticator app) ----

export type MfaStep = { kind: "challenge"; factorId: string } | { kind: "enroll" };

export async function mfaStep(client: SupabaseClient): Promise<MfaStep> {
  const { data, error } = await client.auth.mfa.listFactors();
  if (error) throw error;
  const verified = data.totp.find((f) => f.status === "verified");
  return verified ? { kind: "challenge", factorId: verified.id } : { kind: "enroll" };
}

export interface Enrolment {
  factorId: string;
  /** SVG data URL to show as an image. */
  qrCode: string;
  secret: string;
}

export async function startEnrolment(client: SupabaseClient): Promise<Enrolment> {
  // A half-finished enrolment (QR shown, code never entered) blocks a new one: remove it.
  const { data: list, error: listError } = await client.auth.mfa.listFactors();
  if (listError) throw listError;
  for (const f of list.all) {
    if (f.factor_type === "totp" && f.status !== "verified") await client.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "BioMarQ Prodrome" });
  if (error) throw error;
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/** Check a 6-digit code. Returns an error message, or null when the session is now aal2. */
export async function verifyTotp(client: SupabaseClient, factorId: string, code: string): Promise<string | null> {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return "Enter the 6-digit code from your authenticator app.";
  try {
    const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code: clean });
    if (!error) return null;
    if (classifyAuthError(error) === "network") return "Can't reach the sign-in server. Please try again.";
    return "That code didn't match. Use the newest code, and check that your phone's time is set automatically.";
  } catch (e) {
    return classifyAuthError(e) === "network" ? "Can't reach the sign-in server. Please try again." : "Verification failed. Please try again.";
  }
}

// ---- Hospital admin (real accounts) ----

export interface AuditRow {
  id: number;
  target_id: string | null;
  target_name: string;
  target_role: string;
  actor_name: string;
  old_status: AccountStatus;
  new_status: AccountStatus;
  reason: string;
  created_at: string;
}

export async function listStaffProfiles(client: SupabaseClient): Promise<Profile[]> {
  const { data, error } = await client
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .in("role", ["doctor", "lab"])
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as Profile[]) ?? [];
}

export async function listAuditLog(client: SupabaseClient): Promise<AuditRow[]> {
  const { data, error } = await client
    .from("account_audit_log")
    .select("id,target_id,target_name,target_role,actor_name,old_status,new_status,reason,created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data as AuditRow[]) ?? [];
}

/** Calls set_account_status() (admin + 2FA checked in the database). Returns an error or null. */
export async function setStaffStatus(
  client: SupabaseClient,
  target: string,
  status: AccountStatus,
  reason: string,
): Promise<string | null> {
  try {
    const { error } = await client.rpc("set_account_status", { target, new_status: status, reason });
    return error ? error.message : null;
  } catch (e) {
    return (e as Error).message || "Could not change the status.";
  }
}
