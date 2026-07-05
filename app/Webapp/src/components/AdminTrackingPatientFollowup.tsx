"use client";

/**
 * AdminTrackingPatientFollowup — admin view for patient follow-up survey behavior.
 *
 * Shows per-session survey progress (timing, ordering, completion). Canonical
 * answer values continue to live in patient_survey_submission_log; this view is for
 * understanding HOW the user navigated the survey, not WHAT they answered.
 */

import React, { useEffect, useState, useMemo } from "react";

const API_BASE = "";

interface SessionRow {
  session_id: string;
  file: string;
  speaker: string;
  started_at: string | null;
  ended_at: string | null;
  event_count: number;
}

interface EventRow {
  id: number;
  event_type: string;
  survey_type: string | null;
  question_id: string | null;
  step_number: number | null;
  metadata: Record<string, unknown>;
  device_type: string | null;
  client_timestamp: string | null;
}

interface SurveyAgg {
  answered: number;
  step_views: number;
  completed: boolean;
}

interface AggregateSession {
  session_id: string;
  file: string;
  speaker: string;
  started_at: string | null;
  ended_at: string | null;
  by_survey: Record<string, SurveyAgg>;
  completed: string[];
  total_events: number;
}

const SURVEY_LABEL: Record<string, string> = {
  sdm: "SDM",
  dcs: "DCS",
  risk_perception: "Risk",
  satisfaction: "Satisfaction",
};

function fmtDate(s: string | null): string {
  if (!s) return "—";
  try { return new Date(s).toLocaleString(); } catch { return s; }
}

function durationSecs(start: string | null, end: string | null): string {
  if (!start || !end) return "—";
  try {
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return `${m}m ${s % 60}s`;
  } catch { return "—"; }
}

export default function AdminTrackingPatientFollowup() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  // Auto-follow the newest session (sessions are newest-first) until the user
  // manually picks one, so a Refresh surfaces newly-arrived events without an
  // extra click. Manual selection turns this off (to inspect an older session).
  const [followLatest, setFollowLatest] = useState(true);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [aggregate, setAggregate] = useState<AggregateSession[] | null>(null);
  const [fileFilter, setFileFilter] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reloadSessions = async () => {
    setLoading(true); setError(null);
    try {
      const url = new URL(`${API_BASE}/api/backend/track/patient-followup/sessions`, window.location.origin);
      if (fileFilter) url.searchParams.set("file", fileFilter);
      url.searchParams.set("limit", "100");
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = data.sessions || [];
      setSessions(list);
      if (followLatest && list.length > 0) setSelectedSession(list[0].session_id);
    } catch (e) {
      setError(`Failed to load sessions: ${e}`);
    } finally { setLoading(false); }
  };

  useEffect(() => { reloadSessions(); /* eslint-disable-next-line */ }, []);

  // Named so Refresh can re-fetch events for the SAME selected session (a session
  // accumulates events, so its id can stay put while new events arrive).
  const reloadEvents = async () => {
    if (!selectedSession) { setEvents([]); return; }
    try {
      const res = await fetch(`${API_BASE}/api/backend/track/patient-followup/session/${encodeURIComponent(selectedSession)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEvents(data.events || []);
    } catch (e) { setError(`Failed to load events: ${e}`); }
  };
  useEffect(() => { reloadEvents(); /* eslint-disable-next-line */ }, [selectedSession]);

  const reloadAggregate = async () => {
    if (!fileFilter) { setAggregate(null); return; }
    try {
      const res = await fetch(`${API_BASE}/api/backend/track/patient-followup/aggregate?file=${encodeURIComponent(fileFilter)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAggregate(data.sessions || []);
    } catch (e) { setError(`Failed to load aggregate: ${e}`); }
  };
  useEffect(() => { reloadAggregate(); /* eslint-disable-next-line */ }, [fileFilter]);

  const totalCount = useMemo(() => sessions.reduce((sum, s) => sum + s.event_count, 0), [sessions]);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Patient Follow-up Survey Behavior</h1>
          <p className="text-sm text-slate-600 mt-1">
            Behavior metadata only (timing, ordering). Answer values live in patient_survey_submission_log.
            Sessions: {sessions.length} · Events: {totalCount}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-4 mb-6 flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-700 mb-1">Filter by file</label>
            <input
              type="text"
              value={fileFilter}
              onChange={(e) => setFileFilter(e.target.value)}
              placeholder="e.g. Input_Keystrokes REC 001 (SID 10).xlsx"
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
            />
          </div>
          <button
            onClick={() => { reloadSessions(); reloadEvents(); reloadAggregate(); }}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md mb-4 text-sm">{error}</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow">
            <div className="px-4 py-3 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">Sessions</h2>
            </div>
            <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
              {sessions.length === 0 && (
                <div className="p-6 text-center text-sm text-slate-500">No sessions yet.</div>
              )}
              {sessions.map((s) => {
                const active = s.session_id === selectedSession;
                return (
                  <button
                    key={s.session_id}
                    onClick={() => { setSelectedSession(s.session_id); setFollowLatest(false); }}
                    className={`w-full text-left px-4 py-3 hover:bg-slate-50 ${active ? "bg-indigo-50 border-l-4 border-indigo-500" : ""}`}
                  >
                    <div className="text-xs font-mono text-slate-500 truncate">{s.session_id}</div>
                    <div className="text-sm font-medium text-slate-900 truncate">{s.file}</div>
                    <div className="flex justify-between text-xs text-slate-600 mt-1">
                      <span>{s.speaker}</span>
                      <span>{s.event_count} events · {durationSecs(s.started_at, s.ended_at)}</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">{fmtDate(s.started_at)}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow">
            <div className="px-4 py-3 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">
                {selectedSession ? `Events for ${selectedSession.slice(0, 16)}…` : "Select a session"}
              </h2>
            </div>
            <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
              {events.length === 0 && selectedSession && (
                <div className="p-6 text-center text-sm text-slate-500">No events.</div>
              )}
              {events.map((e) => (
                <div key={e.id} className="px-4 py-2 text-xs">
                  <div className="flex justify-between items-baseline">
                    <span className="font-mono font-semibold text-indigo-700">{e.event_type}</span>
                    <span className="text-slate-400">{fmtDate(e.client_timestamp)}</span>
                  </div>
                  <div className="text-slate-700 mt-0.5 flex gap-2 flex-wrap">
                    {e.survey_type && <span className="bg-violet-100 px-2 py-0.5 rounded">{e.survey_type}</span>}
                    {e.question_id && <span className="bg-slate-100 px-2 py-0.5 rounded">Q: {e.question_id}</span>}
                    {e.step_number != null && <span className="bg-amber-100 px-2 py-0.5 rounded">step {e.step_number}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {aggregate && aggregate.length > 0 && (
          <div className="bg-white rounded-lg shadow mt-6">
            <div className="px-4 py-3 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">
                Per-session aggregate for: <span className="font-mono">{fileFilter}</span>
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 text-left">Session</th>
                    <th className="px-3 py-2 text-left">Started</th>
                    {Object.keys(SURVEY_LABEL).map((k) => (
                      <th key={k} className="px-3 py-2 text-center">{SURVEY_LABEL[k]}</th>
                    ))}
                    <th className="px-3 py-2 text-center">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {aggregate.map((s) => (
                    <tr key={s.session_id}>
                      <td className="px-3 py-2 font-mono text-slate-600">{s.session_id.slice(0, 12)}…</td>
                      <td className="px-3 py-2 text-slate-500">{fmtDate(s.started_at)}</td>
                      {Object.keys(SURVEY_LABEL).map((k) => {
                        const ag = s.by_survey[k];
                        if (!ag) return <td key={k} className="px-3 py-2 text-center text-slate-300">—</td>;
                        return (
                          <td key={k} className="px-3 py-2 text-center">
                            <div>{ag.answered} ans · {ag.step_views} steps</div>
                            {ag.completed && <div className="text-emerald-600">✓ done</div>}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-center font-medium">{s.total_events}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
