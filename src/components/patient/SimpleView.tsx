"use client";

import Link from "next/link";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleStop,
  ClipboardList,
  Clock,
  CloudSun,
  Eye,
  FlaskConical,
  Hand,
  Loader2,
  MessageSquareText,
  Moon,
  Pill,
  Settings,
  Sun,
  Utensils,
  Watch,
  type LucideIcon,
} from "lucide-react";
import { foodTimingLabel } from "@/lib/formulary";
import type { Slot } from "@/lib/medSchedule";
import type { PatientRecord, StatusLevel, WearableLine } from "@/lib/patientView";
import type { Case } from "@/lib/types";
import { cn } from "@/lib/utils";
import { patientStepIndex, patientStepLabel } from "@/lib/workflow";
import { StageTracker } from "@/components/workflow/StageTracker";
import { WarningSignsCard } from "./WarningSignsCard";

const STATUS_STYLE: Record<StatusLevel, { card: string; icon: string; title: string; Icon: LucideIcon }> = {
  none: { card: "bg-white ring-slate-200", icon: "bg-slate-100 text-slate-500", title: "text-slate-900", Icon: Clock },
  green: { card: "bg-green-50 ring-green-200", icon: "bg-green-600 text-white", title: "text-green-900", Icon: CheckCircle2 },
  amber: { card: "bg-amber-50 ring-amber-200", icon: "bg-amber-500 text-white", title: "text-amber-950", Icon: Eye },
  red: { card: "bg-red-50 ring-red-300", icon: "bg-red-600 text-white", title: "text-red-900", Icon: AlertTriangle },
};

const SLOT_ICON: Record<Slot, LucideIcon> = {
  morning: Sun,
  afternoon: CloudSun,
  night: Moon,
  weekly: CalendarDays,
  when_needed: Hand,
  as_directed: ClipboardList,
};

const WEARABLE_STYLE: Record<WearableLine["kind"], string> = {
  off: "bg-slate-100 text-slate-600",
  loading: "bg-slate-100 text-slate-500",
  normal: "bg-green-100 text-green-700",
  watch: "bg-sky-100 text-sky-700",
  checkin: "bg-amber-100 text-amber-700",
};

function Card({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
        <Icon className="size-5 text-teal-600" aria-hidden /> {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * The patient's at-a-glance view: big text, icons, few numbers. Everything comes
 * from the approved-only PatientRecord.
 */
export function SimpleView({
  firstName,
  record,
  current,
  wearable,
  onShowDetails,
}: {
  firstName: string;
  record: PatientRecord;
  current?: Case;
  wearable: WearableLine;
  onShowDetails: () => void;
}) {
  const s = STATUS_STYLE[record.status.level];
  const latest = record.latest;
  const plan = record.plan;
  const waiting = current && patientStepIndex(current.stage) < patientStepIndex("approved");

  return (
    <div className="mx-auto max-w-2xl space-y-5 text-base">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Hello, {firstName}</h1>
        <p className="mt-1 text-slate-600">Here is your health at a glance.</p>
      </div>

      <section className={cn("rounded-2xl p-5 ring-1", s.card)} aria-live="polite">
        <div className="flex items-start gap-4">
          <span className={cn("flex size-14 shrink-0 items-center justify-center rounded-full", s.icon)}>
            <s.Icon className="size-7" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className={cn("text-xl font-semibold", s.title)}>{record.status.title}</p>
            <p className="mt-1 text-slate-700">{record.status.message}</p>
            {latest && (
              <p className="mt-2 text-sm text-slate-500">
                Latest report {format(parseISO(latest.date), "d MMM yyyy")} · approved by {latest.approvedBy}
              </p>
            )}
          </div>
        </div>
      </section>

      {record.warningSigns && <WarningSignsCard large />}

      {current && (
        <Card icon={FlaskConical} title="Your latest tests">
          <StageTracker c={current} variant="patient" />
          <p className="mt-3 rounded-xl bg-teal-50/60 px-3 py-2 text-teal-900">
            {waiting
              ? patientStepLabel(current.stage) === "With your doctor"
                ? "Your results are with your doctor. You’ll see them here once your doctor has approved them."
                : "Your tests are on their way. We’ll show your results once your doctor has reviewed them."
              : "Your doctor has reviewed your results."}
          </p>
        </Card>
      )}

      {record.points.length > 0 && (
        <Card icon={MessageSquareText} title="What your doctor says">
          <ul className="space-y-3">
            {record.points.map((p) => (
              <li key={p} className="flex gap-3 text-slate-800">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-teal-600" aria-hidden />
                <span>{p}</span>
              </li>
            ))}
          </ul>
          {latest?.prescription && (
            <div className="mt-4 rounded-xl bg-slate-50 p-3">
              <p className="text-sm font-medium text-slate-500">Doctor&apos;s advice</p>
              <p className="mt-1 whitespace-pre-line text-slate-800">{latest.prescription}</p>
            </div>
          )}
        </Card>
      )}

      {plan && <MedicinesCard record={record} />}

      <NextStepsCard record={record} />

      <WearableRow line={wearable} />

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={onShowDetails}
          className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-teal-600 px-5 text-lg font-semibold text-white shadow-sm hover:bg-teal-700"
        >
          <ClipboardList className="size-5" aria-hidden /> See full details
        </button>
        <Link
          href="/patient/settings"
          className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-lg font-semibold text-teal-800 shadow-sm ring-1 ring-teal-200 hover:bg-teal-50"
        >
          <Settings className="size-5" aria-hidden /> Privacy & settings
        </Link>
      </div>
    </div>
  );
}

function WearableRow({ line }: { line: WearableLine }) {
  const Icon = line.kind === "loading" ? Loader2 : Watch;
  const body = (
    <>
      <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-full", WEARABLE_STYLE[line.kind])}>
        <Icon className={cn("size-5", line.kind === "loading" && "animate-spin")} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-slate-500">Your watch</span>
        <span className="block text-lg font-medium text-slate-900">{line.text}</span>
      </span>
      {line.href && <ChevronRight className="size-5 shrink-0 text-amber-700" aria-hidden />}
    </>
  );
  const cls = "flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1";
  return line.href ? (
    <Link href={line.href} className={cn(cls, "ring-amber-300 hover:shadow-md")}>
      {body}
    </Link>
  ) : (
    <div className={cn(cls, "ring-slate-200")}>{body}</div>
  );
}

/** Medicines by time of day, with the red "Stop taking" box (approved plan only). */
export function MedicinesCard({ record }: { record: PatientRecord }) {
  const stops = record.plan?.stopMedications ?? [];
  return (
        <Card icon={Pill} title="Your medicines">
          {stops.length > 0 && (
            <div className="mb-4 rounded-xl bg-red-50 p-4 ring-1 ring-red-200">
              <p className="flex items-center gap-2 font-semibold text-red-800">
                <CircleStop className="size-5" aria-hidden /> Stop taking
              </p>
              <ul className="mt-2 space-y-1.5">
                {stops.map((m) => (
                  <li key={m.name} className="text-red-900">
                    <span className="font-semibold">{m.name}</span>
                    {m.dose && <span> · {m.dose}</span>}
                    {m.reason && <span className="block text-sm text-red-800">{m.reason}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {record.schedule.length === 0 ? (
            <p className="text-slate-600">No medicines to take.</p>
          ) : (
            <div className="space-y-4">
              {record.schedule.map((g) => {
                const Icon = SLOT_ICON[g.slot];
                return (
                  <div key={g.slot}>
                    <p className="mb-2 flex items-center gap-2 font-semibold text-slate-900">
                      <Icon className="size-5 text-amber-500" aria-hidden /> {g.label}
                    </p>
                    <ul className="space-y-2">
                      {g.medicines.map((m, i) => (
                        <li key={`${m.name}-${i}`} className="rounded-xl bg-slate-50 px-4 py-3">
                          <p className="text-lg font-semibold text-slate-900">
                            {m.name} {m.dose && <span className="font-normal text-slate-700">{m.dose}</span>}
                          </p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                            {foodTimingLabel(m.foodTiming) && m.foodTiming !== "any" && (
                              <span className="inline-flex items-center gap-1">
                                <Utensils className="size-4" aria-hidden /> {foodTimingLabel(m.foodTiming)}
                              </span>
                            )}
                            {m.duration && (
                              <span className="inline-flex items-center gap-1">
                                <CalendarDays className="size-4" aria-hidden /> for {m.duration}
                              </span>
                            )}
                            {g.slot === "as_directed" && <span>{m.frequency}</span>}
                          </p>
                          {m.instructions && <p className="mt-1 text-sm text-slate-500">{m.instructions}</p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
  );
}

/** Follow-up tests and the review date. */
export function NextStepsCard({ record }: { record: PatientRecord }) {
  if (record.nextSteps.length === 0) return null;
  return (
        <Card icon={CalendarCheck} title="Next steps">
          <ul className="space-y-2">
            {record.nextSteps.map((step) => (
              <li key={step.text} className="flex items-center gap-3 rounded-xl bg-teal-50/60 px-4 py-3 text-teal-950">
                {step.kind === "test" ? (
                  <FlaskConical className="size-5 shrink-0 text-teal-600" aria-hidden />
                ) : (
                  <CalendarCheck className="size-5 shrink-0 text-teal-600" aria-hidden />
                )}
                {step.text}
              </li>
            ))}
          </ul>
        </Card>
  );
}
