"use client";

import { useState } from "react";
import { Ban, CheckCircle2, Megaphone, Undo2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/layout/EmptyState";
import { MESSAGE_LIMITS, validateMessage, type AlertStatus, type PublicHealthAlert } from "@/lib/surveillance/alerts";
import { cn } from "@/lib/utils";
import { useInaraStore } from "@/store/useInaraStore";

const STATUS: Record<AlertStatus, { label: string; cls: string }> = {
  proposed: { label: "Proposed by system · needs review", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  authorised: { label: "Published", cls: "bg-teal-50 text-teal-800 ring-teal-200" },
  withdrawn: { label: "Withdrawn", cls: "bg-slate-100 text-slate-700 ring-slate-200" },
  dismissed: { label: "Dismissed", cls: "bg-slate-100 text-slate-700 ring-slate-200" },
};

const ACTION: Record<PublicHealthAlert["log"][number]["action"], string> = {
  proposed: "Proposed",
  edited: "Message edited",
  authorised: "Authorised and published",
  withdrawn: "Withdrawn",
  dismissed: "Dismissed",
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

export function AlertsPanel({ alerts }: { alerts: PublicHealthAlert[] }) {
  const order: AlertStatus[] = ["proposed", "authorised", "withdrawn", "dismissed"];
  const sorted = [...alerts].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || b.proposedAt.localeCompare(a.proposedAt));
  if (!sorted.length) {
    return (
      <EmptyState title="No alerts">
        When an area&apos;s fever-like patterns rise well above its usual level (allowing for the season), Prodrome proposes a
        public alert here for you to review.
      </EmptyState>
    );
  }
  return (
    <div className="space-y-4">
      {sorted.map((a) => (
        <AlertCard key={a.id} alert={a} />
      ))}
    </div>
  );
}

function AlertCard({ alert }: { alert: PublicHealthAlert }) {
  const edit = useInaraStore((s) => s.editHealthAlert);
  const authorise = useInaraStore((s) => s.authoriseHealthAlert);
  const withdraw = useInaraStore((s) => s.withdrawHealthAlert);
  const dismiss = useInaraStore((s) => s.dismissHealthAlert);
  const [message, setMessage] = useState(alert.message);
  const [reasonFor, setReasonFor] = useState<"withdraw" | "dismiss" | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const proposed = alert.status === "proposed";
  const check = validateMessage(message);
  const dirty = message.trim() !== alert.message;

  const run = (fn: () => string | null, ok: string) => {
    const err = fn();
    setError(err);
    if (!err) {
      toast.success(ok);
      setReasonFor(null);
      setReason("");
    }
  };

  return (
    <article className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-slate-900">
            <Megaphone className="size-4 text-slate-400" />
            {alert.title}
          </h3>
          <p className="text-xs text-slate-500">
            {alert.areaName}, {alert.city} · cluster on {alert.date} · {alert.people} people sharing data
          </p>
        </div>
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium ring-1", STATUS[alert.status].cls)}>{STATUS[alert.status].label}</span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence (aggregated)</h4>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {alert.evidence.map((e) => (
              <li key={e} className="flex gap-2">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-slate-400" />
                {e}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">Possible pattern from wearables, not confirmed diagnoses. Counts only — no individual data.</p>
        </section>

        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Public message {proposed ? "(edit before publishing)" : ""}
          </h4>
          {proposed ? (
            <>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                className="mt-2 bg-white"
                aria-label="Public message"
                maxLength={MESSAGE_LIMITS.max + 40}
              />
              <p className={cn("mt-1 text-xs", check ? "text-red-700" : "text-slate-500")}>
                {check ?? `${message.trim().length}/${MESSAGE_LIMITS.max} characters · plain words, what to do, when to see a doctor`}
              </p>
            </>
          ) : (
            <blockquote className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-800">{alert.message}</blockquote>
          )}
          <p className="mt-2 text-xs text-slate-500">
            {alert.status === "authorised"
              ? `Showing now on the dashboards of patients who live in ${alert.areaName}.`
              : proposed
                ? `Patients see nothing until you authorise it. Then it shows only to patients who live in ${alert.areaName}.`
                : "Not shown to anyone."}
          </p>
        </section>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {reasonFor ? (
        <div className="mt-4 space-y-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <label className="block text-sm font-medium text-slate-700">
            Reason for {reasonFor === "withdraw" ? "withdrawing" : "dismissing"} (kept in the log)
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonFor === "withdraw" ? "Cases falling; vector control done" : "Known local event, not an outbreak"}
              className="mt-1 h-9 bg-white"
              autoFocus
            />
          </label>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={reasonFor === "withdraw" ? "destructive" : "outline"}
              onClick={() =>
                run(
                  () => (reasonFor === "withdraw" ? withdraw(alert.id, reason) : dismiss(alert.id, reason)),
                  reasonFor === "withdraw" ? "Alert withdrawn — patients no longer see it" : "Proposal dismissed",
                )
              }
            >
              Confirm
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setReasonFor(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {proposed && (
            <>
              <Button size="sm" disabled={!!check} onClick={() => run(() => authorise(alert.id, message), `Alert published to patients in ${alert.areaName}`)}>
                <CheckCircle2 />
                Authorise &amp; publish
              </Button>
              <Button size="sm" variant="outline" disabled={!dirty || !!check} onClick={() => run(() => edit(alert.id, message), "Draft message saved")}>
                Save draft
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setReasonFor("dismiss")}>
                <XCircle />
                Dismiss
              </Button>
            </>
          )}
          {alert.status === "authorised" && (
            <Button size="sm" variant="outline" onClick={() => setReasonFor("withdraw")}>
              <Undo2 />
              Withdraw alert
            </Button>
          )}
        </div>
      )}

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-slate-600 hover:text-slate-900">Log ({alert.log.length})</summary>
        <ol className="mt-2 space-y-1.5 border-l border-slate-200 pl-3">
          {alert.log.map((l, i) => (
            <li key={i} className="text-slate-700">
              <span className="font-medium">{ACTION[l.action]}</span> · {l.by} · {fmt(l.at)}
              {l.note && <span className="text-slate-500"> — {l.note}</span>}
              {l.action === "dismissed" || l.action === "withdrawn" ? <Ban className="ml-1 inline size-3 text-slate-400" /> : null}
            </li>
          ))}
        </ol>
      </details>
    </article>
  );
}
