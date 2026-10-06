"use client";

import { useState } from "react";
import { BookOpen, ChevronDown, Pencil, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { TrendLabel } from "@/lib/review";
import type { Finding, FindingEdit } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SEVERITY_STYLE, SeverityBadge } from "./badges";

interface Wording {
  title: string;
  summary: string;
  recommendation: string;
}

export function FindingCard({
  finding,
  edit,
  chips,
  statusLabel,
  large,
  readOnly,
  onToggle,
  onSaveWording,
  onResetWording,
}: {
  finding: Finding;
  edit?: FindingEdit;
  chips: string[];
  /** e.g. "Rapid decline" + "still within normal range". */
  statusLabel?: TrendLabel;
  large?: boolean;
  readOnly?: boolean;
  onToggle: (included: boolean) => void;
  onSaveWording: (w: Wording) => void;
  onResetWording: () => void;
}) {
  const included = edit?.included ?? true;
  const title = edit?.title || finding.title;
  const summary = edit?.summary || finding.summary;
  const recommendation = edit?.recommendation || finding.recommendation;
  const reworded = title !== finding.title || summary !== finding.summary || recommendation !== finding.recommendation;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Wording>({ title, summary, recommendation: recommendation ?? "" });
  const style = SEVERITY_STYLE[finding.severity];
  // The generic "no other concerns" finding has nothing to toggle or reword.
  const editable = !readOnly && finding.category !== "normal";

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 transition-opacity",
        large ? "ring-slate-300" : "ring-slate-200",
        !included && "opacity-60",
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-1.5", style.bar)} aria-hidden />
      <div className={large ? "py-6 pr-6 pl-8" : "py-5 pr-5 pl-7"}>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={finding.severity} />
              <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">{finding.disease}</span>
              {reworded && (
                <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-sky-200">
                  Reworded by doctor
                </span>
              )}
              {!included && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                  Excluded from report
                </span>
              )}
            </div>
            {statusLabel && (
              <p className="mt-2">
                <span className={cn("text-sm font-semibold", SEVERITY_STYLE[statusLabel.tone].text)}>{statusLabel.main}</span>
                {statusLabel.secondary && <span className="ml-1.5 text-xs text-slate-500">{statusLabel.secondary}</span>}
              </p>
            )}
            <h3 className={cn("mt-1 font-semibold text-slate-900", large ? "text-xl" : "text-base")}>{title}</h3>
          </div>
          {editable && (
            <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
              Include in report
              <button
                type="button"
                role="switch"
                aria-checked={included}
                onClick={() => onToggle(!included)}
                className={cn(
                  "relative h-5 w-9 rounded-full transition-colors",
                  included ? "bg-teal-600" : "bg-slate-300",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform",
                    included && "translate-x-4",
                  )}
                />
              </button>
            </label>
          )}
        </div>

        {editing ? (
          <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4">
            <label className="block text-xs font-medium text-slate-600">
              Title
              <Input
                className="mt-1 bg-white"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Summary
              <Textarea
                className="mt-1 bg-white"
                value={draft.summary}
                onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Recommendation
              <Textarea
                className="mt-1 bg-white"
                value={draft.recommendation}
                onChange={(e) => setDraft({ ...draft, recommendation: e.target.value })}
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-teal-600 text-white hover:bg-teal-700"
                onClick={() => {
                  onSaveWording(draft);
                  setEditing(false);
                }}
              >
                Save wording
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className={cn("mt-2 text-slate-700", large ? "text-base" : "text-sm")}>{summary}</p>

            {chips.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {chips.map((c) => (
                  <li key={c} className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 tabular-nums">
                    {c}
                  </li>
                ))}
              </ul>
            )}

            {recommendation && (
              <p className={cn("mt-3 rounded-xl px-3 py-2 text-sm", style.soft)}>
                <span className={cn("font-medium", style.text)}>Recommendation: </span>
                <span className="text-slate-700">{recommendation}</span>
              </p>
            )}
          </>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            <BookOpen className="size-3.5" aria-hidden />
            {finding.guideline}
          </span>
          {finding.evidence.length > 0 && (
            <details className="group text-xs text-slate-500">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1 hover:text-slate-700">
                <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
                How this was calculated
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
                {finding.evidence.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </details>
          )}
          {editable && !editing && (
            <span className="ml-auto flex gap-1">
              {reworded && (
                <Button variant="ghost" size="sm" onClick={onResetWording}>
                  <RotateCcw /> AI wording
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDraft({ title, summary, recommendation: recommendation ?? "" });
                  setEditing(true);
                }}
              >
                <Pencil /> Edit wording
              </Button>
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
