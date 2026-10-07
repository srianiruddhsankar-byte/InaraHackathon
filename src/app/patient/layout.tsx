import { Suspense } from "react";
import { RequireRole } from "@/components/auth/RequireRole";
import { PatientShell } from "@/components/patient/PatientShell";

const loading = <div className="py-24 text-center text-sm text-slate-500">Loading…</div>;

export default function PatientLayout({ children }: LayoutProps<"/patient">) {
  return (
    <RequireRole role="patient">
      {/* The sidebar reads ?section= on the client. */}
      <Suspense fallback={loading}>
        <PatientShell>{children}</PatientShell>
      </Suspense>
    </RequireRole>
  );
}
