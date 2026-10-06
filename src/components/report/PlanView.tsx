import { format, parseISO } from "date-fns";
import { CalendarClock, CircleStop, FlaskConical, HeartHandshake, Pill, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { foodTimingLabel, frequencyMeaning } from "@/lib/formulary";
import { frequencyLabel } from "@/lib/record";
import type { TreatmentPlan } from "@/lib/types";

function Block({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
        {icon}
        {title}
      </h4>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/**
 * An approved treatment plan, shown exactly as the doctor wrote it. Patients see
 * frequencies in plain words; safety overrides and doctor notes are doctors only.
 */
export function PlanView({ plan, forDoctor = false }: { plan: TreatmentPlan; forDoctor?: boolean }) {
  const stops = plan.stopMedications ?? [];
  return (
    <div className="space-y-5">
      {stops.length > 0 && (
        <Block icon={<CircleStop className="size-3.5 text-red-600" />} title="Medicines to stop">
          <ul className="space-y-2">
            {stops.map((m) => (
              <li key={m.name} className="rounded-xl bg-red-50 px-3 py-2 text-sm ring-1 ring-red-200">
                <p className="font-semibold text-red-900">
                  Stop {m.name}
                  {m.dose && <span className="font-normal"> · {m.dose}</span>}
                </p>
                {m.reason && <p className="text-red-800">{m.reason}</p>}
              </li>
            ))}
          </ul>
        </Block>
      )}

      <Block icon={<Pill className="size-3.5" />} title="Medicines (as prescribed by your doctor)">
        {plan.medications.length === 0 ? (
          <p className="text-sm text-slate-600">No medicines prescribed.</p>
        ) : (
          <ul className="space-y-2">
            {plan.medications.map((m, i) => (
              <li key={i} className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
                <p className="font-medium text-slate-900">
                  {m.name}
                  {m.dose && <span className="font-normal text-slate-700"> · {m.dose}</span>}
                </p>
                <p className="text-slate-600">
                  {[
                    forDoctor ? frequencyLabel(m.frequency) : frequencyMeaning(m.frequency),
                    foodTimingLabel(m.foodTiming),
                    m.duration && `for ${m.duration}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  {m.instructions && <span className="block text-slate-500">{m.instructions}</span>}
                </p>
                {forDoctor && m.override && (
                  <p className="mt-1 flex items-start gap-1.5 text-xs text-red-800">
                    <ShieldAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                    Safety block overridden by {m.override.author} · {format(parseISO(m.override.timestamp), "d MMM yyyy, HH:mm")} ·{" "}
                    {m.override.reason}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Block>

      {plan.lifestyle.length > 0 && (
        <Block icon={<HeartHandshake className="size-3.5" />} title="Lifestyle">
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            {plan.lifestyle.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </Block>
      )}

      {plan.followUpTests.length > 0 && (
        <Block icon={<FlaskConical className="size-3.5" />} title="Follow-up tests">
          <ul className="flex flex-wrap gap-2">
            {plan.followUpTests.map((t) => (
              <li key={t.name} className="rounded-lg bg-teal-50 px-2.5 py-1 text-sm text-teal-800 ring-1 ring-teal-100">
                {t.name} <span className="text-teal-600">· in {t.inWeeks} weeks</span>
              </li>
            ))}
          </ul>
        </Block>
      )}

      {plan.nextReviewDate && (
        <Block icon={<CalendarClock className="size-3.5" />} title="Next review">
          <p className="text-sm font-medium text-slate-900">{format(parseISO(plan.nextReviewDate), "EEEE d MMMM yyyy")}</p>
        </Block>
      )}

      {forDoctor && plan.doctorNotes && (
        <Block icon={null} title="Doctor notes (doctors only)">
          <p className="text-sm whitespace-pre-line text-slate-700">{plan.doctorNotes}</p>
        </Block>
      )}

      <p className="text-xs text-slate-500">
        Approved by {plan.author} · {format(parseISO(plan.timestamp), "d MMM yyyy, HH:mm")}
      </p>
    </div>
  );
}
