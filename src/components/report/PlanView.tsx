import { format, parseISO } from "date-fns";
import { CalendarClock, FlaskConical, HeartHandshake, Pill } from "lucide-react";
import type { ReactNode } from "react";
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

/** An approved treatment plan, shown exactly as the doctor wrote it. */
export function PlanView({ plan, showNotes = false }: { plan: TreatmentPlan; showNotes?: boolean }) {
  return (
    <div className="space-y-5">
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
                  {[m.frequency, m.duration].filter(Boolean).join(" · ")}
                  {m.instructions && <span className="block text-slate-500">{m.instructions}</span>}
                </p>
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

      {showNotes && plan.doctorNotes && (
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
