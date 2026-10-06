import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Step {
  label: string;
  done: boolean;
  /** Why the step can't be opened yet; undefined = unlocked. */
  locked?: string;
}

export function Stepper({ steps, current, onSelect }: { steps: Step[]; current: number; onSelect: (i: number) => void }) {
  return (
    <nav aria-label="Review steps" className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
      <ol className="flex items-center gap-2">
        {steps.map((step, i) => {
          const active = i === current;
          return (
            <li key={step.label} className="flex min-w-0 flex-1 items-center gap-2">
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-current={active ? "step" : undefined}
                aria-disabled={!!step.locked}
                title={step.locked}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors",
                  active ? "bg-teal-50" : step.locked ? "cursor-not-allowed opacity-60" : "hover:bg-slate-50",
                )}
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                    step.done
                      ? "bg-teal-600 text-white"
                      : active
                        ? "bg-white text-teal-700 ring-2 ring-teal-600"
                        : "bg-slate-100 text-slate-500",
                  )}
                >
                  {step.done ? (
                    <Check className="size-4" aria-label="Completed" />
                  ) : step.locked ? (
                    <Lock className="size-3.5" aria-label="Locked" />
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="min-w-0">
                  <span className={cn("block truncate text-sm font-medium", active ? "text-teal-800" : "text-slate-700")}>
                    {step.label}
                  </span>
                  {step.locked && <span className="hidden truncate text-[11px] text-slate-500 xl:block">{step.locked}</span>}
                </span>
              </button>
              {i < steps.length - 1 && <span className="hidden h-px w-4 shrink-0 bg-slate-200 md:block" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
