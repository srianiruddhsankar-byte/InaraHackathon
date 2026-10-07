import type { PatientResult } from "@/lib/patientView";
import { cn } from "@/lib/utils";

const DOT: Record<PatientResult["flag"], string> = {
  normal: "bg-green-600",
  low: "bg-amber-500",
  high: "bg-amber-500",
};

/** Where the value sits against the healthy range (green) and, if set, the personal target (dashed). */
export function RangeBar({ result }: { result: PatientResult }) {
  const { range, value, target } = result;
  if (result.qualitative || (range.low === undefined && range.high === undefined)) return null;
  const lo = range.low ?? 0;
  const hi = range.high ?? lo * 2;
  const span = Math.max(hi - lo, Math.abs(hi) * 0.2, 1e-6);
  const min = Math.max(0, Math.min(value, lo) - span * 0.4);
  const max = Math.max(value, hi) + span * 0.4;
  const pct = (v: number) => `${Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100))}%`;
  const width = (a: number, b: number) => `calc(${pct(b)} - ${pct(a)})`;
  const bandFrom = range.low ?? min;
  const bandTo = range.high ?? max;
  return (
    <div className="mt-2" aria-hidden>
      <div className="relative h-2.5 rounded-full bg-slate-100">
        <div className="absolute inset-y-0 rounded-full bg-green-200" style={{ left: pct(bandFrom), width: width(bandFrom, bandTo) }} />
        {target && (
          <div
            className="absolute -inset-y-1 rounded-full border-2 border-dashed border-teal-500"
            style={{ left: pct(target.low ?? min), width: width(target.low ?? min, target.high ?? max) }}
          />
        )}
        <div
          className={cn("absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white", DOT[result.flag])}
          style={{ left: pct(value) }}
        />
      </div>
    </div>
  );
}
