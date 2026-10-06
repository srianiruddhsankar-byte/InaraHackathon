"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/layout/EmptyState";
import { useCurrentUser } from "@/store/useInaraStore";

/** Inside /doctor: only the patient's treating doctor may open their record. */
export function RequirePatientAccess({ patientId, children }: { patientId: string; children: ReactNode }) {
  const doctor = useCurrentUser();
  if (!doctor?.patientIds?.includes(patientId)) {
    return (
      <EmptyState title="No access to this record">
        You can only open records of patients you treat, or that a patient has shared with you.{" "}
        <Link href="/doctor" className="text-teal-700 hover:underline">
          Back to my patients
        </Link>
      </EmptyState>
    );
  }
  return <>{children}</>;
}
