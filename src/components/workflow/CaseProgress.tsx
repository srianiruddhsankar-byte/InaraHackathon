"use client";

import { format, parseISO } from "date-fns";
import { Siren } from "lucide-react";
import type { Case } from "@/lib/types";
import { orderedAt, panelName } from "@/lib/workflow";
import { PhaseBadge } from "./StageChip";
import { StageTracker } from "./StageTracker";

/** Doctor view of a case: phase badge, order details, the full tracker and any other open orders. */
export function CaseProgress({ c, otherOpen }: { c: Case; otherOpen: Case[] }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">Case progress</h2>
          <p className="text-xs text-slate-500">
            Ordered by {c.orderedBy} · {format(parseISO(orderedAt(c)), "d MMM yyyy")} · {c.panels.map(panelName).join(", ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {c.urgency === "urgent" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 ring-1 ring-red-200">
              <Siren className="size-3.5" aria-hidden /> Urgent
            </span>
          )}
          <PhaseBadge stage={c.stage} />
        </div>
      </div>
      <StageTracker c={c} />
      {otherOpen.length > 0 && (
        <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-600">
          Also open:{" "}
          {otherOpen
            .map((o) => `new lab order (${o.panels.map(panelName).join(", ")}) · ordered ${format(parseISO(orderedAt(o)), "d MMM")}`)
            .join("; ")}
        </p>
      )}
    </section>
  );
}
