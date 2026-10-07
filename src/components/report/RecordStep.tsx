"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  FileText,
  HeartPulse,
  Minus,
  Phone,
  Pill,
  ShieldAlert,
  Stethoscope,
} from "lucide-react";
import type { ReactNode } from "react";
import { Sparkline } from "@/components/charts/Sparkline";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { recordTimeline, sparklineKeys } from "@/lib/record";
import { formatRange, trendDecimals, trendName, trendRange, trendUnit } from "@/lib/review";
import { formatValue, rangeText, TESTS } from "@/lib/tests";
import { computeTrends, findTrend, seriesFor } from "@/lib/trends";
import type { Finding, Patient, Report } from "@/lib/types";
import { cn } from "@/lib/utils";
import { approvedVersion } from "@/lib/versions";
import { OrderTestButton } from "@/components/workflow/OrderTestDialog";
import { ReportStatusBadge } from "./badges";
import { ConsentSummary } from "@/components/wearable/ConsentSummary";
import { useInaraStore } from "@/store/useInaraStore";

function Card({ title, icon, children, className }: { title: string; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200", className)}>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
        {icon && <span className="text-slate-400">{icon}</span>}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="truncate text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

function PastReportDialog({ report, patient, onClose }: { report: Report | null; patient: Patient; onClose: () => void }) {
  const approved = report ? approvedVersion(report) : undefined;
  return (
    <Dialog open={!!report} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        {report && (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">
                Lab report · {format(parseISO(report.date), "d MMM yyyy")}
              </DialogTitle>
              <p className="text-xs text-slate-500">
                {report.labName} · read-only · {approved ? `approved by ${approved.author}` : "not approved"}
              </p>
            </DialogHeader>
            {approved && (
              <div className="space-y-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Doctor’s note (approved)</p>
                  <p className="mt-1 text-sm whitespace-pre-line text-slate-800">{approved.text}</p>
                  {approved.prescription && (
                    <p className="mt-2 text-sm text-slate-700">
                      <span className="font-medium">Prescription: </span>
                      {approved.prescription}
                    </p>
                  )}
                </div>
              </div>
            )}
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="py-1.5">Test</th>
                  <th className="py-1.5 text-right">Value</th>
                  <th className="py-1.5 pl-4">Range</th>
                  <th className="py-1.5">Flag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.values.map((v) => (
                  <tr key={v.testKey}>
                    <td className="py-1.5 text-slate-800">{TESTS[v.testKey].name}</td>
                    <td className="py-1.5 text-right font-medium tabular-nums">
                      {TESTS[v.testKey].qualitative ? (
                        formatValue(v.testKey, v.value)
                      ) : (
                        <>
                          {v.qualifier ?? ""}
                          {v.value.toFixed(TESTS[v.testKey].decimals)} <span className="text-xs text-slate-500">{v.unit}</span>
                        </>
                      )}
                    </td>
                    <td className="py-1.5 pl-4 text-slate-500 tabular-nums">{rangeText(v.testKey, patient.sex)}</td>
                    <td className={cn("py-1.5 text-xs font-medium", v.flag === "normal" ? "text-green-700" : "text-red-700")}>
                      {v.flag === "normal" ? "Normal" : v.flag === "high" ? "High" : "Low"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function RecordStep({
  patient,
  reports,
  findings,
  doctorName,
  onOpenLatest,
  readOnly = false,
}: {
  patient: Patient;
  reports: Report[];
  findings: Finding[];
  doctorName: string;
  onOpenLatest: () => void;
  /** Temporary (shared) access: no ordering tests, no review actions. */
  readOnly?: boolean;
}) {
  const [openReport, setOpenReport] = useState<Report | null>(null);
  const settings = useInaraStore((s) => s.patientSettings.find((p) => p.patientId === patient.id));
  const latest = reports.at(-1);
  const timeline = useMemo(() => recordTimeline(patient, reports), [patient, reports]);
  const trends = useMemo(() => computeTrends(patient, reports), [patient, reports]);
  const keys = useMemo(() => sparklineKeys(findings), [findings]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          {readOnly
            ? "Doctor-approved reports and the patient’s history, shared with you for a limited time."
            : "The patient’s current health situation, before looking at the new lab report."}
        </p>
        {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <OrderTestButton patient={patient} doctorName={doctorName} />
          <Button size="lg" className="h-10 bg-teal-600 px-4 text-white hover:bg-teal-700" onClick={onOpenLatest} disabled={!latest}>
            Open latest lab report <ArrowRight />
          </Button>
        </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <Card title="Patient summary" icon={<Stethoscope className="size-4" />}>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Fact label="Age · sex">
                  {patient.age} · {patient.sex === "M" ? "Male" : "Female"}
                  {patient.pregnant ? " (pregnant)" : ""}
                </Fact>
                <Fact label="Blood group">{patient.bloodGroup}</Fact>
                <Fact label="Phone">
                  <span className="inline-flex items-center gap-1">
                    <Phone className="size-3 text-slate-400" aria-hidden />
                    {patient.phone}
                  </span>
                </Fact>
                <Fact label="Patient ID">
                  <span className="font-mono text-xs">{patient.id.toUpperCase()}</span>
                </Fact>
                <div className="col-span-2">
                  <Fact label="Reason for this test (suspected)">{patient.suspectedDisease}</Fact>
                </div>
              </dl>
            </Card>

            <Card title="Conditions & allergies" icon={<HeartPulse className="size-4" />}>
              <p className="text-xs text-slate-500">Chronic conditions</p>
              {patient.chronicConditions.length ? (
                <ul className="mt-1 flex flex-wrap gap-2">
                  {patient.chronicConditions.map((c) => (
                    <li key={c} className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm text-slate-800">
                      {c}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-slate-700">None recorded</p>
              )}
              {patient.pastIllnesses?.length ? (
                <>
                  <p className="mt-4 text-xs text-slate-500">Past illnesses</p>
                  <ul className="mt-1 flex flex-wrap gap-2">
                    {patient.pastIllnesses.map((c) => (
                      <li key={c} className="rounded-lg bg-amber-50 px-2.5 py-1 text-sm text-amber-900 ring-1 ring-amber-200">
                        {c}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              <p className="mt-4 text-xs text-slate-500">Allergies</p>
              {patient.allergies.length ? (
                <ul className="mt-1 flex flex-wrap gap-2">
                  {patient.allergies.map((a) => (
                    <li
                      key={a}
                      className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1 text-sm font-medium text-red-700 ring-1 ring-red-200"
                    >
                      <ShieldAlert className="size-3.5" aria-hidden />
                      {a}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-slate-700">None known</p>
              )}
            </Card>
          </div>

          <ConsentSummary settings={settings} />

          <Card title="Current medications" icon={<Pill className="size-4" />}>
            {patient.currentMedications.length === 0 ? (
              <p className="text-sm text-slate-500">No current medications.</p>
            ) : (
              <div className="overflow-hidden rounded-xl ring-1 ring-slate-100">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Medicine</th>
                      <th className="px-3 py-2">Dose</th>
                      <th className="px-3 py-2">Frequency</th>
                      <th className="px-3 py-2">Since</th>
                      <th className="px-3 py-2">Prescribed by</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {patient.currentMedications.map((m, i) => (
                      <tr key={`${m.name}-${i}`} className={cn(m.stopped && "bg-slate-50/60 text-slate-400")}>
                        <td className={cn("px-3 py-2 font-medium", m.stopped ? "text-slate-500" : "text-slate-900")}>
                          <span className={cn(m.stopped && "line-through")}>{m.name}</span>
                          {m.stopped ? (
                            <span className="block text-xs font-normal text-red-700">
                              Stopped {format(parseISO(m.stopped.date), "d MMM yyyy")} by {m.stopped.by} — {m.stopped.reason}
                            </span>
                          ) : (
                            m.note && <span className="block text-xs font-normal text-slate-500">{m.note}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-700">{m.dose}</td>
                        <td className="px-3 py-2 text-slate-700">{m.frequency}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                          {/^\d{4}-\d{2}-\d{2}$/.test(m.since) ? format(parseISO(m.since), "d MMM yyyy") : m.since}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2",
                            /self/i.test(m.prescribedBy) ? "font-medium text-orange-700" : "text-slate-700",
                          )}
                        >
                          {m.prescribedBy}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title={`Key values across ${reports.length} reports`} icon={<CalendarDays className="size-4" />}>
            {reports.length === 0 ? (
              <p className="text-sm text-slate-500">No reports yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {keys.map((key) => {
                  const points = seriesFor(patient, reports, key);
                  if (points.length === 0) return null;
                  const last = points[points.length - 1].value;
                  const { low, high } = trendRange(key, patient.sex);
                  const out = (low !== undefined && last < low) || (high !== undefined && last > high);
                  const t = findTrend(trends, key);
                  const dir = reports.length >= 2 ? t?.direction : undefined;
                  const Arrow = dir === "rising" ? ArrowUpRight : dir === "falling" ? ArrowDownRight : Minus;
                  return (
                    <div key={key} className="rounded-xl bg-slate-50 p-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-xs font-medium text-slate-600">{trendName(key)}</p>
                        <Arrow className="size-3.5 shrink-0 text-slate-500" aria-label={dir ?? "stable"} />
                      </div>
                      <p className={cn("text-base font-semibold tabular-nums", out ? "text-red-700" : "text-slate-900")}>
                        {last.toFixed(trendDecimals(key))}{" "}
                        <span className="text-xs font-normal text-slate-500">{key === "egfr" ? "" : TESTS[key].unit}</span>
                      </p>
                      <Sparkline values={points.map((p) => p.value)} out={out} />
                      <p className="text-[11px] text-slate-500">
                        Normal {formatRange(trendRange(key, patient.sex))} {key === "egfr" ? trendUnit(key) : ""}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Card title="Reports & visits" icon={<FileText className="size-4" />}>
            {timeline.length === 0 ? (
              <p className="text-sm text-slate-500">No history yet.</p>
            ) : (
              <ol className="space-y-1">
                {timeline.map((e, i) => {
                  const isLatest = e.kind === "report" && e.reportId === latest?.id;
                  return (
                    <li key={`${e.kind}-${e.date}-${i}`} className="relative pl-5">
                      {i < timeline.length - 1 && (
                        <span className="absolute top-4 left-[5px] h-full w-px bg-slate-200" aria-hidden />
                      )}
                      <span
                        className={cn(
                          "absolute top-2.5 left-0 size-2.5 rounded-full ring-4 ring-white",
                          e.kind === "report" ? "bg-teal-600" : "bg-slate-400",
                        )}
                      />
                      {e.kind === "report" ? (
                        <button
                          type="button"
                          onClick={() =>
                            isLatest ? onOpenLatest() : setOpenReport(reports.find((r) => r.id === e.reportId) ?? null)
                          }
                          className="w-full rounded-xl px-2 py-1.5 text-left hover:bg-teal-50"
                        >
                          <p className="text-xs text-slate-500">{format(parseISO(e.date), "d MMM yyyy")}</p>
                          <p className="text-sm font-medium text-slate-900">{isLatest ? "Latest lab report" : e.title}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <ReportStatusBadge status={e.status} />
                            <span className="text-xs text-slate-500">
                              {e.abnormalCount} value{e.abnormalCount === 1 ? "" : "s"} out of range
                            </span>
                          </div>
                        </button>
                      ) : (
                        <div className="px-2 py-1.5">
                          <p className="text-xs text-slate-500">{format(parseISO(e.date), "d MMM yyyy")} · Visit</p>
                          <p className="text-sm font-medium text-slate-900">{e.title}</p>
                          <p className="text-xs text-slate-600">{e.note}</p>
                          <p className="text-[11px] text-slate-400">{e.doctor}</p>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </aside>
      </div>

      <PastReportDialog report={openReport} patient={patient} onClose={() => setOpenReport(null)} />
    </div>
  );
}
