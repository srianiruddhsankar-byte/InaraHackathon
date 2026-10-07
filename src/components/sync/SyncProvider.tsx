"use client";

import { useEffect } from "react";
import { useHydrated } from "@/store/useInaraStore";
import { refreshSync, startSync, stopSync, useSyncStore } from "@/store/useSyncStore";

/** Starts shared sync once local data has loaded; restarts when the workspace or offline mode changes. */
export function SyncProvider() {
  const hydrated = useHydrated();
  const workspace = useSyncStore((s) => s.workspace);
  const offlineMode = useSyncStore((s) => s.offlineMode);

  useEffect(() => {
    if (!hydrated) return;
    startSync();
    return stopSync;
  }, [hydrated, workspace, offlineMode]);

  useEffect(() => {
    // Catch up after the laptop wakes or the network returns (realtime may have missed events).
    const onWake = () => {
      if (document.visibilityState === "visible") void refreshSync();
    };
    window.addEventListener("online", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      window.removeEventListener("online", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, []);

  return null;
}
