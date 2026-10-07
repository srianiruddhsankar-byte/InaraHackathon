import { PageHeader } from "@/components/layout/PageHeader";
import { AdminConsole } from "@/components/admin/AdminConsole";

export default function AdminPage() {
  return (
    <>
      <PageHeader
        title="Account verification"
        subtitle="Verify new doctors and labs, or suspend an account. Every change is recorded in the audit log."
      />
      <AdminConsole />
    </>
  );
}
