"use client";

import { useMemo, useState } from "react";
import { LabHistory } from "@/components/lab/LabHistory";
import { PendingOrders } from "@/components/lab/PendingOrders";
import { UploadResults } from "@/components/lab/UploadResults";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { labHistoryRows } from "@/lib/labReport";
import { orderedAt } from "@/lib/workflow";
import { useInaraStore } from "@/store/useInaraStore";

type Tab = "pending" | "upload" | "history";

export default function LabPage() {
  const cases = useInaraStore((s) => s.cases);
  const patients = useInaraStore((s) => s.patients);
  const reports = useInaraStore((s) => s.reports);
  const [tab, setTab] = useState<Tab>("pending");
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

  return (
    <>
      <PageHeader title="Lab workspace" subtitle="Receive samples, upload results and check every value before it goes to the doctor." />
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="mb-4 h-10! w-full sm:w-fit">
          <TabsTrigger value="pending" className="px-3">
            Pending orders
            <span className="rounded-full bg-slate-200 px-1.5 text-[11px] text-slate-700">{pending.length}</span>
          </TabsTrigger>
          <TabsTrigger value="upload" className="px-3">
            Upload results
          </TabsTrigger>
          <TabsTrigger value="history" className="px-3">
            History
          </TabsTrigger>
        </TabsList>
        <TabsContent value="pending">
          <PendingOrders
            orders={pending}
            patients={patients}
            onUpload={(id) => {
              setCaseId(id);
              setTab("upload");
            }}
          />
        </TabsContent>
        <TabsContent value="upload" keepMounted>
          <UploadResults
            orders={pending}
            patients={patients}
            caseId={caseId}
            onSelectCase={setCaseId}
            onSent={() => setTab("history")}
          />
        </TabsContent>
        <TabsContent value="history">
          <LabHistory rows={history} />
        </TabsContent>
      </Tabs>
    </>
  );
}
