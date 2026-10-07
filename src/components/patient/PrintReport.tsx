import type { PrintableReport } from "@/lib/patientView";

/** Print-only layout ("Download / print my report"): approved content only, plain and clean. */
export function PrintReport({ report }: { report: PrintableReport }) {
  return (
    <article className="hidden text-[11pt] leading-snug text-black print:block">
      <header className="mb-4 border-b border-slate-300 pb-3">
        <p className="text-sm font-semibold text-teal-700">BioMarQ: Prodrome</p>
        <h1 className="text-xl font-semibold">{report.title}</h1>
        <p className="text-sm">{report.patientLine}</p>
        <p className="mt-1 text-xs text-slate-600">Only results and plans approved by your doctor are included.</p>
      </header>
      {report.sections.map((s, i) => (
        <section key={`${s.heading}-${i}`} className="mb-3 break-inside-avoid">
          <h2 className="text-sm font-semibold">{s.heading}</h2>
          <ul className="mt-1 space-y-0.5 text-sm">
            {s.lines.map((l, j) => (
              <li key={j} className="whitespace-pre-line">
                {l}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <footer className="mt-6 border-t border-slate-300 pt-2 text-xs text-slate-600">{report.footer}</footer>
    </article>
  );
}
