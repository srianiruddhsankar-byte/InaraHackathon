"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Clock, HeartPulse, Lock, Phone, Pill, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/layout/EmptyState";
import { PlanView } from "@/components/report/PlanView";
import { RawLabReport } from "@/components/report/RawLabReport";
import { RecordStep } from "@/components/report/RecordStep";
import { findingsContextFor } from "@/lib/caseContext";
import { getFindings } from "@/lib/findings";
import { activeGrant, emergencyView, formatCountdown, remainingMs } from "@/lib/recordAccess";
import { approvedPlan } from "@/lib/treatment";
import { approvedVersion, isApproved } from "@/lib/versions";
import { caseForReport } from "@/lib/workflow";
import { cn } from "@/lib/utils";
import { selectReports, useCurrentUser, useInaraStore } from "@/store/useInaraStore";
import { useNow } from "./useNow";

const TABS = [
  { id: "emergency", label: "Emergency summary" },
  { id: "record", label: "Patient's Record" },
  { id: "lab", label: "Lab Report" },
  { id: "report", label: "Approved report & plan" },
] as const;
type Tab = (typeof TABS)[number]["id"];

/**
 * A record shared with a doctor for a limited time (QR / patient ID + patient OTP).
 * Read-only, approved reports only; locks itself the moment access expires or is revoked.
 */
export function SharedRecord({ patientId }: { patientId: string }) {
  const doctor = useCurrentUser();
  const requests = useInaraStore((s) => s.accessRequests);
  const now = useNow();
  const grant = useMemo(() => (doctor ? activeGrant(requests, doctor.id, patientId, now) : undefined), [requests, doctor, patientId, now]);

  if (!grant) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <EmptyState title="No access to this record">
          <span className="inline-flex items-center gap-1.5">
            <Lock className="size-4" aria-hidden /> Access has ended, was revoked by the patient, or was never granted.
          </span>{" "}
          <Link href="/doctor/access" className="text-teal-700 hover:underline">
            Request access again
          </Link>
        </EmptyState>
      </div>
    );
  }
  return <Granted key={grant.id} patientId={patientId} requestId={grant.id} scope={grant.scope ?? "full"} left={remainingMs(grant, now)} />;
}

function Granted({ patientId, requestId, scope, left }: { patientId: string; requestId: string; scope: "full" | "emergency"; left: number }) {
  const patient = useInaraStore((s) => s.patients.find((p) => p.id === patientId));
  const settings = useInaraStore((s) => s.patientSettings.find((p) => p.patientId === patientId));
  const allReports = useInaraStore((s) => s.reports);
  const plans = useInaraStore((s) => s.treatmentPlans);
  const cases = useInaraStore((s) => s.cases);
  const wearableEvents = useInaraStore((s) => s.wearableEvents);
  const logRecordView = useInaraStore((s) => s.logRecordView);
  const [tab, setTab] = useState<Tab>("emergency");
  const tabs = scope === "emergency" ? TABS.filter((t) => t.id === "emergency") : TABS;
  const label = TABS.find((t) => t.id === tab)!.label;

  // The patient's access log shows which parts were opened.
  useEffect(() => {
    logRecordView(requestId, label);
  }, [logRecordView, requestId, label]);

  // Approved reports only: drafts stay with the treating doctor.
  const reports = useMemo(() => selectReports(allReports, patientId).filter(isApproved), [allReports, patientId]);
  const latest = reports.at(-1);
  const findings = useMemo(
    () => (patient ? getFindings(patient, reports, findingsContextFor(latest ? caseForReport(cases, latest.id) : undefined, wearableEvents)) : []),
    [patient, reports, latest, cases, wearableEvents],
  );
  if (!patient) return <EmptyState title="Patient not found" />;
  const emergency = emergencyView(patient, settings);
  const approved = latest ? approvedVersion(latest) : undefined;
  const plan = latest ? approvedPlan(plans, latest.id) : undefined;
  const soon = left < 5 * 60_000;

  return (
    <div className="space-y-6">
      <div
        className={cn(
          "sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-2xl px-5 py-3 shadow-sm ring-1",
          soon ? "bg-red-50 text-red-900 ring-red-200" : "bg-teal-50 text-teal-900 ring-teal-200",
        )}
        role="status"
      >
        <Clock className="size-5" aria-hidden />
        <p className="text-sm">
          <span className="font-semibold">Temporary access · {formatCountdown(left)} left</span> · approved by the patient with a
          one-time code · {scope === "emergency" ? "emergency view only" : "read-only, approved reports"}
        </p>
        <Link href="/doctor" className="ml-auto text-sm font-medium underline">
          My patients
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{patient.name}</h1>
        <p className="mt-1 text-slate-600">
          {patient.age} · {patient.sex === "M" ? "Male" : "Female"} · Patient ID {patient.publicId}
        </p>
      </div>

      {tabs.length > 1 && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Shared record sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-xl px-4 py-2 text-sm font-medium ring-1",
                tab === t.id ? "bg-teal-600 text-white ring-teal-600" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === "emergency" && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Blood group" icon={<HeartPulse className="size-4" />}>
            <p className="text-3xl font-bold text-slate-900">{emergency.bloodGroup}</p>
          </Card>
          <Card title="Allergies" icon={<ShieldAlert className="size-4" />}>
            {emergency.allergies.length ? (
              <ul className="list-disc pl-5 text-sm font-medium text-red-800">
                {emergency.allergies.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-600">No known allergies recorded.</p>
            )}
          </Card>
          <Card title="Current medicines" icon={<Pill className="size-4" />}>
            {emergency.medicines.length ? (
              <ul className="space-y-1 text-sm">
                {emergency.medicines.map((m) => (
                  <li key={m.name}>
                    <span className="font-medium text-slate-900">{m.name}</span> <span className="text-slate-600">{m.dose} · {m.frequency}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-600">None recorded.</p>
            )}
          </Card>
          <Card title="Emergency contact" icon={<Phone className="size-4" />}>
            {emergency.emergencyContact ? (
              <p className="text-sm">
                <span className="font-medium text-slate-900">{emergency.emergencyContact.name}</span>{" "}
                <span className="text-slate-600">({emergency.emergencyContact.relation})</span>
                <br />
                <a href={`tel:${emergency.emergencyContact.phone.replace(/\s/g, "")}`} className="text-teal-700 hover:underline">
                  {emergency.emergencyContact.phone}
                </a>
              </p>
            ) : (
              <p className="text-sm text-slate-600">No emergency contact recorded.</p>
            )}
          </Card>
        </div>
      )}
      {tab === "record" && (
        <RecordStep patient={patient} reports={reports} findings={findings} doctorName="" readOnly onOpenLatest={() => setTab("report")} />
      )}
      {tab === "lab" && <RawLabReport reports={[...reports].reverse()} audience="doctor" downloads={false} />}
      {tab === "report" &&
        (latest && approved ? (
          <div className="space-y-4">
            <Card title={`Approved report · ${format(parseISO(latest.date), "d MMM yyyy")} · ${latest.labName}`}>
              <p className="text-xs text-slate-500">Approved by {approved.author}</p>
              <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-slate-700">{approved.text}</p>
              {approved.prescription && (
                <div className="mt-4 rounded-xl bg-slate-50 p-3">
                  <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Doctor&apos;s prescription</p>
                  <p className="mt-1 text-sm whitespace-pre-line text-slate-800">{approved.prescription}</p>
                </div>
              )}
            </Card>
            {plan ? <PlanView plan={plan} forDoctor /> : <p className="text-sm text-slate-500">No approved treatment plan for this report.</p>}
          </div>
        ) : (
          <EmptyState title="No approved reports yet" />
        ))}
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
        {icon && <span className="text-slate-400">{icon}</span>}
        {title}
      </h2>
      {children}
    </section>
  );
}
