// Who may open which area, and staff account status (pure, tested).
import { homeFor } from "./auth";
import type { AccountAuditEntry, AccountStatus, Role, Session, User } from "./types";

/** Roles that must enter an authenticator code (Supabase MFA) on every real login. */
export const MFA_ROLES: readonly Role[] = ["doctor", "admin"];

export const MFA_PATH = "/login/mfa";

export type Access =
  | { kind: "allow" }
  /** Not logged in, or logged in with another role → this login tab. */
  | { kind: "login"; redirect: string }
  /** Real login with a verified account that still needs its authenticator code. */
  | { kind: "mfa"; redirect: string }
  /** Logged in, but the account may not see this area's data. */
  | { kind: "blocked"; status: Exclude<AccountStatus, "verified">; title: string; message: string };

/** The role a path belongs to, or null for public pages. */
export function areaFor(pathname: string): Role | null {
  const first = pathname.split("/")[1];
  return first === "doctor" || first === "patient" || first === "lab" || first === "admin" ? first : null;
}

/** The status that counts for this session: the profile's (real login) or the local user's (demo login). */
export function effectiveStatus(session: Session, user: User): AccountStatus {
  if (user.role === "patient") return "verified";
  if (session.mode === "supabase") return session.status ?? "pending";
  return user.status ?? "verified";
}

export function needsMfa(session: Session, user: User): boolean {
  return session.mode === "supabase" && MFA_ROLES.includes(user.role) && session.aal !== "aal2";
}

export function blockedMessage(role: Role, status: Exclude<AccountStatus, "verified">): { title: string; message: string } {
  const what = role === "lab" ? "lab orders and patient results" : "patient data";
  return status === "pending"
    ? {
        title: "Account pending verification",
        message: `Your account is waiting for the hospital admin to verify it. You can't see ${what} until then. We'll let you in as soon as it is verified — please check back later.`,
      }
    : {
        title: "Account suspended",
        message: `Your account has been suspended by the hospital admin, so you can't see ${what}. Please contact the hospital admin.`,
      };
}

/**
 * Route guard decision for `pathname`.
 * Order: right role → account status → 2FA. A pending or suspended account sees no data at all,
 * so it is told about its status straight away; a verified doctor or admin must pass 2FA.
 */
export function accessFor(pathname: string, session: Session | null, user: User | undefined): Access {
  const area = areaFor(pathname);
  if (!area) return { kind: "allow" };
  if (!session || !user || user.role !== area || session.role !== area) {
    return { kind: "login", redirect: `/login?tab=${area}` };
  }
  if (area === "patient") return { kind: "allow" };
  const status = effectiveStatus(session, user);
  if (status !== "verified") return { kind: "blocked", status, ...blockedMessage(user.role, status) };
  if (needsMfa(session, user)) return { kind: "mfa", redirect: MFA_PATH };
  return { kind: "allow" };
}

/** Where to go right after a successful password step. */
export function afterLoginPath(session: Session, user: User): string {
  return effectiveStatus(session, user) === "verified" && needsMfa(session, user) ? MFA_PATH : homeFor(user.role);
}

// ---- Real accounts (Supabase profiles) → app users ----

export interface Profile {
  id: string;
  role: "doctor" | "lab" | "admin";
  name: string;
  email: string;
  hospital: string | null;
  specialty: string | null;
  council_reg_no: string | null;
  app_user_id: string | null;
  status: AccountStatus;
  created_at?: string;
}

/**
 * The app user for a signed-in profile: the seeded demo user it is linked to
 * (so Dr. Meera keeps her patients), else a new user with no patients.
 */
export function userFromProfile(profile: Profile, users: User[]): User {
  const linked = profile.app_user_id ? users.find((u) => u.id === profile.app_user_id) : undefined;
  if (linked && linked.role === profile.role) return { ...linked, status: profile.status };
  return {
    id: `sb-${profile.id}`,
    role: profile.role,
    name: profile.name,
    email: profile.email,
    ...(profile.hospital ? { hospital: profile.hospital } : {}),
    ...(profile.specialty ? { specialty: profile.specialty } : {}),
    ...(profile.council_reg_no ? { councilRegNo: profile.council_reg_no } : {}),
    ...(profile.role === "doctor" ? { patientIds: [] } : {}),
    status: profile.status,
  };
}

// ---- Offline demo: the hospital admin changes a status ----

export type StatusChange =
  | { ok: true; users: User[]; entry: AccountAuditEntry }
  | { ok: false; error: string };

export function applyStatusChange(
  users: User[],
  input: { targetId: string; status: AccountStatus; reason: string; actorName: string; id: string; timestamp: string },
): StatusChange {
  const target = users.find((u) => u.id === input.targetId);
  if (!target) return { ok: false, error: "Account not found." };
  if (target.role !== "doctor" && target.role !== "lab") return { ok: false, error: "Only doctor and lab accounts can be changed here." };
  const reason = input.reason.trim();
  if (reason.length < 3) return { ok: false, error: "Please give a reason (at least 3 characters)." };
  const oldStatus = target.status ?? "verified";
  if (oldStatus === input.status) return { ok: false, error: `The account is already ${input.status}.` };
  return {
    ok: true,
    users: users.map((u) => (u.id === target.id ? { ...u, status: input.status } : u)),
    entry: {
      id: input.id,
      targetId: target.id,
      targetName: target.name,
      targetRole: target.role,
      actorName: input.actorName,
      oldStatus,
      newStatus: input.status,
      reason: reason.slice(0, 500),
      timestamp: input.timestamp,
    },
  };
}
