"use client";

import { format, parseISO } from "date-fns";
import { ArrowDown, ArrowRight, ArrowUp, ClipboardList, FileText, History, LineChart, Printer, TestTubes, Watch } from "lucide-react";
import type { ReactNode } from "react";
import { TrendChart } from "@/components/charts/TrendChart";
import { EmptyState } from "@/components/layout/EmptyState";
import { PlanView } from "@/components/report/PlanView";
import { WearablePanel } from "@/components/wearable/WearablePanel";
import type { PatientRecord, PatientResult } from "@/lib/patientView";
import { cn } from "@/lib/utils";
import { RangeBar } from "./RangeBar";
import { WarningSignsCard } from "./WarningSignsCard";

function Section({ icon, title, action, children }: { icon: ReactNode; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const FLAG_STYLE: Record<PatientResult["flag"], string> = {
  normal: "bg-green-50 text-green-800 ring-green-200",
  low: "bg-amber-50 text-amber-900 ring-amber-200",
  high: "bg-amber-50 text-amber-900 ring-amber-200",
};

function Change({ r }: { r: PatientResult }) {
  if (r.delta === undefined || !r.deltaText) return null;
  const same = r.deltaText === "no change";
  const Icon = same ? ArrowRight : r.delta > 0 ? ArrowUp : ArrowDown;
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-slate-500">
      <Icon className="size-3.5" aria-hidden />
      {same ? "No change since last report" : `${r.deltaText}${r.unit ? ` ${r.unit}` : ""} since last report`}
    </span>
  );
}

function ResultRow({ r }: { r: PatientResult }) {
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-900">
            {r.name} <span className="text-xs font-normal text-slate-400">· {r.specimen}</span>
          </p>
          <p className="text-sm text-slate-500">{r.description}</p>
        </div>
        <div className="text-right">
          <p className="text-lg leading-tight font-semibold tabular-nums text-slate-900">
            {r.display}
            {r.unit && <span className="ml-1 text-xs font-normal text-slate-500">{r.unit}</span>}
          </p>
          <Change r={r} />
        </div>
      </div>
      <RangeBar result={r} />
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span className={cn("rounded-full px-2 py-0.5 font-medium ring-1", FLAG_STYLE[r.flag])}>{r.flagText}</span>
        <span className={cn("tabular-nums", r.target && "font-medium text-teal-700")}>{r.ref}</span>
        {r.target && <span className="font-medium text-teal-700">{r.target.met ? "Target met" : "Target not met yet"}</span>}
      </div>
    </li>
  );
}

/** Everything approved, in full: results, trends, history, plan, wearable, print. */
export function DetailedView({ patientId, record }: { patientId: string; record: PatientRecord }) {
  const latest = record.latest;
  const older = record.reports.slice(1);

  return (
    <div className="space-y-8">
      {!latest ? (
        <EmptyState title="No approved reports yet">You will see your results here once your doctor has reviewed them.</EmptyState>
      ) : (
        <>
          <Section
            icon={<TestTubes className="size-5 text-teal-600" aria-hidden />}
            title={`Your results · ${format(parseISO(latest.date), "d MMMM yyyy")}`}
            action={
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-teal-800 shadow-sm ring-1 ring-teal-200 hover:bg-teal-50"
              >
                <Printer className="size-4" aria-hidden /> Download / print my report
              </button>
            }
          >
            <p className="text-sm text-slate-500">
              {latest.specimenTitle} · {latest.labName} · approved by {latest.approvedBy}
            </p>
            <p className="text-sm text-slate-700">{latest.presenting}</p>
            {latest.explanation && (
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  <FileText className="size-3.5" aria-hidden /> What your results mean
                </h3>
                <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-slate-700">{latest.explanation}</p>
                {latest.prescription && (
                  <div className="mt-4 rounded-xl bg-slate-50 p-3">
                    <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Doctor&apos;s prescription</p>
                    <p className="mt-1 text-sm whitespace-pre-line text-slate-800">{latest.prescription}</p>
                  </div>
                )}
              </div>
            )}
            <div className="grid gap-4 lg:grid-cols-2">
              {latest.groups.map((g) => (
                <div key={g.id} className="rounded-2xl bg-white px-5 py-3 shadow-sm ring-1 ring-slate-200">
                  <h3 className="pt-1 text-sm font-semibold text-teal-800">{g.name}</h3>
                  <ul className="divide-y divide-slate-100">
                    {g.results.map((r) => (
                      <ResultRow key={r.testKey} r={r} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Section>

          {record.trends.length > 0 && (
            <Section icon={<LineChart className="size-5 text-teal-600" aria-hidden />} title="How your results have changed">
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Changes over time</h3>
                {record.changes.length > 0 ? (
                  <ul className="mt-2 space-y-2 text-sm leading-relaxed text-slate-700">
                    {record.changes.map((c) => (
                      <li key={c} className="flex gap-2">
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-teal-600" aria-hidden />
                        <span>{c}</span>
                      </li>
                    ))}
                    <li className="flex gap-2 text-slate-500">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-slate-300" aria-hidden />
                      <span>Your other results have stayed about the same.</span>
                    </li>
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-slate-700">Your results have stayed about the same over time.</p>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {record.trends.map((t) => (
                  <div key={t.key} className="space-y-2">
                    <TrendChart title={t.title} unit={t.unit} decimals={t.decimals} points={t.points} range={t.range} />
                    <p className="px-1 text-sm text-slate-700">{t.sentence}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {record.plan && (
            <Section icon={<ClipboardList className="size-5 text-teal-600" aria-hidden />} title="Your treatment plan">
              {record.warningSigns && <WarningSignsCard />}
              <div className="rounded-2xl bg-teal-50/50 p-5 ring-1 ring-teal-100">
                <PlanView plan={record.plan} />
              </div>
            </Section>
          )}

          <Section icon={<History className="size-5 text-teal-600" aria-hidden />} title="Report history">
            <ul className="space-y-3">
              {record.reports.map((r, i) => (
                <li key={r.reportId} className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
                  <details open={i === 0 && older.length === 0} className="group p-4">
                    <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-2">
                      <span className="font-semibold text-slate-900">
                        {format(parseISO(r.date), "d MMMM yyyy")}
                        {i === 0 && <span className="ml-2 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">Latest</span>}
                      </span>
                      <span className="text-xs text-slate-500">
                        {r.specimenTitle} · {r.labName} · approved by {r.approvedBy}
                      </span>
                    </summary>
                    <p className="mt-2 text-xs text-slate-500">{r.presenting}</p>
                    {r.explanation && <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-slate-700">{r.explanation}</p>}
                    {r.prescription && (
                      <div className="mt-3 rounded-xl bg-slate-50 p-3">
                        <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Doctor&apos;s prescription</p>
                        <p className="mt-1 text-sm whitespace-pre-line text-slate-800">{r.prescription}</p>
                      </div>
                    )}
                  </details>
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}

      <Section icon={<Watch className="size-5 text-teal-600" aria-hidden />} title="Your watch">
        <WearablePanel patientId={patientId} audience="patient" />
      </Section>
    </div>
  );
}
