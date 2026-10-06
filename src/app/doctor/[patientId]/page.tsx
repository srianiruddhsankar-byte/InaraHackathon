import { RequirePatientAccess } from "@/components/auth/RequirePatientAccess";
import { ReviewWorkspace } from "@/components/report/ReviewWorkspace";

export default async function DoctorPatientPage({ params }: PageProps<"/doctor/[patientId]">) {
  const { patientId } = await params;
  return (
    <RequirePatientAccess patientId={patientId}>
      <ReviewWorkspace patientId={patientId} />
    </RequirePatientAccess>
  );
}
