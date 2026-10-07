/**
 * Shared workspace sync (no React, no Supabase import — the backend is injected,
 * so tests run it against an in-memory fake).
 *
 * - Local changes are pushed after a short debounce with a version check
 *   (`update … where version = v`, then version v + 1).
 * - Realtime is only a "something changed" signal; the row is then re-fetched.
 * - If the other device wrote first, the change is merged (src/lib/sync/merge.ts):
 *   last write wins per value, and every overwritten value is reported.
 * - A "Reset demo" from any device starts a new epoch: everyone adopts it.
 * - Network errors never drop local changes: they stay in the store
 *   (localStorage) and are retried.
 */

import { deepEqual, threeWayMerge } from "./merge";

export type SharedData = Record<string, unknown>;

export interface WorkspaceRow {
  id: string;
  state: unknown;
  version: number;
}

export interface SyncBackend {
  fetch(id: string): Promise<WorkspaceRow | null>;
  /** Create the row at version 1. `conflict` = it already exists. */
  insert(id: string, state: WorkspacePayload): Promise<{ ok: true; row: WorkspaceRow } | { ok: false; conflict: true }>;
  /** Write only if the row is still at `expectedVersion`; null = someone else wrote first. */
  update(id: string, state: WorkspacePayload, expectedVersion: number): Promise<WorkspaceRow | null>;
  /** Calls `onChange(version)` when the row changes on any device. Returns unsubscribe. */
  subscribe(id: string, onChange: (version: number) => void): () => void;
}

/** What the `state` column holds. */
export interface WorkspacePayload {
  /** The store's persist version: different app versions never mix data. */
  schema: number;
  /** Changes on every "Reset demo"; a new epoch replaces everyone's data. */
  epoch: string;
  /** Device that wrote this version (its own realtime echo is ignored). */
  origin: string;
  data: SharedData;
}

/** The last version this device and the workspace agreed on (saved across reloads). */
export interface SyncBase {
  workspace: string;
  version: number;
  epoch: string;
  data: SharedData;
}

export type SyncStatus = "synced" | "syncing" | "offline";

export interface SyncStatusInfo {
  status: SyncStatus;
  workspace: string;
  version: number | null;
  lastSyncedAt: string | null;
  /** Why it's offline (plain words). */
  detail?: string;
}

export type SyncNotice =
  | { kind: "conflict"; paths: string[] }
  | { kind: "remote_reset"; discardedLocal: boolean }
  | { kind: "newer_schema" };

export interface SyncEngineOptions {
  backend: SyncBackend;
  workspace: string;
  schema: number;
  deviceId: string;
  getLocal: () => SharedData;
  /** Replace the shared part of the local store (never the session). */
  applyRemote: (data: SharedData) => void;
  loadBase: () => SyncBase | null;
  saveBase: (base: SyncBase) => void;
  onStatus: (info: SyncStatusInfo) => void;
  onNotice?: (notice: SyncNotice) => void;
  newEpoch?: () => string;
  now?: () => string;
  debounceMs?: number;
  retryMs?: number;
  maxRetryMs?: number;
}

export interface SyncEngine {
  start(): void;
  /** Stop timers and realtime. Pending changes stay in the local store. */
  stop(): void;
  /** Call after every local change to shared data. */
  localChanged(): void;
  /** Push now (skips the debounce). */
  flush(): Promise<void>;
  /** Fetch the row and reconcile (e.g. on window focus). */
  refresh(): Promise<void>;
  /** "Reset demo": write the (already reset) local state as a new epoch, overriding everyone. */
  reset(): Promise<void>;
}

const MAX_ATTEMPTS = 5;

export function createSyncEngine(opts: SyncEngineOptions): SyncEngine {
  const {
    backend,
    workspace,
    schema,
    deviceId,
    getLocal,
    applyRemote,
    onStatus,
    onNotice = () => {},
    newEpoch = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    now = () => new Date().toISOString(),
    debounceMs = 800,
    retryMs = 3000,
    maxRetryMs = 30_000,
  } = opts;

  let base: SyncBase | null = null;
  let stopped = true;
  let applying = false;
  let pendingReset = false;
  let blocked = false; // newer app version in the workspace: never write to it
  let debounce: ReturnType<typeof setTimeout> | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let retryDelay = retryMs;
  let unsubscribe: (() => void) | null = null;
  let chain: Promise<void> = Promise.resolve();
  let lastSyncedAt: string | null = null;

  const status = (s: SyncStatus, detail?: string) =>
    onStatus({ status: s, workspace, version: base?.version ?? null, lastSyncedAt, ...(detail ? { detail } : {}) });

  const setBase = (version: number, epoch: string, data: SharedData) => {
    base = { workspace, version, epoch, data };
    opts.saveBase(base);
  };

  const adopt = (version: number, payload: WorkspacePayload) => {
    applying = true;
    try {
      applyRemote(payload.data);
    } finally {
      applying = false;
    }
    setBase(version, payload.epoch, payload.data);
  };

  const payloadFor = (data: SharedData, epoch: string): WorkspacePayload => ({ schema, epoch, origin: deviceId, data });

  const localDirty = (local: SharedData) => !base || !deepEqual(local, base.data);

  /** One full reconcile. Throws on network errors. */
  async function reconcile(): Promise<void> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (stopped) return;
      const row = await backend.fetch(workspace);
      if (stopped) return;
      const local = getLocal();
      const remote = parsePayload(row?.state);

      if (remote && remote.schema > schema) {
        blocked = true;
        onNotice({ kind: "newer_schema" });
        status("offline", "This workspace was saved by a newer app version — using this device's data only.");
        return;
      }
      blocked = false;

      // Reset, empty workspace, or one from an older app version: write ours.
      if (pendingReset || !row || !remote || remote.schema < schema) {
        const epoch = pendingReset || !base ? newEpoch() : base.epoch;
        const payload = payloadFor(local, epoch);
        if (!row) {
          const res = await backend.insert(workspace, payload);
          if (!res.ok) continue; // created by another device meanwhile
          setBase(res.row.version, epoch, local);
        } else {
          const written = await backend.update(workspace, payload, row.version);
          if (!written) continue;
          setBase(written.version, epoch, local);
        }
        pendingReset = false;
        return;
      }

      if (base && row.version === base.version && remote.epoch === base.epoch) {
        // Nobody else wrote: push ours if it changed.
        if (!localDirty(local)) return;
        const written = await backend.update(workspace, payloadFor(local, base.epoch), base.version);
        if (!written) continue;
        setBase(written.version, base.epoch, local);
        return;
      }

      // The workspace moved on.
      if (!base) {
        adopt(row.version, remote); // first time on this device: take the shared data
        return;
      }
      if (remote.epoch !== base.epoch) {
        const discardedLocal = localDirty(local);
        adopt(row.version, remote);
        onNotice({ kind: "remote_reset", discardedLocal });
        return;
      }
      if (!localDirty(local)) {
        adopt(row.version, remote);
        return;
      }
      const { merged, conflicts } = threeWayMerge(base.data, local, remote.data);
      adopt(row.version, { ...remote, data: merged });
      if (conflicts.length) onNotice({ kind: "conflict", paths: conflicts });
      if (deepEqual(merged, remote.data)) return;
      const written = await backend.update(workspace, payloadFor(merged, remote.epoch), row.version);
      if (!written) continue;
      setBase(written.version, remote.epoch, merged);
      return;
    }
    throw new Error("Too many concurrent writes — will retry");
  }

  /** Fast path: push without fetching first when we're up to date. */
  async function push(): Promise<void> {
    if (!base || pendingReset || blocked) return reconcile();
    const local = getLocal();
    if (!localDirty(local)) return;
    const written = await backend.update(workspace, payloadFor(local, base.epoch), base.version);
    if (stopped) return;
    if (written) setBase(written.version, base.epoch, local);
    else await reconcile();
  }

  /** Run one operation at a time; report status; retry with backoff on errors. */
  function run(op: () => Promise<void>): Promise<void> {
    chain = chain.then(async () => {
      if (stopped) return;
      status("syncing");
      try {
        await op();
        if (stopped || blocked) return;
        retryDelay = retryMs;
        lastSyncedAt = now();
        status("synced");
      } catch {
        if (stopped) return;
        status("offline", "Can't reach the shared workspace — changes are kept on this device and will sync when it's back.");
        if (retry) clearTimeout(retry);
        retry = setTimeout(() => {
          retry = null;
          void run(reconcile);
        }, retryDelay);
        retryDelay = Math.min(retryDelay * 2, maxRetryMs);
      }
    });
    return chain;
  }

  const clearDebounce = () => {
    if (debounce) clearTimeout(debounce);
    debounce = null;
  };

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      const saved = opts.loadBase();
      // A base from another workspace means the local data belongs to that one: don't merge it in.
      base = saved && saved.workspace === workspace ? saved : null;
      unsubscribe = backend.subscribe(workspace, (version) => {
        if (base && version <= base.version) return; // our own echo, or old news
        void run(reconcile);
      });
      void run(reconcile);
    },
    stop() {
      stopped = true;
      clearDebounce();
      if (retry) clearTimeout(retry);
      retry = null;
      unsubscribe?.();
      unsubscribe = null;
    },
    localChanged() {
      if (applying || stopped) return;
      clearDebounce();
      status("syncing");
      debounce = setTimeout(() => {
        debounce = null;
        void run(push);
      }, debounceMs);
    },
    flush() {
      clearDebounce();
      return run(push);
    },
    refresh() {
      return run(reconcile);
    },
    reset() {
      clearDebounce();
      pendingReset = true;
      return run(reconcile);
    },
  };
}

export function parsePayload(state: unknown): WorkspacePayload | null {
  if (typeof state !== "object" || state === null) return null;
  const s = state as Partial<WorkspacePayload>;
  if (typeof s.schema !== "number" || typeof s.epoch !== "string" || typeof s.data !== "object" || s.data === null) return null;
  return { schema: s.schema, epoch: s.epoch, origin: typeof s.origin === "string" ? s.origin : "", data: s.data as SharedData };
}

/** Workspace codes: 3–20 letters, digits or dashes, upper case ("demo1" → "DEMO1"). */
export function normaliseWorkspaceCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  return /^[A-Z0-9-]{3,20}$/.test(code) ? code : null;
}

export const DEFAULT_WORKSPACE = "DEMO1";
