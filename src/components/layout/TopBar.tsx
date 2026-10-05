"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FlaskConical, RotateCcw, Stethoscope, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useInaraStore, type Persona } from "@/store/useInaraStore";

const PERSONAS: { key: Persona; label: string; href: string; icon: typeof User }[] = [
  { key: "lab", label: "Lab", href: "/lab", icon: FlaskConical },
  { key: "doctor", label: "Doctor", href: "/doctor", icon: Stethoscope },
  { key: "patient", label: "Patient", href: "/patient", icon: User },
];

export function TopBar() {
  const pathname = usePathname();
  const setPersona = useInaraStore((s) => s.setPersona);
  const resetDemo = useInaraStore((s) => s.resetDemo);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
          <span className="flex size-7 items-center justify-center rounded-lg bg-teal-600 text-sm text-white">
            I
          </span>
          <span className="hidden sm:inline">Inara</span>
        </Link>

        <nav className="ml-auto flex items-center gap-1 rounded-xl bg-slate-100 p-1" aria-label="Persona">
          {PERSONAS.map(({ key, label, href, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={key}
                href={href}
                onClick={() => setPersona(key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-medium transition-colors",
                  active ? "bg-white text-teal-700 shadow-sm" : "text-slate-600 hover:text-slate-900",
                )}
              >
                <Icon className="size-4" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </nav>

        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            resetDemo();
            toast.success("Demo data restored");
          }}
        >
          <RotateCcw />
          <span className="hidden sm:inline">Reset demo</span>
        </Button>
      </div>
    </header>
  );
}
