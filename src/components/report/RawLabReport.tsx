"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Camera, Download, FileJson, FileSpreadsheet, FlaskConical } from "lucide-react";
import { EmptyState } from "@/components/layout/EmptyState";
import { Button } from "@/components/ui/button";
import { rawCsv, rawFileName, rawJson, rawRows } from "@/lib/rawReport";
import type { Report } from "@/lib/types";
import { cn } from "@/lib/utils";

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * The lab report exactly as received: test names, values and units as the lab
 * sent them, in their order. Doctors can download CSV / JSON; patients only see
 * approved reports (the caller passes only those) and no downloads.
 */
export function RawLabReport({
  reports,
  audience,
  downloads = audience === "doctor",
}: {
  reports: Report[];
  audience: "doctor" | "patient";
  /** CSV / JSON downloads (off for patients and for doctors with temporary access). */
  downloads?: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | undefined>(reports[0]?.id);
  const report = reports.find((r) => r.id === selectedId) ?? reports[0];

  if (!report) {
    return (
      <EmptyState title="No lab reports yet">
        {audience === "patient"
          ? "Your lab report appears here once your doctor has reviewed it."
          : "Reports appear here after the lab uploads results."}
      </EmptyState>
    );
  }
  const rows = rawRows(report);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Lab report</h1>
        <p className="mt-1 text-slate-600">
          {audience === "patient"
            ? "Your results exactly as the lab sent them. See AI Analysis for what they mean."
            : "Raw, unaltered rows exactly as received from the lab — before mapping, unit conversion or flags."}
        </p>
      </div>

      {reports.length > 1 && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Choose a report">
          {reports.map((r) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={r.id === report.id}
              onClick={() => setSelectedId(r.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition-colors",
                r.id === report.id ? "bg-teal-600 text-white ring-teal-600" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50",
              )}
            >
              {format(parseISO(r.date), "d MMM yyyy")}
            </button>
          ))}
        </div>
      )}

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-start gap-4">
          {report.photoThumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element -- stored data-URL thumbnail (the full photo is never kept)
            <img src={report.photoThumbnail} alt="Thumbnail of the photographed lab report" className="h-28 w-auto shrink-0 rounded-lg ring-1 ring-slate-200" />
          ) : (
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <FlaskConical className="size-5" aria-hidden />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-slate-900">{format(parseISO(report.date), "d MMMM yyyy")}</h2>
            <p className="text-sm text-slate-600">
              {report.labName}
              {report.receivedAt && <> · received {format(parseISO(report.receivedAt), "d MMM yyyy, HH:mm")}</>} · {rows.length} rows
            </p>
            {report.verifiedBy && (
              <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                {report.source === "photo" ? <Camera className="size-3.5" aria-hidden /> : <FileSpreadsheet className="size-3.5" aria-hidden />}
                {report.source === "photo" ? "Photo report" : "CSV upload"} · verified by {report.verifiedBy}
              </p>
            )}
          </div>
          {downloads && rows.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => download(rawFileName(report, "csv"), rawCsv(report), "text/csv;charset=utf-8")}>
                <Download /> Download CSV
              </Button>
              <Button variant="outline" onClick={() => download(rawFileName(report, "json"), JSON.stringify(rawJson(report), null, 2), "application/json")}>
                <FileJson /> Download JSON
              </Button>
            </div>
          )}
        </div>

        {rows.length === 0 ? (
          <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">No raw rows were kept for this report.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl ring-1 ring-slate-200">
            <table className="w-full min-w-[22rem] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                <tr>
                  <th scope="col" className="w-12 px-3 py-2">#</th>
                  <th scope="col" className="px-3 py-2">Test (as sent)</th>
                  <th scope="col" className="px-3 py-2 text-right">Value</th>
                  <th scope="col" className="px-3 py-2">Unit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.line}>
                    <td className="px-3 py-1.5 text-xs text-slate-400 tabular-nums">{r.line}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-slate-700">{r.name}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs text-slate-900 tabular-nums">{String(r.value)}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-slate-500">{r.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
