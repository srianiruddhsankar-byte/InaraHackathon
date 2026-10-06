import { RequireRole } from "@/components/auth/RequireRole";

export default function LabLayout({ children }: LayoutProps<"/lab">) {
  return <RequireRole role="lab">{children}</RequireRole>;
}
