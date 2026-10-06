"use client";

import { useState } from "react";
import { PencilLine, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchFormulary, type FormularyEntry } from "@/lib/formulary";

/** "Add medicine": search the formulary by generic name or class, or add a custom medicine. */
export function MedicinePicker({
  onPick,
  onCustom,
}: {
  onPick: (entry: FormularyEntry) => void;
  onCustom: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const results = searchFormulary(query);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus /> Add medicine
      </Button>
    );
  }

  return (
    <div className="w-full rounded-xl bg-white p-3 ring-1 ring-teal-200">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input
            autoFocus
            aria-label="Search medicines"
            placeholder="Search by generic name or class (e.g. metformin, statin, NSAID)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
              if (e.key === "Enter" && results[0]) {
                e.preventDefault();
                onPick(results[0]);
                close();
              }
            }}
            className="pl-8"
          />
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Close search" onClick={close}>
          <X />
        </Button>
      </div>

      {query.trim() && (
        <ul className="mt-2 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg ring-1 ring-slate-100">
          {results.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className="flex w-full flex-wrap items-baseline justify-between gap-x-3 px-3 py-2 text-left text-sm hover:bg-teal-50"
                onClick={() => {
                  onPick(e);
                  close();
                }}
              >
                <span className="font-medium text-slate-900">{e.genericName}</span>
                <span className="text-xs text-slate-500">
                  {e.drugClass} · {e.strengths.join(", ")}
                </span>
              </button>
            </li>
          ))}
          {results.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">No match in the formulary.</li>}
          <li>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => {
                onCustom(query.trim());
                close();
              }}
            >
              <PencilLine className="size-4 text-slate-400" aria-hidden />
              Custom medicine (not in database): <span className="font-medium">“{query.trim()}”</span>
              <span className="ml-auto text-xs text-slate-500">No safety checks available</span>
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
