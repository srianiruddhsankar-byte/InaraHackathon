import { Suspense } from "react";
import { SurveillanceWorkspace } from "@/components/health/SurveillanceWorkspace";

export default function HealthPage() {
  return (
    // The section lives in ?section=, read on the client.
    <Suspense fallback={<div className="py-24 text-center text-sm text-slate-500">Loading…</div>}>
      <SurveillanceWorkspace />
    </Suspense>
  );
}
