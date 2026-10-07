import { Suspense } from "react";
import { RequirePatientAccess } from "@/components/auth/RequirePatientAccess";
import { ReviewWorkspace } from "@/components/report/ReviewWorkspace";

export default async function DoctorPatientPage({ params }: PageProps<"/doctor/[patientId]">) {
  const { patientId } = await params;
  return (
    <RequirePatientAccess patientId={patientId}>
      {/* The section lives in the URL (?section=…), read on the client. */}
      <Suspense fallback={<div className="py-24 text-center text-sm text-slate-500">Loading…</div>}>
        <ReviewWorkspace patientId={patientId} />
      </Suspense>
    </RequirePatientAccess>
  );
}
