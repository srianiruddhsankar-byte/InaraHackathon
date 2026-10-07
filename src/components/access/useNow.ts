"use client";

import { useEffect, useState } from "react";

/** Real time in ms, re-rendering every `everyMs` — drives countdowns and automatic expiry. */
export function useNow(everyMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}
