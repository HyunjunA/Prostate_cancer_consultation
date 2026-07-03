"use client";

import { useState } from "react";
import AdminTrackingPatientFirst from "@/components/AdminTrackingPatientFirst";
import AdminTrackingPatientFollowup from "@/components/AdminTrackingPatientFollowup";

type View = "survey" | "followup";

const TABS: { key: View; label: string }[] = [
  { key: "survey", label: "Patient Survey Behavior" },
  { key: "followup", label: "Patient Follow-up Survey Behavior" },
];

// Combined survey view — a toggle picks WHICH dashboard to show. The two survey
// sources have different shapes (first-visit is domain-based; follow-up is
// survey_type-based), so instead of merging them into one table (which would
// blank out columns and lose metrics) each is shown in its own native format.
export default function AdminTrackingSurveysCombined() {
  const [view, setView] = useState<View>("survey");

  return (
    <div className="bg-slate-50">
      {/* Toggle bar */}
      <div className="max-w-7xl mx-auto px-6 pt-6">
        <div className="inline-flex rounded-md border border-slate-300 overflow-hidden">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              className={`px-4 py-2 text-sm font-medium ${
                view === t.key
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Selected dashboard — each renders its own full section (sessions +
          event detail + aggregate) in its correct format. */}
      {view === "survey" ? (
        <AdminTrackingPatientFirst lockedMode="survey" />
      ) : (
        <AdminTrackingPatientFollowup />
      )}
    </div>
  );
}
