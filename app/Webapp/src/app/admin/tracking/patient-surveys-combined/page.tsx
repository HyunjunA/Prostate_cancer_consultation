"use client";

import AdminTrackingSurveysCombined from "@/components/AdminTrackingSurveysCombined";

// Combined survey view — first-visit survey + follow-up survey sessions in ONE
// merged table (source column distinguishes them). The separate per-area pages
// still exist.
export default function AdminTrackingPatientSurveysCombinedPage() {
  return <AdminTrackingSurveysCombined />;
}
