"use client";

import { useState, type FormEvent } from "react";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normaliseWorkspaceCode } from "@/lib/sync/engine";
import { useHydrated } from "@/store/useInaraStore";
import { syncMode, useSyncStore } from "@/store/useSyncStore";

/** Login page: teammates who enter the same code see the same demo data live. */
export function WorkspaceCard() {
  const hydrated = useHydrated();
  // Saved settings only exist in the browser: wait for them (avoids a hydration mismatch).
  return hydrated ? <WorkspaceForm /> : null;
}

function WorkspaceForm() {
  const workspace = useSyncStore((s) => s.workspace);
  const offlineMode = useSyncStore((s) => s.offlineMode);
  const setWorkspace = useSyncStore((s) => s.setWorkspace);
  const setOfflineMode = useSyncStore((s) => s.setOfflineMode);
  const [code, setCode] = useState(workspace);
  const [error, setError] = useState<string | null>(null);
  const mode = syncMode(offlineMode);

  const join = (e: FormEvent) => {
    e.preventDefault();
    const next = normaliseWorkspaceCode(code);
    if (!next) {
      setError("Use 3–20 letters, numbers or dashes, e.g. DEMO1.");
      return;
    }
    setError(null);
    setCode(next);
    if (offlineMode) setOfflineMode(false);
    if (next !== workspace) {
      setWorkspace(next);
      toast.success(`Joined workspace ${next}`);
    }
  };

  return (
    <form onSubmit={join} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Users className="size-4 text-teal-600" />
        Workspace code
      </div>
      {mode === "not_configured" ? (
        <p className="mt-2 text-sm text-slate-600">
          Shared sync isn&apos;t set up on this build, so this device uses its own demo data.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-slate-600">
            Everyone with the same code sees the same demo data live. Current: <strong className="font-mono">{workspace}</strong>
            {offlineMode && " (offline mode)"}
          </p>
          <div className="mt-3 flex gap-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              aria-label="Workspace code"
              aria-invalid={!!error}
              className="font-mono uppercase"
              maxLength={20}
            />
            <Button type="submit" variant="outline">
              Join
            </Button>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </>
      )}
    </form>
  );
}
