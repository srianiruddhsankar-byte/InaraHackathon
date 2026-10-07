"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { CheckCircle2, CloudOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ALLOWED_DOCTOR_DOMAINS,
  MIN_PASSWORD_LENGTH,
  validateRegistration,
  type RegistrationField,
} from "@/lib/auth";
import { registerStaff } from "@/lib/supabaseAuth";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/store/useInaraStore";
import { realAuthClient } from "./staffSession";

type Done = { needsConfirmation: boolean; role: "doctor" | "lab" };

export function RegisterForm({ initialRole }: { initialRole: "doctor" | "lab" }) {
  const hydrated = useHydrated();
  const [role, setRole] = useState(initialRole);
  const [form, setForm] = useState({ name: "", email: "", password: "", specialty: "", councilRegNo: "" });
  const [errors, setErrors] = useState<Partial<Record<RegistrationField, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);

  if (!hydrated) return <Card>Loading…</Card>;

  const client = realAuthClient();
  if (!client) {
    return (
      <Card>
        <div className="flex items-center gap-2 font-medium text-slate-900">
          <CloudOff className="size-4" />
          Registration needs the sign-in server
        </div>
        <p className="mt-2 text-sm text-slate-600">
          This device is using the offline demo login (Offline mode is on, or secure sign-in isn&apos;t set up). Turn off
          Offline mode in the sync menu, or use the demo accounts on the{" "}
          <Link href="/login" className="text-teal-700 hover:underline">
            login page
          </Link>
          .
        </p>
      </Card>
    );
  }

  if (done) {
    return (
      <Card>
        <div className="flex items-center gap-2 font-medium text-slate-900">
          <CheckCircle2 className="size-5 text-teal-600" />
          Account created — pending verification
        </div>
        <p className="mt-2 text-sm text-slate-600">
          {done.needsConfirmation
            ? "We sent you an email to confirm your address. After that you can log in. "
            : "You can log in now. "}
          The hospital admin will check your details{done.role === "doctor" ? " (including your registration number)" : ""}.
          Until your account is verified you will not see any patient data.
          {done.role === "doctor" && " At your first login you will link an authenticator app (2FA)."}
        </p>
        <Link
          href={`/login?tab=${done.role}`}
          className="mt-4 inline-flex h-9 items-center rounded-lg bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700"
        >
          Go to login
        </Link>
      </Card>
    );
  }

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setServerError(null);
    const checked = validateRegistration({ role, ...form });
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    const result = await registerStaff(client, checked.value);
    setBusy(false);
    if (!result.ok) setServerError(result.error);
    else setDone({ needsConfirmation: result.needsConfirmation, role });
  };

  return (
    <Card>
      <div role="tablist" aria-label="Account type" className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
        {(["doctor", "lab"] as const).map((r) => (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={role === r}
            onClick={() => {
              setRole(r);
              setErrors({});
            }}
            className={cn(
              "rounded-lg px-2 py-1.5 text-sm font-medium transition-colors",
              role === r ? "bg-white text-teal-700 shadow-sm" : "text-slate-600 hover:text-slate-900",
            )}
          >
            {r === "doctor" ? "Doctor" : "Lab"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <Field label={role === "doctor" ? "Full name" : "Lab name"} error={errors.name}>
          <Input value={form.name} onChange={set("name")} autoComplete="name" placeholder={role === "doctor" ? "Dr. Anita Menon" : "City Diagnostics"} className="h-10" />
        </Field>
        <Field
          label={role === "doctor" ? "Hospital email" : "Email"}
          hint={role === "doctor" ? `Must end in ${ALLOWED_DOCTOR_DOMAINS.map((d) => "@" + d).join(" or ")}` : undefined}
          error={errors.email}
        >
          <Input type="email" value={form.email} onChange={set("email")} autoComplete="email" className="h-10" />
        </Field>
        {role === "doctor" && (
          <>
            <Field label="Specialty" error={errors.specialty}>
              <Input value={form.specialty} onChange={set("specialty")} placeholder="General Medicine" className="h-10" />
            </Field>
            <Field label="Medical council registration number" hint="e.g. TNMC 123456" error={errors.councilRegNo}>
              <Input value={form.councilRegNo} onChange={set("councilRegNo")} className="h-10 font-mono" />
            </Field>
          </>
        )}
        <Field label="Password" hint={`At least ${MIN_PASSWORD_LENGTH} characters`} error={errors.password}>
          <Input type="password" value={form.password} onChange={set("password")} autoComplete="new-password" className="h-10" />
        </Field>
        {serverError && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {serverError}
          </p>
        )}
        <Button type="submit" className="h-10 w-full" disabled={busy}>
          {busy ? "Creating account…" : `Register as ${role === "doctor" ? "doctor" : "lab"}`}
        </Button>
        <p className="text-center text-sm text-slate-600">
          Already registered?{" "}
          <Link href={`/login?tab=${role}`} className="font-medium text-teal-700 hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </Card>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl bg-white p-6 text-sm shadow-sm ring-1 ring-slate-200">{children}</div>;
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="block text-xs text-red-700">
          {error}
        </span>
      ) : (
        hint && <span className="block text-xs text-slate-500">{hint}</span>
      )}
    </label>
  );
}
