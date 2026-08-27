"use client";

/**
 * Patient records table for /admin/patients.
 *
 * Markup moved out of the public home page (src/app/page.tsx) on 2026-08-27
 * when the browsable patient index was put behind the admin login. The two
 * entry points it produces are unchanged, so links already handed out from
 * deid_mapping.csv keep working:
 *   1st · Report  → /?f=<stem>&view=first-report
 *   Total Survey  → /?f=<stem>&survey=follow-up&combined=1
 */

export type VisitEntry = "first" | "followup" | "combined" | "sequential";

interface Props {
  files: string[];
  onSelect: (file: string, visit: VisitEntry) => void;
}

// Hard-truncate the displayed text (auto-layout tables ignore a child's
// max-width for long unbreakable hashed names, which then overflow the
// overflow-hidden container). Full value on hover via title.
const shorten = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

export default function AdminPatientTable({ files, onSelect }: Props) {
  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm">
      <table className="w-full table-fixed">
        <thead>
          <tr className="bg-slate-50">
            <th className="w-[34%] px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              Patient ID
            </th>
            <th className="w-[28%] px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 hidden sm:table-cell">
              Source File
            </th>
            <th className="w-[38%] px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {files.map((file, idx) => {
            const match = file.match(/sid[\s_-]*(\d+)/i);
            const label = match
              ? `SID-${match[1]}`
              : file
                  .replace(/\.[^.]+$/, "")
                  .replace(/_[^_]+_\d{8}$/, "") // strip 3-part "_<doctor>_<date>"
                  .replace(/_\d{8}$/, ""); // strip legacy 2-part "_<date>"
            return (
              <tr key={file} className="group transition-colors hover:bg-slate-50/80">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center bg-blue-50 text-xs font-bold text-blue-600">
                      {match ? match[1] : idx + 1}
                    </div>
                    <span
                      title={label}
                      className="block truncate max-w-[200px] text-sm font-medium text-slate-800"
                    >
                      {shorten(label, 16)}
                    </span>
                  </div>
                </td>
                <td className="px-5 py-4 hidden sm:table-cell">
                  <span
                    title={file}
                    className="block truncate max-w-[240px] font-mono text-xs text-slate-400"
                  >
                    {shorten(file, 18)}
                  </span>
                </td>
                <td className="px-5 py-4 whitespace-nowrap">
                  <div className="flex items-center justify-end gap-2 shrink-0">
                    <button
                      onClick={() => onSelect(file, "first")}
                      title="First visit — AI summary report (read-only)"
                      className="px-3 py-1.5 rounded-md border border-blue-100 bg-blue-50 text-xs font-medium text-blue-700 transition-all hover:bg-blue-100 hover:text-blue-800"
                    >
                      1st · Report
                    </button>
                    {/* Total Survey entry — 1st survey questions, then follow-up.
                        The standalone "1st · Survey", "Follow-up" and "Combined
                        (2-step)" buttons were hidden on 2026-07-09; their URLs
                        (?survey=first-visit, ?survey=follow-up, ?seq=1) still
                        work and onSelect still accepts those visit values. */}
                    <button
                      onClick={() => onSelect(file, "combined")}
                      title="Total Survey — 1st·Survey questions, then the Follow-up surveys"
                      className="px-3 py-1.5 rounded-md border border-amber-100 bg-amber-50 text-xs font-medium text-amber-700 transition-all hover:bg-amber-100 hover:text-amber-800"
                    >
                      Total Survey
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Table Footer */}
      <div className="px-5 py-3 flex items-center justify-between border-t border-slate-100 bg-slate-50/50">
        <span className="text-xs text-slate-400">
          {files.length} patient{files.length !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}
