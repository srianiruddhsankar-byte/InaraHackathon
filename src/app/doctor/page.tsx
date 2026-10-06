"use client";

import { useMemo } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { CalendarDays, ChevronRight, FlaskConical, Stethoscope } from "lucide-react";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { SeverityBadge } from "@/components/report/badges";
import { StageChip } from "@/components/workflow/StageChip";
import { getFindings } from "@/lib/findings";
import { riskOf, sortDashboard } from "@/lib/review";
import { activeCase, DASHBOARD_GROUPS, dashboardGroup, panelName } from "@/lib/workflow";
import { cn } from "@/lib/utils";
import { selectReports, useCurrentUser, useInaraStore } from "@/store/useInaraStore";

const RISK_BAR = { high: "bg-red-500", watch: "bg-amber-400", normal: "bg-green-500" } as const;

export default function DoctorPage() {
  const doctor = useCurrentUser();
  const patients = useInaraStore((s) => s.patients);
  const reports = useInaraStore((s) => s.reports);
  const cases = useInaraStore((s) => s.cases);

  const rows = useMemo(() => {
    const mine = new Set(doctor?.patientIds ?? []);
    return sortDashboard(
      patients
        .filter((p) => mine.has(p.id))
        .map((patient) => {
          const history = selectReports(reports, patient.id);
          const latest = history.at(-1);
          const c = activeCase(cases, patient.id);
          return {
            patient,
            name: patient.name,
            latest,
            case: c,
            group: c ? dashboardGroup(c.stage) : ("awaiting_lab" as const),
            risk: riskOf(getFindings(patient, history)),
          };
        }),
    );
  }, [doctor, patients, reports, cases]);

  return (
    <>
      <PageHeader
        title="My patients"
        subtitle={doctor?.specialty ? `${doctor.name} · ${doctor.specialty}` : "Reports waiting for your review."}
      />
      {rows.length === 0 ? (
        <EmptyState title="No patients yet">Patients appear here when they share their record with you.</EmptyState>
      ) : (
        <>
          <div className="space-y-8">
            {DASHBOARD_GROUPS.map((g) => {
              const inGroup = rows.filter((r) => r.group === g.id);
              return (
                <section key={g.id} aria-labelledby={`group-${g.id}`}>
                  <div className="mb-3 flex items-baseline gap-2">
                    <h2 id={`group-${g.id}`} className="text-sm font-semibold text-slate-900">
                      {g.label}
                    </h2>
                    <span className="rounded-full bg-slate-100 px-2 text-xs font-medium text-slate-600">{inGroup.length}</span>
                    <span className="hidden text-xs text-slate-500 sm:inline">{g.hint}</span>
                  </div>
                  {inGroup.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-400">None right now.</p>
                  ) : (
                    <ul className="space-y-3">
                      {inGroup.map(({ patient, latest, case: c, risk }) => (
                        <li key={patient.id}>
                          <Link
                            href={`/doctor/${patient.id}`}
                            className="group relative flex flex-wrap items-center gap-4 overflow-hidden rounded-2xl bg-white py-5 pr-5 pl-7 shadow-sm ring-1 ring-slate-200 transition-shadow hover:shadow-md"
                          >
                            <span className={cn("absolute inset-y-0 left-0 w-1.5", RISK_BAR[risk])} aria-hidden />
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-slate-900">
                                {patient.name}{" "}
                                <span className="font-normal text-slate-500">
                                  · {patient.age} · {patient.sex === "M" ? "Male" : "Female"}
                                </span>
                              </p>
                              <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                                <Stethoscope className="size-3.5 text-slate-400" aria-hidden />
                                Suspected: {c?.suspectedDisease ?? patient.suspectedDisease}
                              </p>
                              {c && !c.reportId ? (
                                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                                  <FlaskConical className="size-3.5 text-slate-400" aria-hidden />
                                  Ordered: {c.panels.map(panelName).join(", ")}
                                  {c.urgency === "urgent" && <span className="font-medium text-red-700"> · Urgent</span>}
                                </p>
                              ) : (
                                latest && (
                                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                                    <CalendarDays className="size-3.5 text-slate-400" aria-hidden />
                                    Latest report {format(parseISO(latest.date), "d MMM yyyy")} · {latest.labName}
                                  </p>
                                )
                              )}
                            </div>
                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                              <SeverityBadge severity={risk} prefix="Risk:" />
                              {c ? <StageChip stage={c.stage} /> : <span className="text-xs text-slate-500">No orders yet</span>}
                            </div>
                            <ChevronRight className="size-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
