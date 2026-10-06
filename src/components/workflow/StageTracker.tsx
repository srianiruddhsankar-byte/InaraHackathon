"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import {
  CalendarCheck,
  Check,
  ClipboardList,
  FileCheck,
  FileSearch,
  FlaskConical,
  Pill,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Upload,
  Watch,
  type LucideIcon,
} from "lucide-react";
import type { Case, CaseStage, StageEvent } from "@/lib/types";
import { cn } from "@/lib/utils";
import { patientStepIndex, patientStepsFor, STAGE_LABEL, STAGES, stageEvent, stageIndex } from "@/lib/workflow";

const STAGE_ICON: Record<CaseStage, LucideIcon> = {
  alert_raised: Watch,
  ordered: ClipboardList,
  in_lab: FlaskConical,
  results_uploaded: Upload,
  analysis_done: Sparkles,
  under_review: FileSearch,
  approved: ShieldCheck,
  treatment_planned: Pill,
  follow_up_scheduled: CalendarCheck,
};

const PATIENT_ICON: LucideIcon[] = [Watch, ClipboardList, FlaskConical, Stethoscope, FileCheck, Pill, CalendarCheck];

interface Step {
  label: string;
  icon: LucideIcon;
  event?: StageEvent;
}

const when = (at: string) => format(parseISO(at), "d MMM yyyy, HH:mm");

/**
 * Horizontal case progress. Hover, focus or tap a step to see who moved the
 * case there and when. The patient variant uses the six friendly steps and
 * never shows notes.
 */
export function StageTracker({ c, variant = "doctor" }: { c: Case; variant?: "doctor" | "patient" }) {
  const patient = variant === "patient";
  // Doctor orders skip the wearable-only first step ("Alert raised" / "Inara noticed a change").
  const offset = c.origin === "wearable" ? 0 : 1;
  const steps: Step[] = patient
    ? patientStepsFor(c).map((s, i) => ({
        label: s.label,
        icon: PATIENT_ICON[i + offset],
        // When the patient reached this step: the first event in its group.
        event: c.stageHistory.find((e) => s.stages.includes(e.stage)),
      }))
    : STAGES.slice(offset).map((s) => ({ label: STAGE_LABEL[s], icon: STAGE_ICON[s], event: stageEvent(c, s) }));
  const current = (patient ? patientStepIndex(c.stage) : stageIndex(c.stage)) - offset;
  const complete = current === steps.length - 1;
  const [focus, setFocus] = useState<number | null>(null);
  const shown = focus ?? current;
  const detail = steps[shown];

  return (
    <div>
      <ol className="-mx-1 flex overflow-x-auto px-1 pb-1" aria-label="Case progress">
        {steps.map((s, i) => {
          const done = i < current || complete;
          const isCurrent = i === current && !complete;
          const Icon = done ? Check : s.icon;
          return (
            <li key={s.label} className={cn("relative flex flex-1 flex-col items-center", patient ? "min-w-[52px]" : "min-w-[76px]")}>
              {i > 0 && (
                <span
                  aria-hidden
                  className={cn("absolute top-4 right-1/2 h-0.5 w-full -translate-y-1/2", i <= current ? "bg-teal-500" : "bg-slate-200")}
                />
              )}
              <button
                type="button"
                onMouseEnter={() => setFocus(i)}
                onMouseLeave={() => setFocus(null)}
                onFocus={() => setFocus(i)}
                onBlur={() => setFocus(null)}
                onClick={() => setFocus(i)}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`${s.label}${s.event ? ` — ${s.event.by}, ${when(s.event.at)}` : " — not reached yet"}`}
                className="group relative z-10 flex flex-col items-center gap-1.5 rounded-lg px-1 outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
              >
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full ring-2 transition-colors",
                    done && "bg-teal-600 text-white ring-teal-600",
                    isCurrent && "bg-white text-teal-700 ring-teal-600 shadow-[0_0_0_5px] shadow-teal-100",
                    !done && !isCurrent && "bg-white text-slate-400 ring-slate-200",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                </span>
                <span
                  className={cn(
                    "text-center text-[11px] leading-tight",
                    isCurrent ? "font-semibold text-teal-800" : done ? "text-slate-700" : "text-slate-400",
                    shown === i && "underline decoration-teal-400 underline-offset-2",
                  )}
                >
                  {s.label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 min-h-5 text-xs text-slate-600" aria-live="polite">
        <span className="font-medium text-slate-800">{detail.label}</span>
        {detail.event ? (
          <>
            {" · "}
            {detail.event.by} · {when(detail.event.at)}
            {!patient && detail.event.note && <span className="text-slate-500"> · {detail.event.note}</span>}
          </>
        ) : (
          <span className="text-slate-400"> · Not reached yet</span>
        )}
      </p>
    </div>
  );
}
