"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { getSupabase } from "@/lib/sync/client";
import { createSyncEngine, DEFAULT_WORKSPACE, type SyncBase, type SyncEngine, type SyncNotice, type SyncStatusInfo } from "@/lib/sync/engine";
import { supabaseBackend } from "@/lib/sync/supabaseBackend";
import { SHARED_KEYS, sharedData, STORE_SCHEMA, useInaraStore, type SharedState } from "./useInaraStore";

/** Last synced version (for merging after a reload). One workspace at a time. */
const BASE_KEY = "inara-sync-base";

export type SyncMode = "shared" | "offline_mode" | "not_configured";

interface SyncState {
  /** Persisted per device. */
  workspace: string;
  offlineMode: boolean;
  deviceId: string;
  /** Live (not persisted). */
  info: SyncStatusInfo | null;
  setWorkspace: (code: string) => void;
  setOfflineMode: (on: boolean) => void;
}

export const useSyncStore = create<SyncState>()(
  persist(
    (set) => ({
      workspace: DEFAULT_WORKSPACE,
      offlineMode: false,
      deviceId: nanoid(10),
      info: null,
      setWorkspace: (workspace) => set({ workspace }),
      setOfflineMode: (offlineMode) => set({ offlineMode }),
    }),
    {
      name: "inara-sync",
      storage: createJSONStorage(() => localStorage),
      partialize: ({ workspace, offlineMode, deviceId }) => ({ workspace, offlineMode, deviceId }),
    },
  ),
);

export function syncMode(offlineMode: boolean): SyncMode {
  if (!getSupabase()) return "not_configured";
  return offlineMode ? "offline_mode" : "shared";
}

function loadBase(): SyncBase | null {
  try {
    const raw = localStorage.getItem(BASE_KEY);
    return raw ? (JSON.parse(raw) as SyncBase) : null;
  } catch {
    return null;
  }
}

function saveBase(base: SyncBase) {
  try {
    localStorage.setItem(BASE_KEY, JSON.stringify(base));
  } catch {
    // Storage full or blocked: merging after a reload falls back to "adopt the shared data".
  }
}

function showNotice(n: SyncNotice) {
  if (n.kind === "conflict") {
    toast.warning("Another device changed the same data at the same time — this device's change was kept (last write wins).", {
      description: `Overwritten: ${[...new Set(n.paths.map((p) => p.split(/[.[]/)[0]))].join(", ")}`,
    });
  } else if (n.kind === "remote_reset") {
    toast.info(
      n.discardedLocal
        ? "The demo was reset on another device. This device's unsynced change was replaced by the fresh demo data."
        : "The demo was reset on another device.",
    );
  } else {
    toast.error("This workspace was saved by a newer version of the app. This device keeps its own data until you update.");
  }
}

let engine: SyncEngine | null = null;
let unsubscribeStore: (() => void) | null = null;

/** Start (or restart) syncing the current workspace. Stops when not configured or in offline mode. */
export function startSync() {
  stopSync();
  const { workspace, offlineMode, deviceId } = useSyncStore.getState();
  const client = getSupabase();
  if (!client || offlineMode) {
    useSyncStore.setState({ info: null });
    return;
  }
  const current = createSyncEngine({
    backend: supabaseBackend(client),
    workspace,
    schema: STORE_SCHEMA,
    deviceId,
    getLocal: () => sharedData(useInaraStore.getState()),
    applyRemote: (data) => useInaraStore.setState(data as Partial<SharedState>),
    loadBase,
    saveBase,
    onStatus: (info) => {
      if (engine === current) useSyncStore.setState({ info });
    },
    onNotice: showNotice,
  });
  engine = current;
  unsubscribeStore = useInaraStore.subscribe((s, prev) => {
    if (sharedChanged(s, prev)) current.localChanged();
  });
  current.start();
}

export function stopSync() {
  unsubscribeStore?.();
  unsubscribeStore = null;
  if (engine) {
    // Best effort: push what's pending before letting go (kept locally either way).
    const old = engine;
    engine = null;
    void old.flush().finally(() => old.stop());
  }
}

/** After "Reset demo": write the fresh data to the shared workspace for every device. */
export function resetSharedWorkspace() {
  return engine?.reset();
}

export function refreshSync() {
  return engine?.refresh();
}

const sharedChanged = (a: SharedState, b: SharedState) => SHARED_KEYS.some((k) => a[k] !== b[k]);
