/**
 * firstVisitQuestions.ts — single source of truth for first-visit question_ids.
 *
 * Each question_id is a stable string shared by FOUR places that must agree:
 *   1. behavior tracking      (slider_moved / answer_changed / rating_click)
 *   2. the save payload       (buildAnswers -> PUT /first-visit-answers)
 *   3. prefill hydration      (reading the GET back into local state)
 *   4. the migration-014 backfill (historical; not imported, kept literal)
 *
 * Defining them here once means a typo or rename cannot silently desync those
 * places — referencing QID.cp.timeline is checked by TypeScript; a raw string
 * "cp_timeline" is not.
 *
 * Naming rule: `{domain}_{semantic}`. Sliders use a descriptive suffix because
 * a domain can have several (cp has two); timeline/factors/helpfulness use the
 * field name as suffix because there is one of each per domain today. To add a
 * second question of the same type, give it a new unique id here and reference
 * it from the tracking call, buildAnswers, and hydration.
 */

import type { Domain } from "@/api/firstVisitAnswersApi";

export const QID = {
  cp: {
    helpfulness: "cp_helpfulness",
    riskWithoutTreatment: "cp_risk_without_treatment", // VAS slider
    riskWithTreatment: "cp_risk_with_treatment", // VAS slider
    timeline: "cp_timeline",
  },
  le: {
    helpfulness: "le_helpfulness",
    timeline: "le_timeline",
    factors: "le_factors",
  },
  ed: {
    helpfulness: "ed_helpfulness",
    baselineReturn: "ed_baseline_return", // VAS slider
    timeline: "ed_timeline",
    factors: "ed_factors",
  },
  inc: {
    helpfulness: "inc_helpfulness",
    risk: "inc_risk", // VAS slider
    timeline: "inc_timeline",
    factors: "inc_factors",
  },
  ius: {
    helpfulness: "ius_helpfulness",
    risk: "ius_risk", // VAS slider
    timeline: "ius_timeline",
    factors: "ius_factors",
  },
} as const;

/**
 * Canonical id for a one-per-domain field question (timeline / factors), used
 * by the generic answer-change tracker. cp has no factors question, so callers
 * never request "factors" for cp.
 */
export function fieldQuestionId(
  domain: Domain,
  field: "timeline" | "factors",
): string {
  const q = QID[domain] as { timeline: string; factors?: string };
  return field === "timeline" ? q.timeline : (q.factors as string);
}
