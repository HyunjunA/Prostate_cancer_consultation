"use client";

import AdminTrackingPatientFirst from "@/components/AdminTrackingPatientFirst";

// Patient Survey behavior — first-visit survey mode only.
export default function AdminTrackingPatientSurveyPage() {
  return <AdminTrackingPatientFirst lockedMode="survey" />;
}
