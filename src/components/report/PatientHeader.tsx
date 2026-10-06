import { format, parseISO } from "date-fns";
import { ShieldAlert } from "lucide-react";
import type { Patient, Report, ReportStatus } from "@/lib/types";
import { ReportStatusBadge } from "./badges";

/** Compact header shown above every step. Full details are on the Patient record step. */
export function PatientHeader({ patient, report, status }: { patient: Patient; report: Report; status: ReportStatus }) {
  const initials = patient.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);
  return (
    <section className="flex flex-wrap items-center gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-teal-600 text-base font-semibold text-white">
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">{patient.name}</h1>
        <p className="text-sm text-slate-600">
          {patient.age} y · {patient.sex === "M" ? "Male" : "Female"}
          {patient.pregnant ? " · Pregnant" : ""} · {patient.bloodGroup} · Suspected: {patient.suspectedDisease}
        </p>
      </div>
      {patient.allergies.length > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 ring-1 ring-red-200">
          <ShieldAlert className="size-3.5" aria-hidden />
          Allergy: {patient.allergies.join(", ")}
        </span>
      )}
      <div className="flex flex-col items-end gap-1">
        <ReportStatusBadge status={status} />
        <p className="text-xs text-slate-500">Latest report {format(parseISO(report.date), "d MMM yyyy")}</p>
      </div>
    </section>
  );
}
