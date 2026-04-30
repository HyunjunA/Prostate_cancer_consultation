"use client";

/**
 * AdminTrackingDoctor — Doctor-centric chronological action log.
 *
 * Shows each doctor's behavior as a flat time-ordered stream. Sessions
 * still exist in the data (each row carries session_id) and are surfaced
 * here only as subtle separators between bursts, not as the primary view.
 *
 * Backend endpoints:
 *   GET /api/track/doctor/speakers          — distinct doctor list
 *   GET /api/track/doctor/actions?speaker=X — flat action log for one doctor
 */

import React, { useEffect, useState, useMemo } from "react";

const API_BASE = "";

interface SpeakerRow {
  speaker: string;
  event_count: number;
  last_seen: string | null;
}

interface ActionRow {
  id: number;
  session_id: string;
  file: string | null;
  event_type: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  device_type: string | null;
  client_timestamp: string | null;
}

const EVENT_COLOR: Record<string, string> = {
  page_view: "bg-slate-200 text-slate-700",
  view_change: "bg-slate-200 text-slate-700",
  patient_select: "bg-amber-200 text-amber-900",
  topic_select: "bg-violet-200 text-violet-900",
  sentence_select: "bg-sky-200 text-sky-900",
  rewrite_apply: "bg-emerald-200 text-emerald-900",
  rubric_open: "bg-fuchsia-200 text-fuchsia-900",
  rubric_close: "bg-fuchsia-100 text-fuchsia-700",
  tour_open: "bg-cyan-200 text-cyan-900",
  tour_end: "bg-cyan-100 text-cyan-700",
  session_end: "bg-slate-300 text-slate-700",
};

function fmtTime(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

function shortFile(file: string | null): string {
  if (!file) return "(no file)";
  return file.length > 50 ? file.slice(0, 47) + "…" : file;
}

function describeAction(a: ActionRow): React.ReactNode {
  const meta = (a.metadata || {}) as Record<string, any>;
  switch (a.event_type) {
    case "patient_select":
      return <span>→ patient: <code className="text-xs">{a.target_id ?? meta.fileId ?? "?"}</code></span>;
    case "topic_select":
      return <span>→ topic: <strong>{a.target_id ?? meta.topicName ?? "?"}</strong></span>;
    case "sentence_select":
      return <span>→ sentence #{a.target_id ?? meta.sentenceIdx ?? "?"}</span>;
    case "rewrite_apply":
      return <span>→ Try & Score (length {meta.length ?? "?"} chars, topic <strong>{meta.topic ?? "?"}</strong>)</span>;
    case "rubric_open":
      return <span>→ open Scoring Rubric modal</span>;
    case "rubric_close":
      return <span>→ close Scoring Rubric modal</span>;
    case "tour_open":
      return <span>→ open guided tour (trigger: <strong>{meta.trigger ?? "auto"}</strong>, view: {meta.view ?? "?"})</span>;
    case "tour_end":
      return <span>→ end guided tour (status: <strong>{meta.status ?? "?"}</strong>, view: {meta.view ?? "?"})</span>;
    case "view_change":
      return <span>→ view: <strong>{meta.to ?? meta.view ?? "?"}</strong>{meta.from && <span className="text-slate-400"> (from {meta.from})</span>}</span>;
    case "page_view":
      return <span>→ {meta.page ?? "page"} ({meta.view ?? "?"})</span>;
    case "session_end":
      return <span>→ session end</span>;
    default:
      return null;
  }
}

export default function AdminTrackingDoctor() {
  const [speakers, setSpeakers] = useState<SpeakerRow[]>([]);
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>("");
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [fileFilter, setFileFilter] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch the dropdown list of distinct doctor speakers
  const reloadSpeakers = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/backend/track/doctor/speakers`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list: SpeakerRow[] = data.speakers || [];
      setSpeakers(list);
      // Default to the most recently active doctor if nothing selected.
      if (!selectedSpeaker && list.length > 0) {
        setSelectedSpeaker(list[0].speaker);
      }
    } catch (e) {
      setError(`Failed to load speakers: ${e}`);
    }
  };

  useEffect(() => { reloadSpeakers(); /* eslint-disable-next-line */ }, []);

  // Fetch action log when speaker (or file filter) changes
  useEffect(() => {
    if (!selectedSpeaker) {
      setActions([]);
      return;
    }
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const url = new URL(`${API_BASE}/api/backend/track/doctor/actions`, window.location.origin);
        url.searchParams.set("speaker", selectedSpeaker);
        if (fileFilter) url.searchParams.set("file", fileFilter);
        url.searchParams.set("limit", "500");
        const res = await fetch(url.toString());
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setActions(data.actions || []);
      } catch (e) {
        setError(`Failed to load actions: ${e}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedSpeaker, fileFilter]);

  // Group actions by session_id boundary so we can render subtle separators.
  // Sessions are kept in the data — they show up only as section dividers.
  const sectioned = useMemo(() => {
    const out: { session_id: string; rows: ActionRow[] }[] = [];
    for (const a of actions) {
      const last = out[out.length - 1];
      if (!last || last.session_id !== a.session_id) {
        out.push({ session_id: a.session_id, rows: [a] });
      } else {
        last.rows.push(a);
      }
    }
    return out;
  }, [actions]);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Doctor Behavior</h1>
          <p className="text-sm text-slate-600 mt-1">
            Per-doctor chronological action log. Each session is shown as a
            subtle separator — actions are otherwise listed in time order.
          </p>
        </div>

        {/* Filter bar */}
        <div className="bg-white rounded-lg shadow p-4 mb-6 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Doctor ID</label>
            <select
              value={selectedSpeaker}
              onChange={(e) => setSelectedSpeaker(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
            >
              {speakers.length === 0 && <option value="">(no doctors yet)</option>}
              {speakers.map((s) => (
                <option key={s.speaker} value={s.speaker}>
                  {s.speaker} ({s.event_count} events)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">File (optional)</label>
            <input
              type="text"
              value={fileFilter}
              onChange={(e) => setFileFilter(e.target.value)}
              placeholder="filter by patient file"
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
            />
          </div>
          <button
            onClick={() => { reloadSpeakers(); /* trigger actions effect */ setSelectedSpeaker(selectedSpeaker); }}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md mb-4 text-sm">
            {error}
          </div>
        )}

        {/* Action log */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-4 py-3 border-b border-slate-200 flex justify-between items-baseline">
            <h2 className="text-sm font-semibold text-slate-900">
              {selectedSpeaker
                ? <>Action log for <code className="bg-slate-100 px-2 py-0.5 rounded">{selectedSpeaker}</code></>
                : "Select a doctor"}
            </h2>
            <span className="text-xs text-slate-500">{actions.length} actions across {sectioned.length} session(s)</span>
          </div>

          <div className="divide-y divide-slate-100 max-h-[700px] overflow-y-auto">
            {actions.length === 0 && selectedSpeaker && !loading && (
              <div className="p-6 text-center text-sm text-slate-500">No actions for this doctor.</div>
            )}

            {sectioned.map((section, sectionIdx) => (
              <div key={`${section.session_id}-${sectionIdx}`}>
                <div className="px-4 py-1.5 bg-slate-50 border-y border-slate-200 text-xs text-slate-500 font-mono">
                  ── session {section.session_id} ── ({section.rows.length} actions)
                </div>
                {section.rows.map((a) => (
                  <div key={a.id} className="px-4 py-2 hover:bg-slate-50 grid grid-cols-[120px_120px_1fr] gap-3 items-start text-sm">
                    <span className="text-xs text-slate-500 font-mono pt-0.5">
                      {fmtTime(a.client_timestamp)}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium text-center ${EVENT_COLOR[a.event_type] || "bg-slate-200 text-slate-700"}`}>
                      {a.event_type}
                    </span>
                    <div className="text-slate-700">
                      {describeAction(a)}
                      {a.file && (
                        <div className="text-xs text-slate-400 mt-0.5 truncate" title={a.file}>
                          {shortFile(a.file)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
