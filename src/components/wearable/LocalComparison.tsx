import { MapPin } from "lucide-react";
import { percentile, type LocalReference } from "@/lib/wearable/population";
import { cn } from "@/lib/utils";

/** Where the person's night resting HR sits among people like them locally (synthetic population data). */
export function LocalComparison({
  reference,
  usualHr,
  tonightHr,
  loading,
}: {
  reference: LocalReference | null;
  usualHr: number | null;
  tonightHr: number | null;
  loading: boolean;
}) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <MapPin className="size-4 text-teal-600" aria-hidden /> Local comparison
      </h3>
      {loading ? (
        <p className="mt-3 animate-pulse text-sm text-slate-500">Loading population data…</p>
      ) : !reference ? (
        <p className="mt-3 text-sm text-slate-500">No population reference with enough people.</p>
      ) : (
        <>
          <ol className="mt-3 flex flex-wrap items-center gap-1 text-xs" aria-label="Population levels checked">
            {reference.tried.map((l, i) => (
              <li key={l.name} className="flex items-center gap-1">
                {i > 0 && <span className="text-slate-400">→</span>}
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 ring-1",
                    l.used ? "bg-teal-50 font-medium text-teal-800 ring-teal-200" : "bg-slate-50 text-slate-500 line-through ring-slate-200",
                  )}
                >
                  {l.name} · {l.people.toLocaleString("en-IN")}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-slate-600">{reference.reason}</p>

          <p className="mt-3 text-xs font-medium text-slate-500">
            Night resting HR vs {reference.groupLabel} ({reference.group.n.toLocaleString("en-IN")} people, median ≈{" "}
            {reference.group.restingHr.mean.toFixed(0)} bpm)
          </p>
          <div className="mt-2 space-y-2">
            <Marker label="Usual" value={usualHr} reference={reference} tone="bg-slate-700" />
            <Marker label="This night" value={tonightHr} reference={reference} tone="bg-teal-600" />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Synthetic data · only people who agreed to share are counted{reference.excludedSelf ? "; this patient's own data is excluded" : ""}.
          </p>
        </>
      )}
    </section>
  );
}

function Marker({ label, value, reference, tone }: { label: string; value: number | null; reference: LocalReference; tone: string }) {
  if (value === null) return null;
  const p = percentile(value, reference.group.restingHr);
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-slate-600">
          {label} {value.toFixed(0)} bpm
        </span>
        <span className="font-medium text-slate-900 tabular-nums">{ordinal(p)} percentile</span>
      </div>
      <div className="relative mt-1 h-2 rounded-full bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100" role="img" aria-label={`${label}: ${ordinal(p)} percentile`}>
        <span className="absolute inset-y-0 left-1/2 w-px bg-slate-400" aria-hidden />
        <span className={cn("absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white", tone)} style={{ left: `${p}%` }} />
      </div>
    </div>
  );
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${s}`;
}
