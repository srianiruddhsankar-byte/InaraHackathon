import { RequireRole } from "@/components/auth/RequireRole";

export default function HealthLayout({ children }: LayoutProps<"/health">) {
  return <RequireRole role="health_officer">{children}</RequireRole>;
}
