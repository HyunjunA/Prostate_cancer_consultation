"use client";

/**
 * Admin landing page (/admin).
 *
 * Requested by the manager (2026-08-27): the patient and physician entry
 * points used to be browsable from the public home page, so anyone on the LAN
 * could pick any patient. They now live under /admin, which middleware.ts
 * gates behind the admin_session cookie, and this page is where staff land
 * after signing in.
 *
 * Card style is the same as /admin/tracking (gradient bar + title +
 * description + CTA) so the two hubs read as one interface.
 */

import AdminHubCard from "@/components/AdminHubCard";

const ENTRIES = [
  {
    href: "/admin/patients",
    title: "Patient Records",
    description:
      "Browse processed transcripts and open a patient's first-visit report or Total Survey.",
    cta: "Open patient list →",
    color: "from-blue-500 to-indigo-500",
  },
  {
    href: "/admin/physicians",
    title: "Physician View",
    description:
      "Pick a doctor to open their consultation dashboard, scoped to their own patients.",
    cta: "Open physician list →",
    color: "from-emerald-500 to-teal-500",
  },
  {
    href: "/admin/tracking",
    title: "Tracking",
    description:
      "Per-area behavior dashboards: patient report, follow-up surveys, and doctor activity.",
    cta: "Open tracking →",
    color: "from-violet-500 to-purple-500",
  },
];

export default function AdminHomePage() {
  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Admin</h1>
          <p className="mt-2 text-sm text-slate-600">
            Staff entry points. Patients and physicians reach their own pages
            through the personal link they were given, not from here.
          </p>
        </div>

        {/* Primary action — bring transcript data into the pipeline. This is the
            only place it appears; /admin/tracking used to carry it too, back
            when /admin did not exist. */}
        <AdminHubCard
          href="/admin/upload"
          title="Upload Transcript"
          description="Add a de-identified transcript to the processing pipeline."
          cta="Upload transcript →"
          color="from-indigo-500 to-blue-500"
          className="mb-8"
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {ENTRIES.map((e) => (
            <AdminHubCard key={e.href} {...e} />
          ))}
        </div>
      </div>
    </div>
  );
}
