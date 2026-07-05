"use client";

/**
 * AdminDataIntegrity — admin view of the automated data-integrity verifiers.
 *
 * Calls GET /api/admin/integrity (DB invariants + DB↔REDCap reconciliation +
 * activity cross-check) and renders each check pass/warn/fail with its count and
 * an expandable list of flagged EXAMPLES only, so a human reviews exceptions rather
 * than every row. The endpoint returns 503 when any check fails — its body is still
 * the report, so we parse regardless of status.
 */

import React, { useEffect, useState } from "react";

const API_BASE = "";

interface CheckRow {
  name: string;
  status: "pass" | "warn" | "fail";
  count: number;
  total: number | null;
  detail: string;
  examples: unknown[];
}
interface Report {
  overall: "pass" | "warn" | "fail";
  results: CheckRow[];
}

const STATUS_STYLE: Record<string, string> = {
  pass: "bg-green-100 text-green-800",
  warn: "bg-amber-100 text-amber-800",
  fail: "bg-red-100 text-red-800",
};

export default function AdminDataIntegrity() {
  const [report, setReport] = useState<Report | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/backend/admin/integrity`);
      // 503 = at least one check FAILed; the body is still the report.
      const data = await res.json();
      if (!data.results) throw new Error(`HTTP ${res.status}`);
      setReport(data);
    } catch (e) { setError(`Failed to load: ${e}`); }
    finally { setLoading(false); }
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, []);

  const counts = report
    ? {
        pass: report.results.filter((r) => r.status === "pass").length,
        warn: report.results.filter((r) => r.status === "warn").length,
        fail: report.results.filter((r) => r.status === "fail").length,
      }
    : { pass: 0, warn: 0, fail: 0 };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Data Integrity</h1>
            <p className="text-sm text-slate-500">
              Automated checks — DB invariants, DB↔REDCap reconciliation, and activity cross-check.
              Review only the flagged exceptions below.
            </p>
          </div>
          <button onClick={reload} disabled={loading}
            className="bg-indigo-600 text-white text-sm rounded px-4 py-1.5 disabled:opacity-50">
            {loading ? "Running…" : "Re-run"}
          </button>
        </div>

        {report && (
          <div className="mb-4 flex items-center gap-3">
            <span className={`rounded px-3 py-1 text-sm font-semibold ${STATUS_STYLE[report.overall]}`}>
              overall: {report.overall}
            </span>
            <span className="text-sm text-slate-500">
              {counts.pass} pass · {counts.warn} warn · {counts.fail} fail
            </span>
          </div>
        )}

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 mb-3 text-sm">{error}</div>}

        <div className="space-y-2">
          {report?.results.map((r) => (
            <div key={r.name} className="bg-white rounded-lg border border-slate-200">
              <button
                onClick={() => setExpanded(expanded === r.name ? null : r.name)}
                className="w-full flex items-center gap-3 p-3 text-left"
              >
                <span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${STATUS_STYLE[r.status]}`}>
                  {r.status}
                </span>
                <span className="font-medium text-slate-800">{r.name}</span>
                <span className="text-sm text-slate-500">
                  count {r.count}{r.total != null ? ` / ${r.total}` : ""}
                </span>
                <span className="ml-auto text-slate-400 text-sm truncate max-w-md">{r.detail}</span>
                {r.examples.length > 0 && (
                  <span className="text-indigo-500 text-xs">{expanded === r.name ? "▲" : "▼"}</span>
                )}
              </button>
              {expanded === r.name && r.examples.length > 0 && (
                <pre className="bg-slate-50 border-t border-slate-100 text-xs p-3 overflow-x-auto text-slate-600">
                  {r.examples.map((ex) => JSON.stringify(ex)).join("\n")}
                </pre>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
