"use client";

import { useMemo, useState } from "react";
import { BellRing, Check, FlaskConical, MessageSquare, Phone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { OrderTestDialog } from "@/components/workflow/OrderTestDialog";
import { OutcomePanel } from "./OutcomePanel";
import { StageChip } from "@/components/workflow/StageChip";
import { alertOrderPrefill } from "@/lib/caseContext";
import { outcomeLabel } from "@/lib/wearable/outcomes";
import { panelName } from "@/lib/workflow";
import { ANSWER_LABEL, formatIst, isYes, type EpisodeState, type WearableEvent } from "@/lib/wearable/checkin";
import { QUESTION_BANK } from "@/lib/wearable/conditions";
import { cn } from "@/lib/utils";
import { useCurrentUser, useInaraStore } from "@/store/useInaraStore";

const LEVEL = {
  urgent: { label: "Urgent", badge: "bg-red-600 text-white", card: "ring-red-300" },
  see_doctor: { label: "See doctor within 24 h", badge: "bg-amber-500 text-white", card: "ring-amber-300" },
  monitor: { label: "Monitor", badge: "bg-sky-100 text-sky-800", card: "ring-slate-200" },
} as const;

/** The doctor's view of a wearable alert episode: pattern, answers, recommendation, notifications, timeline, actions. */
export function AlertDetail({ episode }: { episode: EpisodeState }) {
  const allNotifications = useInaraStore((s) => s.notifications);
  const act = useInaraStore((s) => s.doctorAlertAction);
  const doctor = useCurrentUser();
  const patient = useInaraStore((s) => s.patients.find((p) => p.id === episode.patientId));
  const alertCase = useInaraStore((s) => s.cases.find((c) => c.episodeId === episode.episodeId));
  const [ordering, setOrdering] = useState(false);
  const notifications = useMemo(() => allNotifications.filter((n) => n.episodeId === episode.episodeId), [allNotifications, episode.episodeId]);
  const [mode, setMode] = useState<"called" | "dismissed" | null>(null);
  const [note, setNote] = useState("");
  const snap = episode.snapshot;
  const rec = episode.latest?.recommendation;
  const level = rec?.level;

  const submit = () => {
    if (!mode || (mode === "dismissed" && !note.trim())) return;
    act(episode.episodeId, mode, note || (mode === "called" ? "Called patient" : undefined));
    setMode(null);
    setNote("");
  };

  return (
    <section className={cn("rounded-2xl bg-white p-5 shadow-sm ring-2", level ? LEVEL[level].card : "ring-amber-200")} aria-labelledby="alert-title">
      <div className="flex flex-wrap items-center gap-2">
        <BellRing className="size-5 text-red-600" aria-hidden />
        <h2 id="alert-title" className="mr-auto font-semibold text-slate-900">
          Wearable alert · {snap.patternName}
        </h2>
        {level ? (
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", LEVEL[level].badge)}>{LEVEL[level].label}</span>
        ) : (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">Waiting for check-in answers</span>
        )}
        {rec && rec.redFlags.length > 0 && <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-200">Red flag</span>}
        {episode.dismissed && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">Dismissed</span>}
        {episode.closed && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">Closed · outcome recorded</span>}
        {!episode.dismissed && episode.acknowledged && <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-700 ring-1 ring-teal-200">Acknowledged</span>}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Started {formatIst(episode.startedAt)} from Day {snap.day} data · possible pattern, not a diagnosis
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Block title="Evidence">
            <ul className="flex flex-wrap gap-1.5">
              {[...snap.evidence, ...snap.sensorFlags.map((f) => `Sensor red flag: ${f}`)].map((e) => (
                <li key={e} className="rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-800 ring-1 ring-slate-200">
                  {e}
                </li>
              ))}
            </ul>
            {snap.supportingFactors.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
                {snap.supportingFactors.map((f) => (
                  <li key={f}>+ {f}</li>
                ))}
              </ul>
            )}
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              <FlaskConical className="size-3.5" aria-hidden /> Consider: {snap.suggestedLabTests.join(", ")}
            </p>
          </Block>

          <Block title={`Patient's answers${episode.round > 1 ? ` (round ${episode.round})` : ""}`}>
            {snap.questions.length === 0 ? (
              <p className="text-sm text-slate-600">No questions — a sensor red flag went straight to urgent.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {snap.questions.map((id) => {
                  const q = QUESTION_BANK[id];
                  const a = episode.answers[id];
                  const flagged = q.redFlag && isYes(a);
                  return (
                    <li key={id} className={cn("flex items-baseline justify-between gap-3 py-1.5", flagged && "-mx-2 rounded-lg bg-red-50 px-2")}>
                      <span className={cn("text-slate-700", flagged && "font-semibold text-red-800")}>
                        {q.text}
                        {q.redFlag && <span className="ml-1 text-[10px] font-semibold tracking-wide text-red-600 uppercase">red flag</span>}
                      </span>
                      <span className={cn("shrink-0 font-medium", a === undefined ? "text-slate-400" : isYes(a) ? "text-amber-700" : "text-slate-900", flagged && "text-red-700")}>
                        {a === undefined ? (episode.checkInDue ? "—" : "not asked") : ANSWER_LABEL[a]}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Block>

          {rec && (
            <Block title="Recommendation given to the patient">
              <p className="font-medium text-slate-900">{rec.headline}</p>
              <p className="mt-1 text-sm text-slate-600">{rec.why}</p>
            </Block>
          )}
        </div>

        <div className="space-y-4">
          <Block title="Notifications">
            {notifications.length === 0 ? (
              <p className="text-sm text-slate-500">None yet.</p>
            ) : (
              <ul className="space-y-2">
                {notifications.map((n) => (
                  <li key={n.id} className="rounded-xl bg-slate-50 p-2.5 text-xs ring-1 ring-slate-200">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      {n.channel === "sms" ? <MessageSquare className="size-3.5 text-slate-500" aria-hidden /> : <BellRing className="size-3.5 text-slate-500" aria-hidden />}
                      <span className="font-medium text-slate-800">
                        {n.to === "emergency_contact" ? "Emergency contact" : n.to === "doctor" ? "Doctor" : "Patient"} · {n.channel === "sms" ? "SMS preview" : "in-app"}
                      </span>
                      <span className={cn("rounded-full px-1.5 font-medium", n.sent ? "bg-green-50 text-green-700" : "bg-slate-200 text-slate-600")}>{n.status}</span>
                      <span className="ml-auto text-slate-500">{formatIst(n.at)}</span>
                    </div>
                    <p className="mt-1 text-slate-500">To {n.toName} · consent: {n.consent === "patient_app" ? "patient's own app" : n.consent}</p>
                    <p className={cn("mt-1.5 rounded-lg px-2.5 py-1.5 text-slate-800", n.channel === "sms" ? "bg-green-100/70" : "bg-white ring-1 ring-slate-200", !n.sent && "line-through opacity-60")}>
                      {n.message}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Block>

          <Block title="Timeline">
            <ol className="space-y-1.5 border-l-2 border-slate-200 pl-3 text-xs">
              {episode.events.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute top-1.5 -left-[17px] size-2 rounded-full bg-slate-400" aria-hidden />
                  <span className="text-slate-500 tabular-nums">{formatIst(e.at)}</span> · <span className="text-slate-800">{describe(e)}</span>
                </li>
              ))}
            </ol>
          </Block>
        </div>
      </div>

      {!episode.dismissed && !episode.closed && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          {mode ? (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-800" htmlFor="alert-note">
                {mode === "called" ? "Call note" : "Reason for dismissing (required)"}
              </label>
              <Textarea
                id="alert-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={mode === "called" ? "e.g. Spoke to patient, advised to go to the hospital now" : "e.g. Seen in clinic today, recovering"}
                rows={2}
              />
              <div className="flex gap-2">
                <Button onClick={submit} disabled={mode === "dismissed" && !note.trim()} className="bg-teal-600 text-white hover:bg-teal-700">
                  Save
                </Button>
                <Button variant="outline" onClick={() => setMode(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => act(episode.episodeId, "acknowledged")} disabled={episode.acknowledged}>
                <Check aria-hidden /> {episode.acknowledged ? "Acknowledged" : "Acknowledge"}
              </Button>
              <Button variant="outline" onClick={() => setMode("called")}>
                <Phone aria-hidden /> Called patient
              </Button>
              <Button variant="outline" onClick={() => setMode("dismissed")}>
                <X aria-hidden /> Dismiss with reason
              </Button>
              {alertCase?.stage === "alert_raised" && (
                <Button className="bg-teal-600 text-white hover:bg-teal-700 sm:ml-auto" onClick={() => setOrdering(true)}>
                  <FlaskConical aria-hidden /> Order lab test
                </Button>
              )}
            </div>
          )}
        </div>
      )}
      {alertCase && alertCase.stage !== "alert_raised" && (
        <p className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-900 ring-1 ring-teal-200">
          <FlaskConical className="size-4 text-teal-700" aria-hidden />
          Test ordered · {alertCase.panels.map(panelName).join(", ")}
          {alertCase.urgency === "urgent" && <span className="font-semibold text-red-700">· Urgent</span>}
          <span className="ml-auto">
            <StageChip stage={alertCase.stage} />
          </span>
        </p>
      )}
      {ordering && alertCase && patient && (
        <OrderTestDialog
          patient={patient}
          doctorName={doctor?.name ?? "Doctor"}
          onClose={() => setOrdering(false)}
          alert={{ caseId: alertCase.id, prefill: alertOrderPrefill(snap, rec?.redFlags.map((f) => f.replace(/^your /, ""))) }}
        />
      )}
      {!episode.dismissed && (
        <div className="mt-4">
          <OutcomePanel episode={episode} />
        </div>
      )}
    </section>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">{title}</h3>
      {children}
    </div>
  );
}

function describe(e: WearableEvent): string {
  switch (e.type) {
    case "episode_started":
      return `Inara noticed a ${e.snapshot.patternName.toLowerCase()} (concerning)`;
    case "checkin_started":
      return e.round > 1 ? `Follow-up check-in sent (round ${e.round})` : "Check-in sent to patient";
    case "answer":
      return `${e.by} answered “${QUESTION_BANK[e.questionId].short}”: ${ANSWER_LABEL[e.answer]}`;
    case "recommendation":
      return `Recommendation: ${e.recommendation.headline}`;
    case "reminder":
      return e.reason === "recheck" ? "12 h recheck due" : e.reason === "disconnected" ? "Reminder: watch disconnected for 6 h" : "Reminder: no answer after 6 h";
    case "contact_escalation":
      return e.reason === "disconnected" ? "Escalated to emergency contact: watch off for 12 h" : "Escalated to emergency contact: no answer after 12 h";
    case "watch_off":
      return "Watch disconnected";
    case "watch_on":
      return "Watch reconnected";
    case "doctor_action":
      return `${e.by}: ${e.action === "acknowledged" ? "acknowledged" : e.action === "called" ? "called patient" : "dismissed"}${e.note ? ` — ${e.note}` : ""}`;
    case "outcome":
      return `${e.by}: outcome — ${outcomeLabel(e.outcome)} · population data: ${e.population} · alert closed`;
  }
}
