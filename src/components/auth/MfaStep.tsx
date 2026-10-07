"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { homeFor } from "@/lib/auth";
import { getSupabase } from "@/lib/sync/client";
import { mfaStep, startEnrolment, verifyTotp, type Enrolment } from "@/lib/supabaseAuth";
import { useCurrentUser, useHydrated, useInaraStore, useSession } from "@/store/useInaraStore";
import { staffLogout } from "./staffSession";

type Step =
  | { kind: "loading" }
  | { kind: "enroll"; enrolment: Enrolment }
  | { kind: "challenge"; factorId: string }
  | { kind: "error"; message: string };

/** One load at a time (React dev mode runs effects twice; two enrolments would race). */
let inflight: Promise<Step> | null = null;

async function loadStep(): Promise<Step> {
  const client = getSupabase();
  if (!client) throw new Error("Secure sign-in is not configured.");
  const { data } = await client.auth.getSession();
  if (!data.session) throw new Error("Your sign-in has expired. Please log in again.");
  const next = await mfaStep(client);
  return next.kind === "challenge" ? next : { kind: "enroll", enrolment: await startEnrolment(client) };
}

/** After the password: enrol an authenticator (first login) or enter its code (every login). */
export function MfaStep() {
  const hydrated = useHydrated();
  const session = useSession();
  const user = useCurrentUser();
  const router = useRouter();
  const updateSessionAuth = useInaraStore((s) => s.updateSessionAuth);
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pending = hydrated && session?.mode === "supabase" && session.aal !== "aal2";
  const done = hydrated && session?.mode === "supabase" && session.aal === "aal2";

  useEffect(() => {
    if (done && user) router.replace(homeFor(user.role));
  }, [done, user, router]);

  useEffect(() => {
    if (!pending) return;
    let cancelled = false;
    inflight ??= loadStep().finally(() => {
      inflight = null;
    });
    const current = inflight;
    void (async () => {
      try {
        const loaded = await current;
        if (!cancelled) setStep(loaded);
      } catch (e) {
        if (!cancelled) setStep({ kind: "error", message: (e as Error).message || "Could not start the two-factor check." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pending, attempt]);

  if (!hydrated) return <Panel>Loading…</Panel>;
  if (!session || session.mode !== "supabase" || !user) {
    return (
      <Panel>
        No secure sign-in in progress.{" "}
        <Link href="/login" className="text-teal-700 hover:underline">
          Go to login
        </Link>
      </Panel>
    );
  }
  if (done) return <Panel>Verified. Opening your workspace…</Panel>;

  const factorId = step.kind === "enroll" ? step.enrolment.factorId : step.kind === "challenge" ? step.factorId : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const client = getSupabase();
    if (!client || !factorId) return;
    setBusy(true);
    const message = await verifyTotp(client, factorId, code);
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    if (step.kind === "enroll") toast.success("Authenticator app linked. You'll need a code at every login.");
    updateSessionAuth({ aal: "aal2" });
    router.push(homeFor(user.role));
  };

  const logOut = async () => {
    await staffLogout();
    router.push("/login");
  };

  return (
    <div className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm text-slate-600">
        Signed in as <strong>{user.name}</strong> ({user.email}).
      </p>

      {step.kind === "loading" && <p className="text-sm text-slate-500">Preparing the two-factor check…</p>}

      {step.kind === "error" && (
        <div role="alert" className="space-y-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <p>{step.message}</p>
          <Button size="sm" variant="outline" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </div>
      )}

      {step.kind === "enroll" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 font-medium text-slate-900">
            <Smartphone className="size-4 text-teal-600" />
            Set up your authenticator app (one time)
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
            <li>Open Google Authenticator (or Microsoft Authenticator, 1Password…).</li>
            <li>Tap “+” → “Scan a QR code” and scan this code.</li>
            <li>Enter the 6-digit code the app shows.</li>
          </ol>
          {/* Supabase returns the QR code as an SVG data URL. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={step.enrolment.qrCode}
            alt="QR code for your authenticator app"
            className="mx-auto size-48 rounded-xl bg-white p-2 ring-1 ring-slate-200"
          />
          <p className="text-center text-xs text-slate-500">
            Can&apos;t scan? Enter this key manually (time-based):
            <br />
            <code className="break-all font-mono text-slate-800">{step.enrolment.secret}</code>
          </p>
        </div>
      )}

      {step.kind === "challenge" && (
        <div className="flex items-center gap-2 font-medium text-slate-900">
          <ShieldCheck className="size-4 text-teal-600" />
          Enter the code from your authenticator app
        </div>
      )}

      {factorId && (
        <form onSubmit={submit} className="space-y-3">
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="6-digit code"
            aria-label="Authenticator code"
            className="h-10 font-mono tracking-widest"
            autoFocus
          />
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <Button type="submit" className="h-10 w-full" disabled={busy}>
            {busy ? "Checking…" : step.kind === "enroll" ? "Link app and continue" : "Verify and continue"}
          </Button>
        </form>
      )}

      <button type="button" onClick={() => void logOut()} className="text-sm text-slate-500 hover:text-slate-800 hover:underline">
        Cancel and log out
      </button>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl bg-white p-6 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200">{children}</div>;
}
