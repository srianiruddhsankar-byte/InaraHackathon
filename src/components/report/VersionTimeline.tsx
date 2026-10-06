import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

export interface TimelineItem {
  id: string;
  label: string;
  author: string;
  timestamp: string;
  tone: "ai" | "edit" | "approved";
}

const DOT: Record<TimelineItem["tone"], string> = {
  ai: "bg-violet-500",
  edit: "bg-sky-500",
  approved: "bg-teal-600",
};

export function VersionTimeline({ title, items, empty }: { title: string; items: TimelineItem[]; empty?: string }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-0.5 text-xs text-slate-500">Append-only — earlier versions are never overwritten.</p>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">{empty ?? "No versions yet."}</p>
      ) : (
        <ol className="mt-4 space-y-4">
          {items.map((item, i) => (
            <li key={item.id} className="relative flex gap-3">
              {i < items.length - 1 && (
                <span className="absolute top-4 left-[5px] h-[calc(100%+0.5rem)] w-px bg-slate-200" aria-hidden />
              )}
              <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-white", DOT[item.tone])} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800">{item.label}</p>
                <p className="truncate text-xs text-slate-500">{item.author}</p>
                <p className="text-xs text-slate-400">{format(parseISO(item.timestamp), "d MMM yyyy, HH:mm")}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
