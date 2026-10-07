"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, CloudOff, FlaskConical, KeyRound, Map as MapIcon, ShieldCheck, ShieldUser, Stethoscope, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEMO_OTP, homeFor, requestOtp, roleLabel, verifyOtp, type AuthResult } from "@/lib/auth";
import { getSupabase } from "@/lib/sync/client";
import { DEMO_PASSWORD } from "@/lib/users";
import type { Role, User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useCurrentUser, useHydrated, useInaraStore } from "@/store/useInaraStore";
import { useSyncStore } from "@/store/useSyncStore";
import { demoStaffLogin, staffLogin, staffLogout, type StaffLoginResult, type StaffRole } from "./staffSession";

const TABS: { role: Role; icon: typeof UserIcon; label: string }[] = [
  { role: "doctor", icon: Stethoscope, label: "Doctor" },
  { role: "patient", icon: UserIcon, label: "Patient" },
  { role: "lab", icon: FlaskConical, label: "Lab" },
  { role: "health_officer", icon: MapIcon, label: "Health" },
  { role: "admin", icon: ShieldUser, label: "Admin" },
];

/** True when staff sign in with Supabase Auth (keys set, Offline mode off). Only after hydration. */
function useRealAuth(): boolean | null {
  const hydrated = useHydrated();
  const offlineMode = useSyncStore((s) => s.offlineMode);
  if (!hydrated) return null;
  return Boolean(getSupabase()) && !offlineMode;
}

export function LoginPanel({ initialTab }: { initialTab: Role }) {
  const [tab, setTab] = useState<Role>(initialTab);
  const router = useRouter();
  const users = useInaraStore((s) => s.users);
  const login = useInaraStore((s) => s.login);
  const current = useCurrentUser();
  const realAuth = useRealAuth();

  /** Patient OTP (always simulated). */
  const finish = (result: AuthResult): string | null => {
    if (!result.ok) return result.error;
    void staffLogout(); // one role at a time: end any staff session first
    login(result.user, { mode: "demo" });
    toast.success(`Welcome, ${result.user.name}`);
    router.push(homeFor(result.user.role));
    return null;
  };

  /** Doctor / lab / admin, real or offline demo login. */
  const finishStaff = (result: StaffLoginResult): string | null => {
    if (!result.ok) return result.error;
    if (result.fellBack) toast.warning("Sign-in server unreachable — logged in with the offline demo login.");
    toast.success(`Welcome, ${result.user.name}`);
    router.push(result.path);
    return null;
  };

  return (
    <div className="space-y-4">
      {current && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-teal-50 p-4 text-sm text-teal-900 ring-1 ring-teal-200">
          <span>
            Logged in as <strong>{current.name}</strong> ({roleLabel(current.role)}). Logging in again replaces this session.
          </span>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => router.push(homeFor(current.role))}>
              Continue
            </Button>
            <Button size="sm" variant="outline" onClick={() => void staffLogout()}>
              Log out
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div role="tablist" aria-label="Login type" className="grid grid-cols-5 gap-1 rounded-xl bg-slate-100 p-1">
          {TABS.map(({ role, icon: Icon, label }) => (
            <button
              key={role}
              type="button"
              role="tab"
              aria-selected={tab === role}
              onClick={() => setTab(role)}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg px-1 py-1.5 text-sm font-medium transition-colors",
                tab === role ? "bg-white text-teal-700 shadow-sm" : "text-slate-600 hover:text-slate-900",
              )}
            >
              <Icon className="hidden size-4 sm:block" />
              {label}
            </button>
          ))}
        </div>

        <div className="mt-6" role="tabpanel">
          {tab === "patient" ? (
            <PatientOtpForm users={users} onResult={finish} />
          ) : (
            <EmailPasswordForm key={tab} role={tab} realAuth={realAuth} onResult={finishStaff} />
          )}
        </div>
        {(tab === "doctor" || tab === "lab") && (
          <p className="mt-4 border-t border-slate-100 pt-4 text-center text-sm text-slate-600">
            New doctor or lab?{" "}
            <Link href={`/register?role=${tab}`} className="font-medium text-teal-700 hover:underline">
              Register
            </Link>
          </p>
        )}
      </div>

      <DemoQuickLogin users={users} onPatient={finish} onStaff={finishStaff} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function ErrorText({ children }: { children: string | null }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      {children}
    </p>
  );
}

type OnResult = (result: AuthResult) => string | null;

const FORM_INTRO: Record<StaffRole, string> = {
  doctor: "Use your hospital email. Only verified hospital domains (@inara-hospital.in, @citycare.in) can sign in.",
  lab: "Sign in with your lab account to upload results.",
  admin: "Hospital admins verify or suspend doctor, lab and public health officer accounts.",
  health_officer: "Public health officers see anonymised, area-level wearable trends and authorise regional alerts. Hospital email only.",
};

function EmailPasswordForm({
  role,
  realAuth,
  onResult,
}: {
  role: StaffRole;
  realAuth: boolean | null;
  onResult: (result: StaffLoginResult) => string | null;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [offerOffline, setOfferOffline] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setOfferOffline(false);
    const result = await staffLogin(role, email, password);
    setBusy(false);
    if (!result.ok && result.offerOffline) setOfferOffline(true);
    setError(onResult(result));
  };

  const continueOffline = () => {
    setOfferOffline(false);
    setError(onResult(demoStaffLogin(role, email, password, true)));
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-slate-600">{FORM_INTRO[role]}</p>
      <Field label="Email">
        <Input
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={
            role === "lab"
              ? "lab@inara-diagnostics.in"
              : role === "admin"
                ? "admin@inara-hospital.in"
                : role === "health_officer"
                  ? "health@inara-hospital.in"
                  : "name@inara-hospital.in"
          }
          className="h-10"
        />
      </Field>
      <Field label="Password">
        <Input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-10"
        />
      </Field>
      {offerOffline ? (
        <div role="alert" className="space-y-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          <p>
            <strong>Can&apos;t reach the sign-in server.</strong> The network may be blocking it. You can continue with the
            offline demo login (demo accounts only, no 2FA).
          </p>
          <Button type="button" size="sm" variant="outline" onClick={continueOffline}>
            <CloudOff />
            Continue with offline demo login
          </Button>
        </div>
      ) : (
        <ErrorText>{error}</ErrorText>
      )}
      <Button type="submit" className="h-10 w-full" disabled={busy}>
        {busy ? "Signing in…" : `Log in as ${roleLabel(role)}`}
      </Button>
      {realAuth !== null && (
        <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
          {realAuth ? (
            <>
              <ShieldCheck className="size-3.5 text-teal-600" />
              Secure sign-in{role !== "lab" ? " · authenticator app (2FA) required" : ""}
            </>
          ) : (
            <>
              <CloudOff className="size-3.5" />
              Offline demo login (simulated, no 2FA)
            </>
          )}
        </p>
      )}
    </form>
  );
}

function PatientOtpForm({ users, onResult }: { users: User[]; onResult: OnResult }) {
  const [phone, setPhone] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [demoOtp, setDemoOtp] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const sendOtp = (e: FormEvent) => {
    e.preventDefault();
    const result = requestOtp(users, phone);
    if (!result.ok) return setError(result.error);
    setError(null);
    setSentTo(result.phone);
    setDemoOtp(result.demoOtp);
  };

  const verify = (e: FormEvent) => {
    e.preventDefault();
    setError(onResult(verifyOtp(users, sentTo ?? phone, code)));
  };

  if (!sentTo) {
    return (
      <form onSubmit={sendOtp} className="space-y-4">
        <p className="text-sm text-slate-600">Enter the mobile number registered with your lab. We will send you a one-time code.</p>
        <Field label="Mobile number">
          <div className="flex">
            <span className="flex h-10 items-center rounded-l-lg border border-r-0 border-input bg-slate-50 px-3 text-sm text-slate-600">
              +91
            </span>
            <Input
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="90000 00001"
              className="h-10 rounded-l-none"
            />
          </div>
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" className="h-10 w-full">
          Send OTP
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="space-y-4">
      <p className="text-sm text-slate-600">
        Code sent to <strong>{sentTo}</strong>.{" "}
        <button
          type="button"
          className="text-teal-700 underline-offset-2 hover:underline"
          onClick={() => {
            setSentTo(null);
            setCode("");
            setError(null);
          }}
        >
          Change number
        </button>
      </p>
      <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
        <KeyRound className="size-4" />
        Demo OTP: <strong className="font-mono tracking-widest">{demoOtp}</strong>
      </div>
      <Field label="One-time code">
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="6-digit code"
          className="h-10 font-mono tracking-widest"
          autoFocus
        />
      </Field>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" className="h-10 w-full">
        Verify &amp; log in
      </Button>
    </form>
  );
}

const STATUS_NOTE: Partial<Record<string, string>> = { pending: " · Pending", suspended: " · Suspended" };

function DemoQuickLogin({
  users,
  onPatient,
  onStaff,
}: {
  users: User[];
  onPatient: (result: AuthResult) => string | null;
  onStaff: (result: StaffLoginResult) => string | null;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // Goes through the same login as the forms (real when online, falling back offline), so quick
  // login proves the real flow works.
  const quickLogin = async (user: User) => {
    if (user.role === "patient") return onPatient(verifyOtp(users, user.phone ?? "", DEMO_OTP));
    setBusy(user.id);
    const result = await staffLogin(user.role, user.email ?? "", DEMO_PASSWORD, { autoFallback: true });
    setBusy(null);
    return onStaff(result);
  };

  return (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        Demo quick login
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="grid gap-2 border-t border-slate-100 p-4 sm:grid-cols-2">
          {users
            .filter((u) => u.password || u.role === "patient")
            .map((user) => (
              <button
                key={user.id}
                type="button"
                disabled={busy !== null}
                onClick={async () => {
                  const error = await quickLogin(user);
                  if (error) toast.error(error);
                }}
                className="rounded-xl px-3 py-2 text-left ring-1 ring-slate-200 transition-colors hover:bg-teal-50 hover:ring-teal-300 disabled:opacity-60"
              >
                <span className="block text-sm font-medium text-slate-900">
                  {busy === user.id ? "Signing in…" : user.name}
                </span>
                <span className="block text-xs text-slate-500">
                  {roleLabel(user.role)} · {user.role === "patient" ? user.phone : user.specialty ?? user.email}
                  {STATUS_NOTE[user.status ?? ""] ?? ""}
                </span>
              </button>
            ))}
          <p className="text-xs text-slate-500 sm:col-span-2">
            Password for all email accounts: {DEMO_PASSWORD}. Patient OTP: {DEMO_OTP}. With secure sign-in on, Dr. Meera,
            Dr. Arun, the public health officer and the admin also need an authenticator app code.
          </p>
        </div>
      )}
    </div>
  );
}
