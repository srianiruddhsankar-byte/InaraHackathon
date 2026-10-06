import { ChevronDown, FlaskConical, Search, ShieldCheck } from "lucide-react";
import { CONDITIONS, type PatternLevel } from "@/lib/wearable/conditions";
import type { Detection, PatternResult } from "@/lib/wearable/detect";
import { cn } from "@/lib/utils";

const LEVEL_STYLE: Record<Exclude<PatternLevel, "none">, { card: string; badge: string; bar: string; label: string }> = {
  concerning: { card: "bg-red-50/60 ring-red-200", badge: "bg-red-100 text-red-800 ring-red-200", bar: "bg-red-500", label: "Concerning" },
  watch: { card: "bg-amber-50/60 ring-amber-200", badge: "bg-amber-100 text-amber-800 ring-amber-200", bar: "bg-amber-500", label: "Watch" },
};

/**
 * Ranked possible patterns for the selected day (doctor only). The top pattern
 * is shown in full; weaker ones sit in a collapsed list.
 */
export function PossiblePatterns({ detection }: { detection: Detection | null }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Search className="size-4 text-teal-600" aria-hidden /> Possible patterns
      </h3>
      <div className="mt-3" aria-live="polite">
        <Body detection={detection} />
      </div>
      <p className="mt-3 text-xs text-slate-500">Possible pattern · not a diagnosis. For the doctor to review.</p>
    </section>
  );
}

function Body({ detection }: { detection: Detection | null }) {
  if (!detection) return <p className="animate-pulse text-sm text-slate-500">Checking patterns…</p>;
  if (detection.status === "insufficient_data") {
    return (
      <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
        <p className="font-medium">Insufficient data</p>
        <p className="text-xs text-slate-500">{detection.reason} No judgement is made.</p>
      </div>
    );
  }
  const [top, ...others] = detection.patterns;
  if (!top) {
    return (
      <div className="flex items-start gap-2 rounded-xl bg-green-50 px-3 py-2.5 text-sm text-green-900 ring-1 ring-green-200">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-green-600" aria-hidden />
        <span>
          No pattern found
          <span className="block text-xs text-green-800/80">
            {CONDITIONS.length} conditions checked · changes the weather explains are ignored
          </span>
        </span>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <PatternCard pattern={top} />
      {others.length > 0 && (
        <details className="group rounded-xl ring-1 ring-slate-200">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium text-slate-700 [&::-webkit-details-marker]:hidden">
            Other possible patterns ({others.length})
            <ChevronDown className="size-4 text-slate-400 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="space-y-2 px-3 pb-3">
            {others.map((p) => (
              <PatternCard key={p.id} pattern={p} compact />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function PatternCard({ pattern, compact }: { pattern: PatternResult; compact?: boolean }) {
  const style = LEVEL_STYLE[pattern.level as Exclude<PatternLevel, "none">];
  return (
    <article className={cn("rounded-xl p-3 ring-1", style.card)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={cn("font-semibold text-slate-900", compact ? "text-sm" : "text-base")}>{pattern.condition.name}</p>
          {!compact && <p className="mt-0.5 text-xs text-slate-600">{pattern.condition.summary}</p>}
        </div>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ring-1", style.badge)}>{style.label}</span>
      </div>

      <div className="mt-2 flex items-center gap-2" title="How closely the data matches the pattern (0–1)">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white ring-1 ring-slate-200">
          <div className={cn("h-full rounded-full", style.bar)} style={{ width: `${Math.round(pattern.score * 100)}%` }} />
        </div>
        <span className="text-xs font-medium text-slate-600 tabular-nums">Match {pattern.score.toFixed(2)}</span>
      </div>

      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Evidence">
        {pattern.evidence.map((e) => (
          <li key={e} className="rounded-lg bg-white px-2 py-1 text-xs text-slate-800 ring-1 ring-slate-200">
            {e}
          </li>
        ))}
      </ul>

      {pattern.supportingFactors.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium text-slate-500">Supporting factors</p>
          <ul className="mt-1 space-y-0.5 text-xs text-slate-700">
            {pattern.supportingFactors.map((f) => (
              <li key={f}>+ {f}</li>
            ))}
          </ul>
        </div>
      )}

      {pattern.suggestedLabTests.length > 0 && (
        <div className="mt-2">
          <p className="flex items-center gap-1 text-xs font-medium text-slate-500">
            <FlaskConical className="size-3.5" aria-hidden /> Consider lab tests
          </p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {pattern.suggestedLabTests.map((l) => (
              <li key={l.label} className="rounded-full bg-teal-50 px-2 py-0.5 text-xs text-teal-800 ring-1 ring-teal-200">
                {l.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
