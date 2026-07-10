"use client";

/**
 * Admin tracking nav hub — Pattern A.
 *
 * The legacy single-table dashboard (AdminTrackingDashboard.tsx) is kept
 * importable for now so we can compare side by side; it will be removed in
 * Phase 6 of the rebuild.
 */

import Link from "next/link";

const AREAS = [
  {
    href: "/admin/tracking/patient-report",
    title: "Patient Report",
    description:
      "First-visit report mode: report views, topic/evidence open-close, and helpfulness ratings.",
    color: "from-rose-500 to-pink-500",
  },
  // Patient Survey Behavior — hidden. First-visit survey behavior was consolidated
  // into the follow-up table (survey_type='risk_perception'), so this view is now
  // redundant with "Patient Follow-up Survey Behavior". Route still exists; uncomment
  // to show the card again.
  // {
  //   href: "/admin/tracking/patient-survey",
  //   title: "Patient Survey Behavior",
  //   description:
  //     "First-visit survey mode: question answers, sliders, and submission activity.",
  //   color: "from-emerald-500 to-teal-500",
  // },
  {
    href: "/admin/tracking/patient-followup",
    title: "Patient Follow-up Survey Behavior",
    description:
      "Survey navigation, step views, answer timing, and completion across SDM / DCS / Risk / Satisfaction.",
    color: "from-violet-500 to-purple-500",
  },
  // Patient Survey + Follow-up (Combined) — hidden. Now redundant since first-visit
  // survey behavior lives in the follow-up table. Route still exists; uncomment to show.
  // {
  //   href: "/admin/tracking/patient-surveys-combined",
  //   title: "Patient Survey + Follow-up (Combined)",
  //   description:
  //     "First-visit survey and follow-up survey behavior together in one combined view.",
  //   color: "from-amber-500 to-orange-500",
  // },
  {
    href: "/admin/tracking/doctor",
    title: "Doctor Behavior",
    description:
      "Consultation navigation, patient and topic selection, AI rewrite usage, rubric scoring activity.",
    color: "from-sky-500 to-cyan-500",
  },
  // REDCap Sync Status — hidden from the admin hub (commented out).
  // The /admin/tracking/redcap-sync route still exists; uncomment to show the card again.
  // {
  //   href: "/admin/tracking/redcap-sync",
  //   title: "REDCap Sync Status",
  //   description:
  //     "Per-submission REDCap synchronization: synced / pending / errored survey answers, by SID record_id.",
  //   color: "from-teal-500 to-emerald-500",
  // },
  // Data Integrity — hidden from the admin hub (commented out).
  // The /admin/tracking/data-integrity route still exists; uncomment to show the card again.
  // {
  //   href: "/admin/tracking/data-integrity",
  //   title: "Data Integrity",
  //   description:
  //     "Automated checks: DB invariants, DB↔REDCap reconciliation, and activity cross-check. Review flagged exceptions only.",
  //   color: "from-slate-600 to-slate-800",
  // },
  // Session Recordings (rrweb) — hidden from the admin hub (commented out).
  // The /admin/tracking/recordings route still exists; uncomment to show the card again.
  // {
  //   href: "/admin/tracking/recordings",
  //   title: "Session Recordings (rrweb)",
  //   description:
  //     "Replay or download captured sessions to see how users actually navigated. PHI is masked at capture time.",
  //   color: "from-amber-500 to-orange-500",
  // },
];

export default function AdminTrackingHubPage() {
  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Admin Tracking</h1>
          <p className="mt-2 text-sm text-slate-600">
            Per-area behavior dashboards. Each area is backed by its own table
            with strict event vocabulary — no event-type free text, no OR-merge
            across sessions.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {AREAS.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="group block bg-white rounded-xl shadow hover:shadow-lg transition-shadow overflow-hidden"
            >
              <div className={`h-2 bg-gradient-to-r ${a.color}`} />
              <div className="p-6">
                <h2 className="text-lg font-semibold text-slate-900 group-hover:text-indigo-600">
                  {a.title}
                </h2>
                <p className="mt-2 text-sm text-slate-600">{a.description}</p>
                <span className="mt-4 inline-block text-xs text-indigo-600 group-hover:underline">
                  Open dashboard →
                </span>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-10 text-xs text-slate-500">
          Legacy single dashboard (AdminTrackingDashboard) is still importable
          but will be removed in Phase 6 of the tracking rebuild.
        </div>
      </div>
    </div>
  );
}
