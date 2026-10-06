"use client";

import { useState } from "react";
import { CircleStop, TriangleAlert, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CurrentMedication, StoppedMedication } from "@/lib/types";
import { cn } from "@/lib/utils";

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The patient's current medicines, each with a "Stop" action that needs a reason. */
export function CurrentMedsPanel({
  meds,
  stopping,
  flags,
  onStop,
  onUndo,
}: {
  meds: CurrentMedication[];
  stopping: StoppedMedication[];
  /** Medicine name → analysis notes about it (e.g. NSAID with a kidney finding). */
  flags: Record<string, string[]>;
  onStop: (med: CurrentMedication, reason: string) => void;
  onUndo: (name: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  if (meds.length === 0) {
    return <p className="text-sm text-slate-500">No current medications.</p>;
  }

  return (
    <ul className="space-y-2">
      {meds.map((m) => {
        const stop = stopping.find((s) => same(s.name, m.name));
        const notes = flags[m.name] ?? [];
        const consider = notes.some((n) => /consider stopping/i.test(n));
        return (
          <li
            key={m.name}
            className={cn("rounded-xl px-3 py-2 ring-1", stop ? "bg-red-50/50 ring-red-200" : "bg-white ring-slate-200")}
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm font-medium text-slate-900", stop && "text-slate-500 line-through")}>
                  {m.name} <span className="font-normal text-slate-600">· {m.dose}</span>
                </p>
                <p className="text-xs text-slate-500">
                  {m.frequency} · {m.prescribedBy}
                </p>
              </div>
              {stop ? (
                <>
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                    To stop · {stop.reason}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => onUndo(m.name)}>
                    <Undo2 /> Undo
                  </Button>
                </>
              ) : (
                editing !== m.name && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditing(m.name);
                      setReason(consider ? "May worsen kidney function" : "");
                    }}
                  >
                    <CircleStop /> Stop
                  </Button>
                )
              )}
            </div>

            {notes.length > 0 && !stop && (
              <div className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 ring-1 ring-amber-200">
                <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                <span>
                  <span className="font-semibold">Flagged in analysis — {consider ? "consider stopping" : "review"}.</span>{" "}
                  {notes.join(" ")}
                </span>
              </div>
            )}

            {editing === m.name && !stop && (
              <form
                className="mt-2 flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!reason.trim()) return;
                  onStop(m, reason.trim());
                  setEditing(null);
                }}
              >
                <Input
                  autoFocus
                  aria-label={`Reason for stopping ${m.name}`}
                  placeholder="Reason for stopping (required)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="min-w-48 flex-1"
                />
                <Button type="submit" size="sm" variant="destructive" disabled={!reason.trim()}>
                  Confirm stop
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}
