import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";

export default function DoctorPage() {
  return (
    <>
      <PageHeader title="Patients" subtitle="Reports waiting for your review." />
      <EmptyState title="No patients yet">Synthetic demo patients will appear here.</EmptyState>
    </>
  );
}
