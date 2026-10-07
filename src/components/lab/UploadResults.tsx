"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { format, parseISO } from "date-fns";
import { AlertTriangle, Camera, CheckCircle2, Download, FileSpreadsheet, ImageIcon, Sparkles, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseOcrText } from "@/lib/ocr";
import { RAVI_PHOTO_OCR, SAMPLE_PHOTO_FILE } from "@/lib/samplePhoto";
import type { Case, Patient, ReportSource } from "@/lib/types";
import {
  attentionFirst,
  canSubmit,
  isImported,
  orderedTestKeys,
  parseLabCsv,
  reviewUpload,
  submitBlockers,
  type FallbackDateSource,
  type ParsedCsv,
  type UploadRow,
} from "@/lib/upload";
import { panelName, stageEvent } from "@/lib/workflow";
import { useInaraStore } from "@/store/useInaraStore";
import { makeThumbnail, runOcr, type OcrProgress } from "./photo";
import { VerificationTable, type RowPatch } from "./VerificationTable";

const MAX_CSV_BYTES = 2 * 1024 * 1024;
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
/** Ravi's samples are his 15 Mar 2026 panel; Karthik's is his dengue panel on Day 30 (5 Oct 2026). */
const RAVI_SAMPLE_DATE = "2026-03-15";
const KARTHIK_SAMPLE_FILE = "karthik_dengue.csv";

export const SAMPLES = [
  { file: "ravi_report.csv", label: "Clean CSV", patientId: "ravi", date: RAVI_SAMPLE_DATE },
  { file: "ravi_report_messy.csv", label: "Messy CSV", patientId: "ravi", date: RAVI_SAMPLE_DATE },
  { file: SAMPLE_PHOTO_FILE, label: "Report photo", patientId: "ravi", date: RAVI_SAMPLE_DATE },
  { file: KARTHIK_SAMPLE_FILE, label: "Karthik dengue CSV", patientId: "karthik", date: "2026-10-05" },
];

interface Loaded {
  /** The order this file was loaded for. */
  caseId: string;
  fileName: string;
  source: ReportSource;
  parsed: ParsedCsv;
  rows: UploadRow[];
  /** Row ids in display order, fixed at load so rows don't jump while the lab edits. */
  order: string[];
  /** Demo samples default to their own date when the file has none. */
  demoDate?: string;
  /** Photo uploads: preview URL (for this session only) and the small thumbnail that is kept. */
  preview?: string;
  thumbnail?: string;
  ocrNote?: string;
}

/** Local calendar date (not UTC) for an ISO timestamp. */
function localDate(iso: string): string {
  return format(parseISO(iso), "yyyy-MM-dd");
}

/** No date in the file: the sample-received date, else today. Demo samples use their own date. */
function fallbackDate(order: Case, demoDate?: string): { date: string; source: FallbackDateSource } {
  if (demoDate) return { date: demoDate, source: "demo_sample" };
  const received = stageEvent(order, "in_lab")?.at;
  return received ? { date: localDate(received), source: "sample_received" } : { date: useInaraStore.getState().today(), source: "today" };
}

const pickerClass =
  "flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-teal-300 bg-teal-50/50 px-3 font-medium text-teal-800 hover:bg-teal-50";

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
  const [ocr, setOcr] = useState<(OcrProgress & { caseId: string; preview: string }) | null>(null);
  const [dateOverride, setDateOverride] = useState<string | undefined>();
  const [verified, setVerified] = useState(false);
  const [technician, setTechnician] = useState("");
  const [sent, setSent] = useState<{ patient: string; doctor: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const order = orders.find((c) => c.id === caseId) ?? null;
  const patient = order ? patients.find((p) => p.id === order.patientId) : undefined;
  // A file belongs to one order; picking another order starts fresh.
  const loaded = file && file.caseId === order?.id ? file : null;
  const reading = ocr && ocr.caseId === order?.id ? ocr : null;

  const review = useMemo(() => {
    if (!loaded || !order || !patient) return null;
    return reviewUpload({
      parsed: loaded.parsed,
      rows: loaded.rows,
      sex: patient.sex,
      ordered: orderedTestKeys(order.panels),
      fallbackDate: fallbackDate(order, loaded.demoDate),
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

  const load = (forOrder: Case, next: Omit<Loaded, "caseId" | "rows" | "order">) => {
    const forPatient = patients.find((p) => p.id === forOrder.patientId);
    // Rows needing attention go first; the order then stays fixed while editing.
    const first = forPatient
      ? attentionFirst(reviewUpload({ parsed: next.parsed, sex: forPatient.sex, fallbackDate: fallbackDate(forOrder, next.demoDate) }).rows)
      : next.parsed.rows;
    setFile((prev) => {
      if (prev?.preview?.startsWith("blob:") && prev.preview !== next.preview) URL.revokeObjectURL(prev.preview);
      return { ...next, caseId: forOrder.id, rows: next.parsed.rows, order: first.map((r) => r.id) };
    });
    setDateOverride(undefined);
    setVerified(false);
    setSent(null);
  };

  const onCsv = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked || !order) return;
    if (picked.size > MAX_CSV_BYTES) {
      toast.error("That file is too large for a lab CSV (max 2 MB).");
      return;
    }
    load(order, { fileName: picked.name, source: "csv", parsed: parseLabCsv(await picked.text()) });
  };

  const onPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked || !order) return;
    if (!picked.type.startsWith("image/")) {
      toast.error("Please choose a photo (JPG or PNG).");
      return;
    }
    if (picked.size > MAX_PHOTO_BYTES) {
      toast.error("That photo is too large (max 15 MB).");
      return;
    }
    const preview = URL.createObjectURL(picked);
    setFile(null);
    setOcr({ caseId: order.id, preview, status: "Loading OCR engine…", progress: 0 });
    try {
      const [lines, thumbnail] = await Promise.all([
        runOcr(picked, (p) => setOcr((o) => o && { ...o, ...p })),
        makeThumbnail(preview),
      ]);
      load(order, {
        fileName: picked.name,
        source: "photo",
        parsed: parseOcrText(lines),
        preview,
        thumbnail,
        ocrNote: "Read with OCR in your browser — check every value.",
      });
    } catch {
      URL.revokeObjectURL(preview);
      toast.error("Couldn't read the photo. Check your connection (the OCR engine loads on first use) or upload the CSV.");
    } finally {
      setOcr(null);
    }
  };

  /** One-click demo: the patient's open order + a sample file. The sample photo uses pre-extracted text (no live OCR). */
  const loadSample = async (fileName: string) => {
    const sample = SAMPLES.find((x) => x.file === fileName)!;
    const target = orders.find((c) => c.patientId === sample.patientId);
    if (!target) {
      toast.info(
        sample.patientId === "karthik"
          ? "Karthik has no open order yet. Dr. Meera orders it from the wearable alert first."
          : "Ravi has no open order right now. Use “Reset demo” to start again.",
      );
      return;
    }
    setBusy(true);
    try {
      onSelectCase(target.id);
      if (fileName === SAMPLE_PHOTO_FILE) {
        const preview = `/samples/${fileName}`;
        load(target, {
          fileName,
          source: "photo",
          parsed: parseOcrText(RAVI_PHOTO_OCR),
          demoDate: sample.date,
          preview,
          thumbnail: await makeThumbnail(preview),
          ocrNote: "Demo sample: text was pre-extracted from this photo, so the demo doesn’t depend on OCR quality.",
        });
      } else {
        const res = await fetch(`/samples/${fileName}`);
        if (!res.ok) throw new Error(String(res.status));
        load(target, { fileName, source: "csv", parsed: parseLabCsv(await res.text()), demoDate: sample.date });
      }
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
          // Any edit (or "Looks right") means the lab has checked this row.
          const next: UploadRow = { ...r, ...patch, confirmed: true } as UploadRow;
          // Renaming a row re-runs the automatic mapping.
          if (patch.rawName !== undefined) delete next.testKeyOverride;
          return next;
        }),
      },
    );
    setVerified(false);
  };

  const submit = () => {
    if (!review || !loaded || !order || !patient || !canSubmit(review, { verified, technician })) return;
    const id = submitLabResults(order.id, {
      rows: review.rows,
      date: review.reportDate,
      source: loaded.source,
      verifiedBy: technician,
      photoThumbnail: loaded.source === "photo" ? loaded.thumbnail : undefined,
    });
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
  const disabled = !order || !!reading;

  return (
    <div className="space-y-5">
      {/* Steps 1–2: order + file or photo */}
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-slate-900">1. Which order?</span>
            <select
              className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm"
              value={caseId ?? ""}
              disabled={!!reading}
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
            <span className="font-medium text-slate-900">2. Results — CSV file or photo of the report</span>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <label className={pickerClass + (disabled ? " pointer-events-none opacity-50" : "")}>
                <Upload className="size-4" aria-hidden /> CSV file
                <input type="file" accept=".csv,.tsv,.txt,text/csv" className="sr-only" disabled={disabled} onChange={onCsv} />
              </label>
              <label className={pickerClass + (disabled ? " pointer-events-none opacity-50" : "")}>
                <Camera className="size-4" aria-hidden /> Photo / camera
                <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={disabled} onChange={onPhoto} />
              </label>
            </div>
            <span className="mt-1 block text-xs text-slate-500">
              {loaded ? `Loaded: ${loaded.fileName}. ` : ""}CSV columns can vary. Photos are read in your browser.
            </span>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 text-sm">
          <Button className="bg-teal-600 text-white hover:bg-teal-700" disabled={busy || !!reading} onClick={() => loadSample("ravi_report.csv")}>
            <Sparkles aria-hidden /> Use sample for Ravi
          </Button>
          <Button variant="outline" disabled={busy || !!reading} onClick={() => loadSample("ravi_report_messy.csv")}>
            Use messy sample
          </Button>
          <Button variant="outline" disabled={busy || !!reading} onClick={() => loadSample(SAMPLE_PHOTO_FILE)}>
            <ImageIcon aria-hidden /> Use sample photo for Ravi
          </Button>
          <Button variant="outline" disabled={busy || !!reading} onClick={() => loadSample(KARTHIK_SAMPLE_FILE)}>
            <Sparkles aria-hidden /> Use sample for Karthik
          </Button>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            Download:
            {SAMPLES.map((s) => (
              <a key={s.file} href={`/samples/${s.file}`} download className="inline-flex items-center gap-1 font-medium text-teal-700 hover:underline">
                <Download className="size-3.5" aria-hidden /> {s.label}
              </a>
            ))}
          </span>
        </div>
      </section>

      {reading && (
        <section className="flex flex-wrap items-center gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200" aria-live="polite">
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
          <img src={reading.preview} alt="Photo being read" className="h-28 w-auto rounded-lg object-contain ring-1 ring-slate-200" />
          <div className="min-w-[200px] flex-1">
            <p className="text-sm font-medium text-slate-900">{reading.status}</p>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-label="OCR progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(reading.progress * 100)}
            >
              <div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${Math.max(4, reading.progress * 100)}%` }} />
            </div>
            <p className="mt-1 text-xs text-slate-500">Reading the photo in your browser. The first run downloads the OCR engine.</p>
          </div>
        </section>
      )}

      {!order && !loaded && !reading && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          <FileSpreadsheet className="mx-auto mb-2 size-8 text-slate-300" aria-hidden />
          Pick an order, then choose its CSV file or a photo of the report — or try a sample for Ravi.
        </div>
      )}

      {order && !loaded && !reading && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Ordered by {order.orderedBy} · {order.panels.map(panelName).join(", ")}. Choose the CSV or take a photo of the report to check it
          here before sending.
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

            {loaded.source === "photo" && loaded.preview && (
              <details open className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <summary className="cursor-pointer text-sm font-medium text-slate-900">Original photo — compare each value</summary>
                <div className="mt-3 flex flex-wrap items-start gap-4">
                  <a href={loaded.preview} target="_blank" rel="noreferrer" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local preview of the lab's photo */}
                    <img src={loaded.preview} alt="Photo of the lab report" className="max-h-96 w-auto rounded-lg object-contain ring-1 ring-slate-200" />
                  </a>
                  <p className="max-w-sm text-xs text-slate-500">
                    {loaded.ocrNote} Only a small thumbnail is kept with the report; the full photo is not stored.
                  </p>
                </div>
              </details>
            )}

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
                  : `Sends ${review.rows.filter(isImported).length} values for ${patient?.name}, sample date ${format(parseISO(review.reportDate), "d MMM yyyy")}.`}
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
