"use client";

import { Clock, FastForward, RotateCcw, Watch, WatchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatIst, simNow, type EpisodeState } from "@/lib/wearable/checkin";
import { useInaraStore } from "@/store/useInaraStore";

/** Demo controls: simulated clock (+6 h), watch on/off, and reset the check-in. */
export function DemoClock({ patientId, episode }: { patientId: string; episode: EpisodeState | null }) {
  const simHours = useInaraStore((s) => s.simHours);
  const advance = useInaraStore((s) => s.advanceSimClock);
  const setWatchWorn = useInaraStore((s) => s.setWatchWorn);
  const resetCheckIn = useInaraStore((s) => s.resetCheckIn);
  const off = !!episode?.watchOffAt;

  return (
    <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-violet-300 bg-violet-50/50 px-4 py-3 text-sm">
      <span className="mr-auto flex items-center gap-2 text-violet-900">
        <Clock className="size-4" aria-hidden />
        <span>
          <span className="font-medium">Demo clock:</span> <span className="tabular-nums">{formatIst(simNow(simHours))}</span>
          {simHours > 0 && <span className="text-violet-700"> (+{simHours} h)</span>}
        </span>
      </span>
      <Button variant="outline" size="sm" onClick={() => advance(6)}>
        <FastForward aria-hidden /> +6 h
      </Button>
      {episode && !episode.dismissed && (
        <Button variant="outline" size="sm" onClick={() => setWatchWorn(patientId, off)}>
          {off ? <Watch aria-hidden /> : <WatchIcon aria-hidden />} {off ? "Put watch back on" : "Take watch off"}
        </Button>
      )}
      <Button variant="outline" size="sm" onClick={() => resetCheckIn(patientId)}>
        <RotateCcw aria-hidden /> Reset check-in
      </Button>
      {off && <p className="w-full text-xs text-violet-800">Watch disconnected since {formatIst(episode!.watchOffAt!)}.</p>}
    </section>
  );
}
