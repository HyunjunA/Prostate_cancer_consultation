"use client";

import AdminTrackingPatientFirst from "@/components/AdminTrackingPatientFirst";

// Patient Report behavior — first-visit report mode only.
export default function AdminTrackingPatientReportPage() {
  return <AdminTrackingPatientFirst lockedMode="report" />;
}
