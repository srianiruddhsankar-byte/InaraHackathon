"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { QRCodeSVG } from "qrcode.react";
import { History, QrCode, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/report/ConfirmDialog";
import { accessHistory, currentShareToken, formatCountdown, formatToken, remainingMs, STATE_LABEL, type AccessState } from "@/lib/recordAccess";
import { cn } from "@/lib/utils";
import { useInaraStore } from "@/store/useInaraStore";
import { useNow } from "./useNow";

const STATE_STYLE: Record<AccessState, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-amber-100 text-amber-800",
  active: "bg-green-100 text-green-800",
  declined: "bg-slate-100 text-slate-600",
  lapsed: "bg-slate-100 text-slate-600",
  locked: "bg-red-100 text-red-700",
  expired: "bg-slate-100 text-slate-600",
  revoked: "bg-slate-100 text-slate-600",
};

const time = (iso?: string) => (iso ? format(new Date(iso), "d MMM, h:mm a") : "—");

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 focus-visible:outline-none",
        checked ? "bg-teal-600" : "bg-slate-300",
      )}
    >
      <span className={cn("inline-block size-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-5" : "translate-x-0.5")} />
    </button>
  );
}

/** Patient "Medical Records": QR + patient ID to share, emergency-only choice, access log with Revoke now. */
export function PatientSharePanel({ patientId }: { patientId: string }) {
  const patient = useInaraStore((s) => s.patients.find((p) => p.id === patientId));
  const tokens = useInaraStore((s) => s.shareTokens);
  const requests = useInaraStore((s) => s.accessRequests);
  const log = useInaraStore((s) => s.accessLog);
  const { regenerateShareToken, setShareEmergencyOnly, revokeAccess } = useInaraStore.getState();
  const [confirmNew, setConfirmNew] = useState(false);
  const now = useNow();
  const token = currentShareToken(tokens, patientId);
  const history = useMemo(() => accessHistory(requests, log, patientId, now), [requests, log, patientId, now]);

  if (!patient) return null;
  return (
    <section aria-labelledby="share-heading" className="space-y-4">
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
        <h2 id="share-heading" className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <QrCode className="size-5 text-teal-600" aria-hidden /> Share my record with a doctor
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Show this QR code or tell the doctor your patient ID. You will be asked to approve, and the doctor needs the
          one-time code you see. Access ends by itself after 30 or 60 minutes.
        </p>
        <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
            {token ? (
              <QRCodeSVG value={token.token} size={176} marginSize={1} aria-label="Your share QR code" />
            ) : (
              <div className="flex size-44 items-center justify-center text-sm text-slate-500">No code yet</div>
            )}
          </div>
          <dl className="w-full min-w-0 flex-1 space-y-4">
            <div>
              <dt className="text-xs text-slate-500">Code under the QR (if the doctor can&apos;t scan)</dt>
              <dd className="mt-0.5 font-mono text-lg font-semibold tracking-wider break-all text-slate-900">{token ? formatToken(token.token) : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">My patient ID</dt>
              <dd className="mt-0.5 font-mono text-lg font-semibold tracking-wider text-slate-900">{patient.publicId ?? "—"}</dd>
            </div>
            <p className="text-xs text-slate-500">The QR holds only a random code — none of your health details.</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={() => setConfirmNew(true)}>
                <RefreshCw /> Make a new QR code
              </Button>
            </div>
          </dl>
        </div>
        <div className="mt-5 flex items-start justify-between gap-4 rounded-xl bg-slate-50 p-4">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
              <ShieldAlert className="size-4 text-red-600" aria-hidden /> Emergency view only
            </p>
            <p className="mt-0.5 text-sm text-slate-600">
              Doctors you approve see only your blood group, allergies, current medicines and emergency contact — not
              your reports. You can still change this for each request.
            </p>
          </div>
          <Switch checked={!!token?.emergencyOnly} onChange={(v) => setShareEmergencyOnly(patientId, v)} label="Emergency view only" />
        </div>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <History className="size-5 text-teal-600" aria-hidden /> Who has seen my record
        </h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No doctor has asked for access yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {history.map(({ request: r, state, viewed }) => (
              <li key={r.id} className="flex flex-wrap items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                    {r.doctorName}
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", STATE_STYLE[state])}>
                      {STATE_LABEL[state]}
                      {state === "active" && ` · ${formatCountdown(remainingMs(r, now))} left`}
                    </span>
                    {r.scope === "emergency" && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Emergency view</span>}
                  </p>
                  <p className="text-sm text-slate-600">{[r.specialty, r.hospital].filter(Boolean).join(" · ")}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Asked {time(r.requestedAt)} · {r.durationMin} min
                    {r.grantedAt && ` · Started ${time(r.grantedAt)}`}
                    {r.expiresAt && ` · ${r.revokedAt ? "Revoked" : state === "active" ? "Ends" : "Ended"} ${time(r.revokedAt ?? r.expiresAt)}`}
                  </p>
                  {r.grantedAt && (
                    <p className="mt-0.5 text-xs text-slate-500">Viewed: {viewed.length ? viewed.join(", ") : "nothing yet"}</p>
                  )}
                </div>
                {(state === "active" || state === "pending" || state === "approved") && (
                  <Button size="sm" variant="destructive" onClick={() => revokeAccess(r.id)}>
                    {state === "active" ? "Revoke now" : "Cancel request"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={confirmNew}
        onOpenChange={setConfirmNew}
        title="Make a new QR code?"
        confirmLabel="Make new code"
        onConfirm={() => regenerateShareToken(patientId)}
      >
        <p>Your old QR code and its typed code will stop working at once. Doctors who already have access keep it until it ends or you revoke it.</p>
      </ConfirmDialog>
    </section>
  );
}
