"use client";

import { Ban, Info, ShieldAlert, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { findFormulary, FOOD_TIMINGS, FREQUENCIES } from "@/lib/formulary";
import { blockRules, type AlertLevel, type PrescriptionAlert } from "@/lib/prescriptionChecks";
import type { FoodTiming, Medication } from "@/lib/types";
import { cn } from "@/lib/utils";

const SELECT =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-white px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const ALERT_STYLE: Record<AlertLevel, { box: string; icon: React.ReactNode; label: string }> = {
  block: { box: "bg-red-50 text-red-800 ring-red-200", icon: <Ban className="size-4 shrink-0" aria-hidden />, label: "Block" },
  warning: {
    box: "bg-amber-50 text-amber-900 ring-amber-200",
    icon: <TriangleAlert className="size-4 shrink-0" aria-hidden />,
    label: "Warning",
  },
  info: { box: "bg-sky-50 text-sky-900 ring-sky-200", icon: <Info className="size-4 shrink-0" aria-hidden />, label: "Info" },
};

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span className="mb-1 block text-[11px] font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

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

/** One medicine in the plan: dose/frequency/timing fields, live safety alerts and the override box. */
export function MedicationRow({
  med,
  alerts,
  doctorName,
  onChange,
  onRemove,
}: {
  med: Medication;
  alerts: PrescriptionAlert[];
  doctorName: string;
  onChange: (patch: Partial<Medication>) => void;
  onRemove: () => void;
}) {
  const entry = med.custom ? undefined : findFormulary(med.formularyId);
  const blocked = blockRules(alerts).length > 0;
  const frequencyOptions = FREQUENCIES.some((f) => f.code === med.frequency) || !med.frequency
    ? FREQUENCIES
    : [{ code: med.frequency, meaning: "as entered" }, ...FREQUENCIES];

  return (
    <div
      className={cn(
        "space-y-3 rounded-xl p-3 ring-1",
        blocked && !med.override?.reason.trim() ? "bg-red-50/30 ring-red-200" : "bg-slate-50/60 ring-slate-200",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-slate-900">{med.name}</p>
          {entry ? (
            <p className="text-xs text-slate-500">
              {entry.drugClass} · {entry.route} · {entry.pregnancyCategoryNote}
            </p>
          ) : (
            <span className="mt-0.5 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
              Custom medicine · No safety checks available
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon-sm" aria-label={`Remove ${med.name}`} onClick={onRemove}>
          <Trash2 />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Field label={entry ? "Strength" : "Dose"}>
          {entry ? (
            <select className={SELECT} value={med.dose} onChange={(e) => onChange({ dose: e.target.value })}>
              {entry.strengths.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          ) : (
            <Input placeholder="e.g. 10 mg" value={med.dose} onChange={(e) => onChange({ dose: e.target.value })} className="bg-white" />
          )}
        </Field>
        <Field label="Frequency">
          <select className={SELECT} value={med.frequency} onChange={(e) => onChange({ frequency: e.target.value })}>
            {!med.frequency && <option value="">Choose…</option>}
            {frequencyOptions.map((f) => (
              <option key={f.code} value={f.code}>
                {f.code} — {f.meaning.toLowerCase()}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Food timing">
          <select
            className={SELECT}
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
        <Field label="Duration">
          <Input
            placeholder="e.g. 30 days"
            value={med.duration}
            onChange={(e) => onChange({ duration: e.target.value })}
            className="bg-white"
          />
        </Field>
        <Field label="Instructions" className="col-span-2 md:col-span-4">
          <Input
            placeholder="e.g. Only for knee pain, max 3 tablets a day"
            value={med.instructions}
            onChange={(e) => onChange({ instructions: e.target.value })}
            className="bg-white"
          />
        </Field>
      </div>

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
    </div>
  );
}
