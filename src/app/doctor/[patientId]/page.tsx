import { RequirePatientAccess } from "@/components/auth/RequirePatientAccess";
import { ReviewWorkspace } from "@/components/report/ReviewWorkspace";

export default async function DoctorPatientPage({ params, searchParams }: PageProps<"/doctor/[patientId]">) {
  const { patientId } = await params;
  const { view } = await searchParams;
  return (
    <RequirePatientAccess patientId={patientId}>
      <ReviewWorkspace patientId={patientId} initialView={view === "wearable" ? "wearable" : undefined} />
    </RequirePatientAccess>
  );
}
