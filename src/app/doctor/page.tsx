"use client";

import { useMemo } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { CalendarDays, ChevronRight, Stethoscope } from "lucide-react";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { SeverityBadge, StageBadge } from "@/components/report/badges";
import { getFindings } from "@/lib/findings";
import { reviewStage, riskOf, sortDashboard } from "@/lib/review";
import { cn } from "@/lib/utils";
import { selectReports, useCurrentUser, useInaraStore } from "@/store/useInaraStore";

const RISK_BAR = { high: "bg-red-500", watch: "bg-amber-400", normal: "bg-green-500" } as const;

export default function DoctorPage() {
  const doctor = useCurrentUser();
  const patients = useInaraStore((s) => s.patients);
  const reports = useInaraStore((s) => s.reports);
  const plans = useInaraStore((s) => s.treatmentPlans);

  const rows = useMemo(() => {
    const mine = new Set(doctor?.patientIds ?? []);
    return sortDashboard(
      patients
        .filter((p) => mine.has(p.id))
        .map((patient) => {
          const history = selectReports(reports, patient.id);
          const latest = history.at(-1);
          return {
            patient,
            name: patient.name,
            latest,
            stage: latest ? reviewStage(latest, plans) : undefined,
            risk: riskOf(getFindings(patient, history)),
          };
        }),
    );
  }, [doctor, patients, reports, plans]);

  const awaiting = rows.filter((r) => r.stage === "awaiting_review").length;
  const planPending = rows.filter((r) => r.stage === "plan_pending").length;

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
          <p className="mb-4 text-sm text-slate-600">
            <span className="font-semibold text-slate-900">
              {rows.length} patient{rows.length === 1 ? "" : "s"}
            </span>
            {" · "}
            <span className={cn(awaiting > 0 && "font-semibold text-sky-700")}>
              {awaiting} report{awaiting === 1 ? "" : "s"} awaiting review
            </span>
            {planPending > 0 && (
              <>
                {" · "}
                <span className="font-semibold text-violet-700">
                  {planPending} treatment plan{planPending === 1 ? "" : "s"} pending
                </span>
              </>
            )}
          </p>
          <ul className="space-y-3">
            {rows.map(({ patient, latest, stage, risk }) => (
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
                      Suspected: {patient.suspectedDisease}
                    </p>
                    {latest && (
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                        <CalendarDays className="size-3.5 text-slate-400" aria-hidden />
                        Latest report {format(parseISO(latest.date), "d MMM yyyy")} · {latest.labName}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <SeverityBadge severity={risk} prefix="Risk:" />
                    {stage ? (
                      <StageBadge stage={stage} />
                    ) : (
                      <span className="text-xs text-slate-500">No reports yet</span>
                    )}
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
