"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, FlaskConical, KeyRound, Stethoscope, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEMO_OTP, homeFor, loginDoctorOrLab, requestOtp, roleLabel, verifyOtp, type AuthResult } from "@/lib/auth";
import { DEMO_PASSWORD } from "@/lib/users";
import type { Role, User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useCurrentUser, useInaraStore } from "@/store/useInaraStore";

const TABS: { role: Role; icon: typeof UserIcon }[] = [
  { role: "doctor", icon: Stethoscope },
  { role: "patient", icon: UserIcon },
  { role: "lab", icon: FlaskConical },
];

export function LoginPanel({ initialTab }: { initialTab: Role }) {
  const [tab, setTab] = useState<Role>(initialTab);
  const router = useRouter();
  const users = useInaraStore((s) => s.users);
  const login = useInaraStore((s) => s.login);
  const logout = useInaraStore((s) => s.logout);
  const current = useCurrentUser();

  const finish = (result: AuthResult): string | null => {
    if (!result.ok) return result.error;
    login(result.user);
    toast.success(`Welcome, ${result.user.name}`);
    router.push(homeFor(result.user.role));
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
            <Button size="sm" variant="outline" onClick={logout}>
              Log out
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div role="tablist" aria-label="Login type" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
          {TABS.map(({ role, icon: Icon }) => (
            <button
              key={role}
              type="button"
              role="tab"
              aria-selected={tab === role}
              onClick={() => setTab(role)}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors",
                tab === role ? "bg-white text-teal-700 shadow-sm" : "text-slate-600 hover:text-slate-900",
              )}
            >
              <Icon className="size-4" />
              {roleLabel(role)}
            </button>
          ))}
        </div>

        <div className="mt-6" role="tabpanel">
          {tab === "patient" ? (
            <PatientOtpForm users={users} onResult={finish} />
          ) : (
            <EmailPasswordForm key={tab} role={tab} users={users} onResult={finish} />
          )}
        </div>
      </div>

      <DemoQuickLogin users={users} onResult={finish} />
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

function EmailPasswordForm({ role, users, onResult }: { role: "doctor" | "lab"; users: User[]; onResult: OnResult }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const result = loginDoctorOrLab(users, email, password);
    if (result.ok && result.user.role !== role) {
      setError(`This is a ${roleLabel(result.user.role).toLowerCase()} account. Use the ${roleLabel(result.user.role)} tab.`);
      return;
    }
    setError(onResult(result));
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-slate-600">
        {role === "doctor"
          ? "Use your hospital email. Only verified hospital domains (@inara-hospital.in, @citycare.in) can sign in."
          : "Sign in with your lab account to upload results."}
      </p>
      <Field label="Email">
        <Input
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={role === "doctor" ? "name@inara-hospital.in" : "lab@inara-diagnostics.in"}
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
      <ErrorText>{error}</ErrorText>
      <Button type="submit" className="h-10 w-full">
        Log in as {roleLabel(role)}
      </Button>
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

function DemoQuickLogin({ users, onResult }: { users: User[]; onResult: OnResult }) {
  const [open, setOpen] = useState(false);

  // Goes through the same auth functions as the forms, so quick login proves the real flow works.
  const quickLogin = (user: User) =>
    onResult(
      user.role === "patient"
        ? verifyOtp(users, user.phone ?? "", DEMO_OTP)
        : loginDoctorOrLab(users, user.email ?? "", DEMO_PASSWORD),
    );

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
          {users.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => {
                const error = quickLogin(user);
                if (error) toast.error(error);
              }}
              className="rounded-xl px-3 py-2 text-left ring-1 ring-slate-200 transition-colors hover:bg-teal-50 hover:ring-teal-300"
            >
              <span className="block text-sm font-medium text-slate-900">{user.name}</span>
              <span className="block text-xs text-slate-500">
                {roleLabel(user.role)} · {user.role === "patient" ? user.phone : user.specialty ?? user.email}
              </span>
            </button>
          ))}
          <p className="text-xs text-slate-500 sm:col-span-2">
            Password for all email accounts: {DEMO_PASSWORD}. Patient OTP: {DEMO_OTP}.
          </p>
        </div>
      )}
    </div>
  );
}
