"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, BellRing, FlaskConical, KeyRound, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openRequest, type LimitedAlert } from "@/lib/recordAccess";
import { formatIst } from "@/lib/wearable/checkin";
import type { Case } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useCurrentUser, useInaraStore } from "@/store/useInaraStore";
import { toast } from "sonner";

/** Ask the patient for consent from the dashboard (alert / renewal) and go to the code screen. */
function useAskPatient() {
  const router = useRouter();
  const doctor = useCurrentUser();
  return (patientId: string, via: "alert" | "renewal") => {
    const s = useInaraStore.getState();
    const open = doctor ? openRequest(s.accessRequests, doctor.id, patientId, Date.now()) : undefined;
    const result = open ? { id: open.id } : s.requestRecordAccess(patientId, via);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    router.push(`/doctor/access?request=${result.id}`);
  };
}

/** Urgent wearable alerts for the doctor's patients without consent: level, red flags and contact only. */
export function ConsentNeededAlerts({ alerts }: { alerts: LimitedAlert[] }) {
  const ask = useAskPatient();
  if (alerts.length === 0) return null;
  return (
    <section aria-labelledby="group-consent-alerts">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 id="group-consent-alerts" className="flex items-center gap-1.5 text-sm font-semibold text-red-700">
          <BellRing className="size-4" aria-hidden /> Alerts — consent needed
        </h2>
        <span className="rounded-full bg-red-100 px-2 text-xs font-medium text-red-700">{alerts.length}</span>
        <span className="hidden text-xs text-slate-500 sm:inline">The record stays closed until the patient allows access.</span>
      </div>
      <ul className="space-y-3">
        {alerts.map((a) => (
          <li
            key={a.episodeId}
            className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-2xl bg-white py-5 pr-5 pl-7 shadow-sm ring-1 ring-slate-200"
          >
            <span className={cn("absolute inset-y-0 left-0 w-1.5", a.level === "urgent" ? "bg-red-600" : "bg-amber-400")} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                {a.level === "urgent" ? "Urgent alert" : "Alert"} for {a.patientName} — consent needed
                {a.redFlags.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-200">
                    <AlertTriangle className="size-3" aria-hidden /> Red flag: {a.redFlags.join(", ").replace(/your /g, "")}
                  </span>
                )}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {a.level === "urgent" ? "Urgent — the patient was advised to see a doctor now" : "See a doctor within 24 h"} · {formatIst(a.at)}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-700">
                {a.patientPhone && (
                  <a href={`tel:${a.patientPhone}`} className="inline-flex items-center gap-1 text-teal-700 hover:underline">
                    <Phone className="size-3.5" aria-hidden /> Patient {a.patientPhone}
                  </a>
                )}
                {a.emergencyContact && (
                  <a href={`tel:${a.emergencyContact.phone}`} className="inline-flex items-center gap-1 text-teal-700 hover:underline">
                    <Phone className="size-3.5" aria-hidden /> {a.emergencyContact.name} ({a.emergencyContact.relation}) {a.emergencyContact.phone}
                  </a>
                )}
              </p>
            </div>
            <Button className="shrink-0 bg-teal-600 text-white hover:bg-teal-700" onClick={() => ask(a.patientId, "alert")}>
              <KeyRound /> Request access
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Results for the doctor's own orders that arrived after consent ended. */
export function ResultsAwaitingConsent({ cases }: { cases: Case[] }) {
  const ask = useAskPatient();
  const patients = useInaraStore((s) => s.patients);
  if (cases.length === 0) return null;
  return (
    <section aria-labelledby="group-renew">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 id="group-renew" className="text-sm font-semibold text-amber-800">
          Results arrived — consent needed
        </h2>
        <span className="rounded-full bg-amber-100 px-2 text-xs font-medium text-amber-800">{cases.length}</span>
      </div>
      <ul className="space-y-3">
        {cases.map((c) => (
          <li key={c.id} className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-2xl bg-white py-5 pr-5 pl-7 shadow-sm ring-1 ring-slate-200">
            <span className="absolute inset-y-0 left-0 w-1.5 bg-amber-400" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900">{patients.find((p) => p.id === c.patientId)?.name ?? "Patient"}</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                <FlaskConical className="size-3.5 text-slate-400" aria-hidden /> Results arrived — ask the patient to renew consent
              </p>
            </div>
            <Button variant="outline" className="shrink-0" onClick={() => ask(c.patientId, "renewal")}>
              <KeyRound /> Ask to renew
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
