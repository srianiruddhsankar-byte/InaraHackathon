import type { CaseStage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { dashboardGroup, doctorPhase, STAGE_LABEL, type DashboardGroup } from "@/lib/workflow";

export const GROUP_STYLE: Record<DashboardGroup, string> = {
  wearable_alert: "bg-red-50 text-red-700 ring-red-200",
  awaiting_lab: "bg-slate-100 text-slate-700 ring-slate-200",
  needs_review: "bg-sky-50 text-sky-700 ring-sky-200",
  treatment_pending: "bg-violet-50 text-violet-700 ring-violet-200",
  completed: "bg-teal-50 text-teal-700 ring-teal-200",
};

const pill = "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1";

/** The case's exact stage, coloured by dashboard group. */
export function StageChip({ stage, className }: { stage: CaseStage; className?: string }) {
  return (
    <span className={cn(pill, GROUP_STYLE[dashboardGroup(stage)], className)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {STAGE_LABEL[stage]}
    </span>
  );
}

/** "Current phase: Doctor review" */
export function PhaseBadge({ stage }: { stage: CaseStage }) {
  return (
    <span className={cn(pill, "px-3 py-1", GROUP_STYLE[dashboardGroup(stage)])}>
      Current phase: <span className="font-semibold">{doctorPhase(stage)}</span>
    </span>
  );
}
