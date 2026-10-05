import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";

export default async function SharePage({ params }: PageProps<"/share/[token]">) {
  await params;
  return (
    <>
      <PageHeader title="Shared health record" subtitle="Access requires the patient's consent." />
      <EmptyState title="Consent flow coming soon">
        Doctor sign-in and patient OTP consent will appear here.
      </EmptyState>
    </>
  );
}
