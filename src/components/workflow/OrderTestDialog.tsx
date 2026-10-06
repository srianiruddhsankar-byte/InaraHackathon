"use client";

import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Patient, PanelId, Urgency } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PANELS } from "@/lib/workflow";
import { useInaraStore } from "@/store/useInaraStore";

/** "Order lab test" button + dialog. Creates a case at "ordered" for the lab. */
export function OrderTestButton({ patient, doctorName }: { patient: Patient; doctorName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="lg" className="h-10 px-4" onClick={() => setOpen(true)}>
        <FlaskConical /> Order lab test
      </Button>
      {open && <OrderTestDialog patient={patient} doctorName={doctorName} onClose={() => setOpen(false)} />}
    </>
  );
}

function OrderTestDialog({ patient, doctorName, onClose }: { patient: Patient; doctorName: string; onClose: () => void }) {
  const orderLabTest = useInaraStore((s) => s.orderLabTest);
  const [panels, setPanels] = useState<PanelId[]>([]);
  const [suspected, setSuspected] = useState(patient.suspectedDisease);
  const [urgency, setUrgency] = useState<Urgency>("routine");
  const [note, setNote] = useState("");

  const toggle = (id: PanelId) => setPanels((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const submit = () => {
    if (panels.length === 0) return;
    // Keep panels in their standard order, whatever order they were ticked in.
    const ordered = PANELS.map((p) => p.id).filter((id) => panels.includes(id));
    orderLabTest(
      { patientId: patient.id, suspectedDisease: suspected.trim() || patient.suspectedDisease, panels: ordered, urgency, clinicalNote: note.trim() },
      doctorName,
    );
    toast.success(`Lab test ordered for ${patient.name} — ${ordered.length} panel${ordered.length === 1 ? "" : "s"}, ${urgency}`);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Order lab test · {patient.name}</DialogTitle>
          <DialogDescription>The order goes to the lab at stage “Ordered”.</DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium text-slate-900">Panels</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {PANELS.map((p) => {
              const checked = panels.includes(p.id);
              return (
                <label
                  key={p.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-2.5 rounded-xl p-2.5 ring-1 transition-colors",
                    checked ? "bg-teal-50 ring-teal-300" : "bg-white ring-slate-200 hover:bg-slate-50",
                  )}
                >
                  <input type="checkbox" className="mt-0.5 size-4 accent-teal-600" checked={checked} onChange={() => toggle(p.id)} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-900">{p.name}</span>
                    <span className="block text-xs text-slate-500">{p.tests.map((t) => t.name).join(", ")}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <button
            type="button"
            className="text-xs font-medium text-teal-700 hover:underline"
            onClick={() => setPanels(panels.length === PANELS.length ? [] : PANELS.map((p) => p.id))}
          >
            {panels.length === PANELS.length ? "Clear all" : "Select all"}
          </button>
        </fieldset>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-900">Suspected disease</span>
          <Input value={suspected} onChange={(e) => setSuspected(e.target.value)} />
        </label>

        <fieldset>
          <legend className="mb-1 text-sm font-medium text-slate-900">Urgency</legend>
          <div className="inline-flex rounded-lg bg-slate-100 p-1">
            {(["routine", "urgent"] as const).map((u) => (
              <button
                key={u}
                type="button"
                aria-pressed={urgency === u}
                onClick={() => setUrgency(u)}
                className={cn(
                  "rounded-md px-4 py-1.5 text-sm font-medium capitalize",
                  urgency === u ? (u === "urgent" ? "bg-red-600 text-white" : "bg-white text-slate-900 shadow-sm") : "text-slate-600",
                )}
              >
                {u}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-900">Clinical note for the lab</span>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Fasting sample please. On metformin." />
        </label>

        <DialogFooter>
          {panels.length === 0 && <p className="mr-auto self-center text-xs text-slate-500">Choose at least one panel.</p>}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button className="bg-teal-600 text-white hover:bg-teal-700" disabled={panels.length === 0} onClick={submit}>
            Order tests
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
