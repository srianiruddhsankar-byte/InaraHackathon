import { AlertTriangle, Watch } from "lucide-react";
import type { WearableContext } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Doctor-only: the wearable alert that started this case — pattern, key evidence, check-in answers and red flags. */
export function WearableContextCard({ context }: { context: WearableContext }) {
  return (
    <section className="rounded-2xl bg-sky-50 p-5 ring-1 ring-sky-200" aria-labelledby="wearable-context-title">
      <div className="flex flex-wrap items-center gap-2">
        <Watch className="size-5 text-sky-700" aria-hidden />
        <h2 id="wearable-context-title" className="mr-auto font-semibold text-slate-900">
          Wearable context
        </h2>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-semibold",
            context.patternLevel === "concerning" ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800",
          )}
        >
          {context.patternName} · {context.patternLevel}
        </span>
        {context.redFlags.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-200">
            <AlertTriangle className="size-3" aria-hidden /> Red flag: {context.redFlags.join(", ")}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-600">
        This case started from a wearable alert ({context.date}). Possible pattern, not a diagnosis — supporting evidence for the lab findings.
      </p>

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">Key evidence</h3>
          <ul className="flex flex-wrap gap-1.5">
            {context.evidence.map((e) => (
              <li key={e} className="rounded-lg bg-white px-2 py-1 text-xs text-slate-800 ring-1 ring-slate-200">
                {e}
              </li>
            ))}
          </ul>
          {context.supportingFactors.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
              {context.supportingFactors.map((f) => (
                <li key={f}>+ {f}</li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">Check-in answers</h3>
          {context.answers.length === 0 ? (
            <p className="text-sm text-slate-600">No answers recorded.</p>
          ) : (
            <ul className="space-y-0.5 text-sm">
              {context.answers.map((a) => (
                <li key={a.question} className={cn("flex justify-between gap-3", a.redFlag ? "font-semibold text-red-700" : "text-slate-700")}>
                  <span>{a.question}</span>
                  <span>
                    {a.answer}
                    {a.redFlag && " · red flag"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {context.recommendation && <p className="mt-2 text-xs text-slate-600">Prodrome advised: {context.recommendation}</p>}
        </div>
      </div>
    </section>
  );
}
