"use client";

import { useMemo } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { AlertTriangle, BellDot, BellRing, CalendarDays, ChevronRight, FlaskConical, Stethoscope, Watch } from "lucide-react";
import { AccessPatientButton, SharedWithMe } from "@/components/access/SharedWithMe";
import { ConsentBadge } from "@/components/access/ConsentBadge";
import { ConsentNeededAlerts, ResultsAwaitingConsent } from "@/components/access/ConsentNeeded";
import { useNow } from "@/components/access/useNow";
import { fullGrant, grantedPatientIds, resultsAwaitingConsent, splitAlerts } from "@/lib/recordAccess";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { SeverityBadge } from "@/components/report/badges";
import { StageChip } from "@/components/workflow/StageChip";
import { getFindings } from "@/lib/findings";
import { presentingFor, presentingLine } from "@/lib/presenting";
import { riskOf, sortDashboard } from "@/lib/review";
import { activeCase, caseForReport, DASHBOARD_GROUPS, dashboardGroup, panelName } from "@/lib/workflow";
import { findingsContextFor } from "@/lib/caseContext";
import { formatIst, openAlerts } from "@/lib/wearable/checkin";
import { cn } from "@/lib/utils";
import { selectReports, useCurrentUser, useInaraStore } from "@/store/useInaraStore";

const RISK_BAR = { high: "bg-red-500", watch: "bg-amber-400", normal: "bg-green-500" } as const;

export default function DoctorPage() {
  const doctor = useCurrentUser();
  const patients = useInaraStore((s) => s.patients);
  const reports = useInaraStore((s) => s.reports);
  const cases = useInaraStore((s) => s.cases);
  const wearableEvents = useInaraStore((s) => s.wearableEvents);
  const requests = useInaraStore((s) => s.accessRequests);
  const settings = useInaraStore((s) => s.patientSettings);
  const users = useInaraStore((s) => s.users);
  const now = useNow();
  // Only patients who gave this doctor consent (QR / patient ID + one-time code) — no standing access.
  const grantedKey = grantedPatientIds(requests, doctor?.id, now).join(",");
  const granted = useMemo(() => (grantedKey ? grantedKey.split(",") : []), [grantedKey]);
  // Alerts: the treating doctor's patients and anyone who gave consent. Without consent: a limited card.
  const { full: alerts, consentNeeded } = useMemo(
    () =>
      splitAlerts(openAlerts(wearableEvents, [...new Set([...(doctor?.patientIds ?? []), ...granted])]), granted, {
        patients,
        settings,
        users,
      }),
    [wearableEvents, doctor, granted, patients, settings, users],
  );
  const awaiting = useMemo(() => resultsAwaitingConsent(cases, doctor?.name, granted), [cases, doctor, granted]);

  const rows = useMemo(() => {
    const mine = new Set(granted);
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
            risk: riskOf(getFindings(patient, history, findingsContextFor(latest ? caseForReport(cases, latest.id) : undefined, wearableEvents))),
          };
        }),
    );
  }, [granted, patients, reports, cases, wearableEvents]);
  const badge = (patientId: string) => {
    const g = doctor ? fullGrant(requests, doctor.id, patientId, now) : undefined;
    return g ? <ConsentBadge request={g} /> : null;
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="My patients"
          subtitle={doctor?.specialty ? `${doctor.name} · ${doctor.specialty}` : "Reports waiting for your review."}
        />
        <AccessPatientButton />
      </div>
      <SharedWithMe />
      {(consentNeeded.length > 0 || awaiting.length > 0) && (
        <div className="mb-8 space-y-8">
          <ConsentNeededAlerts alerts={consentNeeded} />
          <ResultsAwaitingConsent cases={awaiting} />
        </div>
      )}
      {rows.length === 0 ? (
        <EmptyState title="No access — ask the patient to share via QR">
          Every doctor needs the patient&apos;s consent. Use “Access a patient” and scan their QR code or type their
          patient ID; the patient allows it and reads you a one-time code.
        </EmptyState>
      ) : (
        <>
          <div className="space-y-8">
            {alerts.length > 0 && (
              <section aria-labelledby="group-alerts">
                <div className="mb-3 flex items-baseline gap-2">
                  <h2 id="group-alerts" className="flex items-center gap-1.5 text-sm font-semibold text-red-700">
                    <BellRing className="size-4" aria-hidden /> Wearable alerts
                  </h2>
                  <span className="rounded-full bg-red-100 px-2 text-xs font-medium text-red-700">{alerts.length}</span>
                  <span className="hidden text-xs text-slate-500 sm:inline">Urgent first · from patients&apos; watch data and check-ins.</span>
                </div>
                <ul className="space-y-3">
                  {alerts.map(({ episode, level, at, hasRedFlag }) => {
                    const patient = patients.find((p) => p.id === episode.patientId);
                    const rec = episode.latest!.recommendation;
                    return (
                      <li key={episode.episodeId}>
                        <Link
                          href={`/doctor/${episode.patientId}?section=wearable`}
                          className="group relative flex flex-wrap items-center gap-4 overflow-hidden rounded-2xl bg-white py-5 pr-5 pl-7 shadow-sm ring-1 ring-slate-200 transition-shadow hover:shadow-md"
                        >
                          <span className={cn("absolute inset-y-0 left-0 w-1.5", level === "urgent" ? "bg-red-600" : "bg-amber-400")} aria-hidden />
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                              {patient?.name ?? episode.patientId}
                              <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", level === "urgent" ? "bg-red-600 text-white" : "bg-amber-100 text-amber-800")}>
                                {level === "urgent" ? "Urgent" : "See doctor within 24 h"}
                              </span>
                              {hasRedFlag && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-200">
                                  <AlertTriangle className="size-3" aria-hidden /> Red flag: {rec.redFlags.join(", ").replace(/your /g, "")}
                                </span>
                              )}
                              {episode.acknowledged && <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700 ring-1 ring-teal-200">Acknowledged</span>}
                            </p>
                            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                              <Watch className="size-3.5 text-slate-400" aria-hidden />
                              {episode.snapshot.patternName} (concerning) · {formatIst(at)}
                            </p>
                          </div>
                          <ChevronRight className="size-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            {DASHBOARD_GROUPS.map((g) => {
              const inGroup = rows.filter((r) => r.case && r.group === g.id);
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
                                {presentingLine(presentingFor(patient, c))}
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
                              {c?.stage === "results_uploaded" && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-teal-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                                  <BellDot className="size-3.5" aria-hidden /> New results
                                </span>
                              )}
                              {badge(patient.id)}
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
            {rows.some((r) => !r.case) && (
              <section aria-labelledby="group-monitoring">
                <div className="mb-3 flex items-baseline gap-2">
                  <h2 id="group-monitoring" className="text-sm font-semibold text-slate-900">
                    Wearable monitoring
                  </h2>
                  <span className="rounded-full bg-slate-100 px-2 text-xs font-medium text-slate-600">{rows.filter((r) => !r.case).length}</span>
                  <span className="hidden text-xs text-slate-500 sm:inline">No lab orders — watched by their wearable.</span>
                </div>
                <ul className="space-y-3">
                  {rows
                    .filter((r) => !r.case)
                    .map(({ patient }) => (
                      <li key={patient.id}>
                        <Link
                          href={`/doctor/${patient.id}`}
                          className="group relative flex flex-wrap items-center gap-4 overflow-hidden rounded-2xl bg-white py-5 pr-5 pl-7 shadow-sm ring-1 ring-slate-200 transition-shadow hover:shadow-md"
                        >
                          <span className="absolute inset-y-0 left-0 w-1.5 bg-sky-400" aria-hidden />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-slate-900">
                              {patient.name}{" "}
                              <span className="font-normal text-slate-500">
                                · {patient.age} · {patient.sex === "M" ? "Male" : "Female"}
                                {patient.area ? ` · ${patient.area}, ${patient.city}` : ""}
                              </span>
                            </p>
                            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                              <Watch className="size-3.5 text-slate-400" aria-hidden />
                              Wearable streaming · no open lab orders
                            </p>
                          </div>
                          {badge(patient.id)}
                          <ChevronRight className="size-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                        </Link>
                      </li>
                    ))}
                </ul>
              </section>
            )}
          </div>
        </>
      )}
    </>
  );
}
