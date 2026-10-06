import { RequirePatientAccess } from "@/components/auth/RequirePatientAccess";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";

export default async function DoctorPatientPage({ params }: PageProps<"/doctor/[patientId]">) {
  const { patientId } = await params;
  return (
    <RequirePatientAccess patientId={patientId}>
      <PageHeader title="Patient review" subtitle={`Patient ID: ${patientId}`} />
      <EmptyState title="Review screen coming soon">
        Suspected condition, findings from the same panel, trends and the AI draft will appear here.
      </EmptyState>
    </RequirePatientAccess>
  );
}
