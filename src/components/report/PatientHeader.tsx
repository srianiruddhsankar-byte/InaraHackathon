import { format, parseISO } from "date-fns";
import { FlaskConical, HeartPulse, ShieldAlert, Stethoscope } from "lucide-react";
import type { ReactNode } from "react";
import type { Patient, Report, ReportStatus } from "@/lib/types";
import { ReportStatusBadge } from "./badges";

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-sm font-medium text-slate-800">{children}</p>
      </div>
    </div>
  );
}

export function PatientHeader({
  patient,
  report,
  status,
  reportCount,
  firstDate,
}: {
  patient: Patient;
  report: Report;
  status: ReportStatus;
  reportCount: number;
  firstDate: string;
}) {
  const initials = patient.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-teal-600 text-lg font-semibold text-white">
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">{patient.name}</h1>
          <p className="text-sm text-slate-600">
            {patient.age} years · {patient.sex === "M" ? "Male" : "Female"} · Blood group {patient.bloodGroup}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <ReportStatusBadge status={status} />
          <p className="text-xs text-slate-500">
            Report {format(parseISO(report.date), "d MMM yyyy")} · {report.labName}
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 md:grid-cols-4">
        <Fact icon={<Stethoscope className="size-4" />} label="Suspected condition">
          {patient.suspectedDisease}
        </Fact>
        <Fact icon={<ShieldAlert className="size-4" />} label="Allergies">
          {patient.allergies.length ? (
            <span className="text-red-700">{patient.allergies.join(", ")}</span>
          ) : (
            "None known"
          )}
        </Fact>
        <Fact icon={<HeartPulse className="size-4" />} label="Chronic conditions">
          {patient.chronicConditions.length ? patient.chronicConditions.join(", ") : "None recorded"}
        </Fact>
        <Fact icon={<FlaskConical className="size-4" />} label="History">
          {reportCount} reports since {format(parseISO(firstDate), "MMM yyyy")}
        </Fact>
      </div>
    </section>
  );
}
