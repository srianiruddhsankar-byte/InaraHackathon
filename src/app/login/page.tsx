import { PageHeader } from "@/components/layout/PageHeader";
import { LoginPanel } from "@/components/auth/LoginPanel";
import type { Role } from "@/lib/types";

const ROLES: Role[] = ["doctor", "patient", "lab"];

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { tab } = await searchParams;
  const initialTab = ROLES.find((r) => r === tab) ?? "doctor";
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Log in to Inara" subtitle="Choose how you use Inara. Each role has its own login." />
      {/* key: re-mount when the tab in the URL changes (e.g. a guard redirect). */}
      <LoginPanel key={initialTab} initialTab={initialTab} />
    </div>
  );
}
