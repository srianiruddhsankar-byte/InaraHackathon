import { format, parseISO } from "date-fns";
import { CheckCircle2, Phone, ShieldCheck, XCircle } from "lucide-react";
import type { ConsentKey, PatientSettings } from "@/lib/types";
import { CONSENT_TEXT } from "@/lib/wearable/consent";
import { cn } from "@/lib/utils";

const KEYS: ConsentKey[] = ["ownCare", "populationShare", "streaming", "notifyDoctorOnUrgent"];

/** Read-only consent + emergency contact, with when each was set (doctor's patient record). */
export function ConsentSummary({ settings, className }: { settings: PatientSettings | undefined; className?: string }) {
  if (!settings) return null;
  const contact = settings.emergencyContact;
  return (
    <section className={cn("rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200", className)}>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <ShieldCheck className="size-4 text-teal-600" aria-hidden /> Consent & emergency contact
      </h2>
      <ul className="mt-3 space-y-2">
        {KEYS.map((key) => {
          const c = settings[key];
          return (
            <li key={key} className="flex items-start gap-2 text-sm">
              {c.granted ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" aria-label="On" />
              ) : (
                <XCircle className="mt-0.5 size-4 shrink-0 text-slate-400" aria-label="Off" />
              )}
              <span className="min-w-0 flex-1 text-slate-800">
                {CONSENT_TEXT[key].title}
                <span className="block text-xs text-slate-500">
                  {c.granted ? "On" : "Off"} · set {format(parseISO(c.updatedAt), "d MMM yyyy, HH:mm")}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 border-t border-slate-100 pt-3 text-sm">
        <p className="text-xs font-medium text-slate-500">Emergency contact</p>
        {contact ? (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-slate-800">
            <span className="font-medium">{contact.name}</span>
            <span className="text-slate-500">({contact.relation})</span>
            <span className="inline-flex items-center gap-1 text-slate-700">
              <Phone className="size-3.5" aria-hidden /> {contact.phone}
            </span>
          </p>
        ) : (
          <p className="mt-0.5 text-slate-500">Not set</p>
        )}
      </div>
    </section>
  );
}
