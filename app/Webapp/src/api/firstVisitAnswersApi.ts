/**
 * firstVisitAnswersApi.ts
 *
 * Typed fetch wrappers for the row-per-question first-visit ANSWERS endpoints
 * (question_id-keyed; migration 014). Successor to firstVisitApi.ts, which is
 * kept for the legacy V37 page. Both go through the Next.js proxy at
 * /api/backend/[...path], which injects X-API-Key server-side.
 *
 * Backend contract: app/Backend/routes_patient.py
 *   GET  /api/patient/first-visit-answers/{file}/{speaker}
 *   PUT  /api/patient/first-visit-answers
 */

export type Domain = "cp" | "le" | "ed" | "inc" | "ius";
export type AnswerField = "vas" | "timeline" | "factors";
// vas -> number, timeline -> string, factors -> string[].
export type AnswerValue = number | string | string[] | null;

export interface AnswerItem {
  question_id: string;
  field: AnswerField;
  value: AnswerValue;
}

export interface AnswerRead {
  question_id: string;
  field: string;
  value: AnswerValue;
  submitted_at: string;
}

/** One domain's answers, keyed by question_id. */
export type DomainAnswers = Record<string, AnswerRead>;

export interface FirstVisitAnswersGet {
  responses: Record<Domain, DomainAnswers>;
}

const BASE = "/api/backend/patient/first-visit-answers";
const headers = { "Content-Type": "application/json" };

export const firstVisitAnswersApi = {
  /** Fetch all answers for one patient, nested domain -> question_id. */
  async get(file: string, speaker: string): Promise<FirstVisitAnswersGet> {
    const url = `${BASE}/${encodeURIComponent(file)}/${encodeURIComponent(speaker)}`;
    const resp = await fetch(url, { method: "GET", headers });
    if (!resp.ok) {
      throw new Error(`GET first-visit-answers failed: ${resp.status} ${await resp.text()}`);
    }
    return (await resp.json()) as FirstVisitAnswersGet;
  },

  /** Upsert one domain's answers (one row per question_id). */
  async put(payload: {
    file: string;
    speaker: string;
    domain: Domain;
    answers: AnswerItem[];
  }): Promise<FirstVisitAnswersGet> {
    const resp = await fetch(BASE, {
      method: "PUT",
      headers,
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      throw new Error(`PUT first-visit-answers failed: ${resp.status} ${await resp.text()}`);
    }
    return (await resp.json()) as FirstVisitAnswersGet;
  },
};
