"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { History, Upload } from "lucide-react";
import { LabHistory } from "@/components/lab/LabHistory";
import { PendingOrders } from "@/components/lab/PendingOrders";
import { UploadResults } from "@/components/lab/UploadResults";
import { PageHeader } from "@/components/layout/PageHeader";
import { SidebarLayout, setSectionInUrl, useSection, type SidebarGroup } from "@/components/layout/SidebarLayout";
import { labHistoryRows } from "@/lib/labReport";
import { cn } from "@/lib/utils";
import { orderedAt } from "@/lib/workflow";
import { useInaraStore } from "@/store/useInaraStore";

const SECTIONS = ["upload", "history"] as const;

export default function LabPage() {
  return (
    // The section lives in ?section=, read on the client.
    <Suspense fallback={<div className="py-24 text-center text-sm text-slate-500">Loading…</div>}>
      <LabWorkspace />
    </Suspense>
  );
}

function LabWorkspace() {
  const cases = useInaraStore((s) => s.cases);
  const patients = useInaraStore((s) => s.patients);
  const reports = useInaraStore((s) => s.reports);
  const section = useSection(SECTIONS, "upload", useSearchParams());
  const [caseId, setCaseId] = useState<string | null>(null);

  // The lab only sees orders, stages and its own uploads — never analysis, drafts or approvals.
  // Pending: still with the lab, urgent first, then oldest first.
  const pending = useMemo(
    () =>
      cases
        .filter((c) => c.stage === "ordered" || c.stage === "in_lab")
        .sort((a, b) => Number(b.urgency === "urgent") - Number(a.urgency === "urgent") || orderedAt(a).localeCompare(orderedAt(b))),
    [cases],
  );
  const history = useMemo(() => labHistoryRows(reports, cases, patients), [reports, cases, patients]);

  const groups: SidebarGroup[] = [
    {
      items: [
        {
          id: "upload",
          label: "Upload Lab Report",
          icon: Upload,
          active: section === "upload",
          onSelect: () => setSectionInUrl("upload"),
          badge: pending.length ? (
            <span className="rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-800">{pending.length}</span>
          ) : undefined,
        },
        { id: "history", label: "Previous Lab Reports", icon: History, active: section === "history", onSelect: () => setSectionInUrl("history") },
      ],
    },
  ];

  return (
    <SidebarLayout title="Lab workspace" groups={groups}>
      {/* Both stay mounted so an upload in progress survives switching sections. */}
      <div className={cn("space-y-8", section !== "upload" && "hidden")}>
        <PageHeader title="Upload lab report" subtitle="Receive samples, upload results and check every value before it goes to the doctor." />
        <section>
          <h2 className="mb-3 text-base font-semibold text-slate-900">
            Pending orders <span className="ml-1 rounded-full bg-slate-200 px-1.5 text-xs text-slate-700">{pending.length}</span>
          </h2>
          <PendingOrders
            orders={pending}
            patients={patients}
            onUpload={(id) => {
              setCaseId(id);
              requestAnimationFrame(() => document.getElementById("upload-results")?.scrollIntoView({ behavior: "smooth", block: "start" }));
            }}
          />
        </section>
        <section id="upload-results" className="scroll-mt-24">
          <h2 className="mb-3 text-base font-semibold text-slate-900">Upload results</h2>
          <UploadResults orders={pending} patients={patients} caseId={caseId} onSelectCase={setCaseId} onSent={() => setSectionInUrl("history")} />
        </section>
      </div>
      {section === "history" && (
        <>
          <PageHeader title="Previous lab reports" subtitle="What you sent and where each case is now. Findings and doctor notes are never shown here." />
          <LabHistory rows={history} />
        </>
      )}
    </SidebarLayout>
  );
}
