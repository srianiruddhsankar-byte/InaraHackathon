"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Building2, CalendarPlus, CheckCircle2, ChevronRight, Eye, Phone, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StageTracker } from "@/components/workflow/StageTracker";
import {
  CHECKIN_PROMPT,
  addHours,
  formatIst,
  type Answer,
  type EpisodeState,
  type NotificationEntry,
  type Recommendation,
  type RecommendationLevel,
} from "@/lib/wearable/checkin";
import { QUESTION_BANK } from "@/lib/wearable/conditions";
import { cn } from "@/lib/utils";
import { useInaraStore } from "@/store/useInaraStore";

/** Banner on the patient page: a check-in is due, or the latest result. */
export function CheckInBanner({ episode }: { episode: EpisodeState | null }) {
  const cases = useInaraStore((s) => s.cases);
  const alertCase = episode ? cases.find((c) => c.episodeId === episode.episodeId) : undefined;
  if (!episode) return null;
  if (episode.checkInDue) {
    return (
      <Link
        href="/patient/checkin"
        className="mb-6 flex items-center gap-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-300 transition-shadow hover:shadow-md"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <Eye className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-amber-950">{CHECKIN_PROMPT}</span>
          <span className="block text-sm text-amber-900/80">
            {episode.snapshot.questions.length} questions · about 1 minute{episode.round > 1 ? " · follow-up check-in" : ""}
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-amber-700" aria-hidden />
      </Link>
    );
  }
  if (!episode.latest) return null;
  if (episode.closed) {
    // The doctor recorded the outcome: the check-in advice is no longer current.
    return (
      <section className="mb-6 rounded-2xl bg-teal-50/60 p-4 ring-1 ring-teal-100">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700">
            <CheckCircle2 className="size-5" aria-hidden />
          </span>
          <p className="min-w-0 flex-1 font-semibold text-teal-950">Your doctor has followed up on Inara&apos;s alert</p>
        </div>
        {alertCase && (
          <div className="mt-4 rounded-xl bg-white/80 p-3 ring-1 ring-slate-200">
            <StageTracker c={alertCase} variant="patient" />
          </div>
        )}
      </section>
    );
  }
  const level = episode.latest.recommendation.level;
  return (
    <section className={cn("mb-6 rounded-2xl p-4 ring-1", LEVEL_STYLE[level].card)}>
      <div className="flex flex-wrap items-center gap-3">
        <LevelIcon level={level} />
        <div className="min-w-0 flex-1">
          <p className={cn("font-semibold", LEVEL_STYLE[level].title)}>{episode.latest.recommendation.headline}</p>
          <p className="text-xs text-slate-600">From your check-in · {formatIst(episode.latest.at)}</p>
        </div>
        <Link href="/patient/checkin" className="text-sm font-medium text-teal-700 hover:underline">
          See details
        </Link>
      </div>
      {alertCase && (
        <div className="mt-4 rounded-xl bg-white/80 p-3 ring-1 ring-slate-200">
          <StageTracker c={alertCase} variant="patient" />
        </div>
      )}
    </section>
  );
}

const LEVEL_STYLE: Record<RecommendationLevel, { card: string; title: string; icon: string }> = {
  monitor: { card: "bg-sky-50 ring-sky-200", title: "text-sky-950", icon: "bg-sky-100 text-sky-700" },
  see_doctor: { card: "bg-amber-50 ring-amber-300", title: "text-amber-950", icon: "bg-amber-100 text-amber-700" },
  urgent: { card: "bg-red-50 ring-red-300", title: "text-red-950", icon: "bg-red-100 text-red-700" },
};

function LevelIcon({ level }: { level: RecommendationLevel }) {
  const Icon = level === "urgent" ? AlertTriangle : level === "see_doctor" ? Stethoscope : CheckCircle2;
  return (
    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", LEVEL_STYLE[level].icon)}>
      <Icon className="size-5" aria-hidden />
    </span>
  );
}

/** One question per card, big buttons, progress dots. */
export function CheckInFlow({ episode }: { episode: EpisodeState }) {
  const answerCheckIn = useInaraStore((s) => s.answerCheckIn);
  const questions = episode.snapshot.questions;
  const firstOpen = questions.findIndex((q) => episode.answers[q] === undefined);
  const [index, setIndex] = useState(firstOpen < 0 ? 0 : firstOpen);
  const q = QUESTION_BANK[questions[index]];

  const answer = (a: Answer) => {
    answerCheckIn(episode.episodeId, q.id, a);
    if (index < questions.length - 1) setIndex(index + 1);
  };
  const options: { a: Answer; label: string; tone: string }[] = q.severity
    ? [
        { a: "no", label: "No", tone: "bg-white text-slate-900 ring-slate-300 hover:bg-slate-50" },
        { a: "a_little", label: "A little", tone: "bg-amber-50 text-amber-900 ring-amber-300 hover:bg-amber-100" },
        { a: "a_lot", label: "A lot", tone: "bg-amber-100 text-amber-950 ring-amber-400 hover:bg-amber-200" },
      ]
    : [
        { a: "no", label: "No", tone: "bg-white text-slate-900 ring-slate-300 hover:bg-slate-50" },
        { a: "yes", label: "Yes", tone: "bg-teal-600 text-white ring-teal-600 hover:bg-teal-700" },
      ];

  return (
    <div className="mx-auto max-w-md">
      <p className="text-sm text-slate-600">{CHECKIN_PROMPT}</p>
      <ol className="mt-4 flex justify-center gap-2" aria-label={`Question ${index + 1} of ${questions.length}`}>
        {questions.map((id, i) => (
          <li
            key={id}
            className={cn(
              "size-2.5 rounded-full transition-colors",
              i === index ? "bg-teal-600 ring-4 ring-teal-100" : episode.answers[id] !== undefined ? "bg-teal-400" : "bg-slate-200",
            )}
          />
        ))}
      </ol>
      <section className="mt-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200" aria-live="polite">
        <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
          Question {index + 1} of {questions.length}
        </p>
        <h2 className="mt-2 text-xl leading-snug font-semibold text-slate-900">{q.text}</h2>
        <div className={cn("mt-6 grid gap-3", options.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
          {options.map((o) => (
            <button
              key={o.a}
              type="button"
              onClick={() => answer(o.a)}
              aria-pressed={episode.answers[q.id] === o.a}
              className={cn(
                "min-h-16 rounded-2xl text-lg font-semibold ring-2 transition-colors focus-visible:outline-none focus-visible:ring-4",
                o.tone,
                episode.answers[q.id] === o.a && "ring-4",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </section>
      {index > 0 && (
        <button type="button" onClick={() => setIndex(index - 1)} className="mt-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-teal-700">
          <ArrowLeft className="size-4" aria-hidden /> Previous question
        </button>
      )}
      <p className="mt-6 text-xs text-slate-500">If you feel very unwell right now, call 108 or go to the nearest hospital — don&apos;t wait for the questions.</p>
    </div>
  );
}

/** The result of a check-in, by level. */
export function CheckInResult({ episode, doctorName }: { episode: EpisodeState; doctorName: string }) {
  const allNotifications = useInaraStore((s) => s.notifications);
  const [booked, setBooked] = useState(false);
  const notifications = useMemo(() => allNotifications.filter((n) => n.episodeId === episode.episodeId), [allNotifications, episode.episodeId]);
  const latest = episode.latest!;
  const rec = latest.recommendation;
  const told = notified(notifications, latest.at);

  if (rec.level === "urgent") {
    return (
      <div className="-mx-4 sm:mx-0">
        <section className="bg-red-600 px-5 py-6 text-white sm:rounded-3xl" role="alert">
          <AlertTriangle className="size-8" aria-hidden />
          <h2 className="mt-3 text-2xl font-bold">{rec.headline}</h2>
          <p className="mt-2 text-red-50">Or go to the nearest hospital.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <a href="tel:108" className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-white text-lg font-bold text-red-700 hover:bg-red-50">
              <Phone className="size-5" aria-hidden /> Call 108 (ambulance)
            </a>
            <a
              href="https://www.google.com/maps/search/hospital+near+me"
              target="_blank"
              rel="noreferrer"
              className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-red-700 text-lg font-semibold text-white ring-1 ring-white/40 hover:bg-red-800"
            >
              <Building2 className="size-5" aria-hidden /> Go to the nearest hospital
            </a>
          </div>
          {told.length > 0 && <p className="mt-4 rounded-xl bg-red-700/60 px-3 py-2 text-sm">{told.join(" and ")} {told.length > 1 ? "have" : "has"} been notified.</p>}
        </section>
        <Reasons rec={rec} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className={cn("rounded-3xl p-5 ring-1", LEVEL_STYLE[rec.level].card)}>
        <div className="flex items-center gap-3">
          <LevelIcon level={rec.level} />
          <h2 className={cn("text-xl font-semibold", LEVEL_STYLE[rec.level].title)}>{rec.headline}</h2>
        </div>
        {rec.level === "see_doctor" ? (
          <Button
            className="mt-4 h-12 w-full bg-teal-600 text-base text-white hover:bg-teal-700 sm:w-auto"
            disabled={booked}
            onClick={() => {
              setBooked(true);
              toast.success(`Appointment request sent to ${doctorName} (simulated)`);
            }}
          >
            <CalendarPlus aria-hidden /> {booked ? "Request sent" : `Book with ${doctorName.replace(/ Nair$/, "")}`}
          </Button>
        ) : (
          <p className="mt-3 text-sm text-sky-900">We&apos;ll check again around {formatIst(addHours(latest.at, rec.recheckHours ?? 12))}.</p>
        )}
      </section>
      <Reasons rec={rec} />
      {rec.level === "see_doctor" && (
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">What to tell the doctor</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {rec.tellDoctor.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Reasons({ rec }: { rec: Recommendation }) {
  return (
    <section className="mt-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      {rec.whatWeNoticed.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-slate-900">What we noticed</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {rec.whatWeNoticed.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </>
      )}
      <h3 className="mt-4 text-sm font-semibold text-slate-900">Why we recommend this</h3>
      <p className="mt-1 text-sm leading-relaxed text-slate-700">{rec.why}</p>
      <p className="mt-4 text-xs text-slate-500">Early warning from your watch, not a diagnosis. Your doctor decides what it means.</p>
    </section>
  );
}

/** "Your emergency contact Revathi R" / "Dr. Meera Nair" — only those actually sent with this result. */
function notified(notifications: NotificationEntry[], at: string): string[] {
  const sent = notifications.filter((x) => x.at === at && x.sent);
  const contact = sent.find((n) => n.to === "emergency_contact");
  const doctor = sent.find((n) => n.to === "doctor");
  return [contact && `Your emergency contact ${contact.toName.split(" (")[0]}`, doctor?.toName].filter((x): x is string => !!x);
}
