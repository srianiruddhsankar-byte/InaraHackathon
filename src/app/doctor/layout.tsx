import { RequireRole } from "@/components/auth/RequireRole";

export default function DoctorLayout({ children }: LayoutProps<"/doctor">) {
  return <RequireRole role="doctor">{children}</RequireRole>;
}
