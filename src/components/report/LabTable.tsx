"use client";

import { Fragment, useState } from "react";
import { format, parseISO } from "date-fns";
import { ArrowDownRight, ArrowUpRight, Minus, Pencil, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LabRow } from "@/lib/review";
import { meetsTarget, type PatientTarget } from "@/lib/targets";
import type { Flag, TestKey } from "@/lib/types";
import { cn } from "@/lib/utils";

const FLAG_STYLE: Record<Flag, { label: string; className: string }> = {
  high: { label: "High", className: "bg-red-50 text-red-700 ring-red-200" },
  low: { label: "Low", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  normal: { label: "Normal", className: "bg-green-50 text-green-700 ring-green-200" },
};

export interface OverrideInput {
  op: "<" | ">";
  value: number;
  reason: string;
}

function Delta({ row }: { row: LabRow }) {
  if (row.delta === undefined) return <span className="text-slate-400">—</span>;
  const d = Math.max(row.decimals, 1);
  if (Math.abs(row.delta) < 10 ** -d / 2) {
    return (
      <span className="inline-flex items-center gap-1 text-slate-500">
        <Minus className="size-3.5" aria-hidden /> no change
      </span>
    );
  }
  const up = row.delta > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-slate-700 tabular-nums">
      <Icon className={cn("size-3.5", up ? "text-rose-600" : "text-sky-600")} aria-hidden />
      {up ? "+" : "−"}
      {Math.abs(row.delta).toFixed(d)}
    </span>
  );
}

function TargetCell({
  target,
  readOnly,
  onEdit,
  onRevert,
}: {
  target: PatientTarget;
  readOnly?: boolean;
  onEdit: () => void;
  onRevert: () => void;
}) {
  return (
    <div className="flex items-start gap-1">
      <div className="min-w-0 flex-1">
        {target.kind === "reference" ? (
          <p className="text-xs text-slate-400">Same as population range</p>
        ) : (
          <>
            <p className={cn("font-semibold tabular-nums", target.kind === "override" ? "text-sky-700" : "text-teal-700")}>
              {target.label}
            </p>
            {target.kind === "guideline" && (
              <p className="text-[11px] leading-snug text-slate-500">
                {target.reason} · {target.source}
              </p>
            )}
            {target.override && (
              <>
                <p className="text-[11px] leading-snug text-slate-500">
                  Overridden by {target.override.author} · {format(parseISO(target.override.timestamp), "d MMM yyyy")} ·{" "}
                  {target.override.reason}
                </p>
                {!readOnly && target.replaced && (
                  <button
                    type="button"
                    onClick={onRevert}
                    className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-teal-700 hover:underline"
                  >
                    <RotateCcw className="size-3" aria-hidden /> Revert to {target.replaced.label}
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>
      {!readOnly && (
        <Button variant="ghost" size="icon-xs" aria-label="Override target" title="Set a target for this patient" onClick={onEdit}>
          <Pencil />
        </Button>
      )}
    </div>
  );
}

function OverrideForm({
  target,
  onSave,
  onCancel,
}: {
  target: PatientTarget;
  onSave: (o: OverrideInput) => void;
  onCancel: () => void;
}) {
  const [op, setOp] = useState<"<" | ">">(target.low !== undefined && target.high === undefined ? ">" : "<");
  const [value, setValue] = useState(String(target.high ?? target.low ?? ""));
  const [reason, setReason] = useState("");
  const num = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(num) && reason.trim().length > 0;
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl bg-sky-50/60 p-3 ring-1 ring-sky-100">
      <label className="text-xs font-medium text-slate-600">
        Target
        <div className="mt-1 flex gap-1">
          <select
            value={op}
            onChange={(e) => setOp(e.target.value as "<" | ">")}
            className="h-8 rounded-lg border border-input bg-white px-2 text-sm"
            aria-label="Direction"
          >
            <option value="<">below (&lt;)</option>
            <option value=">">above (&gt;)</option>
          </select>
          <Input type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} className="w-24 bg-white" aria-label="Target value" />
        </div>
      </label>
      <label className="min-w-48 flex-1 text-xs font-medium text-slate-600">
        Reason (required)
        <Input
          className="mt-1 bg-white"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Individualised for frailty"
        />
      </label>
      <Button variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
      <Button
        size="sm"
        className="bg-teal-600 text-white hover:bg-teal-700"
        disabled={!valid}
        onClick={() => onSave({ op, value: num, reason: reason.trim() })}
      >
        Save target
      </Button>
    </div>
  );
}

export function LabTable({
  rows,
  targets,
  previousDate,
  readOnly,
  onOverride,
  onRevert,
}: {
  rows: LabRow[];
  targets: PatientTarget[];
  previousDate?: string;
  readOnly?: boolean;
  onOverride: (testKey: TestKey, o: OverrideInput) => void;
  onRevert: (testKey: TestKey) => void;
}) {
  const [editing, setEditing] = useState<TestKey | null>(null);
  if (rows.length === 0) {
    return <p className="rounded-2xl bg-white p-6 text-sm text-slate-500 ring-1 ring-slate-200">No lab values in this report.</p>;
  }
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <table className="w-full table-fixed text-sm">
        <colgroup>
          <col className="w-[19%]" />
          <col className="w-[12%]" />
          <col className="w-[14%]" />
          <col className="w-[30%]" />
          <col className="w-[12%]" />
          <col className="w-[13%]" />
        </colgroup>
        <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
          <tr>
            <th className="px-4 py-2.5">Test</th>
            <th className="px-4 py-2.5 text-right">Value</th>
            <th className="px-4 py-2.5">Population range</th>
            <th className="px-4 py-2.5">Target for this patient</th>
            <th className="px-4 py-2.5">Flag</th>
            <th className="px-4 py-2.5">
              Change{previousDate && <span className="hidden font-normal xl:inline"> vs {previousDate}</span>}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => {
            const target = targets.find((t) => t.testKey === row.testKey)!;
            const missesTarget = target.kind !== "reference" && !meetsTarget(target, row.value);
            return (
              <Fragment key={row.testKey}>
                <tr className={row.flag !== "normal" ? "bg-red-50/20" : undefined}>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{row.name}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-slate-900 tabular-nums">
                    {row.qualifier ?? ""}
                    {row.value.toFixed(row.decimals)}
                    <span className="ml-1 text-xs font-normal text-slate-500">{row.unit}</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 tabular-nums">{target.populationRange}</td>
                  <td className="px-4 py-2.5">
                    <TargetCell
                      target={target}
                      readOnly={readOnly}
                      onEdit={() => setEditing(editing === row.testKey ? null : row.testKey)}
                      onRevert={() => onRevert(row.testKey)}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-col items-start gap-1">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium ring-1", FLAG_STYLE[row.flag].className)}>
                        {FLAG_STYLE[row.flag].label}
                      </span>
                      {missesTarget && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">
                          Misses target
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    <Delta row={row} />
                  </td>
                </tr>
                {editing === row.testKey && !readOnly && (
                  <tr>
                    <td colSpan={6} className="px-4 pb-3">
                      <OverrideForm
                        target={target}
                        onCancel={() => setEditing(null)}
                        onSave={(o) => {
                          onOverride(row.testKey, o);
                          setEditing(null);
                        }}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
