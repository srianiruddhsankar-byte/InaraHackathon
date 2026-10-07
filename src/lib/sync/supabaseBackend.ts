import type { SupabaseClient } from "@supabase/supabase-js";
import type { SyncBackend, WorkspaceRow } from "./engine";

export const WORKSPACE_TABLE = "demo_workspaces";
const COLUMNS = "id,state,version";

/** SyncBackend on the demo_workspaces table (see CLAUDE.md for the SQL). Errors are thrown. */
export function supabaseBackend(client: SupabaseClient, table = WORKSPACE_TABLE): SyncBackend {
  return {
    async fetch(id) {
      const { data, error } = await client.from(table).select(COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return (data as WorkspaceRow | null) ?? null;
    },
    async insert(id, state) {
      const { data, error } = await client.from(table).insert({ id, state, version: 1 }).select(COLUMNS).single();
      if (error?.code === "23505") return { ok: false, conflict: true }; // unique violation: row exists
      if (error) throw new Error(error.message);
      return { ok: true, row: data as WorkspaceRow };
    },
    async update(id, state, expectedVersion) {
      const { data, error } = await client
        .from(table)
        .update({ state, version: expectedVersion + 1 })
        .eq("id", id)
        .eq("version", expectedVersion)
        .select(COLUMNS);
      if (error) throw new Error(error.message);
      return ((data as WorkspaceRow[] | null) ?? [])[0] ?? null;
    },
    subscribe(id, onChange) {
      const channel = client
        .channel(`workspace-${id}`)
        .on("postgres_changes", { event: "*", schema: "public", table, filter: `id=eq.${id}` }, (payload) => {
          const version = (payload.new as { version?: unknown } | null)?.version;
          if (typeof version === "number") onChange(version);
        })
        .subscribe();
      return () => {
        void client.removeChannel(channel);
      };
    },
  };
}
