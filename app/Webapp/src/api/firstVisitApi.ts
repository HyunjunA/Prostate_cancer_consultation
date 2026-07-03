/**
 * firstVisitApi.ts
 *
 * @deprecated Wraps the DEPRECATED first-visit-responses endpoints
 * (`patient_first_visit_responses` table, superseded by
 * `patient_first_visit_answer`). Use `firstVisitAnswersApi` /
 * `useFirstVisitAnswers` instead. Only the dead V37–V39 flow uses this.
 *
 * Typed fetch wrappers for the V37 first-visit responses endpoints.
 * Both calls go through the Next.js proxy at /api/backend/[...path],
 * which injects the X-API-Key header server-side.
 *
 * Backend contract: see app/Backend/routes_patient.py
 *   GET  /api/patient/first-visit-responses/{file}/{speaker}
 *   PUT  /api/patient/first-visit-responses
 */

export type Domain = "cp" | "le" | "ed" | "inc" | "ius";

export interface FirstVisitResponseRead {
  domain: Domain;
  vas_primary: number | null;
  vas_secondary: number | null;
  timeline: string | null;
  factors: string[] | null;
  submitted_at: string;
}

export interface FirstVisitResponsesGet {
  responses: Record<Domain, FirstVisitResponseRead | null>;
}

export interface FirstVisitResponseUpsert {
  file: string;
  speaker: string;
  domain: Domain;
  vas_primary?: number | null;
  vas_secondary?: number | null;
  timeline?: string | null;
  factors?: string[] | null;
}

// Webapp proxy ([...path] route) auto-prepends "/api/" before forwarding
// to the backend. Existing calls follow the same convention — see
// usePatientData.tsx using "/api/backend/patient/scoring" (NOT
// "/api/backend/api/patient/scoring").
const BASE = "/api/backend/patient/first-visit-responses";

const headers = { "Content-Type": "application/json" };

export const firstVisitApi = {
  /** Fetch all five domain responses for one patient. */
  async get(
    file: string,
    speaker: string,
  ): Promise<FirstVisitResponsesGet> {
    const url = `${BASE}/${encodeURIComponent(file)}/${encodeURIComponent(
      speaker,
    )}`;
    const resp = await fetch(url, { method: "GET", headers });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`GET first-visit-responses failed: ${resp.status} ${text}`);
    }
    return (await resp.json()) as FirstVisitResponsesGet;
  },

  /** Upsert one (file, speaker, domain) row. */
  async put(
    payload: FirstVisitResponseUpsert,
  ): Promise<FirstVisitResponseRead> {
    const resp = await fetch(BASE, {
      method: "PUT",
      headers,
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`PUT first-visit-responses failed: ${resp.status} ${text}`);
    }
    return (await resp.json()) as FirstVisitResponseRead;
  },
};
