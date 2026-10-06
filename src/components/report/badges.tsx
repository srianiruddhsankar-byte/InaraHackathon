import { AlertTriangle, CheckCircle2, Clock, Eye, Sparkles } from "lucide-react";
import type { ReviewStage } from "@/lib/review";
import type { ReportStatus, Severity } from "@/lib/types";
import { cn } from "@/lib/utils";

export const SEVERITY_STYLE: Record<Severity, { label: string; badge: string; bar: string; soft: string; text: string }> = {
  high: {
    label: "High",
    badge: "bg-red-50 text-red-700 ring-red-200",
    bar: "bg-red-500",
    soft: "bg-red-50/60",
    text: "text-red-700",
  },
  watch: {
    label: "Watch",
    badge: "bg-amber-50 text-amber-800 ring-amber-200",
    bar: "bg-amber-400",
    soft: "bg-amber-50/60",
    text: "text-amber-800",
  },
  normal: {
    label: "Normal",
    badge: "bg-green-50 text-green-700 ring-green-200",
    bar: "bg-green-500",
    soft: "bg-green-50/60",
    text: "text-green-700",
  },
};

const SEVERITY_ICON = { high: AlertTriangle, watch: Eye, normal: CheckCircle2 } as const;

const pill = "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1";

export function SeverityBadge({ severity, prefix }: { severity: Severity; prefix?: string }) {
  const Icon = SEVERITY_ICON[severity];
  return (
    <span className={cn(pill, SEVERITY_STYLE[severity].badge)}>
      <Icon className="size-3" aria-hidden />
      {prefix ? `${prefix} ${SEVERITY_STYLE[severity].label.toLowerCase()}` : SEVERITY_STYLE[severity].label}
    </span>
  );
}

const STAGE_STYLE: Record<ReviewStage, { label: string; className: string; icon: typeof Clock }> = {
  awaiting_review: { label: "Awaiting review", className: "bg-sky-50 text-sky-700 ring-sky-200", icon: Clock },
  plan_pending: { label: "Treatment plan pending", className: "bg-violet-50 text-violet-700 ring-violet-200", icon: Clock },
  complete: { label: "Approved", className: "bg-teal-50 text-teal-700 ring-teal-200", icon: CheckCircle2 },
};

export function StageBadge({ stage }: { stage: ReviewStage }) {
  const { label, className, icon: Icon } = STAGE_STYLE[stage];
  return (
    <span className={cn(pill, className)}>
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  );
}

const STATUS_STYLE: Record<ReportStatus, { label: string; className: string }> = {
  ai_draft: { label: "AI draft", className: "bg-violet-50 text-violet-700 ring-violet-200" },
  doctor_edited: { label: "Doctor edited", className: "bg-sky-50 text-sky-700 ring-sky-200" },
  approved: { label: "Approved", className: "bg-teal-50 text-teal-700 ring-teal-200" },
};

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  return <span className={cn(pill, STATUS_STYLE[status].className)}>{STATUS_STYLE[status].label}</span>;
}

export function AiDraftBadge({ className }: { className?: string }) {
  return (
    <span className={cn(pill, "bg-violet-50 text-violet-700 ring-violet-200", className)}>
      <Sparkles className="size-3" aria-hidden />
      AI DRAFT
    </span>
  );
}
