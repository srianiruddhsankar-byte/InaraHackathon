"use client";

import { useMemo, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { KeyRound, ShieldAlert, ShieldQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { breakGlassNotices, currentShareToken, formatCountdown, OTP_VALID_MIN, ONGOING_CARE_DAYS, promptsForPatient, VIA_LABEL, VISIT_DURATIONS } from "@/lib/recordAccess";
import type { AccessRequest, AccessScope, ConsentKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useInaraStore } from "@/store/useInaraStore";
import { useNow } from "./useNow";

/** In-app approval prompts for doctors asking to see this patient's record (synced across devices), plus break-glass notices. */
export function AccessPrompts({ patientId }: { patientId: string }) {
  const requests = useInaraStore((s) => s.accessRequests);
  const now = useNow();
  const open = useMemo(() => promptsForPatient(requests, patientId, now), [requests, patientId, now]);
  const notices = useMemo(() => breakGlassNotices(requests, patientId), [requests, patientId]);
  if (open.length === 0 && notices.length === 0) return null;
  return (
    <div className="mb-6 space-y-3" aria-live="polite">
      {notices.map((r) => (
        <BreakGlassNotice key={r.id} request={r} />
      ))}
      {open.map((r) => (
        <Prompt key={r.id} request={r} now={now} />
      ))}
    </div>
  );
}

function BreakGlassNotice({ request: r }: { request: AccessRequest }) {
  const { acknowledgeBreakGlass } = useInaraStore.getState();
  const who = [r.specialty, r.hospital].filter(Boolean).join(", ");
  return (
    <div role="alert" className="rounded-2xl bg-red-50 p-5 ring-1 ring-red-200">
      <p className="flex items-center gap-2 font-semibold text-red-900">
        <ShieldAlert className="size-5" aria-hidden /> {r.doctorName}
        {who && ` (${who})`} opened your emergency information
      </p>
      <p className="mt-1 text-sm text-red-900">
        {format(new Date(r.grantedAt ?? r.requestedAt), "d MMM, h:mm a")} · Reason given: “{r.reason}”
      </p>
      <p className="mt-1 text-sm text-red-900">
        Only your blood group, allergies, current medicines and emergency contact — not your reports. It ends by itself
        after 15 minutes. You can end it now under “Who has seen my record”.
      </p>
      <Button size="sm" variant="outline" className="mt-3" onClick={() => acknowledgeBreakGlass(r.id)}>
        OK, I&apos;ve seen this
      </Button>
    </div>
  );
}

function Choice<T extends string | number>({ value, current, onPick, children }: { value: T; current: T; onPick: (v: T) => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={current === value}
      onClick={() => onPick(value)}
      className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", current === value ? "bg-amber-600 text-white" : "text-amber-900 hover:bg-amber-100")}
    >
      {children}
    </button>
  );
}

function Prompt({ request: r, now }: { request: AccessRequest; now: number }) {
  const emergencyDefault = useInaraStore((s) => !!currentShareToken(s.shareTokens, r.patientId)?.emergencyOnly);
  const [scope, setScope] = useState<AccessScope | null>(null);
  const [consent, setConsent] = useState<ConsentKind>("visit");
  const [visitMin, setVisitMin] = useState<number>(30);
  const chosen = scope ?? (emergencyDefault ? "emergency" : "full");
  const { answerAccessRequest, revokeAccess } = useInaraStore.getState();
  const who = [r.specialty, r.hospital].filter(Boolean).join(", ");

  if (r.approvedAt) {
    const left = Date.parse(r.approvedAt) + OTP_VALID_MIN * 60_000 - now;
    return (
      <div role="alert" className="rounded-2xl bg-teal-50 p-5 ring-1 ring-teal-200">
        <p className="flex items-center gap-2 font-semibold text-teal-900">
          <KeyRound className="size-5" aria-hidden /> Read this one-time code to your doctor (valid {OTP_VALID_MIN} min)
        </p>
        <p className="mt-3 font-mono text-4xl font-bold tracking-[0.3em] text-teal-900">{r.otp}</p>
        <p className="mt-2 text-sm text-teal-900">
          For {r.doctorName} only · works for {formatCountdown(Math.max(0, left))} more. Access:{" "}
          {r.consent === "ongoing" ? `ongoing care (${ONGOING_CARE_DAYS} days)` : `this visit only (${r.durationMin} min)`},{" "}
          {r.scope === "emergency" ? "emergency view only" : "full record"}.
        </p>
        <Button size="sm" variant="outline" className="mt-3" onClick={() => revokeAccess(r.id)}>
          I changed my mind — cancel
        </Button>
      </div>
    );
  }

  return (
    <div role="alert" className="rounded-2xl bg-amber-50 p-5 ring-1 ring-amber-200">
      <p className="flex items-center gap-2 font-semibold text-amber-950">
        <ShieldQuestion className="size-5" aria-hidden />
        {r.doctorName}
        {who && ` (${who})`} wants access to your record — Allow?
      </p>
      <p className="mt-1 text-sm text-amber-900">
        Asked using your {VIA_LABEL[r.via]}. Only allow if you are with this doctor or expect this request. You can revoke
        it at any time.
      </p>
      <fieldset className="mt-3">
        <legend className="text-xs font-medium text-amber-900">For how long</legend>
        <div className="mt-1 inline-flex flex-wrap rounded-xl bg-white p-1 ring-1 ring-amber-200">
          {VISIT_DURATIONS.map((m) => (
            <Choice
              key={m}
              value={`visit-${m}`}
              current={consent === "visit" ? `visit-${visitMin}` : "ongoing"}
              onPick={() => {
                setConsent("visit");
                setVisitMin(m);
              }}
            >
              This visit only · {m} min
            </Choice>
          ))}
          <Choice value="ongoing" current={consent === "visit" ? `visit-${visitMin}` : "ongoing"} onPick={() => setConsent("ongoing")}>
            Ongoing care · {ONGOING_CARE_DAYS} days
          </Choice>
        </div>
        {consent === "ongoing" && (
          <p className="mt-1 text-xs text-amber-900">Lets this doctor review lab results that arrive later. You can revoke it any time.</p>
        )}
      </fieldset>
      <fieldset className="mt-3">
        <legend className="text-xs font-medium text-amber-900">What they can see</legend>
        <div className="mt-1 inline-flex rounded-xl bg-white p-1 ring-1 ring-amber-200">
          {(["full", "emergency"] as const).map((s) => (
            <Choice key={s} value={s} current={chosen} onPick={setScope}>
              {s === "full" ? "Full record" : "Emergency view only"}
            </Choice>
          ))}
        </div>
      </fieldset>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button className="bg-teal-600 text-white hover:bg-teal-700" onClick={() => answerAccessRequest(r.id, true, { scope: chosen, consent, visitMin })}>
          Allow
        </Button>
        <Button variant="outline" onClick={() => answerAccessRequest(r.id, false)}>
          Decline
        </Button>
      </div>
    </div>
  );
}
