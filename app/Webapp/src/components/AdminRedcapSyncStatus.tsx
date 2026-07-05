"use client";

/**
 * AdminRedcapSyncStatus — admin view of REDCap synchronization status.
 *
 * Read-only: summary tiles (total / synced / pending / error, and per survey type)
 * plus a filterable, paginated table of survey submissions showing whether each
 * reached REDCap, under which record_id (SID), and the error if it failed.
 * Reuses GET /api/surveys/stats and GET /api/surveys/submissions.
 */

import React, { useEffect, useState } from "react";

const API_BASE = "";
const PAGE_SIZE = 25;

interface Stats {
  total_submissions: number;
  redcap_synced: number;
  redcap_pending: number;
  redcap_error: number;
  by_survey_type: Record<string, number>;
}

interface Row {
  id: number;
  file: string;
  speaker: string;
  survey_type: string;
  submitted_at: string | null;
  sid: string | null;
  doctor: string | null;
  redcap_synced: boolean;
  redcap_record_id: string | null;
  redcap_error: string | null;
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  try { return new Date(s).toLocaleString(); } catch { return s; }
}

function rowStatus(r: Row): "synced" | "error" | "pending" {
  if (r.redcap_synced) return "synced";
  if (r.redcap_error) return "error";
  return "pending";
}

const STATUS_STYLE: Record<string, string> = {
  synced: "bg-green-100 text-green-800",
  pending: "bg-slate-100 text-slate-600",
  error: "bg-red-100 text-red-800",
};

export default function AdminRedcapSyncStatus() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<string>("");
  const [surveyType, setSurveyType] = useState<string>("");
  const [fileFilter, setFileFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async (goToPage = page) => {
    setLoading(true); setError(null);
    try {
      const statsRes = await fetch(`${API_BASE}/api/backend/surveys/stats`);
      if (!statsRes.ok) throw new Error(`stats HTTP ${statsRes.status}`);
      setStats(await statsRes.json());

      const url = new URL(`${API_BASE}/api/backend/surveys/submissions`, window.location.origin);
      if (status) url.searchParams.set("status", status);
      if (surveyType) url.searchParams.set("survey_type", surveyType);
      if (fileFilter) url.searchParams.set("file", fileFilter);
      url.searchParams.set("page", String(goToPage));
      url.searchParams.set("size", String(PAGE_SIZE));
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`submissions HTTP ${res.status}`);
      const data = await res.json();
      setRows(data.data || []);
      setPages(data.pages || 1);
      setTotal(data.total || 0);
      setPage(data.page || goToPage);
    } catch (e) {
      setError(`Failed to load: ${e}`);
    } finally { setLoading(false); }
  };

  useEffect(() => { reload(1); /* eslint-disable-next-line */ }, []);

  const pendingClean = stats
    ? Math.max(0, stats.total_submissions - stats.redcap_synced - stats.redcap_error)
    : 0;

  const tiles = stats
    ? [
        { label: "Total", value: stats.total_submissions, cls: "text-slate-800" },
        { label: "Synced", value: stats.redcap_synced, cls: "text-green-700" },
        { label: "Pending", value: pendingClean, cls: "text-slate-500" },
        { label: "Error", value: stats.redcap_error, cls: "text-red-700" },
      ]
    : [];

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-slate-800">REDCap Sync Status</h1>
          <p className="text-sm text-slate-500">
            Per-submission REDCap synchronization: which survey answers reached REDCap (by SID record_id),
            which are pending, and which errored.
          </p>
        </div>

        {/* Summary tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          {tiles.map((t) => (
            <div key={t.label} className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">{t.label}</div>
              <div className={`text-2xl font-bold ${t.cls}`}>{t.value}</div>
            </div>
          ))}
        </div>
        {stats && (
          <div className="flex flex-wrap gap-2 mb-4 text-xs">
            {Object.entries(stats.by_survey_type).map(([k, v]) => (
              <span key={k} className="bg-white border border-slate-200 rounded px-2 py-1 text-slate-600">
                {k}: <b>{v}</b>
              </span>
            ))}
          </div>
        )}

        {/* Filter bar */}
        <div className="bg-white rounded-lg border border-slate-200 p-3 mb-3 flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-600">
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              className="block mt-1 border border-slate-300 rounded px-2 py-1 text-sm">
              <option value="">All</option>
              <option value="synced">Synced</option>
              <option value="pending">Pending</option>
              <option value="error">Error</option>
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Survey type
            <select value={surveyType} onChange={(e) => setSurveyType(e.target.value)}
              className="block mt-1 border border-slate-300 rounded px-2 py-1 text-sm">
              <option value="">All</option>
              {stats && Object.keys(stats.by_survey_type).map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            File
            <input value={fileFilter} onChange={(e) => setFileFilter(e.target.value)}
              placeholder="exact file name"
              className="block mt-1 border border-slate-300 rounded px-2 py-1 text-sm w-64" />
          </label>
          <button onClick={() => reload(1)} disabled={loading}
            className="ml-auto bg-indigo-600 text-white text-sm rounded px-4 py-1.5 disabled:opacity-50">
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 mb-3 text-sm">{error}</div>}

        {/* Table */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                {["Submitted", "Survey", "SID", "Doctor", "File", "Status", "REDCap record", "Error"].map((h) => (
                  <th key={h} className="text-left font-medium px-3 py-2 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = rowStatus(r);
                return (
                  <tr key={r.id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{fmtDate(r.submitted_at)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.survey_type}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono">{r.sid || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.doctor || "—"}</td>
                    <td className="px-3 py-2 max-w-xs truncate" title={r.file}>{r.file}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-2 py-0.5 ${STATUS_STYLE[st]}`}>{st}</span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono">{r.redcap_record_id || "—"}</td>
                    <td className="px-3 py-2 max-w-sm text-red-600 truncate" title={r.redcap_error || ""}>
                      {r.redcap_error || ""}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && !loading && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400">No submissions.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-3 text-sm text-slate-600">
          <span>{total} submissions · page {page} / {pages}</span>
          <div className="flex gap-2">
            <button onClick={() => reload(page - 1)} disabled={loading || page <= 1}
              className="border border-slate-300 rounded px-3 py-1 disabled:opacity-40">Prev</button>
            <button onClick={() => reload(page + 1)} disabled={loading || page >= pages}
              className="border border-slate-300 rounded px-3 py-1 disabled:opacity-40">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
