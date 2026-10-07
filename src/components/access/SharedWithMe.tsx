"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ChevronRight, Clock, ScanLine } from "lucide-react";
import { activeGrantsFor, formatCountdown, remainingMs } from "@/lib/recordAccess";
import { useCurrentUser, useInaraStore } from "@/store/useInaraStore";
import { useNow } from "./useNow";

/** Dashboard button: open the QR / patient ID flow. */
export function AccessPatientButton() {
  return (
    <Link
      href="/doctor/access"
      className="inline-flex h-10 items-center gap-2 rounded-xl bg-teal-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
    >
      <ScanLine className="size-4" aria-hidden /> Access a patient
    </Link>
  );
}

/** Records patients shared with this doctor right now, with the time left. */
export function SharedWithMe() {
  const doctor = useCurrentUser();
  const requests = useInaraStore((s) => s.accessRequests);
  const patients = useInaraStore((s) => s.patients);
  const now = useNow();
  const grants = useMemo(() => (doctor ? activeGrantsFor(requests, doctor.id, now) : []), [requests, doctor, now]);
  if (grants.length === 0) return null;
  return (
    <section aria-labelledby="group-shared" className="mb-8">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 id="group-shared" className="text-sm font-semibold text-teal-800">
          Shared with me
        </h2>
        <span className="rounded-full bg-teal-50 px-2 text-xs font-medium text-teal-700">{grants.length}</span>
        <span className="hidden text-xs text-slate-500 sm:inline">Temporary access approved by the patient.</span>
      </div>
      <ul className="space-y-3">
        {grants.map((g) => {
          const p = patients.find((x) => x.id === g.patientId);
          return (
            <li key={g.id}>
              <Link
                href={`/doctor/shared/${g.patientId}`}
                className="group relative flex items-center gap-4 overflow-hidden rounded-2xl bg-white py-5 pr-5 pl-7 shadow-sm ring-1 ring-slate-200 hover:shadow-md"
              >
                <span className="absolute inset-y-0 left-0 w-1.5 bg-teal-500" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{p?.name ?? "Patient"}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                    <Clock className="size-3.5 text-slate-400" aria-hidden />
                    {formatCountdown(remainingMs(g, now))} left · {g.scope === "emergency" ? "Emergency view only" : "Read-only record"}
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-slate-400" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
