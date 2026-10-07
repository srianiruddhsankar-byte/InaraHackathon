"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Camera, CheckCircle2, Hash, KeyRound, Loader2, QrCode, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/PageHeader";
import { ACCESS_DURATIONS, accessState, isOpenRequest, resolveTarget, type AccessState } from "@/lib/recordAccess";
import type { AccessVia } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useCurrentUser, useInaraStore } from "@/store/useInaraStore";
import { QrScanner } from "./QrScanner";
import { useNow } from "./useNow";

const ENDED: Partial<Record<AccessState, string>> = {
  declined: "The patient declined this request.",
  revoked: "The patient cancelled this request.",
  lapsed: "This request expired before the code was entered.",
  locked: "Too many wrong codes — this request is locked.",
};

/** Doctor: scan the patient's QR (or type its code / the patient ID) → request → patient's OTP → access. */
export function AccessPatient() {
  const doctor = useCurrentUser();
  const params = useSearchParams();
  const router = useRouter();
  const tokens = useInaraStore((s) => s.shareTokens);
  const patients = useInaraStore((s) => s.patients);
  const requests = useInaraStore((s) => s.accessRequests);
  const { requestRecordAccess, enterAccessOtp } = useInaraStore.getState();
  const now = useNow();

  const initialCode = params?.get("code") ?? "";
  const [via, setVia] = useState<AccessVia>(params?.get("via") === "patient_id" ? "patient_id" : "qr");
  const [camera, setCamera] = useState(false);
  const [input, setInput] = useState(initialCode);
  const [target, setTarget] = useState<{ patientId: string; via: AccessVia } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(30);
  // Resume the doctor's latest open request (e.g. after logging out while the patient approved).
  const [requestId, setRequestId] = useState<string | null>(
    () =>
      useInaraStore
        .getState()
        .accessRequests.filter((r) => r.doctorId === doctor?.id && isOpenRequest(accessState(r, Date.now())))
        .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))[0]?.id ?? null,
  );
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);

  const request = useMemo(() => requests.find((r) => r.id === requestId), [requests, requestId]);
  const state = request ? accessState(request, now) : null;
  const ownPatient = target && doctor?.patientIds?.includes(target.patientId);

  const find = (code = input, how = via) => {
    const result = resolveTarget(code, how, { tokens, patients });
    setCamera(false);
    if (!result.ok) {
      setError(result.error);
      setTarget(null);
      return;
    }
    setError(null);
    setTarget({ patientId: result.patientId, via: result.via });
  };
  const send = () => {
    if (!target) return;
    const result = requestRecordAccess(target.patientId, target.via, duration);
    if ("error" in result) setError(result.error);
    else {
      setRequestId(result.id);
      setOtp("");
      setOtpError(null);
    }
  };
  const submitOtp = () => {
    if (!request) return;
    const err = enterAccessOtp(request.id, otp);
    if (err) setOtpError(err);
    else router.push(`/doctor/shared/${request.patientId}`);
  };
  const restart = () => {
    setRequestId(null);
    setTarget(null);
    setInput("");
    setError(null);
  };

  // Step 3: waiting for the patient / entering their code.
  if (request && state) {
    if (state === "active") {
      return (
        <Shell>
          <Panel>
            <p className="flex items-center gap-2 font-semibold text-green-800">
              <CheckCircle2 className="size-5" aria-hidden /> Access granted
            </p>
            <Button className="mt-4 bg-teal-600 text-white hover:bg-teal-700" onClick={() => router.push(`/doctor/shared/${request.patientId}`)}>
              Open the record
            </Button>
          </Panel>
        </Shell>
      );
    }
    const ended = ENDED[state];
    return (
      <Shell>
        <Panel>
          {ended ? (
            <>
              <p className="flex items-center gap-2 font-semibold text-red-800">
                <XCircle className="size-5" aria-hidden /> {ended}
              </p>
              <Button className="mt-4" variant="outline" onClick={restart}>
                Start again
              </Button>
            </>
          ) : (
            <>
              <p className="flex items-center gap-2 font-semibold text-slate-900">
                {state === "pending" ? <Loader2 className="size-5 animate-spin text-teal-600" aria-hidden /> : <KeyRound className="size-5 text-teal-600" aria-hidden />}
                {state === "pending" ? "Request sent — waiting for the patient to approve" : "The patient approved — enter their code"}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                The patient sees your name, specialty and hospital in their app. When they approve, they get a 6-digit
                code — ask them to read it to you. Access: {request.durationMin} minutes.
              </p>
              <form
                className="mt-4 flex flex-wrap items-end gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  submitOtp();
                }}
              >
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Patient&apos;s code</span>
                  <Input
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="6 digits"
                    className="mt-1 h-11 w-40 font-mono text-lg tracking-widest"
                    aria-invalid={!!otpError}
                  />
                </label>
                <Button type="submit" className="h-11 bg-teal-600 text-white hover:bg-teal-700" disabled={otp.length !== 6}>
                  Open record
                </Button>
                <Button type="button" variant="ghost" className="h-11" onClick={restart}>
                  Cancel
                </Button>
              </form>
              {otpError && (
                <p role="alert" className="mt-2 text-sm text-red-700">
                  {otpError}
                </p>
              )}
            </>
          )}
        </Panel>
      </Shell>
    );
  }

  return (
    <Shell>
      <Panel>
        <div className="inline-flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="How to find the patient">
          {(
            [
              ["qr", "Scan QR code", QrCode],
              ["patient_id", "Patient ID", Hash],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={via === id}
              onClick={() => {
                setVia(id);
                setTarget(null);
                setError(null);
                setInput("");
                setCamera(false);
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium",
                via === id ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
              )}
            >
              <Icon className="size-4" aria-hidden /> {label}
            </button>
          ))}
        </div>

        {via === "qr" && (
          <div className="mt-4">
            {camera ? (
              <QrScanner
                onCode={(code) => {
                  setInput(code);
                  find(code, "qr");
                }}
              />
            ) : (
              <Button variant="outline" onClick={() => setCamera(true)}>
                <Camera /> Scan with camera
              </Button>
            )}
          </div>
        )}

        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            find();
          }}
        >
          <label className="block min-w-0 flex-1">
            <span className="text-sm font-medium text-slate-700">
              {via === "qr" ? "Or type the code under the QR" : "Patient ID (the patient shows it under their QR)"}
            </span>
            <Input
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setTarget(null);
              }}
              placeholder={via === "qr" ? "XXXX-XXXX-XXXX-XXXX" : "BMQ-1001"}
              className="mt-1 h-11 font-mono tracking-wider uppercase"
              aria-invalid={!!error}
              autoCapitalize="characters"
            />
          </label>
          <Button type="submit" className="h-11" variant="outline">
            Find
          </Button>
        </form>
        {error && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {target &&
          (ownPatient ? (
            <div className="mt-5 rounded-xl bg-teal-50 p-4 text-sm text-teal-900 ring-1 ring-teal-200">
              This is one of your patients — you already have access.{" "}
              <Link href={`/doctor/${target.patientId}`} className="font-semibold underline">
                Open their record
              </Link>
            </div>
          ) : (
            <div className="mt-5 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <CheckCircle2 className="size-4 text-green-600" aria-hidden /> Code recognised
              </p>
              <p className="mt-1 text-sm text-slate-600">
                No details are shown until the patient agrees. How long do you need access?
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {ACCESS_DURATIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={duration === d}
                    onClick={() => setDuration(d)}
                    className={cn(
                      "rounded-lg px-4 py-2 text-sm font-medium ring-1",
                      duration === d ? "bg-teal-600 text-white ring-teal-600" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-100",
                    )}
                  >
                    {d} minutes
                  </button>
                ))}
                <Button className="ml-auto bg-teal-600 text-white hover:bg-teal-700" onClick={send}>
                  Send request to patient
                </Button>
              </div>
            </div>
          ))}
      </Panel>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/doctor" className="mb-4 inline-flex items-center gap-1 text-sm text-teal-700 hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> My patients
      </Link>
      <PageHeader title="Access a patient" subtitle="Scan the patient's QR code or type their patient ID. The patient approves in their app and gives you a one-time code." />
      {children}
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">{children}</div>;
}
