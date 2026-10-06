"use client";

import { useId } from "react";
import { Ban, CheckCheck, Eye, Info, ShieldAlert, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { findFormulary, FOOD_TIMINGS, FREQUENCIES } from "@/lib/formulary";
import { isUnconfirmed, patientPreview } from "@/lib/medEntry";
import { blockRules, type AlertLevel, type PrescriptionAlert } from "@/lib/prescriptionChecks";
import type { DefaultField, FoodTiming, Medication } from "@/lib/types";
import { cn } from "@/lib/utils";

const CONTROL =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-white px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
/** Light amber highlight for a value pre-filled from the formulary and not yet confirmed. */
const DEFAULT_HIGHLIGHT = "border-amber-300 bg-amber-50";

const ALERT_STYLE: Record<AlertLevel, { box: string; icon: React.ReactNode; label: string }> = {
  block: { box: "bg-red-50 text-red-800 ring-red-200", icon: <Ban className="size-4 shrink-0" aria-hidden />, label: "Block" },
  warning: {
    box: "bg-amber-50 text-amber-900 ring-amber-200",
    icon: <TriangleAlert className="size-4 shrink-0" aria-hidden />,
    label: "Warning",
  },
  info: { box: "bg-sky-50 text-sky-900 ring-sky-200", icon: <Info className="size-4 shrink-0" aria-hidden />, label: "Info" },
};

export function AlertList({ alerts }: { alerts: PrescriptionAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {alerts.map((a) => {
        const s = ALERT_STYLE[a.level];
        return (
          <li key={a.rule} className={cn("flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-sm ring-1", s.box)}>
            {s.icon}
            <span className="min-w-0 flex-1">
              <span className="sr-only">{s.label}: </span>
              {a.message}
            </span>
            <span className="shrink-0 text-[11px] opacity-75">{a.source}</span>
          </li>
        );
      })}
    </ul>
  );
}

const HELP: Record<"name" | DefaultField, string> = {
  name: "Generic name. Formulary medicines get safety checks; custom medicines don’t.",
  dose: "Strength of one dose, e.g. 500 mg.",
  frequency: "How many times a day. The patient sees the plain meaning (e.g. “Twice daily”).",
  foodTiming: "When to take it relative to meals.",
  duration: "How long to take it, e.g. 30 days, or “As needed”.",
  instructions: "Shown to the patient word for word.",
};

/** A labelled field with an info tooltip; flags a formulary default the doctor hasn't confirmed. */
function Field({
  id,
  label,
  help,
  pending,
  children,
}: {
  id: string;
  label: string;
  help: string;
  pending?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center gap-1">
        <label htmlFor={id} className="text-xs font-medium text-slate-700">
          {label}
        </label>
        <Tooltip>
          <TooltipTrigger
            type="button"
            aria-label={`About ${label}`}
            className="rounded text-slate-400 hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-teal-600"
          >
            <Info className="size-3.5" aria-hidden />
          </TooltipTrigger>
          <TooltipContent>{help}</TooltipContent>
        </Tooltip>
      </div>
      {children}
      {pending && <p className="mt-1 text-[11px] font-medium text-amber-700">Default — please confirm</p>}
    </div>
  );
}

/**
 * One medicine in the plan as a card: header, labelled fields (formulary
 * defaults highlighted until confirmed or edited), the patient preview line,
 * live safety alerts and the override box.
 */
export function MedicationRow({
  med,
  alerts,
  doctorName,
  onChange,
  onConfirmDefaults,
  onRemove,
}: {
  med: Medication;
  alerts: PrescriptionAlert[];
  doctorName: string;
  onChange: (patch: Partial<Medication>) => void;
  onConfirmDefaults: () => void;
  onRemove: () => void;
}) {
  const uid = useId();
  const id = (f: string) => `${uid}-${f}`;
  const entry = med.custom ? undefined : findFormulary(med.formularyId);
  const blocked = blockRules(alerts).length > 0;
  const pending = (f: DefaultField) => isUnconfirmed(med, f);
  const pendingCount = med.unconfirmedDefaults?.length ?? 0;
  const control = (f: DefaultField) => cn(CONTROL, pending(f) && DEFAULT_HIGHLIGHT);

  const frequencyOptions =
    FREQUENCIES.some((f) => f.code === med.frequency) || !med.frequency
      ? FREQUENCIES
      : [{ code: med.frequency, meaning: "as entered" }, ...FREQUENCIES];
  const strengths = entry && (entry.strengths.includes(med.dose) || !med.dose ? entry.strengths : [med.dose, ...entry.strengths]);
  const preview = patientPreview(med);

  return (
    <article
      aria-label={med.name}
      className={cn(
        "space-y-4 rounded-2xl p-4 ring-1",
        blocked && !med.override?.reason.trim() ? "bg-red-50/30 ring-red-200" : "bg-white ring-slate-200",
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="font-semibold text-slate-900">{med.name}</h4>
          {entry ? (
            <p className="text-xs text-slate-500">
              {entry.drugClass} · <span className="text-slate-600">{entry.pregnancyCategoryNote}</span>
            </p>
          ) : (
            <span className="mt-0.5 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
              Custom medicine · No safety checks available
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {pendingCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={onConfirmDefaults}
              className="border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
            >
              <CheckCheck /> Confirm defaults
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" aria-label={`Remove ${med.name}`} onClick={onRemove}>
            <Trash2 />
          </Button>
        </div>
      </header>

      <div className="grid gap-x-3 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field id={id("name")} label="Medicine" help={HELP.name}>
          <Input
            id={id("name")}
            value={med.name}
            readOnly={!!entry}
            onChange={(e) => onChange({ name: e.target.value })}
            className={cn("h-9 bg-white", entry && "bg-slate-50 text-slate-700")}
          />
        </Field>
        <Field id={id("dose")} label="Strength" help={HELP.dose} pending={pending("dose")}>
          {strengths ? (
            <select id={id("dose")} className={control("dose")} value={med.dose} onChange={(e) => onChange({ dose: e.target.value })}>
              {strengths.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          ) : (
            <Input
              id={id("dose")}
              placeholder="e.g. 10 mg"
              value={med.dose}
              onChange={(e) => onChange({ dose: e.target.value })}
              className={control("dose")}
            />
          )}
        </Field>
        <Field id={id("frequency")} label="How often" help={HELP.frequency} pending={pending("frequency")}>
          <select
            id={id("frequency")}
            className={control("frequency")}
            value={med.frequency}
            onChange={(e) => onChange({ frequency: e.target.value })}
          >
            {!med.frequency && <option value="">Choose…</option>}
            {frequencyOptions.map((f) => (
              <option key={f.code} value={f.code}>
                {f.code} — {f.meaning.toLowerCase()}
              </option>
            ))}
          </select>
        </Field>
        <Field id={id("foodTiming")} label="When to take (food)" help={HELP.foodTiming} pending={pending("foodTiming")}>
          <select
            id={id("foodTiming")}
            className={control("foodTiming")}
            value={med.foodTiming ?? ""}
            onChange={(e) => onChange({ foodTiming: (e.target.value || undefined) as FoodTiming | undefined })}
          >
            {!med.foodTiming && <option value="">Not specified</option>}
            {FOOD_TIMINGS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field id={id("duration")} label="Duration" help={HELP.duration} pending={pending("duration")}>
          <Input
            id={id("duration")}
            placeholder="e.g. 30 days"
            value={med.duration}
            onChange={(e) => onChange({ duration: e.target.value })}
            className={control("duration")}
          />
        </Field>
        <Field id={id("instructions")} label="Instructions for patient" help={HELP.instructions} pending={pending("instructions")}>
          <Input
            id={id("instructions")}
            placeholder="e.g. Only for knee pain"
            value={med.instructions}
            onChange={(e) => onChange({ instructions: e.target.value })}
            className={control("instructions")}
          />
        </Field>
      </div>

      {preview && (
        <p className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200">
          <Eye className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
          <span className="min-w-0">
            <span className="font-medium text-slate-500">Patient will see: </span>
            {preview}
          </span>
        </p>
      )}

      <AlertList alerts={alerts} />

      {blocked && (
        <div className="rounded-lg bg-white p-2.5 ring-1 ring-red-200">
          <label className="flex items-center gap-2 text-sm font-medium text-red-800">
            <input
              type="checkbox"
              className="size-4 accent-red-600"
              checked={!!med.override}
              onChange={(e) =>
                onChange({
                  override: e.target.checked
                    ? { reason: "", author: doctorName, timestamp: new Date().toISOString(), rules: blockRules(alerts) }
                    : undefined,
                })
              }
            />
            <ShieldAlert className="size-4" aria-hidden /> Override — prescribe anyway
          </label>
          {med.override ? (
            <Input
              autoFocus
              aria-label="Override reason"
              placeholder="Reason for override (required)"
              value={med.override.reason}
              onChange={(e) =>
                onChange({ override: { ...med.override!, reason: e.target.value, timestamp: new Date().toISOString() } })
              }
              aria-invalid={!med.override.reason.trim()}
              className="mt-2 bg-white"
            />
          ) : (
            <p className="mt-1 text-xs text-red-700">Blocked — remove this medicine, or tick Override and give a reason.</p>
          )}
        </div>
      )}
    </article>
  );
}
