/**
 * useFirstVisitAnswers.tsx
 *
 * Question_id-keyed successor to useFirstVisitResponses. Bridges the active
 * V38 first-visit page with the row-per-question answers endpoints:
 *
 *   1. On mount (or file/speaker change) it issues one GET to prefill the
 *      patient's previously-submitted answers (nested domain -> question_id).
 *   2. It exposes `saveDomain(domain, answers)` for the Submit handler; the
 *      promise resolves on success (so submittedDomains stays accurate) or
 *      rejects on failure.
 *
 * The hydration race is handled the same way as the legacy hook: the
 * consumer reads the cache only once `isHydrated` flips true, so a patient
 * typing before GET resolves is not overwritten.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AnswerItem,
  Domain,
  DomainAnswers,
  firstVisitAnswersApi,
} from "@/api/firstVisitAnswersApi";

type Cache = Partial<Record<Domain, DomainAnswers>>;

export interface UseFirstVisitAnswers {
  /** Cached server state — keyed by domain, then question_id. */
  responses: Cache;
  /** True after the mount-time GET resolves (success or error). */
  isHydrated: boolean;
  /** Last error (network, server, validation). Cleared on next save. */
  error: Error | null;
  /** Upsert one domain's answers. Rejects on failure. */
  saveDomain: (domain: Domain, answers: AnswerItem[]) => Promise<void>;
}

export function useFirstVisitAnswers(
  file: string | null | undefined,
  speaker: string | null | undefined,
): UseFirstVisitAnswers {
  const [responses, setResponses] = useState<Cache>({});
  const [isHydrated, setIsHydrated] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const latestKey = useRef<string>("");

  useEffect(() => {
    if (!file || !speaker) {
      setIsHydrated(false);
      return;
    }
    const key = `${file}::${speaker}`;
    latestKey.current = key;
    let cancelled = false;

    setIsHydrated(false);
    firstVisitAnswersApi
      .get(file, speaker)
      .then((data) => {
        if (cancelled || latestKey.current !== key) return;
        setResponses(data.responses);
        setError(null);
        setIsHydrated(true);
      })
      .catch((e: Error) => {
        if (cancelled || latestKey.current !== key) return;
        setError(e);
        setIsHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [file, speaker]);

  const saveDomain = useCallback(
    async (domain: Domain, answers: AnswerItem[]): Promise<void> => {
      if (!file || !speaker) {
        throw new Error("saveDomain called before file/speaker were known");
      }
      try {
        const data = await firstVisitAnswersApi.put({ file, speaker, domain, answers });
        // Refresh the whole cache from the server's authoritative response.
        setResponses(data.responses);
        setError(null);
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        throw err;
      }
    },
    [file, speaker],
  );

  return { responses, isHydrated, error, saveDomain };
}
