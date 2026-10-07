import { PageHeader } from "@/components/layout/PageHeader";
import { MfaStep } from "@/components/auth/MfaStep";

export default function MfaPage() {
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Two-factor check" subtitle="Doctors, public health officers and hospital admins confirm every login with an authenticator app." />
      <MfaStep />
    </div>
  );
}
