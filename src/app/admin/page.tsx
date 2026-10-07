import { PageHeader } from "@/components/layout/PageHeader";
import { AdminConsole } from "@/components/admin/AdminConsole";

export default function AdminPage() {
  return (
    <>
      <PageHeader
        title="Account verification"
        subtitle="Verify new doctors, labs and public health officers, or suspend an account. Every change is recorded in the audit log."
      />
      <AdminConsole />
    </>
  );
}
