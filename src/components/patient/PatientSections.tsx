"use client";

import { format, parseISO } from "date-fns";
import { BadgeCheck, ClipboardList, Hourglass } from "lucide-react";
import { TrendChart } from "@/components/charts/TrendChart";
import { EmptyState } from "@/components/layout/EmptyState";
import { PlanView } from "@/components/report/PlanView";
import type { PatientRecord } from "@/lib/patientView";
import type { Case } from "@/lib/types";
import { patientStepIndex } from "@/lib/workflow";
import { MedicinesCard, NextStepsCard } from "./SimpleView";
import { WarningSignsCard } from "./WarningSignsCard";

function Heading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
      <p className="mt-1 text-slate-600">{subtitle}</p>
    </div>
  );
}

/** Newer results are still with the lab or the doctor (no content — just that they exist). */
function PendingNotice({ current }: { current?: Case }) {
  if (!current || patientStepIndex(current.stage) >= patientStepIndex("approved")) return null;
  const withDoctor = !!current.reportId;
  return (
    <p className="mb-5 flex items-start gap-3 rounded-2xl bg-sky-50 px-4 py-3 text-sky-950 ring-1 ring-sky-200">
      <Hourglass className="mt-0.5 size-5 shrink-0 text-sky-600" aria-hidden />
      {withDoctor
        ? "Your doctor is reviewing your latest results. Their analysis appears here once they approve it."
        : "Your latest tests are on their way. The analysis appears here once your doctor has reviewed the results."}
    </p>
  );
}

/** AI Analysis for the patient: only what the doctor approved. */
export function AnalysisSection({ record, current }: { record: PatientRecord; current?: Case }) {
  const latest = record.latest;
  const outside = record.groups.flatMap((g) => g.results).filter((r) => r.flag !== "normal");
  return (
    <div className="mx-auto max-w-3xl">
      <Heading title="AI Analysis" subtitle="What your results mean — shown only after your doctor has reviewed and approved it." />
      <PendingNotice current={current} />
      {!latest ? (
        <EmptyState title="No approved analysis yet">You will see it here once your doctor has reviewed your results.</EmptyState>
      ) : (
        <div className="space-y-6">
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-800 ring-1 ring-green-200">
              <BadgeCheck className="size-3.5" aria-hidden /> Reviewed and approved by {latest.approvedBy}
            </p>
            <h2 className="mt-3 font-semibold text-slate-900">Report · {format(parseISO(latest.date), "d MMMM yyyy")}</h2>
            {latest.explanation ? (
              <p className="mt-2 leading-relaxed whitespace-pre-line text-slate-700">{latest.explanation}</p>
            ) : (
              <p className="mt-2 text-slate-600">Your doctor approved this report without a written explanation.</p>
            )}
          </section>

          {outside.length > 0 && (
            <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <h2 className="font-semibold text-slate-900">Results outside the healthy range</h2>
              <ul className="mt-3 divide-y divide-slate-100">
                {outside.map((r) => (
                  <li key={r.testKey} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">{r.name}</p>
                      <p className="text-sm text-slate-500">{r.description}</p>
                    </div>
                    <p className="text-right">
                      <span className="font-semibold tabular-nums text-slate-900">
                        {r.display}
                        {r.unit && <span className="ml-1 text-xs font-normal text-slate-500">{r.unit}</span>}
                      </span>
                      <span className="block text-xs text-amber-800">{r.flagText}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {record.trends.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-semibold text-slate-900">How your results have changed</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {record.trends.map((t) => (
                  <div key={t.key} className="space-y-2">
                    <TrendChart title={t.title} unit={t.unit} decimals={t.decimals} points={t.points} range={t.range} />
                    <p className="px-1 text-sm text-slate-700">{t.sentence}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

/** Prescription & Treatment Plan: the approved plan, verbatim, with the daily schedule. */
export function TreatmentSection({ record }: { record: PatientRecord }) {
  const plan = record.plan;
  const prescription = record.latest?.prescription;
  return (
    <div className="mx-auto max-w-3xl">
      <Heading title="Prescription & Treatment Plan" subtitle="Exactly as your doctor approved it." />
      {!plan && !prescription ? (
        <EmptyState title="No treatment plan yet">Your doctor&apos;s plan appears here once it is approved.</EmptyState>
      ) : (
        <div className="space-y-5">
          {record.warningSigns && <WarningSignsCard large />}
          {plan && <MedicinesCard record={record} />}
          <NextStepsCard record={record} />
          {prescription && (
            <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <h2 className="text-sm font-semibold text-slate-500">Doctor&apos;s prescription</h2>
              <p className="mt-1 whitespace-pre-line text-slate-800">{prescription}</p>
            </section>
          )}
          {plan && (
            <section className="rounded-2xl bg-teal-50/50 p-5 ring-1 ring-teal-100">
              <h2 className="mb-4 flex items-center gap-2 font-semibold text-teal-900">
                <ClipboardList className="size-5" aria-hidden /> Full plan as approved
              </h2>
              <PlanView plan={plan} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
