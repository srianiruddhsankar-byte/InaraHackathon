import { RequireRole } from "@/components/auth/RequireRole";

// Debug output includes AI drafts, which only doctors may see.
export default function DebugLayout({ children }: LayoutProps<"/debug">) {
  return <RequireRole role="doctor">{children}</RequireRole>;
}
