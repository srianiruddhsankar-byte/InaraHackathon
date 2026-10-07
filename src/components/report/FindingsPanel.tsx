"use client";

import { useMemo } from "react";
import { presentingFor, presentingLine } from "@/lib/presenting";
import { notesFor, type MedNote } from "@/lib/medContext";
import { chartKeysFor, findingChips, trendLabel } from "@/lib/review";
import { buildTrajectories } from "@/lib/trajectory";
import { findTrend } from "@/lib/trends";
import type { Finding, FindingEdit, FindingEdits, Patient, Report, Trend } from "@/lib/types";
import { FindingCard } from "./FindingCard";
import { TrajectoryPanel } from "./TrajectoryPanel";

export function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/** Findings (suspected first, then "Also detected") with include/edit controls, then the longitudinal trajectory analysis. */
export function FindingsPanel({
  patient,
  reports,
  findings,
  trends,
  medNotes,
  edits,
  locked,
  onEdit,
  onClearEdit,
  suspectedDisease,
  symptoms,
}: {
  patient: Patient;
  reports: Report[];
  findings: Finding[];
  trends: Trend[];
  medNotes: MedNote[];
  edits: FindingEdits;
  locked: boolean;
  onEdit: (findingId: string, patch: Partial<FindingEdit>) => void;
  onClearEdit: (findingId: string) => void;
  /** The case's suspected disease (defaults to the patient's). */
  suspectedDisease?: string;
  /** The case's presenting symptoms (defaults to the patient's). */
  symptoms?: string;
}) {
  const presenting = presentingFor(patient, { suspectedDisease, symptoms });
  const suspectedName = presenting.suspectedDisease;
  const primaryKeys = useMemo(() => chartKeysFor(findings), [findings]);
  const trajectories = useMemo(() => buildTrajectories(patient, reports), [patient, reports]);

  const suspected = findings.filter((f) => f.category === "suspected");
  const others = findings.filter((f) => f.category !== "suspected");
  const egfrLabel = (() => {
    const t = findTrend(trends, "egfr");
    const l = t && reports.length >= 2 ? trendLabel(t) : undefined;
    return l?.main === "Rapid decline" ? l : undefined;
  })();

  const card = (f: Finding, large = false) => (
    <FindingCard
      key={f.id}
      finding={f}
      edit={edits[f.id]}
      chips={findingChips(f, trends)}
      statusLabel={f.screen === "kidney" ? egfrLabel : undefined}
      notes={notesFor(medNotes, f.id)}
      large={large}
      readOnly={locked}
      onToggle={(included) => onEdit(f.id, { included })}
      onSaveWording={(w) => onEdit(f.id, w)}
      onResetWording={() =>
        edits[f.id]?.included === false
          ? onEdit(f.id, { title: undefined, summary: undefined, recommendation: undefined })
          : onClearEdit(f.id)
      }
    />
  );

  return (
    <div className="space-y-8">
      <section>
        <SectionTitle title="Suspected condition" hint={`Screened first · ${presentingLine(presenting)}`} />
        {suspected.length ? (
          <div className="space-y-4">{suspected.map((f) => card(f, true))}</div>
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
            {suspectedName
              ? `“${suspectedName}” does not map to a specific screen, so the whole panel was screened.`
              : "No suspected disease on this order, so the whole panel was screened."}
          </p>
        )}
      </section>

      <section>
        <SectionTitle
          title="Also detected from the same panel"
          hint={locked ? undefined : "Toggle or reword findings — your choices flow into the draft."}
        />
        <div className="grid gap-4 lg:grid-cols-2">{others.map((f) => card(f))}</div>
      </section>

      <TrajectoryPanel trajectories={trajectories} primaryKeys={primaryKeys} reportCount={reports.length} />
    </div>
  );
}
