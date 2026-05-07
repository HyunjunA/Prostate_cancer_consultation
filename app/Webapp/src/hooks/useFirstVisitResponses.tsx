/**
 * useFirstVisitResponses.tsx
 *
 * Hook that bridges PatientInitialVisitReportV37.tsx with the backend
 * first-visit-responses endpoints. It does two things:
 *
 *   1. On mount (or when file/speaker changes) it issues a single GET
 *      to prefill the patient's previously-submitted answers.
 *   2. It exposes `saveDomain(domain, payload)` which the V37 Submit
 *      handler calls; the promise resolves with the persisted row on
 *      success, or rejects on failure (so the caller can keep
 *      submittedDomains accurate).
 *
 * The `isHydrated` flag guards against the hydration race: if the
 * patient starts typing before GET resolves, their input wins — the
 * hook does not retroactively overwrite local state from the GET
 * payload (V37 reads the cache only when isHydrated flips true).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Domain,
  FirstVisitResponseRead,
  FirstVisitResponseUpsert,
  firstVisitApi,
} from "@/api/firstVisitApi";

type Cache = Partial<Record<Domain, FirstVisitResponseRead | null>>;

export interface UseFirstVisitResponses {
  /** Cached server state — null inside the map means "no row yet". */
  responses: Cache;
  /** True after the mount-time GET resolves (success or error). */
  isHydrated: boolean;
  /** Last error (network, server, validation). Cleared on next save. */
  error: Error | null;
  /** Upsert one domain. Rejects on failure; on success returns the row. */
  saveDomain: (
    domain: Domain,
    payload: Omit<FirstVisitResponseUpsert, "file" | "speaker" | "domain">,
  ) => Promise<FirstVisitResponseRead>;
}

export function useFirstVisitResponses(
  file: string | null | undefined,
  speaker: string | null | undefined,
): UseFirstVisitResponses {
  const [responses, setResponses] = useState<Cache>({});
  const [isHydrated, setIsHydrated] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  // Track the latest (file, speaker) pair so a slow GET against an
  // older identifier does not write into state after we have moved on.
  const latestKey = useRef<string>("");

  useEffect(() => {
    if (!file || !speaker) {
      // No identity yet — keep isHydrated false; V37 should not call
      // saveDomain in this state anyway (the page does not render
      // without these query-string params).
      setIsHydrated(false);
      return;
    }

    const key = `${file}::${speaker}`;
    latestKey.current = key;
    let cancelled = false;

    setIsHydrated(false);
    firstVisitApi
      .get(file, speaker)
      .then((data) => {
        if (cancelled || latestKey.current !== key) return;
        setResponses(data.responses);
        setError(null);
        setIsHydrated(true);
      })
      .catch((e: Error) => {
        if (cancelled || latestKey.current !== key) return;
        // Mark hydrated even on failure so the UI is usable;
        // saveDomain will still attempt to PUT.
        setError(e);
        setIsHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [file, speaker]);

  const saveDomain = useCallback(
    async (
      domain: Domain,
      patch: Omit<FirstVisitResponseUpsert, "file" | "speaker" | "domain">,
    ): Promise<FirstVisitResponseRead> => {
      if (!file || !speaker) {
        throw new Error("saveDomain called before file/speaker were known");
      }
      // Per-Submit visibility: log what is about to be sent so a
      // watcher (manual via DevTools console, or automated via
      // page.on('console')) can see exactly what hits the backend
      // and what comes back. Counts factors as a length so the line
      // stays compact even with five factor labels.
      // eslint-disable-next-line no-console
      console.log(
        `%c[V37 Submit] → PUT /api/patient/first-visit-responses`,
        "color:#10b981;font-weight:bold",
        {
          domain,
          file,
          speaker,
          vas_primary: patch.vas_primary ?? null,
          vas_secondary: patch.vas_secondary ?? null,
          timeline: patch.timeline ?? null,
          factors_count: Array.isArray(patch.factors)
            ? patch.factors.length
            : 0,
          factors: patch.factors ?? null,
        },
      );
      try {
        const saved = await firstVisitApi.put({
          file,
          speaker,
          domain,
          ...patch,
        });
        // eslint-disable-next-line no-console
        console.log(
          `%c[V37 Submit] ✓ saved domain=${domain}`,
          "color:#10b981;font-weight:bold",
          {
            submitted_at: saved.submitted_at,
            vas_primary: saved.vas_primary,
            vas_secondary: saved.vas_secondary,
            timeline: saved.timeline,
            factors: saved.factors,
          },
        );
        // Merge into the cache so a subsequent GET-less re-render
        // still sees the latest server-confirmed values.
        setResponses((prev) => ({ ...prev, [domain]: saved }));
        setError(null);
        return saved;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        // eslint-disable-next-line no-console
        console.error(
          `%c[V37 Submit] ✗ failed domain=${domain}`,
          "color:#ef4444;font-weight:bold",
          err.message,
        );
        setError(err);
        throw err;
      }
    },
    [file, speaker],
  );

  return { responses, isHydrated, error, saveDomain };
}
