"use client";

import AdminTrackingPatientFollowup from "@/components/AdminTrackingPatientFollowup";

// All patient SURVEY behavior now lives in patient_followup_survey_page_behavior: the
// follow-up surveys (SDM/DCS/Satisfaction) and the first-visit Risk survey
// (survey_type='risk_perception', redirected from the first-visit page). One
// dashboard covers them. (patient_report_page_behavior is report-only — see
// AdminTrackingPatientReport.)
export default function AdminTrackingSurveysCombined() {
  return <AdminTrackingPatientFollowup />;
}
