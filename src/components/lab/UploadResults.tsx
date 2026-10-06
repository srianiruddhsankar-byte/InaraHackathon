"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { format, parseISO } from "date-fns";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Sparkles, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Case, Patient } from "@/lib/types";
import {
  attentionFirst,
  canSubmit,
  orderedTestKeys,
  parseLabCsv,
  reviewUpload,
  submitBlockers,
  type ParsedCsv,
  type UploadRow,
} from "@/lib/upload";
import { panelName, stageEvent } from "@/lib/workflow";
import { useInaraStore } from "@/store/useInaraStore";
import { VerificationTable, type RowPatch } from "./VerificationTable";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

export const SAMPLES = [
  { file: "ravi_report.csv", label: "Ravi — clean CSV" },
  { file: "ravi_report_messy.csv", label: "Ravi — messy CSV" },
];

interface Loaded {
  /** The order this file was loaded for. */
  caseId: string;
  fileName: string;
  parsed: ParsedCsv;
  rows: UploadRow[];
  /** Row ids in display order, fixed at load so rows don't jump while the lab edits. */
  order: string[];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function UploadResults({
  orders,
  patients,
  caseId,
  onSelectCase,
  onSent,
}: {
  /** Open orders still with the lab (ordered / in_lab). */
  orders: Case[];
  patients: Patient[];
  caseId: string | null;
  onSelectCase: (id: string | null) => void;
  onSent: () => void;
}) {
  const submitLabResults = useInaraStore((s) => s.submitLabResults);
  const [file, setFile] = useState<Loaded | null>(null);
  const [dateOverride, setDateOverride] = useState<string | undefined>();
  const [verified, setVerified] = useState(false);
  const [technician, setTechnician] = useState("");
  const [sent, setSent] = useState<{ patient: string; doctor: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const order = orders.find((c) => c.id === caseId) ?? null;
  const patient = order ? patients.find((p) => p.id === order.patientId) : undefined;
  // A file belongs to one order; picking another order starts fresh.
  const loaded = file && file.caseId === order?.id ? file : null;

  const review = useMemo(() => {
    if (!loaded || !order || !patient) return null;
    const received = stageEvent(order, "in_lab")?.at;
    return reviewUpload({
      parsed: loaded.parsed,
      rows: loaded.rows,
      sex: patient.sex,
      ordered: orderedTestKeys(order.panels),
      fallbackDate: received ? { date: received.slice(0, 10), source: "sample_received" } : { date: today(), source: "today" },
      reportDateOverride: dateOverride,
    });
  }, [loaded, order, patient, dateOverride]);

  const displayRows = useMemo(() => {
    if (!review || !loaded) return [];
    const byId = new Map(review.rows.map((r) => [r.id, r]));
    return loaded.order.map((id) => byId.get(id)!).filter(Boolean);
  }, [review, loaded]);

  const resetForm = () => {
    setFile(null);
    setDateOverride(undefined);
    setVerified(false);
  };

  const load = (fileName: string, text: string, forOrder: Case) => {
    const parsed = parseLabCsv(text);
    const forPatient = patients.find((p) => p.id === forOrder.patientId);
    // Rows needing attention go first; the order then stays fixed while editing.
    const first = forPatient
      ? attentionFirst(reviewUpload({ parsed, sex: forPatient.sex, fallbackDate: { date: today(), source: "today" } }).rows)
      : parsed.rows;
    setFile({ caseId: forOrder.id, fileName, parsed, rows: parsed.rows, order: first.map((r) => r.id) });
    setDateOverride(undefined);
    setVerified(false);
    setSent(null);
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked || !order) return;
    if (picked.size > MAX_FILE_BYTES) {
      toast.error("That file is too large for a lab CSV (max 2 MB).");
      return;
    }
    load(picked.name, await picked.text(), order);
  };

  const loadSample = async (fileName: string) => {
    const ravi = orders.find((c) => c.patientId === "ravi");
    if (!ravi) {
      toast.info("Ravi has no open order right now. Use “Reset demo” to start again.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/samples/${fileName}`);
      if (!res.ok) throw new Error(String(res.status));
      onSelectCase(ravi.id);
      load(fileName, await res.text(), ravi);
    } catch {
      toast.error("Couldn't load the sample file.");
    } finally {
      setBusy(false);
    }
  };

  const patchRow = (id: string, patch: RowPatch) => {
    setFile((l) =>
      l && {
        ...l,
        rows: l.rows.map((r) => {
          if (r.id !== id) return r;
          const next: UploadRow = { ...r, ...patch } as UploadRow;
          // Renaming a row re-runs the automatic mapping.
          if (patch.rawName !== undefined) delete next.testKeyOverride;
          return next;
        }),
      },
    );
    setVerified(false);
  };

  const submit = () => {
    if (!review || !order || !patient || !canSubmit(review, { verified, technician })) return;
    const id = submitLabResults(order.id, { rows: review.rows, date: review.reportDate, source: "csv", verifiedBy: technician });
    if (!id) {
      toast.error("This order can't take results any more.");
      return;
    }
    toast.success(`Results sent to ${order.orderedBy}`);
    setSent({ patient: patient.name, doctor: order.orderedBy });
    resetForm();
    onSelectCase(null);
  };

  if (sent) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
        <CheckCircle2 className="mx-auto size-10 text-green-600" aria-hidden />
        <p className="mt-3 text-lg font-semibold text-slate-900">Results sent to {sent.doctor}</p>
        <p className="mt-1 text-sm text-slate-600">{sent.patient}’s report is with the doctor for review.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button variant="outline" onClick={() => setSent(null)}>
            Upload another
          </Button>
          <Button
            className="bg-teal-600 text-white hover:bg-teal-700"
            onClick={() => {
              setSent(null);
              onSent();
            }}
          >
            View history
          </Button>
        </div>
      </div>
    );
  }

  const blockers = review ? submitBlockers(review, { verified, technician }) : [];

  return (
    <div className="space-y-5">
      {/* Step 1: order + file */}
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-slate-900">1. Which order?</span>
            <select
              className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm"
              value={caseId ?? ""}
              onChange={(e) => {
                onSelectCase(e.target.value || null);
                resetForm();
              }}
            >
              <option value="">Select a patient order…</option>
              {orders.map((c) => (
                <option key={c.id} value={c.id}>
                  {patients.find((p) => p.id === c.patientId)?.name ?? "Unknown"} · {c.panels.map(panelName).join(", ")}
                  {c.urgency === "urgent" ? " · URGENT" : ""}
                </option>
              ))}
            </select>
            {orders.length === 0 && <span className="mt-1 block text-xs text-slate-500">No open orders waiting for results.</span>}
          </label>
          <div className="text-sm">
            <span className="font-medium text-slate-900">2. Results file (CSV)</span>
            <label
              className={
                "mt-1.5 flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-teal-300 bg-teal-50/50 px-3 font-medium text-teal-800 hover:bg-teal-50" +
                (order ? "" : " pointer-events-none opacity-50")
              }
            >
              <Upload className="size-4" aria-hidden />
              {loaded ? `Replace file (${loaded.fileName})` : "Choose CSV file"}
              <input type="file" accept=".csv,.tsv,.txt,text/csv" className="sr-only" disabled={!order} onChange={onFile} />
            </label>
            <span className="mt-1 block text-xs text-slate-500">Comma, semicolon or tab separated. Column names can vary.</span>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 text-sm">
          <Button className="bg-teal-600 text-white hover:bg-teal-700" disabled={busy} onClick={() => loadSample("ravi_report.csv")}>
            <Sparkles aria-hidden /> Use sample for Ravi
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => loadSample("ravi_report_messy.csv")}>
            Use messy sample
          </Button>
          <span className="mx-1 hidden text-slate-300 sm:inline">|</span>
          {SAMPLES.map((s) => (
            <a
              key={s.file}
              href={`/samples/${s.file}`}
              download
              className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline"
            >
              <Download className="size-3.5" aria-hidden /> {s.label}
            </a>
          ))}
        </div>
      </section>

      {!order && !loaded && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          <FileSpreadsheet className="mx-auto mb-2 size-8 text-slate-300" aria-hidden />
          Pick an order, then choose its results file — or try “Use sample for Ravi”.
        </div>
      )}

      {order && !loaded && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Ordered by {order.orderedBy} · {order.panels.map(panelName).join(", ")}. Choose the results file to check it here before sending.
        </div>
      )}

      {/* Step 3: verify */}
      {review && loaded && (
        <>
          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">3. Check every value</h2>
                <p className="mt-0.5 text-sm font-medium text-slate-700">{review.summaryText}</p>
              </div>
              <label className="text-sm">
                <span className="block text-xs font-medium text-slate-500">Sample date</span>
                <input
                  type="date"
                  className="mt-1 h-8 rounded-md border border-slate-200 bg-white px-2 text-sm"
                  value={review.reportDate}
                  onChange={(e) => setDateOverride(e.target.value || undefined)}
                />
              </label>
            </div>

            {review.errors.length > 0 && (
              <ul className="space-y-1 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
                {review.errors.map((e) => (
                  <li key={e} className="flex gap-2">
                    <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {e}
                  </li>
                ))}
              </ul>
            )}
            {review.warnings.length > 0 && (
              <ul className="space-y-1 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
                {review.warnings.map((w) => (
                  <li key={w} className="flex gap-2">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {w}
                  </li>
                ))}
              </ul>
            )}

            {displayRows.length > 0 && <VerificationTable rows={displayRows} onChange={patchRow} />}
          </section>

          {/* Step 4: confirm and send */}
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-base font-semibold text-slate-900">4. Confirm and send</h2>
            <div className="mt-3 grid gap-4 md:grid-cols-[1fr_260px]">
              <label className="flex items-start gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-teal-600"
                  checked={verified}
                  onChange={(e) => setVerified(e.target.checked)}
                />
                I have verified these values against the original report
              </label>
              <label className="text-sm">
                <span className="block text-xs font-medium text-slate-500">Technician name</span>
                <Input className="mt-1" value={technician} placeholder="e.g. Anil Kumar" onChange={(e) => setTechnician(e.target.value)} />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <p className="text-xs text-slate-500">
                {blockers.length > 0
                  ? blockers[0]
                  : `Sends ${review.summary.mapped + review.summary.converted + review.summary.unit_assumed} values for ${patient?.name}, sample date ${format(parseISO(review.reportDate), "d MMM yyyy")}.`}
              </p>
              <Button className="bg-teal-600 text-white hover:bg-teal-700" disabled={blockers.length > 0} onClick={submit}>
                Send results to {order?.orderedBy ?? "doctor"}
              </Button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
