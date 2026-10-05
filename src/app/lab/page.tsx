import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";

export default function LabPage() {
  return (
    <>
      <PageHeader title="Lab upload" subtitle="Select a patient and upload a CSV of results." />
      <EmptyState title="CSV upload coming soon">Columns: test_name, value, unit, date.</EmptyState>
    </>
  );
}
