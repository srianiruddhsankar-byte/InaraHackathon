import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { LabRow } from "@/lib/review";
import type { Flag } from "@/lib/types";
import { cn } from "@/lib/utils";

const FLAG_STYLE: Record<Flag, { label: string; className: string }> = {
  high: { label: "High", className: "bg-red-50 text-red-700 ring-red-200" },
  low: { label: "Low", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  normal: { label: "Normal", className: "bg-green-50 text-green-700 ring-green-200" },
};

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
    <span className="inline-flex items-center gap-1 text-slate-700 tabular-nums">
      <Icon className={cn("size-3.5", up ? "text-rose-600" : "text-sky-600")} aria-hidden />
      {up ? "+" : "−"}
      {Math.abs(row.delta).toFixed(d)}
    </span>
  );
}

export function LabTable({ rows, previousDate }: { rows: LabRow[]; previousDate?: string }) {
  if (rows.length === 0) {
    return <p className="rounded-2xl bg-white p-6 text-sm text-slate-500 ring-1 ring-slate-200">No lab values in this report.</p>;
  }
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
          <tr>
            <th className="px-4 py-2.5">Test</th>
            <th className="px-4 py-2.5 text-right">Value</th>
            <th className="hidden px-4 py-2.5 sm:table-cell">Unit</th>
            <th className="hidden px-4 py-2.5 md:table-cell">Reference</th>
            <th className="px-4 py-2.5">Flag</th>
            <th className="px-4 py-2.5">
              Change{previousDate && <span className="hidden font-normal lg:inline"> vs {previousDate}</span>}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.testKey} className={row.flag !== "normal" ? "bg-red-50/20" : undefined}>
              <td className="px-4 py-2.5 font-medium text-slate-800">{row.name}</td>
              <td className="px-4 py-2.5 text-right font-semibold text-slate-900 tabular-nums">
                {row.value.toFixed(row.decimals)}
                <span className="ml-1 text-xs font-normal text-slate-500 sm:hidden">{row.unit}</span>
              </td>
              <td className="hidden px-4 py-2.5 text-slate-500 sm:table-cell">{row.unit}</td>
              <td className="hidden px-4 py-2.5 text-slate-500 tabular-nums md:table-cell">{row.range}</td>
              <td className="px-4 py-2.5">
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium ring-1", FLAG_STYLE[row.flag].className)}>
                  {FLAG_STYLE[row.flag].label}
                </span>
              </td>
              <td className="px-4 py-2.5 text-xs">
                <Delta row={row} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
