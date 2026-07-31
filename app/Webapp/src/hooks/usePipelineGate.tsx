"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Polls whether the transcript pipeline is busy, so /admin/upload can disable
 * uploading while a run is in flight.
 *
 * The pipeline watch handles the drop folder one file at a time and a run takes a
 * couple of minutes, so a second upload mid-run just queues behind the first with
 * nothing on screen to say so. The poll interval matches the watcher's own (5s), so
 * the button re-enables about as fast as the folder actually clears.
 *
 * `stale` means a queued file has been sitting far longer than a run takes — the
 * watcher is probably down, or that file cannot be processed. The page re-enables
 * uploading in that case rather than staying locked forever.
 */

export interface PipelineGate {
  busy: boolean;
  stale: boolean;
  queued: string[];
  waitingSeconds: number;
}

interface GateResponse {
  busy?: boolean;
  stale?: boolean;
  queued?: string[];
  waiting_seconds?: number;
}

const IDLE: PipelineGate = { busy: false, stale: false, queued: [], waitingSeconds: 0 };
const POLL_MS = 5000;

export function usePipelineGate(pollMs: number = POLL_MS): PipelineGate {
  const [gate, setGate] = useState<PipelineGate>(IDLE);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/backend/admin/upload-gate");
        if (!res.ok) return; // keep the last known state
        const d: GateResponse = await res.json();
        if (cancelled) return;
        setGate({
          busy: Boolean(d.busy),
          stale: Boolean(d.stale),
          queued: d.queued ?? [],
          waitingSeconds: d.waiting_seconds ?? 0,
        });
      } catch {
        // Network blip: hold the last known state. Failing open would silently
        // re-enable the button mid-run, which is the thing this hook prevents.
      }
    };

    void poll();
    timerRef.current = window.setInterval(poll, pollMs);
    return () => {
      cancelled = true;
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [pollMs]);

  return gate;
}

export default usePipelineGate;
