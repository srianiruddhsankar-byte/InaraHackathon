"use client";

import { useId, useState } from "react";
import { ChevronDown, LayoutList, PencilLine, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CATEGORIES, formularyByCategory, searchFormulary, type FormularyCategory, type FormularyEntry } from "@/lib/formulary";
import { cn } from "@/lib/utils";

/**
 * Always-visible medicine search: type-ahead over the formulary (name, class or
 * category) with keyboard support, a "Browse by class" panel, and a fallback to
 * add a custom medicine.
 */
export function MedicineSearch({
  onPick,
  onCustom,
}: {
  onPick: (entry: FormularyEntry) => void;
  onCustom: (name: string) => void;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const [browsing, setBrowsing] = useState(false);
  const [category, setCategory] = useState<FormularyCategory>(CATEGORIES[0]);

  const q = query.trim();
  const results = searchFormulary(q);
  // Options: formulary matches, then "add as custom" (always last).
  const optionCount = q ? results.length + 1 : 0;
  const open = focused && optionCount > 0;
  const optionId = (i: number) => `${listId}-opt-${i}`;

  const reset = () => {
    setQuery("");
    setActive(0);
  };
  const pick = (e: FormularyEntry) => {
    onPick(e);
    reset();
    setBrowsing(false);
  };
  const choose = (i: number) => {
    if (i < results.length) pick(results[i]);
    else if (q) {
      onCustom(q);
      reset();
    }
  };

  const group = formularyByCategory().find((g) => g.category === category)!;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input
            role="combobox"
            aria-label="Search medicines"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open ? optionId(active) : undefined}
            placeholder="Search medicines by name or class (e.g. metformin, statin, NSAID)"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") return reset();
              if (!optionCount) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => (a + 1) % optionCount);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => (a - 1 + optionCount) % optionCount);
              } else if (e.key === "Enter") {
                e.preventDefault();
                choose(active);
              }
            }}
            className="h-10 bg-white pl-9 text-sm"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={reset}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
            >
              <X className="size-4" />
            </button>
          )}

          {open && (
            <ul
              id={listId}
              role="listbox"
              aria-label="Matching medicines"
              className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-xl bg-white py-1 shadow-lg ring-1 ring-slate-200"
            >
              {results.map((e, i) => (
                <li
                  key={e.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === active}
                  // mouseDown (not click) so the input's blur doesn't close the list first
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    choose(i);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn("cursor-pointer px-3 py-2", i === active && "bg-teal-50")}
                >
                  <p className="text-sm font-semibold text-slate-900">{e.genericName}</p>
                  <p className="text-xs text-slate-500">
                    {e.drugClass} · {e.strengths.join(", ")}
                  </p>
                </li>
              ))}
              <li
                id={optionId(results.length)}
                role="option"
                aria-selected={active === results.length}
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  choose(results.length);
                }}
                onMouseEnter={() => setActive(results.length)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 border-t border-slate-100 px-3 py-2 text-sm text-slate-700",
                  active === results.length && "bg-slate-50",
                )}
              >
                <PencilLine className="size-4 shrink-0 text-slate-400" aria-hidden />
                <span className="min-w-0 flex-1">
                  {results.length === 0 ? "No match — add as custom medicine" : "Add as custom medicine"}:{" "}
                  <span className="font-medium">“{q}”</span>
                </span>
                <span className="shrink-0 text-xs text-slate-500">No safety checks</span>
              </li>
            </ul>
          )}
        </div>
        <Button variant="outline" className="h-10" aria-expanded={browsing} onClick={() => setBrowsing((b) => !b)}>
          <LayoutList /> Browse by class
          <ChevronDown className={cn("transition-transform", browsing && "rotate-180")} />
        </Button>
      </div>

      {browsing && (
        <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <div role="tablist" aria-label="Medicine classes" className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={c === category}
                onClick={() => setCategory(c)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium ring-1",
                  c === category ? "bg-teal-600 text-white ring-teal-600" : "bg-white text-slate-700 ring-slate-200 hover:bg-teal-50",
                )}
              >
                {c}
              </button>
            ))}
          </div>
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {group.entries.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => pick(e)}
                  className="w-full rounded-lg bg-white px-3 py-2 text-left ring-1 ring-slate-200 hover:bg-teal-50 hover:ring-teal-200"
                >
                  <p className="text-sm font-semibold text-slate-900">{e.genericName}</p>
                  <p className="truncate text-xs text-slate-500">
                    {e.drugClass} · {e.strengths.join(", ")}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
