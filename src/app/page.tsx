import Link from "next/link";
import { FlaskConical, Stethoscope, User } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STEPS = [
  { title: "Lab uploads results", body: "Messy test names are mapped to a standard dictionary and abnormal values are flagged." },
  { title: "Doctor reviews & approves", body: "One panel is screened for several conditions, compared with the patient's own history, and drafted for the doctor to edit." },
  { title: "Patient understands & shares", body: "Only approved reports reach the patient, in plain language, with consent-based QR sharing." },
];

const ENTRIES = [
  { href: "/lab", label: "Enter as Lab", icon: FlaskConical },
  { href: "/doctor", label: "Enter as Doctor", icon: Stethoscope },
  { href: "/patient", label: "Enter as Patient", icon: User },
];

export default function Home() {
  return (
    <div className="space-y-12 py-6">
      <section className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">Inara</h1>
        <p className="mt-3 text-lg text-teal-700">One test. Many diseases. Always doctor-approved.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {ENTRIES.map(({ href, label, icon: Icon }, i) => (
            <Link
              key={href}
              href={href}
              className={cn(buttonVariants({ variant: i === 1 ? "default" : "outline", size: "lg" }), "px-4")}
            >
              <Icon />
              {label}
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <div key={step.title} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <span className="flex size-8 items-center justify-center rounded-full bg-teal-50 text-sm font-semibold text-teal-700">
              {i + 1}
            </span>
            <h2 className="mt-4 font-semibold text-slate-900">{step.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{step.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
