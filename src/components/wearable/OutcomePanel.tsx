"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CircleCheck, Database, History, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dengueMarkers } from "@/lib/rules";
import type { PrevalenceKey } from "@/lib/wearable/conditions";
import { formatIst, type EpisodeState } from "@/lib/wearable/checkin";
import {
  casesText,
  conditionForPattern,
  isOutcomeValid,
  learningUpdate,
  OUTCOME_CONDITIONS,
  outcomeLabel,
  pastIllnessEntry,
  POPULATION_STATUS,
  precisionText,
  statsQuery,
  type DoctorOutcome,
  type OutcomeStats,
} from "@/lib/wearable/outcomes";
import { resolveReference } from "@/lib/wearable/population";
import { cn } from "@/lib/utils";
import { useInaraStore } from "@/store/useInaraStore";
import { usePopulationStore } from "@/store/usePopulationStore";

const KINDS: { kind: DoctorOutcome["kind"]; label: string }[] = [
  { kind: "confirmed", label: "Confirmed" },
  { kind: "ruled_out", label: "Ruled out" },
  { kind: "other", label: "Other diagnosis" },
];

/**
 * Doctor: what the alert turned out to be. Recording it closes the alert and —
 * with the patient's population-share consent — updates the local population data.
 */
export function OutcomePanel({ episode }: { episode: EpisodeState }) {
  const patient = useInaraStore((s) => s.patients.find((p) => p.id === episode.patientId));
  const allSettings = useInaraStore((s) => s.patientSettings);
  const overlay = useInaraStore((s) => s.populationOutcomes);
  const reports = useInaraStore((s) => s.reports);
  const record = useInaraStore((s) => s.recordAlertOutcome);
  const { db, load } = usePopulationStore();
  useEffect(() => {
    void load();
  }, [load]);

  const snap = episode.snapshot;
  // NS1 / IgM positive on the patient's latest report → "lab-confirmed" is ticked by default.
  const labPositive = useMemo(() => {
    const latest = reports.filter((r) => r.patientId === episode.patientId).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
    const v = Object.fromEntries((latest?.values ?? []).map((x) => [x.testKey, x.value]));
    return !!dengueMarkers(v.ns1, v.dengue_igm)?.positive;
  }, [reports, episode.patientId]);

  const [kind, setKind] = useState<DoctorOutcome["kind"]>("confirmed");
  const [condition, setCondition] = useState<PrevalenceKey | "">(conditionForPattern(snap.patternId) ?? "");
  const [labConfirmed, setLabConfirmed] = useState(labPositive);
  const [otherText, setOtherText] = useState("");

  const reference = useMemo(() => (db && patient ? resolveReference(db, patient, allSettings) : null), [db, patient, allSettings]);
  const query = statsQuery(reference, snap.patternId, snap.date);
  const recorded = episode.outcome;
  const update = useMemo(
    () => (db && query && recorded?.recordId ? learningUpdate(db, overlay, recorded.recordId, query) : null),
    [db, query, overlay, recorded],
  );

  const draft: DoctorOutcome = {
    kind,
    labConfirmed: kind === "confirmed" && labConfirmed,
    ...(kind === "confirmed" && condition ? { condition } : {}),
    ...(kind === "other" ? { otherText } : {}),
  };
  const submit = () => {
    if (!isOutcomeValid(draft)) return;
    record(episode.episodeId, draft);
    toast.success("Outcome recorded — alert closed");
  };

  if (recorded) {
    const added = recorded.population === POPULATION_STATUS.added;
    const history = pastIllnessEntry(recorded.outcome, snap.date);
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200" aria-labelledby="outcome-title">
        <div className="flex flex-wrap items-center gap-2">
          <CircleCheck className="size-5 text-teal-600" aria-hidden />
          <h3 id="outcome-title" className="mr-auto font-semibold text-slate-900">
            Outcome · {outcomeLabel(recorded.outcome)}
          </h3>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">Alert closed</span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Recorded by {recorded.by} · {formatIst(recorded.at)}
        </p>
        {history && patient?.pastIllnesses?.includes(history) && (
          <p className="mt-3 flex items-center gap-2 text-sm text-slate-700">
            <History className="size-4 text-slate-400" aria-hidden /> Added to history: {history}
          </p>
        )}
        {added ? (
          update && <LearningUpdate before={update.before} after={update.after} />
        ) : (
          <p className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
            <ShieldOff className="size-4" aria-hidden /> Population data: not added — consent off (this patient doesn&apos;t share data with the local database).
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200" aria-labelledby="outcome-title">
      <h3 id="outcome-title" className="font-semibold text-slate-900">
        Record the outcome
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        What did this {snap.patternName.toLowerCase()} alert turn out to be? Closes the alert; the case carries on to approval and treatment. Recorded once.
      </p>
      <div className="mt-3 inline-flex rounded-lg bg-slate-100 p-1" role="radiogroup" aria-label="Outcome">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            role="radio"
            aria-checked={kind === k.kind}
            onClick={() => setKind(k.kind)}
            className={cn("rounded-md px-3 py-1.5 text-sm font-medium", kind === k.kind ? "bg-white text-slate-900 shadow-sm" : "text-slate-600")}
          >
            {k.label}
          </button>
        ))}
      </div>
      {kind === "confirmed" && (
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-800">
            Condition
            <select
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm"
              value={condition}
              onChange={(e) => setCondition(e.target.value as PrevalenceKey)}
            >
              <option value="" disabled>
                Choose…
              </option>
              {OUTCOME_CONDITIONS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-800">
            <input type="checkbox" className="size-4 accent-teal-600" checked={labConfirmed} onChange={(e) => setLabConfirmed(e.target.checked)} />
            Lab-confirmed{labPositive && <span className="text-xs text-slate-500">(NS1 / IgM positive on the latest report)</span>}
          </label>
        </div>
      )}
      {kind === "other" && (
        <label className="mt-3 block max-w-md text-sm text-slate-800">
          Diagnosis
          <Input className="mt-1" value={otherText} placeholder="e.g. Typhoid fever" onChange={(e) => setOtherText(e.target.value)} />
        </label>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button className="bg-teal-600 text-white hover:bg-teal-700" disabled={!isOutcomeValid(draft)} onClick={submit}>
          Record outcome
        </Button>
        <span className="text-xs text-slate-500">
          {allSettings.find((s) => s.patientId === episode.patientId)?.populationShare.granted
            ? "Population sharing is on: an anonymised outcome (area, month, condition — no name or ID) will update the local database."
            : "Population sharing is off: nothing will be added to the local database."}
        </span>
      </div>
    </section>
  );
}

function LearningUpdate({ before, after }: { before: OutcomeStats; after: OutcomeStats }) {
  const rows = [
    { label: "Alert precision", from: precisionText(before), to: precisionText(after) },
    { label: "Local cases", from: casesText(before), to: casesText(after) },
  ];
  return (
    <div className="mt-3 rounded-xl bg-teal-50 p-4 ring-1 ring-teal-200">
      <p className="flex items-center gap-2 text-sm font-semibold text-teal-900">
        <Database className="size-4" aria-hidden /> Local database updated
      </p>
      <p className="mt-0.5 text-xs text-teal-800">Anonymised outcome added (area, month, condition — no name or ID). Synthetic data.</p>
      <dl className="mt-3 space-y-2 text-sm">
        {rows.map((r) => (
          <div key={r.label}>
            <dt className="text-xs font-medium text-slate-500">{r.label}</dt>
            <dd className="flex flex-wrap items-center gap-1.5 text-slate-800">
              <span className="text-slate-500">{r.from}</span>
              <ArrowRight className="size-3.5 text-teal-600" aria-hidden />
              <span className="font-medium">{r.to}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
