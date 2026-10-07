import { RequireRole } from "@/components/auth/RequireRole";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <RequireRole role="admin">{children}</RequireRole>;
}
