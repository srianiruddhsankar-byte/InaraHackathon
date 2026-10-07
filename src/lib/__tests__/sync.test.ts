import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSyncEngine,
  normaliseWorkspaceCode,
  type SharedData,
  type SyncBackend,
  type SyncBase,
  type SyncNotice,
  type SyncStatusInfo,
  type WorkspacePayload,
  type WorkspaceRow,
} from "@/lib/sync/engine";
import { stableStringify, threeWayMerge } from "@/lib/sync/merge";
import { supabaseBackend } from "@/lib/sync/supabaseBackend";
import { SHARED_KEYS, sharedData, useInaraStore } from "@/store/useInaraStore";

/** In-memory demo_workspaces table with the same version check and realtime callbacks. */
class FakeBackend implements SyncBackend {
  rows = new Map<string, WorkspaceRow>();
  online = true;
  writes = 0;
  private subs = new Set<{ id: string; cb: (v: number) => void }>();

  private check() {
    if (!this.online) throw new Error("Failed to fetch");
  }
  private notify(row: WorkspaceRow) {
    for (const s of this.subs) if (s.id === row.id) queueMicrotask(() => s.cb(row.version));
  }
  async fetch(id: string) {
    this.check();
    const row = this.rows.get(id);
    return row ? structuredClone(row) : null;
  }
  async insert(id: string, state: WorkspacePayload) {
    this.check();
    if (this.rows.has(id)) return { ok: false as const, conflict: true as const };
    const row = { id, state: structuredClone(state), version: 1 };
    this.rows.set(id, row);
    this.writes++;
    this.notify(row);
    return { ok: true as const, row: structuredClone(row) };
  }
  async update(id: string, state: WorkspacePayload, expectedVersion: number) {
    this.check();
    const row = this.rows.get(id);
    if (!row || row.version !== expectedVersion) return null;
    const next = { id, state: structuredClone(state), version: expectedVersion + 1 };
    this.rows.set(id, next);
    this.writes++;
    this.notify(next);
    return structuredClone(next);
  }
  subscribe(id: string, cb: (v: number) => void) {
    const sub = { id, cb };
    this.subs.add(sub);
    return () => void this.subs.delete(sub);
  }
  data(id = "DEMO1") {
    return (this.rows.get(id)?.state as WorkspacePayload).data;
  }
}

/** One simulated device: its own local store, saved base, status and notices. */
function device(backend: SyncBackend, name: string, initial: SharedData, workspace = "DEMO1") {
  const dev = {
    local: structuredClone(initial),
    base: null as SyncBase | null,
    status: null as SyncStatusInfo | null,
    notices: [] as SyncNotice[],
    applied: 0,
  };
  const engine = createSyncEngine({
    backend,
    workspace,
    schema: 13,
    deviceId: name,
    getLocal: () => dev.local,
    applyRemote: (data) => {
      dev.applied++;
      dev.local = structuredClone(data);
      engine.localChanged(); // like the store subscription: must be ignored while applying
    },
    loadBase: () => dev.base,
    saveBase: (b) => (dev.base = structuredClone(b)),
    onStatus: (s) => (dev.status = s),
    onNotice: (n) => dev.notices.push(n),
    debounceMs: 800,
    retryMs: 1000,
  });
  const change = (fn: (d: SharedData) => SharedData) => {
    dev.local = fn(dev.local);
    engine.localChanged();
  };
  return Object.assign(dev, { engine, change });
}

const SEED: SharedData = {
  reports: [{ id: "r1", status: "ai_draft" }],
  consentLog: [],
  patientSettings: [{ id: "karthik", streaming: true }],
  simHours: 0,
};

const settle = () => vi.advanceTimersByTimeAsync(2000);

describe("sync engine", () => {
  let backend: FakeBackend;
  beforeEach(() => {
    vi.useFakeTimers();
    backend = new FakeBackend();
  });
  afterEach(() => vi.useRealTimers());

  it("seeds an empty workspace, then a second device adopts it", async () => {
    const a = device(backend, "a", SEED);
    a.engine.start();
    await settle();
    expect(backend.rows.get("DEMO1")?.version).toBe(1);
    expect(a.status?.status).toBe("synced");

    const b = device(backend, "b", { reports: [], simHours: 99 }); // stale local data
    b.engine.start();
    await settle();
    expect(b.local).toEqual(SEED);
    expect(b.status).toMatchObject({ status: "synced", version: 1 });
  });

  it("pushes a debounced local change and the other device receives it live", async () => {
    const a = device(backend, "a", SEED);
    a.engine.start();
    await settle();
    const b = device(backend, "b", SEED);
    b.engine.start();
    await settle();

    a.change((d) => ({ ...d, simHours: 6 }));
    expect(a.status?.status).toBe("syncing");
    await vi.advanceTimersByTimeAsync(500);
    expect(backend.rows.get("DEMO1")?.version).toBe(1); // still debouncing
    a.change((d) => ({ ...d, simHours: 12 }));
    await settle();

    expect(backend.rows.get("DEMO1")?.version).toBe(2); // two quick changes → one write
    expect(b.local.simHours).toBe(12);
    expect(a.status?.status).toBe("synced");
  });

  it("ignores its own realtime echo and doesn't push remote data back", async () => {
    const a = device(backend, "a", SEED);
    a.engine.start();
    await settle();
    const b = device(backend, "b", SEED);
    b.engine.start();
    await settle();
    const writes = backend.writes;
    const applied = { a: a.applied, b: b.applied };

    a.change((d) => ({ ...d, simHours: 6 }));
    await settle();
    expect(backend.writes).toBe(writes + 1);
    expect(a.applied).toBe(applied.a);
    expect(b.applied).toBe(applied.b + 1);
  });

  it("concurrent changes to different data are both kept (no conflict)", async () => {
    const a = device(backend, "a", SEED);
    a.engine.start();
    await settle();
    const b = device(backend, "b", SEED);
    b.engine.start();
    await settle();

    // Lab uploads a report on A while the patient changes consent on B, at the same moment.
    a.change((d) => ({ ...d, reports: [...(d.reports as object[]), { id: "r2", status: "ai_draft" }] }));
    b.change((d) => ({
      ...d,
      patientSettings: [{ id: "karthik", streaming: false }],
      consentLog: [{ change: "streaming", granted: false }],
    }));
    await settle();

    const expected = {
      ...SEED,
      reports: [...(SEED.reports as object[]), { id: "r2", status: "ai_draft" }],
      patientSettings: [{ id: "karthik", streaming: false }],
      consentLog: [{ change: "streaming", granted: false }],
    };
    expect(backend.data()).toEqual(expected);
    expect(a.local).toEqual(expected);
    expect(b.local).toEqual(expected);
    expect([...a.notices, ...b.notices]).toEqual([]);
  });

  it("both devices appending to the same list keep every item", async () => {
    const a = device(backend, "a", SEED);
    a.engine.start();
    await settle();
    const b = device(backend, "b", SEED);
    b.engine.start();
    await settle();

    a.change((d) => ({ ...d, reports: [...(d.reports as object[]), { id: "ra" }], consentLog: ["a"] }));
    b.change((d) => ({ ...d, reports: [...(d.reports as object[]), { id: "rb" }], consentLog: ["b"] }));
    await settle();

    expect((backend.data().reports as { id: string }[]).map((r) => r.id).sort()).toEqual(["r1", "ra", "rb"]);
    expect([...(backend.data().consentLog as string[])].sort()).toEqual(["a", "b"]);
    expect(a.local).toEqual(b.local);
  });

  it("the same value changed on both: the last write wins and the overwrite is reported", async () => {
    const a = device(backend, "a", SEED);
    a.engine.start();
    await settle();
    const b = device(backend, "b", SEED);
    b.engine.start();
    await settle();

    // Both change the demo clock before either has synced; A's write lands first.
    a.change((d) => ({ ...d, simHours: 6 }));
    b.change((d) => ({ ...d, simHours: 18 }));
    await settle();

    expect(backend.data().simHours).toBe(18);
    expect(a.local.simHours).toBe(18);
    expect(b.notices).toEqual([{ kind: "conflict", paths: ["simHours"] }]);
  });

  it("offline: the change is kept, status goes Offline, and it syncs when the network returns", async () => {
    const a = device(backend, "a", SEED);
    a.engine.start();
    await settle();

    backend.online = false;
    a.change((d) => ({ ...d, simHours: 6 }));
    await settle();
    expect(a.status?.status).toBe("offline");
    expect(a.status?.detail).toMatch(/kept on this device/);
    expect(a.local.simHours).toBe(6);

    backend.online = true;
    await vi.advanceTimersByTimeAsync(5000);
    expect(a.status?.status).toBe("synced");
    expect(backend.data().simHours).toBe(6);
  });

  it("keeps an unsynced change across a reload (saved base) and merges it", async () => {
    const a = device(backend, "a", SEED);
    a.engine.start();
    await settle();
    a.engine.stop();
    a.local = { ...a.local, simHours: 6 }; // changed while the app was closed / offline mode

    const b = device(backend, "b", SEED);
    b.engine.start();
    await settle();
    b.change((d) => ({ ...d, reports: [{ id: "r1", status: "approved" }] }));
    await settle();

    const reloaded = device(backend, "a", SEED);
    reloaded.base = a.base;
    reloaded.local = a.local;
    reloaded.engine.start();
    await settle();
    expect(backend.data()).toEqual({ ...SEED, simHours: 6, reports: [{ id: "r1", status: "approved" }] });
    expect(reloaded.notices).toEqual([]);
  });

  it("Reset demo overrides the shared data; other devices adopt it and say so", async () => {
    const a = device(backend, "a", SEED);
    a.engine.start();
    await settle();
    const b = device(backend, "b", SEED);
    b.engine.start();
    await settle();
    a.change((d) => ({ ...d, simHours: 30, reports: [] }));
    await settle();

    backend.online = false;
    b.change((d) => ({ ...d, simHours: 40 })); // pending on B
    await settle();
    backend.online = true;

    a.local = structuredClone(SEED); // resetDemo() on A
    await a.engine.reset();
    await vi.advanceTimersByTimeAsync(5000);

    expect(backend.data()).toEqual(SEED);
    expect(b.local).toEqual(SEED);
    expect(b.notices).toContainEqual({ kind: "remote_reset", discardedLocal: true });
  });

  it("never writes to a workspace saved by a newer app version", async () => {
    backend.rows.set("DEMO1", { id: "DEMO1", version: 3, state: { schema: 14, epoch: "x", origin: "z", data: { simHours: 1 } } });
    const a = device(backend, "a", SEED);
    a.engine.start();
    await settle();
    a.change((d) => ({ ...d, simHours: 6 }));
    await settle();
    expect(backend.rows.get("DEMO1")?.version).toBe(3);
    expect(a.status?.status).toBe("offline");
    expect(a.notices[0]).toEqual({ kind: "newer_schema" });
    expect(a.local.simHours).toBe(6);
  });

  it("replaces a workspace saved by an older app version", async () => {
    backend.rows.set("DEMO1", { id: "DEMO1", version: 3, state: { schema: 12, epoch: "x", origin: "z", data: { old: true } } });
    const a = device(backend, "a", SEED);
    a.engine.start();
    await settle();
    expect(backend.data()).toEqual(SEED);
    expect(backend.rows.get("DEMO1")?.version).toBe(4);
  });

  it("devices in different workspaces don't see each other's data", async () => {
    const a = device(backend, "a", SEED, "DEMO1");
    a.engine.start();
    await settle();
    const b = device(backend, "b", { simHours: 99 }, "TEAM2");
    b.engine.start();
    await settle();
    a.change((d) => ({ ...d, simHours: 6 }));
    await settle();
    expect(b.local).toEqual({ simHours: 99 });
    expect(backend.data("TEAM2")).toEqual({ simHours: 99 });
  });
});

describe("three-way merge", () => {
  it("compares data regardless of key order (jsonb reorders keys)", () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }));
  });

  it("merges items by id, inside nested objects too", () => {
    const base = { reports: [{ id: "r1", versions: [{ id: "v1" }], note: "x" }] };
    const local = { reports: [{ id: "r1", versions: [{ id: "v1" }, { id: "v2" }], note: "x" }] };
    const remote = { reports: [{ id: "r1", versions: [{ id: "v1" }], note: "y" }] };
    expect(threeWayMerge(base, local, remote)).toEqual({
      merged: { reports: [{ id: "r1", versions: [{ id: "v1" }, { id: "v2" }], note: "y" }] },
      conflicts: [],
    });
  });

  it("deletions on one side are respected unless the other side changed the item", () => {
    const base = { cases: [{ id: "c1", s: 1 }, { id: "c2", s: 1 }] };
    const local = { cases: [{ id: "c2", s: 1 }, { id: "c3", s: 1 }] }; // deleted c1, added c3
    const remote = { cases: [{ id: "c1", s: 1 }, { id: "c2", s: 2 }] }; // changed c2
    expect(threeWayMerge(base, local, remote).merged).toEqual({ cases: [{ id: "c2", s: 2 }, { id: "c3", s: 1 }] });
  });

  it("reports a conflict with its path and keeps the local value", () => {
    const r = threeWayMerge(
      { findingReviews: { r1: { f1: { included: true } } } },
      { findingReviews: { r1: { f1: { included: false, note: "mine" } } } },
      { findingReviews: { r1: { f1: { included: true, note: "theirs" } }, r2: {} } },
    );
    expect(r.merged).toEqual({ findingReviews: { r1: { f1: { included: false, note: "mine" } }, r2: {} } });
    expect(r.conflicts).toEqual(["findingReviews.r1.f1.note"]);
  });
});

describe("shared store data", () => {
  it("shares every saved key except the session", () => {
    useInaraStore.getState().resetDemo();
    const shared = sharedData(useInaraStore.getState());
    expect(Object.keys(shared).sort()).toEqual([...SHARED_KEYS].sort());
    expect(shared).not.toHaveProperty("session");
  });

  it("normalises workspace codes", () => {
    expect(normaliseWorkspaceCode(" demo1 ")).toBe("DEMO1");
    expect(normaliseWorkspaceCode("team-2")).toBe("TEAM-2");
    expect(normaliseWorkspaceCode("ab")).toBeNull();
    expect(normaliseWorkspaceCode("demo 1")).toBeNull();
  });
});

describe("supabase backend (mocked client)", () => {
  /** A chainable query builder that records calls and resolves to `result`. */
  function mockClient(result: { data: unknown; error: unknown }) {
    const calls: [string, ...unknown[]][] = [];
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "insert", "update", "eq", "maybeSingle", "single"]) {
      builder[m] = (...args: unknown[]) => {
        calls.push([m, ...args]);
        return builder;
      };
    }
    builder.then = (resolve: (v: unknown) => void) => resolve(result);
    const client = { from: (table: string) => (calls.push(["from", table]), builder) } as unknown as SupabaseClient;
    return { client, calls };
  }
  const payload: WorkspacePayload = { schema: 13, epoch: "e", origin: "a", data: {} };

  it("update only writes when the version still matches, and bumps it", async () => {
    const { client, calls } = mockClient({ data: [{ id: "DEMO1", state: payload, version: 4 }], error: null });
    const row = await supabaseBackend(client).update("DEMO1", payload, 3);
    expect(row?.version).toBe(4);
    expect(calls).toContainEqual(["update", { state: payload, version: 4 }]);
    expect(calls).toContainEqual(["eq", "id", "DEMO1"]);
    expect(calls).toContainEqual(["eq", "version", 3]);
  });

  it("update returns null when another device wrote first (no row matched)", async () => {
    const { client } = mockClient({ data: [], error: null });
    expect(await supabaseBackend(client).update("DEMO1", payload, 3)).toBeNull();
  });

  it("insert reports an existing row as a conflict; other errors throw", async () => {
    const dup = mockClient({ data: null, error: { code: "23505", message: "duplicate key" } });
    expect(await supabaseBackend(dup.client).insert("DEMO1", payload)).toEqual({ ok: false, conflict: true });
    const down = mockClient({ data: null, error: { code: "", message: "Failed to fetch" } });
    await expect(supabaseBackend(down.client).fetch("DEMO1")).rejects.toThrow("Failed to fetch");
  });
});
