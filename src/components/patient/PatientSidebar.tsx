import { ClipboardList, FlaskConical, FolderHeart, Settings, Sparkles, Watch } from "lucide-react";
import type { SidebarGroup } from "@/components/layout/SidebarLayout";

export const PATIENT_SECTIONS = ["records", "lab", "analysis", "treatment", "wearable"] as const;
export type PatientSection = (typeof PATIENT_SECTIONS)[number] | "settings";

/** The patient's sidebar. Links keep the section in the URL (/patient?section=…). */
export function patientSidebar(active: PatientSection): SidebarGroup[] {
  const link = (s: string) => `/patient?section=${s}`;
  return [
    {
      label: "My health",
      items: [
        { id: "records", label: "Medical Records", icon: FolderHeart, href: link("records"), active: active === "records" },
        { id: "lab", label: "Lab Report", icon: FlaskConical, href: link("lab"), active: active === "lab" },
        { id: "analysis", label: "AI Analysis", icon: Sparkles, href: link("analysis"), active: active === "analysis" },
        { id: "treatment", label: "Prescription & Treatment Plan", icon: ClipboardList, href: link("treatment"), active: active === "treatment" },
      ],
    },
    {
      label: "More",
      items: [
        { id: "wearable", label: "Wearable", icon: Watch, href: link("wearable"), active: active === "wearable" },
        { id: "settings", label: "Privacy & settings", icon: Settings, href: "/patient/settings", active: active === "settings" },
      ],
    },
  ];
}
