"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Polls whether the transcript pipeline is busy, so /admin/upload can disable
 * uploading while a run is in flight.
 *
 * The pipeline watch handles the drop folder one file at a time and a measured run
 * takes 3-4 minutes (a 3-file batch put its last file at ~12), so a second upload
 * mid-run just queues behind the first with nothing on screen to say so. The poll
 * interval matches the watcher's own (5s), so the button re-enables about as fast as
 * the folder actually clears.
 *
 * `stale` means a queued file has been sitting far longer than a run takes — the
 * watcher is probably down, or that file cannot be processed. The page re-enables
 * uploading in that case rather than staying locked forever.
 *
 * `reachable` is false once a poll fails. The gate is the only live signal the page
 * has, and it used to fail silently: an unauthenticated or errored response returned
 * early leaving the IDLE default, so the page showed "nothing is running" — the same
 * screen as a healthy idle pipeline — and the user read that as the upload having
 * done nothing. Surfacing it lets the page say "status unavailable" instead of
 * quietly asserting something it does not know.
 */

export interface PipelineGate {
  busy: boolean;
  stale: boolean;
  queued: string[];
  waitingSeconds: number;
  reachable: boolean;
}

interface GateResponse {
  busy?: boolean;
  stale?: boolean;
  queued?: string[];
  waiting_seconds?: number;
}

const IDLE: PipelineGate = {
  busy: false,
  stale: false,
  queued: [],
  waitingSeconds: 0,
  reachable: true,
};
const POLL_MS = 5000;

export function usePipelineGate(pollMs: number = POLL_MS): PipelineGate {
  const [gate, setGate] = useState<PipelineGate>(IDLE);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/backend/admin/upload-gate");
        if (cancelled) return;
        if (!res.ok) {
          // Keep the last known busy/queued state, but stop claiming it is current.
          setGate((g) => ({ ...g, reachable: false }));
          return;
        }
        const d: GateResponse = await res.json();
        setGate({
          busy: Boolean(d.busy),
          stale: Boolean(d.stale),
          queued: d.queued ?? [],
          waitingSeconds: d.waiting_seconds ?? 0,
          reachable: true,
        });
      } catch {
        // Network blip: hold the last known state. Failing open would silently
        // re-enable the button mid-run, which is the thing this hook prevents.
        if (!cancelled) setGate((g) => ({ ...g, reachable: false }));
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
