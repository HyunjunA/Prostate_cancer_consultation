"use client";

/**
 * AdminTrackingPatientFirst — admin view for patient first-visit behavior.
 *
 * Lists sessions, allows selecting one to inspect its event stream, and
 * displays per-domain open/close counts and rating values.
 *
 * Pattern A: per-session display, NO OR-merge across sessions.
 */

import React, { useEffect, useState, useMemo } from "react";

const API_BASE = "";  // same-origin via /api/backend

interface SessionRow {
  session_id: string;
  file: string;
  speaker: string;
  // "report" (1st visit) | "survey" (2nd visit) | null (pre-split legacy).
  mode: "report" | "survey" | null;
  started_at: string | null;
  ended_at: string | null;
  event_count: number;
}

interface EventRow {
  id: number;
  event_type: string;
  domain: string | null;
  rating: number | null;
  metadata: Record<string, unknown>;
  device_type: string | null;
  client_timestamp: string | null;
}

interface SliderHistoryPoint {
  value: number | null;
  ts: string | null;
}

interface AnswerHistoryPoint {
  // "timeline" | "factors" — kept per entry because answer_history is now
  // keyed by question_id, not by field.
  field: string | null;
  // timeline changes carry `value`; factor changes carry the full `factors`
  // snapshot after the toggle.
  value: string | null;
  factors: string[] | null;
  ts: string | null;
}

interface RatingHistoryPoint {
  value: number | null;
  ts: string | null;
}

interface SubmittedAnswer {
  question_id: string;
  field: string;
  value: number | string | string[] | null;
}

interface SubmissionSnapshot {
  // Question_id-keyed snapshot the patient submitted (one entry per question).
  answers: SubmittedAnswer[];
  ts: string | null;
}

interface DomainAgg {
  open: number;
  close: number;
  evidence_open: number;
  evidence_close: number;
  // "View relevant sentences" vs "View AI-Generated Summary" panel toggles,
  // counted separately so the two behaviors are distinguishable.
  summary_open: number;
  summary_close: number;
  // Same counts broken down by the page (wizard screen) they happened on,
  // e.g. { overview: {open:1, close:1}, cp: {open:1, close:0} }.
  topic_by_screen?: Record<string, { open: number; close: number }>;
  summary_by_screen?: Record<string, { open: number; close: number }>;
  evidence_by_screen?: Record<string, { open: number; close: number }>;
  // Distinct VAS slider names the patient actually moved in this session
  // (backend /aggregate). Compared against DOMAIN_SLIDERS to show how many
  // of a domain's sliders were answered vs left at the default of 50.
  sliders?: string[];
  // Full committed-value trajectory per slider, in time order — every value
  // the patient settled on, including re-edits after Submit. Lets the admin
  // see 50 → 70 → 65 and count how many times an answer was revised.
  slider_history?: Record<string, SliderHistoryPoint[]>;
  // One entry per Submit click, in time order. Each holds the answer snapshot
  // submitted that time; re-submits after editing append further entries, so
  // this is the per-domain submission history.
  submissions?: SubmissionSnapshot[];
  // Per-selection change history for the non-slider questions, keyed by
  // question_id (e.g. "ed_timeline", "ed_factors"), in time order. Keying by
  // question_id keeps multiple same-type questions in one domain apart.
  answer_history?: Record<string, AnswerHistoryPoint[]>;
  // Per-question rating history, keyed by question_id (e.g. "cp_helpfulness"),
  // in time order. Distinguishes multiple rating questions in one domain.
  rating_history?: Record<string, RatingHistoryPoint[]>;
}

interface AggregateSession {
  session_id: string;
  file: string;
  speaker: string;
  mode: "report" | "survey" | null;
  started_at: string | null;
  ended_at: string | null;
  by_domain: Record<string, DomainAgg>;
  ratings: Record<string, number>;
  total_events: number;
}

const DOMAIN_LABEL: Record<string, string> = {
  cp: "Cancer Prognosis",
  le: "Life Expectancy",
  ed: "Erectile Dysfunction",
  inc: "Urinary Incontinence",
  ius: "Irritative Urinary Symptoms",
};

// VAS sliders rendered per domain in the first-visit report. Used to show
// how many of a domain's sliders the patient actually moved (answered) vs
// left at the default of 50. Life Expectancy has no slider. Must mirror the
// slider_name values emitted by PatientInitialVisitReportV38.
const DOMAIN_SLIDERS: Record<string, string[]> = {
  cp: ["cp_risk_without_treatment", "cp_risk_with_treatment"],
  ed: ["ed_baseline_return"],
  inc: ["inc_risk"],
  ius: ["ius_risk"],
};

// Build a human-readable trajectory string for the cell tooltip, e.g.
//   cp_risk_without_treatment: 50 → 70 → 65
// One line per slider the patient committed at least once.
function fmtSliderHistory(
  history?: Record<string, SliderHistoryPoint[]>,
): string {
  if (!history) return "";
  return Object.entries(history)
    .map(([name, points]) => `${name}: ${points.map((p) => p.value).join(" → ")}`)
    .join("\n");
}

// Build a human-readable submission history for the cell tooltip, e.g.
//   #1 (2:00:00 PM): timeline=5-10 years, factors=[age]
//   #2 (2:05:00 PM): timeline=10-15 years, factors=[age, comorbidity]
// One line per Submit click, in time order.
function fmtSubmissions(subs?: SubmissionSnapshot[]): string {
  if (!subs || subs.length === 0) return "";
  return subs
    .map((s, i) => {
      const parts = (s.answers ?? []).map((a) => {
        const v = Array.isArray(a.value) ? `[${a.value.join(", ")}]` : String(a.value);
        return `${a.question_id}=${v}`;
      });
      const when = s.ts ? new Date(s.ts).toLocaleTimeString() : "—";
      return `#${i + 1} (${when}): ${parts.join(", ") || "—"}`;
    })
    .join("\n");
}

// Build a per-field change-history string for the cell tooltip, e.g.
//   timeline: 1-2 years → 3-5 years
//   factors: [age] → [age, smoking]
// One line per field, values in time order.
function fmtAnswerHistory(
  history?: Record<string, AnswerHistoryPoint[]>,
): string {
  if (!history) return "";
  return Object.entries(history)
    .map(([field, points]) => {
      const seq = points
        .map((p) =>
          p.factors != null ? `[${p.factors.join(", ")}]` : String(p.value),
        )
        .join(" → ");
      return `${field}: ${seq}`;
    })
    .join("\n");
}

// Build a per-question rating-history string for the ★ tooltip, e.g.
//   cp_helpfulness: 3 → 4
//   cp_clarity: 5
// One line per rating question, values in time order.
function fmtRatingHistory(
  history?: Record<string, RatingHistoryPoint[]>,
): string {
  if (!history) return "";
  return Object.entries(history)
    .map(([qid, points]) => `${qid}: ${points.map((p) => p.value).join(" → ")}`)
    .join("\n");
}

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
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}m ${r}s`;
  } catch {
    return "—";
  }
}

// Pill showing a session's entry mode. NULL = pre-split legacy data, shown
// honestly as "— pre-split" rather than guessed as report.
function ModeBadge({ mode }: { mode: "report" | "survey" | null }) {
  const base =
    "inline-block text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded";
  if (mode === "survey")
    return <span className={`${base} bg-violet-100 text-violet-700`}>Survey</span>;
  if (mode === "report")
    return <span className={`${base} bg-blue-100 text-blue-700`}>Report</span>;
  return (
    <span
      className={`${base} bg-slate-100 text-slate-400`}
      title="Recorded before the report/survey split"
    >
      — pre-split
    </span>
  );
}

export default function AdminTrackingPatientFirst() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [aggregate, setAggregate] = useState<AggregateSession[] | null>(null);
  const [fileFilter, setFileFilter] = useState<string>("");
  // report (1st) / survey (2nd) / all. Filters the session list client-side
  // since every session row already carries its mode.
  const [modeFilter, setModeFilter] = useState<"all" | "report" | "survey">("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch sessions list
  const reloadSessions = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(`${API_BASE}/api/backend/track/patient-first/sessions`, window.location.origin);
      if (fileFilter) url.searchParams.set("file", fileFilter);
      url.searchParams.set("limit", "100");
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (e) {
      setError(`Failed to load sessions: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  // Fetch event detail for the currently selected session (null = clear).
  const reloadEvents = async () => {
    if (!selectedSession) {
      setEvents([]);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/backend/track/patient-first/session/${encodeURIComponent(selectedSession)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEvents(data.events || []);
    } catch (e) {
      setError(`Failed to load events: ${e}`);
    }
  };

  // Fetch the per-session aggregate for the active file filter (none = clear).
  const reloadAggregate = async () => {
    if (!fileFilter) { setAggregate(null); return; }
    try {
      const res = await fetch(`${API_BASE}/api/backend/track/patient-first/aggregate?file=${encodeURIComponent(fileFilter)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAggregate(data.sessions || []);
    } catch (e) {
      setError(`Failed to load aggregate: ${e}`);
    }
  };

  // Refresh button — pull the latest for every panel at once. Without this,
  // each panel only refetches on its own trigger (mount / session-select /
  // filter-change), so newly-arrived events stay invisible until a full page
  // reload. reloadSessions drives the spinner; the other two run alongside.
  const reloadAll = async () => {
    await Promise.all([reloadSessions(), reloadAggregate(), reloadEvents()]);
  };

  useEffect(() => { reloadSessions(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { reloadEvents(); /* eslint-disable-next-line */ }, [selectedSession]);
  useEffect(() => { reloadAggregate(); /* eslint-disable-next-line */ }, [fileFilter]);

  // Mode filter is applied client-side so toggling does not refetch.
  const visibleSessions = useMemo(
    () => sessions.filter((s) => modeFilter === "all" || s.mode === modeFilter),
    [sessions, modeFilter],
  );
  const totalCount = useMemo(
    () => visibleSessions.reduce((sum, s) => sum + s.event_count, 0),
    [visibleSessions],
  );

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Patient Report & Survey Behavior</h1>
          <p className="text-sm text-slate-600 mt-1">
            Per-session view (no OR-merge). Sessions: {sessions.length} · Events: {totalCount}
          </p>
        </div>

        {/* Filter bar */}
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
          {/* Entry-mode filter: 1st-visit report vs 2nd-visit survey. */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Mode</label>
            <div className="inline-flex rounded-md border border-slate-300 overflow-hidden">
              {(["all", "report", "survey"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setModeFilter(m)}
                  className={`px-3 py-2 text-sm capitalize ${
                    modeFilter === m
                      ? "bg-indigo-600 text-white"
                      : "bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={reloadAll}
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sessions list */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-4 py-3 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">Sessions</h2>
            </div>
            <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
              {visibleSessions.length === 0 && (
                <div className="p-6 text-center text-sm text-slate-500">No sessions yet.</div>
              )}
              {visibleSessions.map((s) => {
                const active = s.session_id === selectedSession;
                return (
                  <button
                    key={s.session_id}
                    onClick={() => setSelectedSession(s.session_id)}
                    className={`w-full text-left px-4 py-3 hover:bg-slate-50 ${active ? "bg-indigo-50 border-l-4 border-indigo-500" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      <ModeBadge mode={s.mode} />
                      <div className="text-xs font-mono text-slate-500 truncate">{s.session_id}</div>
                    </div>
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

          {/* Event detail */}
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
                  <div className="text-slate-700 mt-0.5">
                    {e.domain && <span className="inline-block bg-slate-100 px-2 py-0.5 rounded mr-2">{e.domain}</span>}
                    {/* Page (wizard screen) the action happened on — Overview vs
                        the per-category detail page. Surfaced as a chip so "where"
                        is visible at a glance, not buried in the metadata JSON. */}
                    {typeof e.metadata?.screen === "string" && (
                      <span className="inline-block bg-violet-100 text-violet-700 px-2 py-0.5 rounded mr-2">
                        📄 {e.metadata.screen}
                      </span>
                    )}
                    {e.rating != null && <span className="inline-block bg-amber-100 px-2 py-0.5 rounded mr-2">★ {e.rating}</span>}
                    {e.device_type && <span className="text-slate-500">{e.device_type}</span>}
                  </div>
                  {e.metadata && Object.keys(e.metadata).length > 0 && (
                    <pre className="mt-1 text-xs text-slate-500 bg-slate-50 px-2 py-1 rounded overflow-x-auto">
{JSON.stringify(e.metadata, null, 0)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Aggregate per-session table */}
        {aggregate && aggregate.length > 0 && (
          <div className="bg-white rounded-lg shadow mt-6">
            <div className="px-4 py-3 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">
                Per-session aggregate for: <span className="font-mono">{fileFilter}</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Each row = one session. No OR-merge — domain "—" means not opened in this session.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 text-left">Session</th>
                    <th className="px-3 py-2 text-left">Started</th>
                    {Object.keys(DOMAIN_LABEL).map((d) => (
                      <th key={d} className="px-3 py-2 text-center" title={DOMAIN_LABEL[d]}>{d}</th>
                    ))}
                    <th className="px-3 py-2 text-center">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {aggregate.map((s) => (
                    <tr key={s.session_id}>
                      <td className="px-3 py-2 font-mono text-slate-600">
                        <div className="flex items-center gap-2">
                          <ModeBadge mode={s.mode} />
                          <span>{s.session_id.slice(0, 12)}…</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-500">{fmtDate(s.started_at)}</td>
                      {Object.keys(DOMAIN_LABEL).map((d) => {
                        const ag = s.by_domain[d];
                        const r = s.ratings[d];
                        if (!ag && r == null) return <td key={d} className="px-3 py-2 text-center text-slate-300">—</td>;
                        const expectedSliders = DOMAIN_SLIDERS[d] ?? [];
                        const slidersMoved = ag?.sliders?.length ?? 0;
                        const sliderColor =
                          slidersMoved === 0
                            ? "text-slate-400"
                            : slidersMoved === expectedSliders.length
                              ? "text-emerald-600"
                              : "text-amber-600";
                        // Re-edits = commits beyond the first touch of each
                        // slider. Total committed values minus distinct sliders.
                        const totalCommits = Object.values(
                          ag?.slider_history ?? {},
                        ).reduce((n, pts) => n + pts.length, 0);
                        const revisions = Math.max(0, totalCommits - slidersMoved);
                        const trajectory = fmtSliderHistory(ag?.slider_history);
                        // Each Submit click for this domain (re-submits included).
                        const submissions = ag?.submissions ?? [];
                        // Per-selection changes to the timeline / factor questions.
                        const answerHistory = ag?.answer_history ?? {};
                        const answerChanges = Object.values(answerHistory).reduce(
                          (n, pts) => n + pts.length,
                          0,
                        );
                        // Per-question rating history (multiple rating questions
                        // per domain are kept apart by question_id).
                        const ratingHistory = ag?.rating_history ?? {};
                        const ratingQuestions = Object.keys(ratingHistory).length;
                        return (
                          <td key={d} className="px-3 py-2 text-center">
                            {ag && (
                              <div className="text-slate-700" title="Topic card open/close, broken down by page">
                                <div>{ag.open}↑ {ag.close}↓</div>
                                {Object.entries(ag.topic_by_screen ?? {}).map(([sc, c]) => (
                                  <div key={sc} className="text-[10px] text-slate-500 ml-3">
                                    {sc}: {c.open}↑ {c.close}↓
                                  </div>
                                ))}
                              </div>
                            )}
                            {ag && (ag.summary_open > 0 || ag.summary_close > 0) && (
                              <div className="text-blue-600" title="View AI-Generated Summary — open/close, broken down by page">
                                <div>📄 {ag.summary_open}↑ {ag.summary_close}↓</div>
                                {Object.entries(ag.summary_by_screen ?? {}).map(([sc, c]) => (
                                  <div key={sc} className="text-[10px] text-blue-500 ml-3">
                                    {sc}: {c.open}↑ {c.close}↓
                                  </div>
                                ))}
                              </div>
                            )}
                            {ag && (ag.evidence_open > 0 || ag.evidence_close > 0) && (
                              <div className="text-cyan-600" title="View relevant sentences — open/close, broken down by page">
                                <div>👁 {ag.evidence_open}↑ {ag.evidence_close}↓</div>
                                {Object.entries(ag.evidence_by_screen ?? {}).map(([sc, c]) => (
                                  <div key={sc} className="text-[10px] text-cyan-500 ml-3">
                                    {sc}: {c.open}↑ {c.close}↓
                                  </div>
                                ))}
                              </div>
                            )}
                            {r != null && (
                              <div
                                className="text-amber-600"
                                title={
                                  ratingQuestions > 0
                                    ? `Rating history (per question):\n${fmtRatingHistory(ratingHistory)}`
                                    : undefined
                                }
                              >
                                ★{r}
                                {ratingQuestions > 1 && (
                                  <span className="ml-1 text-amber-500">×{ratingQuestions}</span>
                                )}
                              </div>
                            )}
                            {ag && expectedSliders.length > 0 && (
                              <div
                                className={sliderColor}
                                title={
                                  `Sliders moved: ${(ag.sliders ?? []).join(", ") || "none (left at default 50)"}` +
                                  (trajectory ? `\n\nTrajectory:\n${trajectory}` : "")
                                }
                              >
                                🎚 {slidersMoved}/{expectedSliders.length}
                                {revisions > 0 && (
                                  <span
                                    className="ml-1 text-sky-600"
                                    title={`${revisions} re-edit${revisions === 1 ? "" : "s"} after first touch`}
                                  >
                                    ↻{revisions}
                                  </span>
                                )}
                              </div>
                            )}
                            {answerChanges > 0 && (
                              <div
                                className="text-teal-600"
                                title={`Answer changes (each selection):\n${fmtAnswerHistory(answerHistory)}`}
                              >
                                📝 {answerChanges}
                              </div>
                            )}
                            {submissions.length > 0 && (
                              <div
                                className="text-violet-600"
                                title={`Submissions (each Submit click):\n${fmtSubmissions(submissions)}`}
                              >
                                📥 {submissions.length}
                              </div>
                            )}
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
