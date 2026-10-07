"use client";

import { useMemo, useState } from "react";
import { KeyRound, ShieldQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { currentShareToken, formatCountdown, OTP_VALID_MIN, promptsForPatient } from "@/lib/recordAccess";
import type { AccessRequest, AccessScope } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useInaraStore } from "@/store/useInaraStore";
import { useNow } from "./useNow";

/** In-app approval prompts for doctors asking to see this patient's record (synced across devices). */
export function AccessPrompts({ patientId }: { patientId: string }) {
  const requests = useInaraStore((s) => s.accessRequests);
  const now = useNow();
  const open = useMemo(() => promptsForPatient(requests, patientId, now), [requests, patientId, now]);
  if (open.length === 0) return null;
  return (
    <div className="mb-6 space-y-3" aria-live="polite">
      {open.map((r) => (
        <Prompt key={r.id} request={r} now={now} />
      ))}
    </div>
  );
}

function Prompt({ request: r, now }: { request: AccessRequest; now: number }) {
  const emergencyDefault = useInaraStore((s) => !!currentShareToken(s.shareTokens, r.patientId)?.emergencyOnly);
  const [scope, setScope] = useState<AccessScope | null>(null);
  const chosen = scope ?? (emergencyDefault ? "emergency" : "full");
  const { answerAccessRequest, revokeAccess } = useInaraStore.getState();
  const who = [r.specialty, r.hospital].filter(Boolean).join(" · ");

  if (r.approvedAt) {
    const left = Date.parse(r.approvedAt) + OTP_VALID_MIN * 60_000 - now;
    return (
      <div role="alert" className="rounded-2xl bg-teal-50 p-5 ring-1 ring-teal-200">
        <p className="flex items-center gap-2 font-semibold text-teal-900">
          <KeyRound className="size-5" aria-hidden /> Your code for {r.doctorName}
        </p>
        <p className="mt-3 font-mono text-4xl font-bold tracking-[0.3em] text-teal-900">{r.otp}</p>
        <p className="mt-2 text-sm text-teal-900">
          Tell this code to {r.doctorName} only. It works for {formatCountdown(Math.max(0, left))} more. Access will last{" "}
          {r.durationMin} minutes ({r.scope === "emergency" ? "emergency view only" : "full record"}).
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
        <ShieldQuestion className="size-5" aria-hidden /> {r.doctorName} wants to see your health record
      </p>
      {who && <p className="mt-1 text-sm text-amber-950">{who}</p>}
      <p className="mt-1 text-sm text-amber-900">
        For {r.durationMin} minutes · asked using your {r.via === "qr" ? "QR code" : "patient ID"}. Only approve if you are
        with this doctor or expect this request.
      </p>
      <fieldset className="mt-3">
        <legend className="text-xs font-medium text-amber-900">What they can see</legend>
        <div className="mt-1 inline-flex rounded-xl bg-white p-1 ring-1 ring-amber-200">
          {(["full", "emergency"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={chosen === s}
              onClick={() => setScope(s)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium",
                chosen === s ? "bg-amber-600 text-white" : "text-amber-900 hover:bg-amber-100",
              )}
            >
              {s === "full" ? "Full record" : "Emergency view only"}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button className="bg-teal-600 text-white hover:bg-teal-700" onClick={() => answerAccessRequest(r.id, true, chosen)}>
          Approve and show my code
        </Button>
        <Button variant="outline" onClick={() => answerAccessRequest(r.id, false)}>
          Decline
        </Button>
      </div>
    </div>
  );
}
