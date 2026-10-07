import { AlertTriangle, Phone } from "lucide-react";
import { DENGUE_WARNING_SIGNS } from "@/lib/treatment";

/** The doctor-approved warning-signs advice (shown verbatim) with Call 108. */
export function WarningSignsCard({ large = false }: { large?: boolean }) {
  return (
    <section className="rounded-2xl bg-red-50 p-5 ring-1 ring-red-200" role="note" aria-label="Warning signs">
      <h2 className={large ? "flex items-center gap-2 text-lg font-semibold text-red-800" : "flex items-center gap-2 text-sm font-semibold text-red-800"}>
        <AlertTriangle className="size-5" aria-hidden /> Warning signs — come back immediately
      </h2>
      <p className={large ? "mt-2 text-base text-red-900" : "mt-2 text-sm text-red-900"}>{DENGUE_WARNING_SIGNS}.</p>
      <a
        href="tel:108"
        className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-base font-semibold text-white hover:bg-red-700 sm:w-auto print:hidden"
      >
        <Phone className="size-5" aria-hidden /> Call 108
      </a>
    </section>
  );
}
