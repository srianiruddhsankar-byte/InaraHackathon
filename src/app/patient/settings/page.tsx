"use client";

import { useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ChevronLeft, Phone, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ConsentKey, EmergencyContact } from "@/lib/types";
import { CONSENT_ORDER, CONSENT_TEXT, contactErrors } from "@/lib/wearable/consent";
import { cn } from "@/lib/utils";
import { useCurrentUser, useInaraStore } from "@/store/useInaraStore";

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 focus-visible:outline-none",
        checked ? "bg-teal-600" : "bg-slate-300",
      )}
    >
      <span className={cn("inline-block size-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-5" : "translate-x-0.5")} />
    </button>
  );
}

export default function PatientSettingsPage() {
  const user = useCurrentUser();
  const patientId = user?.patientId;
  const settings = useInaraStore((s) => s.patientSettings.find((p) => p.patientId === patientId));
  const log = useInaraStore((s) => s.consentLog);
  const { setPatientConsent, setEmergencyContact } = useInaraStore.getState();

  if (!patientId || !settings) {
    return <EmptyState title="Settings not available">Please log in as a patient.</EmptyState>;
  }

  const row = (key: ConsentKey) => {
    const c = settings[key];
    return (
      <li key={key} className="flex items-start gap-4 py-4">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-900">{CONSENT_TEXT[key].title}</p>
          <p className="mt-0.5 text-sm text-slate-600">{CONSENT_TEXT[key].detail}</p>
          <p className="mt-1 text-xs text-slate-500">
            {c.granted ? "On" : "Off"} · last changed {format(parseISO(c.updatedAt), "d MMM yyyy, HH:mm")}
          </p>
        </div>
        <Toggle
          checked={c.granted}
          label={CONSENT_TEXT[key].title}
          onChange={(v) => {
            setPatientConsent(patientId, key, v);
            toast.success(`${CONSENT_TEXT[key].title}: ${v ? "on" : "off"}`);
          }}
        />
      </li>
    );
  };

  const mine = log.filter((e) => e.patientId === patientId).slice(-5).reverse();

  return (
    <>
      <Link href="/patient" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-teal-700">
        <ChevronLeft className="size-4" /> My reports
      </Link>
      <PageHeader title="Privacy & settings" subtitle="Each choice is separate. You can change any of them at any time." />

      <section className="rounded-2xl bg-white px-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="flex items-center gap-2 pt-5 text-sm font-semibold text-slate-900">
          <ShieldCheck className="size-4 text-teal-600" aria-hidden /> Wearable data
        </h2>
        <ul className="divide-y divide-slate-100">{CONSENT_ORDER.map(row)}</ul>
      </section>

      <section className="mt-5 rounded-2xl bg-white px-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="pt-5 text-sm font-semibold text-slate-900">Urgent alerts</h2>
        <ul>{row("notifyDoctorOnUrgent")}</ul>
      </section>

      <ContactForm
        key={settings.emergencyContact?.updatedAt ?? "none"}
        contact={settings.emergencyContact}
        onSave={(c) => {
          setEmergencyContact(patientId, c);
          toast.success("Emergency contact saved");
        }}
      />

      {mine.length > 0 && (
        <section className="mt-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Recent changes</h2>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {mine.map((e) => (
              <li key={e.at + e.change}>
                {format(parseISO(e.at), "d MMM, HH:mm")} ·{" "}
                {e.change === "emergencyContact" ? "Emergency contact updated" : `${CONSENT_TEXT[e.change].title}: ${e.granted ? "on" : "off"}`}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function ContactForm({ contact, onSave }: { contact: EmergencyContact | null; onSave: (c: Omit<EmergencyContact, "updatedAt">) => void }) {
  const [form, setForm] = useState({ name: contact?.name ?? "", relation: contact?.relation ?? "", phone: contact?.phone ?? "" });
  const [touched, setTouched] = useState(false);
  const errors = contactErrors(form);
  const field = (key: keyof typeof form, label: string, placeholder: string, type = "text") => (
    <label className="block text-sm">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <Input
        className="mt-1"
        type={type}
        value={form[key]}
        placeholder={placeholder}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
    </label>
  );
  return (
    <section className="mt-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Phone className="size-4 text-teal-600" aria-hidden /> Emergency contact
      </h2>
      <p className="mt-0.5 text-sm text-slate-600">Who we should tell if a reading looks urgent.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {field("name", "Name", "e.g. Revathi R")}
        {field("relation", "Relation", "e.g. Mother")}
        {field("phone", "Mobile", "+91 90000 00000", "tel")}
      </div>
      {touched && errors.length > 0 && <p className="mt-2 text-sm text-red-700">{errors[0]}</p>}
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {contact ? `Last changed ${format(parseISO(contact.updatedAt), "d MMM yyyy, HH:mm")}` : "Not set yet"}
        </p>
        <Button
          className="bg-teal-600 text-white hover:bg-teal-700"
          onClick={() => {
            setTouched(true);
            if (errors.length === 0) onSave({ name: form.name.trim(), relation: form.relation.trim(), phone: form.phone.trim() });
          }}
        >
          Save contact
        </Button>
      </div>
    </section>
  );
}
