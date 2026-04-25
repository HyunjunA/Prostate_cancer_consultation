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
    href: "/admin/tracking/patient-first",
    title: "Patient First-Visit Behavior",
    description:
      "Page views, topic and evidence open/close, and helpfulness ratings on the first-visit report page.",
    color: "from-rose-500 to-pink-500",
  },
  {
    href: "/admin/tracking/patient-followup",
    title: "Patient Follow-up Survey Behavior",
    description:
      "Survey navigation, step views, answer timing, and completion across SDM / DCS / Risk / Satisfaction.",
    color: "from-violet-500 to-purple-500",
  },
  {
    href: "/admin/tracking/doctor",
    title: "Doctor Behavior",
    description:
      "Consultation navigation, patient and topic selection, AI rewrite usage, rubric scoring activity.",
    color: "from-sky-500 to-cyan-500",
  },
  {
    href: "/admin/tracking/recordings",
    title: "Session Recordings (rrweb)",
    description:
      "Replay or download captured sessions to see how users actually navigated. PHI is masked at capture time.",
    color: "from-amber-500 to-orange-500",
  },
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
