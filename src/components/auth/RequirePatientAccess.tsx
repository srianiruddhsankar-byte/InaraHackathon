"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { Lock, ScanLine } from "lucide-react";
import { ConsentBadge } from "@/components/access/ConsentBadge";
import { useNow } from "@/components/access/useNow";
import { EmptyState } from "@/components/layout/EmptyState";
import { activeGrant, fullGrant } from "@/lib/recordAccess";
import { useCurrentUser, useInaraStore } from "@/store/useInaraStore";

/** The doctor's live full-record grant for this patient (re-checked every second, so expiry / revoke lock at once). */
export function useFullGrant(patientId: string) {
  const doctor = useCurrentUser();
  const requests = useInaraStore((s) => s.accessRequests);
  const now = useNow();
  const grant = useMemo(() => (doctor ? fullGrant(requests, doctor.id, patientId, now) : undefined), [requests, doctor, patientId, now]);
  return { grant, now, doctor, requests };
}

/**
 * Inside /doctor: EVERY doctor — the treating doctor too — needs an active consent grant
 * (QR / patient ID + the patient's one-time code). No grant, an expired or a revoked one
 * → the record closes, even on an open page.
 */
export function RequirePatientAccess({ patientId, children }: { patientId: string; children: ReactNode }) {
  const { grant, now, doctor, requests } = useFullGrant(patientId);
  if (!grant) {
    const emergency = doctor ? activeGrant(requests, doctor.id, patientId, now) : undefined;
    return (
      <EmptyState title="No access — ask the patient to share via QR">
        <span className="inline-flex items-center gap-1.5">
          <Lock className="size-4" aria-hidden /> Every doctor needs the patient&apos;s consent. It may have ended or been revoked.
        </span>
        <span className="mt-3 flex flex-wrap justify-center gap-3">
          <Link
            href="/doctor/access?via=patient_id"
            className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
          >
            <ScanLine className="size-4" aria-hidden /> Access a patient
          </Link>
          {emergency && (
            <Link href={`/doctor/shared/${patientId}`} className="rounded-xl px-4 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50">
              Open emergency view
            </Link>
          )}
          <Link href="/doctor" className="px-4 py-2 text-sm text-teal-700 hover:underline">
            Back to my patients
          </Link>
        </span>
      </EmptyState>
    );
  }
  return <>{children}</>;
}

/** Consent badge for the workspace header; logs each section opened to the patient's access log. */
export function ConsentBar({ patientId, section }: { patientId: string; section: string }) {
  const { grant, now } = useFullGrant(patientId);
  const logRecordView = useInaraStore((s) => s.logRecordView);
  const grantId = grant?.id;
  useEffect(() => {
    if (grantId) logRecordView(grantId, section);
  }, [logRecordView, grantId, section]);
  if (!grant) return null;
  return <ConsentBadge request={grant} now={now} />;
}
