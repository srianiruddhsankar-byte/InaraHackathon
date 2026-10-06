"use client";

import { format, parseISO } from "date-fns";
import { EmptyState } from "@/components/layout/EmptyState";
import { StageChip } from "@/components/workflow/StageChip";
import type { LabHistoryRow } from "@/lib/labReport";

/** Results the lab has sent. Stage only — the lab never sees findings or AI text. */
export function LabHistory({ rows }: { rows: LabHistoryRow[] }) {
  if (rows.length === 0) return <EmptyState title="Nothing sent yet">Results you upload appear here.</EmptyState>;
  return (
    <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
          <tr>
            <th className="px-4 py-2">Patient</th>
            <th className="px-4 py-2">Sample date</th>
            <th className="px-4 py-2">Source</th>
            <th className="px-4 py-2">Tests</th>
            <th className="px-4 py-2">Current stage</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.reportId}>
              <td className="px-4 py-2.5 font-medium text-slate-900">{r.patientName}</td>
              <td className="px-4 py-2.5 text-slate-600">{format(parseISO(r.date), "d MMM yyyy")}</td>
              <td className="px-4 py-2.5 text-slate-600">{r.source}</td>
              <td className="px-4 py-2.5 text-slate-600 tabular-nums">{r.testsCount}</td>
              <td className="px-4 py-2.5">{r.stage ? <StageChip stage={r.stage} /> : <span className="text-slate-400">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
