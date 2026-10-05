import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";

export default function PatientPage() {
  return (
    <>
      <PageHeader title="My reports" subtitle="Only reports approved by your doctor are shown here." />
      <EmptyState title="No approved reports yet">
        You will see your results here once your doctor has reviewed them.
      </EmptyState>
    </>
  );
}
