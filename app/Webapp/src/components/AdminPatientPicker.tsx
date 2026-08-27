"use client";

/**
 * Patient picker for /admin/patients — loads the processed transcripts and
 * sends the chosen one to its public patient URL.
 *
 * Moved out of the public home page (src/app/page.tsx) on 2026-08-27: the list
 * is a browsable index of every patient, so it now sits behind the admin gate
 * (src/middleware.ts). The per-patient URLs it navigates to stay public,
 * because patients open their own link and have no admin account.
 */

import AdminPatientTable, { type VisitEntry } from "@/components/AdminPatientTable";
import { usePatientFileList } from "@/hooks/usePatientFileList";

// Self-descriptive URL: the entry point is stated in the query string.
//   report      → ?f=<stem>&view=first-report
//   1st survey  → ?f=<stem>&survey=first-visit
//   follow-up   → ?f=<stem>&survey=follow-up
//   combined    → ?f=<stem>&survey=follow-up&combined=1
//   sequential  → ?f=<stem>&survey=first-visit&seq=1 (chains to the follow-up)
function patientUrl(file: string, visit: VisitEntry): string {
  const stem = file.replace(/\.(xlsx|csv)$/i, "");
  const params = new URLSearchParams({ f: stem });
  if (visit === "combined") {
    // Total Survey = one unified follow-up flow (?combined=1). The follow-up
    // re-enables its Risk step and renders the 1st survey (V41) there, so there
    // is no separate first-visit phase.
    params.set("survey", "follow-up");
    params.set("combined", "1");
  } else if (visit === "sequential") {
    // Combined (2-step) = the 1st survey runs first as its own screen (?seq=1),
    // then chains to a normal follow-up with the Risk step NOT embedded.
    params.set("survey", "first-visit");
    params.set("seq", "1");
  } else if (visit === "followup") {
    params.set("survey", "follow-up");
  } else {
    params.set("view", "first-report");
  }
  return `/?${params.toString()}`;
}

export default function AdminPatientPicker() {
  const { patientList, loading, processingCount } = usePatientFileList();

  const spinner = (size: string) => (
    <svg className={`animate-spin ${size}`} viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900">Patient Records</h1>
        <p className="mt-2 text-sm text-slate-600">
          Pick a patient, then an entry point: 1st · Report (read-only AI summary)
          or Total Survey (the full questionnaire flow).
        </p>
      </div>

      {/* Work in flight. Only shown alongside an existing list — the empty state
          below says the same thing in place of "No patient records yet". */}
      {processingCount > 0 && patientList.length > 0 && (
        <div className="flex items-center gap-3 mb-4 px-4 py-3 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-600">
          {spinner("h-4 w-4 shrink-0")}
          <span>
            {processingCount} transcript{processingCount !== 1 ? "s" : ""} processing…{" "}
            <span className="opacity-70">
              They&rsquo;ll be added to the list automatically when done.
            </span>
          </span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-20 text-slate-500">
          {spinner("h-4 w-4")}
          <span className="text-sm">Loading patients...</span>
        </div>
      ) : patientList.length === 0 ? (
        <div className="text-center py-20 rounded-xl border-2 border-dashed border-slate-200 text-slate-400">
          {processingCount > 0 ? (
            <div className="flex flex-col items-center gap-3">
              {spinner("h-5 w-5")}
              <p className="text-sm">
                {processingCount} transcript{processingCount !== 1 ? "s" : ""} processing…
                <br />
                <span className="opacity-70">
                  They&rsquo;ll appear here automatically when done.
                </span>
              </p>
            </div>
          ) : (
            <p className="text-sm">No patient records yet.</p>
          )}
        </div>
      ) : (
        <AdminPatientTable
          files={patientList}
          onSelect={(file, visit) => {
            window.location.href = patientUrl(file, visit);
          }}
        />
      )}
    </div>
  );
}
