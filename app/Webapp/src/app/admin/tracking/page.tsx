"use client";

/**
 * Admin tracking nav hub. Each card links to a per-area behavior dashboard.
 *
 * The Upload Transcript card lived here until 2026-08-27 only because /admin
 * did not exist yet and this was where sign-in landed. Uploading is a pipeline
 * action, not a behavior dashboard, so it now sits on /admin alone.
 */

import AdminHubCard from "@/components/AdminHubCard";

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
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {AREAS.map((a) => (
            <AdminHubCard key={a.href} {...a} cta="Open dashboard →" />
          ))}
        </div>
      </div>
    </div>
  );
}
