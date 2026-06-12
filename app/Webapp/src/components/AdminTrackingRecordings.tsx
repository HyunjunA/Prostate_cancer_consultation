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

import React, { useCallback, useEffect, useState, useRef } from "react";

const API_BASE = "";

type Area =
  | "patient_first_report"
  | "patient_first_survey"
  | "patient_followup"
  | "physician";

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
  patient_first_report: "Patient First Visit Report",
  patient_first_survey: "Patient First Survey",
  patient_followup: "Patient Follow Up",
  physician: "Physician Page",
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
  const [area, setArea] = useState<Area>("patient_first_report");
  const [sessions, setSessions] = useState<RecordingSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [payload, setPayload] = useState<RecordingPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  // [fit] Outer frame we own: full column width + overflow-hidden. We scale the
  // rrweb wrapper to fit this frame, since rrweb.Replayer renders the recording
  // at its original captured size and does not auto-fit.
  const playerFrameRef = useRef<HTMLDivElement | null>(null);
  const playerInstanceRef = useRef<any>(null);
  const resizeObsRef = useRef<ResizeObserver | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  // [expand] Fullscreen-overlay toggle. expandedRef lets the fit logic read the
  // current mode without re-mounting the player (which would restart playback).
  const [expanded, setExpanded] = useState(false);
  const expandedRef = useRef(false);
  // [progress] Playback position + duration (ms) for the seek bar.
  const [currentTime, setCurrentTime] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const tickRef = useRef<number | null>(null);

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

  // [fit] Scale the rrweb replay to fit our frame's width. rrweb.Replayer draws
  // the recording into a `.replayer-wrapper` at the ORIGINAL captured viewport
  // size (e.g. 1728×964) and applies no scaling — so without this it overflows
  // the column. We compute scale = frameWidth / recordedWidth, apply it to the
  // wrapper via a CSS transform, and set the frame height to the scaled height
  // so the layout reserves the right space. Re-run on container resize.
  const fitReplayToContainer = useCallback(() => {
    const frame = playerFrameRef.current;
    const root = playerContainerRef.current;
    if (!frame || !root) return;
    const wrapper = root.querySelector(".replayer-wrapper") as HTMLElement | null;
    if (!wrapper) return;
    // Recorded viewport comes from the rrweb Meta event (type 4); fall back to
    // the wrapper's own measured size.
    const meta = payload?.events.find((e) => e?.type === 4) as
      | { data?: { width?: number; height?: number } }
      | undefined;
    const recW = meta?.data?.width || wrapper.offsetWidth || 1;
    const recH = meta?.data?.height || wrapper.offsetHeight || 1;
    const availW = frame.clientWidth || recW;
    let scale = availW / recW;
    if (expandedRef.current) {
      // Fullscreen: fit the whole recording inside the viewport (width AND
      // height), leaving room for the control bar + padding.
      const availH =
        (typeof window !== "undefined" ? window.innerHeight : recH) - 140;
      scale = Math.min(availW / recW, availH / recH);
    }
    scale = Math.min(scale, 1); // never upscale past original
    wrapper.style.transform = `scale(${scale})`;
    wrapper.style.transformOrigin = "top left";
    // The imported rrweb-player CSS sets `.replayer-wrapper { float:left;
    // left:50%; top:50% }` — that 50%/50% offset is meant to pair with
    // rrweb-player's own `translate(-50%,-50%)`, which the raw Replayer does
    // NOT apply. Left as-is it pushes the replay off-centre so only part shows.
    // Neutralise it (inline wins over the stylesheet).
    wrapper.style.left = "0";
    wrapper.style.top = "0";
    wrapper.style.float = "none";
    frame.style.height = `${Math.round(recH * scale)}px`;
  }, [payload]);

  // Mount/unmount the rrweb Replayer when payload changes.
  // We use rrweb.Replayer (vanilla JS class) instead of rrweb-player
  // (Svelte component) to avoid Svelte runtime in a Next.js client bundle —
  // which means we own the fit/scale logic above.
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
      const inst = new Replayer(payload.events, {
        root: playerContainerRef.current,
        liveMode: false,
        showWarning: false,
        speed,
      });
      playerInstanceRef.current = inst;
      try { inst.play(); setIsPlaying(true); } catch { /* ignore */ }
      // [progress] Reset position for this video, read its duration, mark
      // finished, and poll the current playback time for the seek bar.
      setCurrentTime(0);
      try { setTotalTime(inst.getMetaData?.().totalTime || 0); } catch { /* ignore */ }
      try { inst.on?.("finish", () => setIsPlaying(false)); } catch { /* ignore */ }
      if (tickRef.current) window.clearInterval(tickRef.current);
      tickRef.current = window.setInterval(() => {
        const p = playerInstanceRef.current;
        if (!p) return;
        try {
          const t = p.getCurrentTime?.();
          if (typeof t === "number") setCurrentTime(t);
        } catch { /* ignore */ }
      }, 100);
      // Fit immediately, again after the wrapper settles, and on every resize.
      fitReplayToContainer();
      requestAnimationFrame(fitReplayToContainer);
      setTimeout(fitReplayToContainer, 60);
      if (playerFrameRef.current && typeof ResizeObserver !== "undefined") {
        resizeObsRef.current?.disconnect();
        resizeObsRef.current = new ResizeObserver(() => fitReplayToContainer());
        resizeObsRef.current.observe(playerFrameRef.current);
      }
    })();
    return () => {
      cancelled = true;
      resizeObsRef.current?.disconnect();
      resizeObsRef.current = null;
      if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
      if (playerInstanceRef.current) {
        try { playerInstanceRef.current.pause?.(); } catch { /* ignore */ }
        playerInstanceRef.current = null;
      }
      setIsPlaying(false);
    };
    // `speed` is read once at mount; speed changes are applied via setConfig.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, fitReplayToContainer]);

  // Keep the fit logic aware of expanded state (without re-mounting the player),
  // refit after the layout change, lock body scroll while expanded, and let
  // Escape collapse the overlay.
  useEffect(() => {
    expandedRef.current = expanded;
    requestAnimationFrame(fitReplayToContainer);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    if (expanded) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", onKey);
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [expanded, fitReplayToContainer]);

  const togglePlay = () => {
    const inst = playerInstanceRef.current;
    if (!inst) return;
    if (isPlaying) {
      try { inst.pause(); } catch { /* ignore */ }
      setIsPlaying(false);
    } else {
      try { inst.play(); } catch { /* ignore */ }
      setIsPlaying(true);
    }
  };

  const restart = () => {
    const inst = playerInstanceRef.current;
    if (!inst) return;
    try { inst.play(0); } catch { /* ignore */ }
    setCurrentTime(0);
    setIsPlaying(true);
    fitReplayToContainer();
  };

  const changeSpeed = (s: number) => {
    setSpeed(s);
    const inst = playerInstanceRef.current;
    if (inst) {
      try { inst.setConfig?.({ speed: s }); } catch { /* ignore */ }
    }
  };

  // [progress] Jump to a position (ms). Keeps the current play/pause state.
  const seek = (ms: number) => {
    const inst = playerInstanceRef.current;
    if (!inst) return;
    setCurrentTime(ms);
    try {
      if (isPlaying) inst.play(ms);
      else inst.pause(ms);
    } catch { /* ignore */ }
  };

  const fmtTime = (ms: number): string => {
    if (!ms || ms < 0) return "0:00";
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

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
              {/* [expand] Controls + player. When expanded, this wrapper becomes
                  a fullscreen overlay; the responsive fit logic scales the replay
                  up to the larger frame. Click the backdrop or press Esc to close. */}
              {payload && (
                <div
                  className={
                    expanded
                      ? "fixed inset-0 z-50 bg-slate-900/80 p-4 sm:p-6 flex flex-col"
                      : ""
                  }
                  onClick={(e) => {
                    if (expanded && e.target === e.currentTarget) setExpanded(false);
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <button
                      onClick={togglePlay}
                      className="px-3 py-1.5 text-xs font-medium bg-slate-700 text-white rounded-md hover:bg-slate-800"
                    >
                      {isPlaying ? "⏸ Pause" : "▶ Play"}
                    </button>
                    <button
                      onClick={restart}
                      className="px-3 py-1.5 text-xs font-medium bg-slate-200 text-slate-700 rounded-md hover:bg-slate-300"
                    >
                      ↻ Restart
                    </button>
                    <button
                      onClick={() => setExpanded((v) => !v)}
                      className="px-3 py-1.5 text-xs font-medium bg-indigo-100 text-indigo-700 rounded-md hover:bg-indigo-200"
                    >
                      {expanded ? "⤡ Collapse" : "⤢ Expand"}
                    </button>
                    <div className="ml-auto flex items-center gap-1">
                      <span
                        className={`text-xs mr-1 ${expanded ? "text-slate-300" : "text-slate-400"}`}
                      >
                        Speed
                      </span>
                      {[1, 2, 4].map((s) => (
                        <button
                          key={s}
                          onClick={() => changeSpeed(s)}
                          className={`px-2 py-1 text-xs rounded-md ${
                            speed === s
                              ? "bg-indigo-600 text-white"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          {s}×
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* [progress] Seek bar: elapsed / total + draggable position. */}
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className={`text-xs tabular-nums ${expanded ? "text-slate-300" : "text-slate-500"}`}
                    >
                      {fmtTime(currentTime)}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={totalTime || 0}
                      step={50}
                      value={Math.min(currentTime, totalTime || 0)}
                      onChange={(e) => seek(Number(e.target.value))}
                      aria-label="Seek"
                      className="flex-1 accent-indigo-600 cursor-pointer"
                    />
                    <span
                      className={`text-xs tabular-nums ${expanded ? "text-slate-300" : "text-slate-500"}`}
                    >
                      {fmtTime(totalTime)}
                    </span>
                  </div>
                  {/* [fit] Responsive frame: full available width, clips the scaled
                      replay. The rrweb wrapper inside is scaled to fit. */}
                  <div
                    ref={playerFrameRef}
                    className={`rrweb-player-frame w-full overflow-hidden rounded border border-slate-200 ${
                      expanded ? "bg-white" : "bg-slate-100"
                    }`}
                  >
                    <div ref={playerContainerRef} className="rrweb-player-container" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
