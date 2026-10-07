"use client";

import type { ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { SidebarLayout, useSection } from "@/components/layout/SidebarLayout";
import { AccessPrompts } from "@/components/access/AccessPrompt";
import { useCurrentUser } from "@/store/useInaraStore";
import { PATIENT_SECTIONS, patientSidebar, type PatientSection } from "./PatientSidebar";

/** The patient area with its sidebar; the active item follows the route and ?section=. */
export function PatientShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const user = useCurrentUser();
  const section = useSection(PATIENT_SECTIONS, "records", params);
  const active: PatientSection | "none" = pathname === "/patient/settings" ? "settings" : pathname === "/patient" ? section : "none";
  return (
    <SidebarLayout title="My health" groups={patientSidebar(active as PatientSection)}>
      {user?.patientId && <AccessPrompts patientId={user.patientId} />}
      {children}
    </SidebarLayout>
  );
}
