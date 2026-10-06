"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import type { ReportStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { latestVersion } from "@/lib/versions";
import { selectReports, useCurrentUser, useInaraStore } from "@/store/useInaraStore";

const STATUS: Record<ReportStatus, { label: string; className: string }> = {
  ai_draft: { label: "AI draft · needs review", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  doctor_edited: { label: "Edited · not released", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  approved: { label: "Approved", className: "bg-green-50 text-green-800 ring-green-200" },
};

export default function DoctorPage() {
  const doctor = useCurrentUser();
  const patients = useInaraStore((s) => s.patients);
  const reports = useInaraStore((s) => s.reports);

  const rows = useMemo(() => {
    const mine = new Set(doctor?.patientIds ?? []);
    return patients
      .filter((p) => mine.has(p.id))
      .map((patient) => {
        const latest = selectReports(reports, patient.id).at(-1);
        return { patient, latest, status: latest ? latestVersion(latest)?.status : undefined };
      });
  }, [doctor, patients, reports]);

  return (
    <>
      <PageHeader
        title="My patients"
        subtitle={doctor?.specialty ? `${doctor.name} · ${doctor.specialty}` : "Reports waiting for your review."}
      />
      {rows.length === 0 ? (
        <EmptyState title="No patients yet">Patients appear here when they share their record with you.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ patient, latest, status }) => (
            <li key={patient.id}>
              <Link
                href={`/doctor/${patient.id}`}
                className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition-shadow hover:shadow-md"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">
                    {patient.name}{" "}
                    <span className="font-normal text-slate-500">
                      · {patient.age} {patient.sex}
                    </span>
                  </p>
                  <p className="mt-0.5 text-sm text-slate-600">Suspected: {patient.suspectedDisease}</p>
                  {latest && <p className="mt-0.5 text-xs text-slate-500">Latest report: {latest.date} · {latest.labName}</p>}
                </div>
                {status && (
                  <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1", STATUS[status].className)}>
                    {STATUS[status].label}
                  </span>
                )}
                <ChevronRight className="size-4 shrink-0 text-slate-400" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
