"use client";

/**
 * AdminTrackingRecordings — list, download, and replay rrweb recordings.
 *
 * Backend endpoints:
 *   GET /api/track/recordings/{area}                  — list sessions
 *   GET /api/track/recordings/{area}/{session_id}     — full decompressed event payload
 *
 * Replay uses the rrweb-player library (already in package.json) and renders
 * inline. PHI is masked at capture time (see sessionRecorder.ts), so what you
 * see during replay matches what was actually stored.
 */

import React, { useEffect, useState, useRef } from "react";

const API_BASE = "";

type Area = "patient_first" | "patient_followup" | "doctor";

interface RecordingSession {
  session_id: string;
  file: string | null;
  chunk_count: number;
  event_count: number;
  started_at: string | null;
  ended_at: string | null;
}

interface RecordingPayload {
  session_id: string;
  area: Area;
  chunk_count: number;
  event_count: number;
  events: any[];
}

const AREA_LABEL: Record<Area, string> = {
  patient_first: "Patient First-Visit",
  patient_followup: "Patient Follow-up",
  doctor: "Doctor",
};

function fmtDate(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

function durationSecs(start: string | null, end: string | null): string {
  if (!start || !end) return "—";
  try {
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  } catch {
    return "—";
  }
}

export default function AdminTrackingRecordings() {
  const [area, setArea] = useState<Area>("patient_first");
  const [sessions, setSessions] = useState<RecordingSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [payload, setPayload] = useState<RecordingPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const playerInstanceRef = useRef<any>(null);

  const reloadSessions = async () => {
    setLoading(true);
    setError(null);
    setSelectedSession(null);
    setPayload(null);
    try {
      const res = await fetch(`${API_BASE}/api/backend/track/recordings/${area}?limit=200`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (e) {
      setError(`Failed to load sessions: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reloadSessions(); /* eslint-disable-next-line */ }, [area]);

  // Fetch payload when a session is selected
  useEffect(() => {
    if (!selectedSession) {
      setPayload(null);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/backend/track/recordings/${area}/${encodeURIComponent(selectedSession)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setPayload(data);
      } catch (e) {
        setError(`Failed to load payload: ${e}`);
        setPayload(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedSession, area]);

  // Mount/unmount the rrweb Replayer when payload changes.
  // We use rrweb.Replayer (vanilla JS class) instead of rrweb-player
  // (Svelte component) to avoid Svelte runtime in a Next.js client bundle.
  useEffect(() => {
    if (!payload || !playerContainerRef.current) return;
    let cancelled = false;
    (async () => {
      if (playerInstanceRef.current) {
        try { playerInstanceRef.current.pause?.(); } catch { /* ignore */ }
        playerInstanceRef.current = null;
      }
      if (playerContainerRef.current) playerContainerRef.current.innerHTML = "";
      const mod = await import("rrweb");
      if (cancelled || !playerContainerRef.current) return;
      const Replayer = (mod as any).Replayer;
      if (!Replayer) {
        console.error("rrweb.Replayer not found in module exports");
        return;
      }
      playerInstanceRef.current = new Replayer(payload.events, {
        root: playerContainerRef.current,
        liveMode: false,
        showWarning: false,
      });
      try { playerInstanceRef.current.play(); } catch { /* ignore */ }
    })();
    return () => {
      cancelled = true;
      if (playerInstanceRef.current) {
        try { playerInstanceRef.current.pause?.(); } catch { /* ignore */ }
        playerInstanceRef.current = null;
      }
    };
  }, [payload]);

  const downloadJson = () => {
    if (!payload) return;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recording_${area}_${payload.session_id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Session Recordings (rrweb)</h1>
          <p className="text-sm text-slate-600 mt-1">
            Replay or download captured user sessions. PHI is masked at capture time
            (sentences, summaries, patient identifiers, free text fields).
          </p>
        </div>

        {/* Area filter */}
        <div className="bg-white rounded-lg shadow p-4 mb-6 flex gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Area</label>
            <select
              value={area}
              onChange={(e) => setArea(e.target.value as Area)}
              className="px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
            >
              {(Object.keys(AREA_LABEL) as Area[]).map((a) => (
                <option key={a} value={a}>{AREA_LABEL[a]}</option>
              ))}
            </select>
          </div>
          <button
            onClick={reloadSessions}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
          <span className="text-xs text-slate-500 ml-auto">
            {sessions.length} sessions
          </span>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md mb-4 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sessions list */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-4 py-3 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">Recordings</h2>
            </div>
            <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
              {sessions.length === 0 && !loading && (
                <div className="p-6 text-center text-sm text-slate-500">
                  No recordings yet for {AREA_LABEL[area]}.
                </div>
              )}
              {sessions.map((s) => {
                const active = s.session_id === selectedSession;
                return (
                  <button
                    key={s.session_id}
                    onClick={() => setSelectedSession(s.session_id)}
                    className={`w-full text-left px-4 py-3 hover:bg-slate-50 ${active ? "bg-indigo-50 border-l-4 border-indigo-500" : ""}`}
                  >
                    <div className="text-xs font-mono text-slate-500 truncate">{s.session_id}</div>
                    <div className="text-sm font-medium text-slate-900 truncate" title={s.file || ""}>
                      {s.file || "(no file)"}
                    </div>
                    <div className="flex justify-between text-xs text-slate-600 mt-1">
                      <span>{s.chunk_count} chunks · {s.event_count} events</span>
                      <span>{durationSecs(s.started_at, s.ended_at)}</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">{fmtDate(s.started_at)}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Player + download */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-4 py-3 border-b border-slate-200 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-slate-900">
                {payload
                  ? <>Replay <code className="text-xs ml-2">{payload.event_count} events</code></>
                  : "Select a recording"}
              </h2>
              {payload && (
                <button
                  onClick={downloadJson}
                  className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
                >
                  📥 Download JSON
                </button>
              )}
            </div>
            <div className="p-4">
              {!selectedSession && (
                <div className="text-center text-sm text-slate-500 py-12">
                  Click a recording on the left to replay it here.
                </div>
              )}
              {selectedSession && loading && (
                <div className="text-center text-sm text-slate-500 py-12">Loading payload…</div>
              )}
              <div ref={playerContainerRef} className="rrweb-player-container" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
