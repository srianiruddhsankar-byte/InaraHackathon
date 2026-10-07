"use client";

import Link from "next/link";
import { Popover } from "@base-ui/react/popover";
import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { refreshSync, syncMode, useSyncStore } from "@/store/useSyncStore";

const STYLE = {
  synced: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  syncing: "bg-amber-50 text-amber-700 ring-amber-200",
  offline: "bg-slate-100 text-slate-600 ring-slate-200",
} as const;

/** Top-bar chip: Synced / Syncing / Offline, with workspace details and the Offline mode switch. */
export function SyncChip() {
  const { workspace, offlineMode, info, setOfflineMode } = useSyncStore();
  const mode = syncMode(offlineMode);
  const status = mode === "shared" ? (info?.status ?? "syncing") : "offline";
  const label = { synced: "Synced", syncing: "Syncing", offline: "Offline" }[status];
  const detail =
    mode === "not_configured"
      ? "Shared sync isn't set up on this build (Supabase keys missing). Everything works from this device's storage."
      : mode === "offline_mode"
        ? "Offline mode is on. Everything works from this device's storage; changes sync when you turn it off."
        : status === "offline"
          ? (info?.detail ?? "Can't reach the shared workspace.")
          : status === "synced"
            ? "All devices in this workspace see the same demo data."
            : "Sending changes…";

  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={`Sync status: ${label}`}
        className={cn(
          "flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-colors",
          STYLE[status],
        )}
      >
        {status === "offline" ? (
          <CloudOff className="size-3.5" />
        ) : status === "syncing" ? (
          <RefreshCw className="size-3.5 animate-spin" />
        ) : (
          <Cloud className="size-3.5" />
        )}
        <span className="hidden sm:inline">{label}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8} className="z-50">
          <Popover.Popup className="w-72 rounded-2xl bg-white p-4 text-sm shadow-lg ring-1 ring-slate-200 outline-none">
            <Popover.Title className="font-semibold text-slate-900">Shared demo data</Popover.Title>
            <Popover.Description className="mt-1 text-slate-600">{detail}</Popover.Description>

            {mode !== "not_configured" && (
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-slate-500">Workspace</dt>
                <dd className="font-mono font-medium text-slate-900">{workspace}</dd>
                {info?.lastSyncedAt && (
                  <>
                    <dt className="text-slate-500">Last synced</dt>
                    <dd className="text-slate-700">{new Date(info.lastSyncedAt).toLocaleTimeString()}</dd>
                  </>
                )}
              </dl>
            )}

            {mode !== "not_configured" && (
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                <span id="offline-mode-label" className="font-medium text-slate-800">
                  Offline mode
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={offlineMode}
                  aria-labelledby="offline-mode-label"
                  onClick={() => setOfflineMode(!offlineMode)}
                  className={cn(
                    "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                    offlineMode ? "bg-teal-600" : "bg-slate-300",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform",
                      offlineMode && "translate-x-5",
                    )}
                  />
                </button>
              </div>
            )}

            <div className="mt-3 flex items-center justify-between gap-2">
              <Link href="/login" className="text-xs font-medium text-teal-700 hover:underline">
                Change workspace
              </Link>
              {mode === "shared" && (
                <Button size="sm" variant="outline" onClick={() => void refreshSync()}>
                  <RefreshCw />
                  Sync now
                </Button>
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
