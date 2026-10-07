// Public health alerts (pure, tested). The system PROPOSES an alert when an area
// has a cluster; a verified public health officer reviews the evidence, edits the
// plain-language message and AUTHORISES it. Only then do patients in that area
// see it. Alerts can be withdrawn, proposals dismissed. Every step is appended to
// the alert's log (never overwritten).
import type { AccountStatus, Patient, Role } from "../types";
import type { VisibleArea } from "./aggregate";

export type AlertStatus = "proposed" | "authorised" | "withdrawn" | "dismissed";

export interface AlertLogEntry {
  at: string; // ISO 8601
  by: string;
  action: "proposed" | "edited" | "authorised" | "withdrawn" | "dismissed";
  note?: string;
  /** The message at this step (proposed / edited / authorised). */
  message?: string;
}

export interface PublicHealthAlert {
  /** "pha-velachery-2026-10-05": one proposal per area and cluster day. */
  id: string;
  areaId: string;
  areaName: string;
  city: string;
  kind: "dengue_like" | "fever_like";
  title: string;
  /** The public message (editable until authorised). */
  message: string;
  status: AlertStatus;
  /** Demo date of the cluster (ISO date). */
  date: string;
  /** Aggregate evidence at proposal time (counts and shares only). */
  evidence: string[];
  /** People sharing data in the area at proposal time. */
  people: number;
  proposedAt: string;
  authorisedBy?: string;
  authorisedAt?: string;
  withdrawnBy?: string;
  withdrawnAt?: string;
  withdrawReason?: string;
  /** Append-only. */
  log: AlertLogEntry[];
}

export interface Officer {
  name: string;
  role: Role;
  status: AccountStatus;
}

export type AlertResult = { ok: true; alert: PublicHealthAlert } | { ok: false; error: string };

export const MESSAGE_LIMITS = { min: 20, max: 320 };

export function defaultAlert(kind: PublicHealthAlert["kind"], area: string): { title: string; message: string } {
  return kind === "dengue_like"
    ? {
        title: `Dengue-like illness rising in ${area}`,
        message: `Dengue-like illness is rising in ${area}. Remove standing water around your home, use mosquito repellent, and see a doctor if a fever comes with belly pain, vomiting or bleeding.`,
      }
    : {
        title: `Fevers rising in ${area}`,
        message: `More people than usual in ${area} have fever-like changes. Drink plenty of fluids, rest, and see a doctor if a fever lasts more than 2 days or you feel very unwell.`,
      };
}

/** A public message must be readable, short, and never sound like a diagnosis. */
export function validateMessage(text: string): string | null {
  const t = text.trim();
  if (t.length < MESSAGE_LIMITS.min) return `Write at least ${MESSAGE_LIMITS.min} characters.`;
  if (t.length > MESSAGE_LIMITS.max) return `Keep it under ${MESSAGE_LIMITS.max} characters (it is shown on phones).`;
  if (/\byou (have|are infected)\b/i.test(t)) return "Don't tell people they have an illness — say what to do and when to see a doctor.";
  return null;
}

const isOfficer = (o: Officer) => o.role === "health_officer" && o.status === "verified";
const notAllowed = { ok: false as const, error: "Only a verified public health officer can do this." };

/** The system's proposal for an area with a cluster today. */
export function proposeAlert(area: VisibleArea, date: string, at: string): PublicHealthAlert | null {
  if (area.cluster.status !== "cluster") return null;
  const kind = area.cluster.dengueLike ? "dengue_like" : "fever_like";
  const { title, message } = defaultAlert(kind, area.name);
  return {
    id: `pha-${area.id}-${date}`,
    areaId: area.id,
    areaName: area.name,
    city: area.city,
    kind,
    title,
    message,
    status: "proposed",
    date,
    evidence: area.cluster.evidence,
    people: area.people,
    proposedAt: at,
    log: [{ at, by: "Prodrome (system)", action: "proposed", message, note: area.cluster.label }],
  };
}

/**
 * New proposals for today's clusters. An area that already has a proposed or
 * authorised alert gets no new one; a proposal the officer dismissed is not re-made.
 */
export function newProposals(areas: VisibleArea[], existing: PublicHealthAlert[], date: string, at: string): PublicHealthAlert[] {
  const out: PublicHealthAlert[] = [];
  for (const area of areas) {
    const open = existing.some((a) => a.areaId === area.id && (a.status === "proposed" || a.status === "authorised"));
    const p = proposeAlert(area, date, at);
    if (!p || open || existing.some((a) => a.id === p.id)) continue;
    out.push(p);
  }
  return out;
}

export function editAlertMessage(alert: PublicHealthAlert, message: string, officer: Officer, at: string): AlertResult {
  if (!isOfficer(officer)) return notAllowed;
  if (alert.status !== "proposed") return { ok: false, error: "Only a proposed alert can be edited." };
  const error = validateMessage(message);
  if (error) return { ok: false, error };
  const m = message.trim();
  if (m === alert.message) return { ok: true, alert };
  return { ok: true, alert: { ...alert, message: m, log: [...alert.log, { at, by: officer.name, action: "edited", message: m }] } };
}

/** Authorise (publish) a proposed alert, optionally with a final edit of the message. */
export function authoriseAlert(alert: PublicHealthAlert, officer: Officer, at: string, message = alert.message): AlertResult {
  if (!isOfficer(officer)) return notAllowed;
  if (alert.status !== "proposed") return { ok: false, error: "Only a proposed alert can be authorised." };
  const edited = editAlertMessage(alert, message, officer, at);
  if (!edited.ok) return edited;
  const a = edited.alert;
  return {
    ok: true,
    alert: {
      ...a,
      status: "authorised",
      authorisedBy: officer.name,
      authorisedAt: at,
      log: [...a.log, { at, by: officer.name, action: "authorised", message: a.message }],
    },
  };
}

export function withdrawAlert(alert: PublicHealthAlert, officer: Officer, reason: string, at: string): AlertResult {
  if (!isOfficer(officer)) return notAllowed;
  if (alert.status !== "authorised") return { ok: false, error: "Only an authorised alert can be withdrawn." };
  const r = reason.trim();
  if (r.length < 3) return { ok: false, error: "Please give a reason (at least 3 characters)." };
  return {
    ok: true,
    alert: {
      ...alert,
      status: "withdrawn",
      withdrawnBy: officer.name,
      withdrawnAt: at,
      withdrawReason: r,
      log: [...alert.log, { at, by: officer.name, action: "withdrawn", note: r }],
    },
  };
}

export function dismissAlert(alert: PublicHealthAlert, officer: Officer, reason: string, at: string): AlertResult {
  if (!isOfficer(officer)) return notAllowed;
  if (alert.status !== "proposed") return { ok: false, error: "Only a proposed alert can be dismissed." };
  const r = reason.trim();
  if (r.length < 3) return { ok: false, error: "Please give a reason (at least 3 characters)." };
  return { ok: true, alert: { ...alert, status: "dismissed", log: [...alert.log, { at, by: officer.name, action: "dismissed", note: r }] } };
}

/** Alerts a patient sees: authorised ones for the area they live in. Nothing else. */
export function alertsForPatient(alerts: PublicHealthAlert[], patient: Pick<Patient, "area" | "city"> | undefined): PublicHealthAlert[] {
  const area = patient?.area?.trim().toLowerCase();
  if (!area) return [];
  const city = patient?.city?.trim().toLowerCase();
  return alerts.filter(
    (a) => a.status === "authorised" && a.areaName.toLowerCase() === area && (!city || a.city.toLowerCase() === city),
  );
}
