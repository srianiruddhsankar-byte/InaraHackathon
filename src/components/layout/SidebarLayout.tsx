"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Check, ChevronsLeft, ChevronsRight, Lock, Menu, X, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface SidebarItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Navigate with a link (e.g. another page) … */
  href?: string;
  /** … or switch section in place. */
  onSelect?: () => void;
  active?: boolean;
  done?: boolean;
  /** Why it can't be opened yet; shown as a lock and a toast. */
  locked?: string;
  /** Small count or dot, e.g. new results. */
  badge?: ReactNode;
}

export interface SidebarGroup {
  label?: string;
  items: SidebarItem[];
}

const COLLAPSE_KEY = "prodrome:sidebar-collapsed";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

function ItemButton({ item, collapsed, onDone }: { item: SidebarItem; collapsed: boolean; onDone: () => void }) {
  const Icon = item.icon;
  const cls = cn(
    "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors",
    collapsed && "lg:justify-center lg:px-0",
    item.active ? "bg-teal-50 text-teal-800 ring-1 ring-teal-100" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
    item.locked && "opacity-60",
  );
  const body = (
    <>
      <span className="relative shrink-0">
        <Icon className={cn("size-5", item.active ? "text-teal-600" : "text-slate-400 group-hover:text-slate-600")} aria-hidden />
        {item.locked ? (
          <Lock className="absolute -right-1.5 -bottom-1 size-3 rounded-full bg-white text-slate-500" aria-label="Locked" />
        ) : item.done ? (
          <Check className="absolute -right-1.5 -bottom-1 size-3 rounded-full bg-teal-600 p-px text-white" aria-label="Done" />
        ) : null}
      </span>
      <span className={cn("min-w-0 flex-1 leading-snug", collapsed && "lg:sr-only")}>{item.label}</span>
      {item.badge && <span className={cn(collapsed && "lg:hidden")}>{item.badge}</span>}
    </>
  );
  if (item.href && !item.locked) {
    return (
      <Link href={item.href} className={cls} aria-current={item.active ? "page" : undefined} title={collapsed ? item.label : undefined} onClick={onDone}>
        {body}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={cls}
      aria-current={item.active ? "page" : undefined}
      aria-disabled={!!item.locked}
      title={item.locked ?? (collapsed ? item.label : undefined)}
      onClick={() => {
        if (item.locked) {
          toast.info(item.locked);
          return;
        }
        item.onSelect?.();
        onDone();
      }}
    >
      {body}
    </button>
  );
}

function Nav({ groups, collapsed, onDone }: { groups: SidebarGroup[]; collapsed: boolean; onDone: () => void }) {
  return (
    <nav className="space-y-4">
      {groups.map((g, i) => (
        <div key={g.label ?? i} className={cn(i > 0 && "border-t border-slate-100 pt-4")}>
          {g.label && (
            <p className={cn("mb-1.5 px-3 text-[11px] font-semibold tracking-wide text-slate-400 uppercase", collapsed && "lg:sr-only")}>{g.label}</p>
          )}
          <ul className="space-y-1">
            {g.items.map((item) => (
              <li key={item.id}>
                <ItemButton item={item} collapsed={collapsed} onDone={onDone} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * A role's sidebar: full on desktop and collapsible to icons (remembered), a
 * slide-in drawer on mobile. Content goes on the right.
 */
export function SidebarLayout({ title, groups, children }: { title: string; groups: SidebarGroup[]; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [open, setOpen] = useState(false);
  const active = groups.flatMap((g) => g.items).find((i) => i.active);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        // Not remembered when storage is unavailable.
      }
      return !c;
    });
  };

  return (
    <div className="lg:flex lg:items-start lg:gap-6">
      {/* Mobile: a bar with the current section and a menu button. */}
      <div className="sticky top-14 z-30 -mx-4 -mt-8 mb-4 flex items-center gap-3 border-b border-slate-200 bg-slate-50/95 px-4 py-2 backdrop-blur lg:hidden print:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="flex size-10 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm ring-1 ring-slate-200"
        >
          <Menu className="size-5" aria-hidden />
        </button>
        <div className="min-w-0">
          <p className="truncate text-xs text-slate-500">{title}</p>
          <p className="truncate font-semibold text-slate-900">{active?.label}</p>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden print:hidden" role="dialog" aria-modal="true" aria-label={`${title} menu`}>
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-white p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-semibold text-slate-900">{title}</p>
              <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <Nav groups={groups} collapsed={false} onDone={() => setOpen(false)} />
          </div>
        </div>
      )}

      <aside
        className={cn(
          "sticky top-20 hidden shrink-0 flex-col rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200 transition-[width] lg:flex print:hidden",
          collapsed ? "w-16" : "w-60",
        )}
        aria-label={`${title} menu`}
      >
        <p className={cn("mb-3 truncate px-3 text-xs font-semibold text-slate-500", collapsed && "sr-only")}>{title}</p>
        <Nav groups={groups} collapsed={collapsed} onDone={() => {}} />
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "mt-4 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800",
            collapsed && "justify-center px-0",
          )}
        >
          {collapsed ? <ChevronsRight className="size-4" aria-hidden /> : <ChevronsLeft className="size-4" aria-hidden />}
          {!collapsed && "Collapse"}
        </button>
      </aside>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** The section in the URL (?section=…), changed without a page reload; Back/Forward still work. */
export function setSectionInUrl(section: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("section", section);
  url.searchParams.delete("view");
  window.history.pushState(null, "", url.toString());
  window.scrollTo({ top: 0 });
}

/**
 * The current section from ?section= (Back/Forward aware), falling back to
 * `fallback` when missing or not one of `allowed`.
 */
export function useSection<T extends string>(allowed: readonly T[], fallback: T, params: URLSearchParams | null): T {
  const s = params?.get("section");
  return s && (allowed as readonly string[]).includes(s) ? (s as T) : fallback;
}
