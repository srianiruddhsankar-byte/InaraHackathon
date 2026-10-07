"use client";

// Glue between the login UI, the store and Supabase Auth. Decides real vs offline demo login.
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterLoginPath, userFromProfile } from "@/lib/access";
import { homeFor, loginDoctorOrLab, roleLabel } from "@/lib/auth";
import { getSupabase } from "@/lib/sync/client";
import { refreshStaffSession, signInStaff, signOutStaff } from "@/lib/supabaseAuth";
import type { Role, User } from "@/lib/types";
import { useInaraStore } from "@/store/useInaraStore";
import { useSyncStore } from "@/store/useSyncStore";

export type StaffRole = Exclude<Role, "patient">;

/** The client for real sign-in, or null → offline demo login (no keys, or Offline mode on). */
export function realAuthClient(): SupabaseClient | null {
  const client = getSupabase();
  return client && !useSyncStore.getState().offlineMode ? client : null;
}

export type StaffLoginResult =
  | { ok: true; user: User; path: string; fellBack: boolean }
  /** offerOffline: Supabase could not be reached — the form may offer the offline demo login. */
  | { ok: false; error: string; offerOffline?: boolean };

/** The simulated login (today's behaviour), used offline. */
export function demoStaffLogin(role: StaffRole, email: string, password: string, fellBack = false): StaffLoginResult {
  const store = useInaraStore.getState();
  const result = loginDoctorOrLab(store.users, email, password);
  if (!result.ok) {
    return { ok: false, error: fellBack ? `${result.error} (offline demo login only knows the demo accounts)` : result.error };
  }
  if (result.user.role !== role) return wrongTab(result.user.role);
  store.login(result.user, { mode: "demo" });
  return { ok: true, user: result.user, path: homeFor(result.user.role), fellBack };
}

const wrongTab = (role: Role): StaffLoginResult => ({
  ok: false,
  error: `This is a ${roleLabel(role).toLowerCase()} account. Use the ${roleLabel(role)} tab.`,
});

/**
 * Real login when Supabase is available, else the demo login.
 * autoFallback: if Supabase can't be reached, log in offline straight away (quick-login buttons);
 * otherwise return offerOffline so the form can ask first. A wrong password never falls back.
 */
export async function staffLogin(
  role: StaffRole,
  email: string,
  password: string,
  { autoFallback = false } = {},
): Promise<StaffLoginResult> {
  const client = realAuthClient();
  if (!client) return demoStaffLogin(role, email, password);

  const result = await signInStaff(client, email, password);
  if (!result.ok) {
    if (result.kind === "network") {
      return autoFallback
        ? demoStaffLogin(role, email, password, true)
        : { ok: false, error: result.error, offerOffline: true };
    }
    return { ok: false, error: result.error };
  }
  if (result.profile.role !== role) {
    await signOutStaff(client);
    return wrongTab(result.profile.role);
  }
  const store = useInaraStore.getState();
  const user = userFromProfile(result.profile, store.users);
  store.upsertUser(user);
  store.login(user, { mode: "supabase", status: result.profile.status, aal: result.aal });
  return { ok: true, user, path: afterLoginPath(useInaraStore.getState().session!, user), fellBack: false };
}

/** Log out of the app and (if any) the real session on this device. */
export async function staffLogout(): Promise<void> {
  const real = useInaraStore.getState().session?.mode === "supabase";
  useInaraStore.getState().logout();
  if (real) await signOutStaff(getSupabase());
}

/**
 * Re-read a real session's profile and 2FA level (e.g. the admin suspended this doctor meanwhile).
 * Offline: keep what we have. Session gone on the server: log out.
 */
export async function refreshRealSession(): Promise<void> {
  const session = useInaraStore.getState().session;
  if (session?.mode !== "supabase") return;
  const client = getSupabase();
  if (!client) {
    useInaraStore.getState().logout();
    return;
  }
  const result = await refreshStaffSession(client);
  const store = useInaraStore.getState();
  if (store.session?.userId !== session.userId) return; // logged out or in as someone else meanwhile
  if (result.kind === "signed_out") store.logout();
  else if (result.kind === "ok") {
    const user = userFromProfile(result.profile, store.users);
    if (user.id !== session.userId) return store.logout();
    store.upsertUser(user);
    store.updateSessionAuth({ status: result.profile.status, aal: result.aal });
  }
}
