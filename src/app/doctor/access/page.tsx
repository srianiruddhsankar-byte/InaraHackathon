import { Suspense } from "react";
import { AccessPatient } from "@/components/access/AccessPatient";

export default function DoctorAccessPage() {
  return (
    // Reads ?code= (from a /share link) on the client.
    <Suspense fallback={<div className="py-24 text-center text-sm text-slate-500">Loading…</div>}>
      <AccessPatient />
    </Suspense>
  );
}
