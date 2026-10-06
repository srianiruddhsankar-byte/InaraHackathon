import { RequireRole } from "@/components/auth/RequireRole";

export default function PatientLayout({ children }: LayoutProps<"/patient">) {
  return <RequireRole role="patient">{children}</RequireRole>;
}
