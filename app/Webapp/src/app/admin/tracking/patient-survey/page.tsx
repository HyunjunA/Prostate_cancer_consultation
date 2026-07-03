"use client";

import AdminTrackingPatientFollowup from "@/components/AdminTrackingPatientFollowup";

// Patient Survey behavior. The first-visit Risk survey behavior now lives in
// patient_followup_survey_page_behavior (survey_type='risk_perception', redirected from the
// first-visit page), alongside the follow-up surveys — so this page shows the
// follow-up survey dashboard.
export default function AdminTrackingPatientSurveyPage() {
  return <AdminTrackingPatientFollowup />;
}
