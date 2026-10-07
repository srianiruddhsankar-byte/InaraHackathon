"use client";

import { useMemo } from "react";
import { Megaphone } from "lucide-react";
import { alertsForPatient } from "@/lib/surveillance/alerts";
import { useInaraStore } from "@/store/useInaraStore";

/** Public health alerts for the area the patient lives in — only once an officer has authorised them. */
export function AreaAlertBanner({ patientId }: { patientId: string }) {
  const patient = useInaraStore((s) => s.patients.find((p) => p.id === patientId));
  const all = useInaraStore((s) => s.publicHealthAlerts);
  const alerts = useMemo(() => alertsForPatient(all, patient), [all, patient]);
  if (!alerts.length) return null;
  return (
    <div className="mb-4 space-y-2">
      {alerts.map((a) => (
        <section key={a.id} role="status" className="rounded-2xl bg-amber-50 p-4 text-amber-950 ring-1 ring-amber-200">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-800">
            <Megaphone className="size-4" />
            Public health alert · {a.areaName}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed sm:text-base">{a.message}</p>
          <p className="mt-2 text-xs text-amber-800">
            From the public health officer{a.authorisedAt ? ` · ${new Date(a.authorisedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""} ·
            for everyone in {a.areaName}, not about your own results.
          </p>
        </section>
      ))}
    </div>
  );
}
