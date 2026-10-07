"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, CloudOff, RefreshCw, ShieldX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/layout/EmptyState";
import { getSupabase } from "@/lib/sync/client";
import { listAuditLog, listStaffProfiles, setStaffStatus } from "@/lib/supabaseAuth";
import type { AccountStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useInaraStore, useSession } from "@/store/useInaraStore";

interface Account {
  id: string;
  name: string;
  email: string;
  role: string;
  hospital?: string;
  specialty?: string;
  councilRegNo?: string;
  status: AccountStatus;
}

interface AuditItem {
  id: string;
  targetName: string;
  targetRole: string;
  actorName: string;
  oldStatus: AccountStatus;
  newStatus: AccountStatus;
  reason: string;
  at: string;
}

type Filter = "all" | AccountStatus;

const STATUS_STYLE: Record<AccountStatus, string> = {
  pending: "bg-amber-50 text-amber-800 ring-amber-200",
  verified: "bg-green-50 text-green-800 ring-green-200",
  suspended: "bg-red-50 text-red-800 ring-red-200",
};

const STATUS_LABEL: Record<AccountStatus, string> = { pending: "Pending", verified: "Verified", suspended: "Suspended" };

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Real accounts from Supabase (real login) or the local demo users (offline demo login). */
function useAccounts() {
  const session = useSession();
  const real = session?.mode === "supabase";
  const users = useInaraStore((s) => s.users);
  const localLog = useInaraStore((s) => s.accountAuditLog);
  const setAccountStatus = useInaraStore((s) => s.setAccountStatus);
  const [remote, setRemote] = useState<{ accounts: Account[]; audit: AuditItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(real);

  const load = useCallback(async () => {
    const client = getSupabase();
    if (!client) return;
    setLoading(true);
    try {
      const [profiles, log] = await Promise.all([listStaffProfiles(client), listAuditLog(client)]);
      setRemote({
        accounts: profiles.map((p) => ({
          id: p.id,
          name: p.name,
          email: p.email,
          role: p.role,
          hospital: p.hospital ?? undefined,
          specialty: p.specialty ?? undefined,
          councilRegNo: p.council_reg_no ?? undefined,
          status: p.status,
        })),
        audit: log.map((a) => ({
          id: String(a.id),
          targetName: a.target_name,
          targetRole: a.target_role,
          actorName: a.actor_name,
          oldStatus: a.old_status,
          newStatus: a.new_status,
          reason: a.reason,
          at: a.created_at,
        })),
      });
      setError(null);
    } catch (e) {
      setError((e as Error).message || "Could not load accounts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!real) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
    };
  }, [real, load]);

  const local = useMemo(
    () => ({
      accounts: users
        .filter((u) => u.role === "doctor" || u.role === "lab")
        .map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email ?? "",
          role: u.role,
          hospital: u.hospital,
          specialty: u.specialty,
          councilRegNo: u.councilRegNo,
          status: u.status ?? "verified",
        })),
      audit: [...localLog].reverse().map((a) => ({ ...a, at: a.timestamp })),
    }),
    [users, localLog],
  );

  const change = async (id: string, status: AccountStatus, reason: string): Promise<string | null> => {
    if (!real) return setAccountStatus(id, status, reason);
    const client = getSupabase();
    if (!client) return "Secure sign-in is not configured.";
    const err = await setStaffStatus(client, id, status, reason);
    if (!err) await load();
    return err;
  };

  return { real, data: real ? remote : local, error, loading, reload: load, change };
}

export function AdminConsole() {
  const { real, data, error, loading, reload, change } = useAccounts();
  const [filter, setFilter] = useState<Filter>("pending");
  const [editing, setEditing] = useState<{ id: string; status: AccountStatus } | null>(null);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const accounts = useMemo(() => data?.accounts ?? [], [data]);
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: accounts.length, pending: 0, verified: 0, suspended: 0 };
    for (const a of accounts) c[a.status] += 1;
    return c;
  }, [accounts]);
  const shown = filter === "all" ? accounts : accounts.filter((a) => a.status === filter);

  const confirm = async () => {
    if (!editing) return;
    setBusy(true);
    const err = await change(editing.id, editing.status, reason);
    setBusy(false);
    if (err) {
      setActionError(err);
      return;
    }
    toast.success(editing.status === "verified" ? "Account verified" : editing.status === "suspended" ? "Account suspended" : "Status changed");
    setEditing(null);
    setReason("");
    setActionError(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        {real ? (
          <span className="rounded-full bg-teal-50 px-2 py-0.5 font-medium text-teal-700 ring-1 ring-teal-200">
            Live accounts (Supabase) · changes checked by the database
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
            <CloudOff className="size-3" />
            Offline demo accounts
          </span>
        )}
        {real && (
          <Button size="sm" variant="ghost" onClick={() => void reload()} disabled={loading}>
            <RefreshCw className={cn(loading && "animate-spin")} />
            Refresh
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6">
        <div role="tablist" aria-label="Filter by status" className="flex flex-wrap gap-1">
          {(["pending", "verified", "suspended", "all"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full px-3 py-1 text-sm font-medium ring-1 transition-colors",
                filter === f ? "bg-teal-600 text-white ring-teal-600" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
              )}
            >
              {f === "all" ? "All" : STATUS_LABEL[f]} ({counts[f]})
            </button>
          ))}
        </div>

        {!data && loading ? (
          <p className="py-8 text-center text-sm text-slate-500">Loading accounts…</p>
        ) : shown.length === 0 ? (
          <div className="py-4">
            <EmptyState title={filter === "pending" ? "No accounts waiting" : "No accounts here"}>
              {filter === "pending" ? "New doctor and lab registrations appear here for verification." : "Try another filter."}
            </EmptyState>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {shown.map((a) => (
              <li key={a.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">{a.name}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium ring-1", STATUS_STYLE[a.status])}>
                        {STATUS_LABEL[a.status]}
                      </span>
                      <span className="text-xs uppercase tracking-wide text-slate-500">{a.role}</span>
                    </div>
                    <p className="mt-0.5 break-all text-sm text-slate-600">{a.email}</p>
                    <p className="text-xs text-slate-500">
                      {[a.specialty, a.hospital, a.councilRegNo && `Reg. no. ${a.councilRegNo}`].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {a.status !== "verified" && (
                      <Button size="sm" onClick={() => setEditing({ id: a.id, status: "verified" })}>
                        <CheckCircle2 />
                        Verify
                      </Button>
                    )}
                    {a.status !== "suspended" && (
                      <Button size="sm" variant="outline" onClick={() => setEditing({ id: a.id, status: "suspended" })}>
                        <ShieldX />
                        Suspend
                      </Button>
                    )}
                  </div>
                </div>
                {editing?.id === a.id && (
                  <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                    <label className="block text-sm font-medium text-slate-700">
                      Reason for {editing.status === "verified" ? "verifying" : "suspending"} (kept in the audit log)
                      <Input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder={editing.status === "verified" ? "Registration number checked with the council" : "Registration under review"}
                        className="mt-1 h-9 bg-white"
                        autoFocus
                      />
                    </label>
                    {actionError && <p className="text-sm text-red-700">{actionError}</p>}
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => void confirm()} disabled={busy}>
                        {busy ? "Saving…" : editing.status === "verified" ? "Confirm verify" : "Confirm suspend"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditing(null);
                          setActionError(null);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6">
        <h2 className="font-semibold text-slate-900">Audit log</h2>
        <p className="text-sm text-slate-500">Append-only: every verification and suspension, who made it and why.</p>
        {!data?.audit.length ? (
          <p className="mt-4 text-sm text-slate-500">No status changes yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {data.audit.map((e) => (
              <li key={e.id} className="text-sm">
                <div className="text-slate-900">
                  <strong>{e.actorName}</strong> changed <strong>{e.targetName}</strong> ({e.targetRole}):{" "}
                  {STATUS_LABEL[e.oldStatus]} → {STATUS_LABEL[e.newStatus]}
                </div>
                <div className="text-slate-500">
                  “{e.reason}” · {fmt(e.at)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
