"use client";

import AdminTrackingPatientFollowup from "@/components/AdminTrackingPatientFollowup";

// All patient SURVEY behavior now lives in patient_followup_survey: the
// follow-up surveys (SDM/DCS/Satisfaction) and the first-visit Risk survey
// (survey_type='risk_perception', redirected from the first-visit page). One
// dashboard covers them. (patient_first_behavior is report-only — see
// AdminTrackingPatientFirst.)
export default function AdminTrackingSurveysCombined() {
  return <AdminTrackingPatientFollowup />;
}
