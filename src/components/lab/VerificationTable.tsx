"use client";

import { ArrowRight } from "lucide-react";
import { TEST_KEYS, TESTS } from "@/lib/tests";
import type { TestKey, UploadRowStatus } from "@/lib/types";
import { STATUS_LABEL, type EvaluatedRow, type UploadRow } from "@/lib/upload";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<UploadRowStatus, string> = {
  mapped: "bg-green-50 text-green-700 ring-green-200",
  converted: "bg-teal-50 text-teal-700 ring-teal-200",
  unit_assumed: "bg-amber-50 text-amber-800 ring-amber-200",
  not_reported: "bg-slate-100 text-slate-600 ring-slate-200",
  unknown: "bg-slate-100 text-slate-600 ring-slate-200",
  duplicate: "bg-slate-100 text-slate-600 ring-slate-200",
  needs_fixing: "bg-red-50 text-red-700 ring-red-200",
};

const FLAG_STYLE = { low: "text-sky-700", normal: "text-green-700", high: "text-red-700" } as const;

const cellInput =
  "h-8 w-full min-w-0 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 outline-none focus-visible:border-teal-500 focus-visible:ring-2 focus-visible:ring-teal-500/30";

export type RowPatch = Partial<Pick<UploadRow, "rawName" | "rawValue" | "rawUnit">> & { testKeyOverride?: TestKey | null };

/**
 * Raw name → mapped test + LOINC, raw value/unit → converted value/unit, flag, status.
 * Every raw cell and the mapped test can be edited; each edit re-checks the row.
 */
export function VerificationTable({ rows, onChange }: { rows: EvaluatedRow[]; onChange: (id: string, patch: RowPatch) => void }) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
          <tr>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Name in file</th>
            <th className="px-3 py-2">Mapped test · LOINC</th>
            <th className="px-3 py-2">Value · unit in file</th>
            <th className="px-3 py-2">Stored as</th>
            <th className="px-3 py-2">Flag</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => {
            const attention = r.status !== "mapped" && r.status !== "converted";
            return (
              <tr
                key={r.id}
                className={cn(
                  "align-top",
                  r.status === "needs_fixing" ? "bg-red-50/60" : attention && r.status !== "duplicate" ? "bg-amber-50/50" : undefined,
                )}
              >
                <td className="px-3 py-2">
                  <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1", STATUS_STYLE[r.status])}>
                    {STATUS_LABEL[r.status]}
                  </span>
                  {r.message && <p className="mt-1 max-w-[220px] text-xs text-slate-600">{r.message}</p>}
                </td>
                <td className="px-3 py-2">
                  <input
                    aria-label={`Name in file, row ${r.line}`}
                    className={cellInput}
                    value={r.rawName}
                    onChange={(e) => onChange(r.id, { rawName: e.target.value })}
                  />
                  <p className="mt-1 text-[11px] text-slate-400">Row {r.line}</p>
                </td>
                <td className="px-3 py-2">
                  <select
                    aria-label={`Mapped test, row ${r.line}`}
                    className={cn(cellInput, "pr-1")}
                    value={r.testKey ?? ""}
                    onChange={(e) => onChange(r.id, { testKeyOverride: (e.target.value || null) as TestKey | null })}
                  >
                    <option value="">Unknown — skip</option>
                    {TEST_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {TESTS[k].name}
                      </option>
                    ))}
                  </select>
                  {r.loinc && <p className="mt-1 text-[11px] text-slate-500">LOINC {r.loinc}</p>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1.5">
                    <input
                      aria-label={`Value in file, row ${r.line}`}
                      className={cn(cellInput, "w-24", r.blocking && "border-red-400")}
                      value={r.rawValue}
                      placeholder="NA"
                      onChange={(e) => onChange(r.id, { rawValue: e.target.value })}
                    />
                    <input
                      aria-label={`Unit in file, row ${r.line}`}
                      className={cn(cellInput, "w-28", r.status === "needs_fixing" && !r.blocking && "border-red-400")}
                      value={r.rawUnit}
                      placeholder={r.testKey ? TESTS[r.testKey].unit : "unit"}
                      onChange={(e) => onChange(r.id, { rawUnit: e.target.value })}
                    />
                  </div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.value !== null ? (
                    <span className="inline-flex items-center gap-1.5 text-slate-900">
                      <ArrowRight className="size-3.5 text-slate-400" aria-hidden />
                      <span className="font-medium tabular-nums">{r.value}</span> {r.unit}
                    </span>
                  ) : (
                    <span className="text-slate-400">Not imported</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {r.flag ? <span className={cn("text-xs font-medium capitalize", FLAG_STYLE[r.flag])}>{r.flag}</span> : <span className="text-slate-300">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
