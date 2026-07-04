"use client";

/**
 * AdminTrackingDoctor — admin view for doctor consultation behavior.
 *
 * Session-based 2-panel layout mirroring AdminTrackingPatientFollowup: a Sessions
 * list (left) + per-session Event detail (right), plus a per-session aggregate for
 * the selected session's doctor. Behavior metadata only (navigation, selections,
 * rewrite/rubric usage) — this view is about HOW the doctor worked, not content.
 */

import React, { useEffect, useMemo, useState } from "react";

const API_BASE = "";

interface SessionRow {
  session_id: string;
  speaker: string | null;
  file: string | null;
  started_at: string | null;
  ended_at: string | null;
  event_count: number;
}

interface EventRow {
  id: number;
  event_type: string;
  file: string | null;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  device_type: string | null;
  client_timestamp: string | null;
}

interface AggregateSession {
  session_id: string;
  speaker: string;
  started_at: string | null;
  ended_at: string | null;
  by_event_type: Record<string, number>;
  total_events: number;
}

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

export default function AdminTrackingDoctor() {
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
      const url = new URL(`${API_BASE}/api/backend/track/doctor/sessions`, window.location.origin);
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

  const reloadEvents = async () => {
    if (!selectedSession) { setEvents([]); return; }
    try {
      const res = await fetch(`${API_BASE}/api/backend/track/doctor/session/${encodeURIComponent(selectedSession)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEvents(data.events || []);
    } catch (e) { setError(`Failed to load events: ${e}`); }
  };
  // Re-fetch the selected session's events whenever it changes. Doctor sessions
  // are long-lived (one session_id accumulates many actions), so Refresh also
  // calls this to surface newly-arrived events for the SAME selected session.
  useEffect(() => { reloadEvents(); /* eslint-disable-next-line */ }, [selectedSession]);

  // The doctor aggregate is speaker-scoped (not file-scoped like follow-up), so
  // load it for the selected session's doctor. Strip any " (+N more)" label suffix
  // the sessions endpoint adds when a session touched more than one speaker.
  const selectedSpeaker = useMemo(() => {
    const s = sessions.find((x) => x.session_id === selectedSession);
    return s?.speaker ? s.speaker.replace(/ \(\+\d+ more\)$/, "") : null;
  }, [sessions, selectedSession]);

  const reloadAggregate = async () => {
    if (!selectedSpeaker) { setAggregate(null); return; }
    try {
      const res = await fetch(`${API_BASE}/api/backend/track/doctor/aggregate?speaker=${encodeURIComponent(selectedSpeaker)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAggregate(data.sessions || []);
    } catch (e) { setError(`Failed to load aggregate: ${e}`); }
  };
  useEffect(() => { reloadAggregate(); /* eslint-disable-next-line */ }, [selectedSpeaker]);

  const totalCount = useMemo(() => sessions.reduce((sum, s) => sum + s.event_count, 0), [sessions]);

  // Aggregate table columns = the union of event_types present, stable-sorted.
  const aggEventTypes = useMemo(() => {
    const set = new Set<string>();
    (aggregate || []).forEach((s) => Object.keys(s.by_event_type || {}).forEach((k) => set.add(k)));
    return Array.from(set).sort();
  }, [aggregate]);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Doctor Behavior</h1>
          <p className="text-sm text-slate-600 mt-1">
            Behavior metadata only (navigation, selections, rewrite/rubric usage).
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
              placeholder="filter by patient file"
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
                    <div className="text-sm font-medium text-slate-900 truncate">{s.file || "(no file)"}</div>
                    <div className="flex justify-between text-xs text-slate-600 mt-1">
                      <span>{s.speaker || "(no doctor)"}</span>
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
                    {e.target_type && <span className="bg-violet-100 px-2 py-0.5 rounded">{e.target_type}</span>}
                    {e.target_id && <span className="bg-slate-100 px-2 py-0.5 rounded">{e.target_id}</span>}
                    {e.file && <span className="bg-amber-100 px-2 py-0.5 rounded truncate max-w-[16rem]" title={e.file}>{e.file}</span>}
                    {e.device_type && <span className="text-slate-500">{e.device_type}</span>}
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
                Per-session aggregate for: <span className="font-mono">{selectedSpeaker}</span>
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 text-left">Session</th>
                    <th className="px-3 py-2 text-left">Started</th>
                    {aggEventTypes.map((k) => (
                      <th key={k} className="px-3 py-2 text-center font-mono">{k}</th>
                    ))}
                    <th className="px-3 py-2 text-center">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {aggregate.map((s) => (
                    <tr key={s.session_id}>
                      <td className="px-3 py-2 font-mono text-slate-600">{s.session_id.slice(0, 12)}…</td>
                      <td className="px-3 py-2 text-slate-500">{fmtDate(s.started_at)}</td>
                      {aggEventTypes.map((k) => {
                        const n = s.by_event_type?.[k];
                        return (
                          <td key={k} className={`px-3 py-2 text-center ${n ? "" : "text-slate-300"}`}>
                            {n ?? "—"}
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
