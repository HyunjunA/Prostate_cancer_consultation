"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useThemeStore } from "@/stores/useThemeStore";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
} from "recharts";

// ══════════════════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════════════════

interface TrackingEvent {
  id: number;
  session_id: string;
  file: string;
  speaker: string;
  event_type: string;
  element_id: string | null;
  event_data: Record<string, any> | null;
  device_type: string | null;
  client_timestamp: string | null;
  created_at: string | null;
  role: string | null;
}

interface TrackingStats {
  total_events: number;
  total_sessions: number;
  total_patients: number;
  total_event_types: number;
  event_type_counts: Record<string, number>;
  role_counts?: Record<string, number>;
  visit_type_counts?: Record<string, number>;
}

interface PatientOption {
  file: string;
  event_count: number;
}

interface AnalyticsData {
  timeline: Array<{ hour: string; count: number }>;
  by_patient: Array<{
    file: string;
    total: number;
    types: Record<string, number>;
  }>;
  sessions: Array<{
    session_id: string;
    file: string;
    device_type: string;
    event_count: number;
    first_event: string | null;
    last_event: string | null;
    duration_sec: number | null;
  }>;
  device_breakdown: Array<{ device: string; count: number }>;
  top_elements: Array<{
    element_id: string;
    event_type: string;
    count: number;
  }>;
  hourly_heatmap: Array<{ hour: number; count: number }>;
}

// ══════════════════════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════════════════════

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const PAGE_SIZE = 100;

const CHART_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

const EVENT_TYPE_COLORS: Record<string, string> = {
  dwell_time: "#3b82f6",
  scroll_depth: "#10b981",
  rating_click: "#f59e0b",
  topic_expand: "#8b5cf6",
  topic_collapse: "#a78bfa",
  evidence_expand: "#ef4444",
  evidence_collapse: "#f87171",
  button_click: "#ec4899",
  page_view: "#06b6d4",
  session_start: "#84cc16",
};

function getHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(process.env.NEXT_PUBLIC_API_KEY && {
      "X-API-Key": process.env.NEXT_PUBLIC_API_KEY,
    }),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab type
// ══════════════════════════════════════════════════════════════════════════════

type TabId = "overview" | "behavior" | "recordings" | "sessions" | "elements" | "events";

interface RecordingEntry {
  session_id: string;
  file: string | null;
  visit_type: string | null;
  chunks: number;
  total_events: number;
  started_at: string | null;
}

interface PatientBehaviorSession {
  session_id: string;
  file: string;
  speaker: string;
  role: string;
  visit_type: string | null;
  device_type: string | null;
  first_event: string | null;
  last_event: string | null;
  total_events: number;
  duration_sec: number | null;
  page_dwell_time_ms: number;
  domains: Record<string, {
    opened: boolean;
    closed: boolean;
    evidence_opened: boolean;
    evidence_closed: boolean;
    rated: boolean;
    rating_value: number | null;
    dwell_time_ms: number;
    proximity_entered: boolean;
    event_count: number;
  }>;
  survey_progress: Record<string, {
    answers: number;
    unique_questions: number;
  }>;
}

// ══════════════════════════════════════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════════════════════════════════════

export default function AdminTrackingDashboard() {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);

  // Data state
  const [stats, setStats] = useState<TrackingStats | null>(null);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [events, setEvents] = useState<TrackingEvent[]>([]);
  const [behaviorSessions, setBehaviorSessions] = useState<PatientBehaviorSession[]>([]);
  const [recordings, setRecordings] = useState<RecordingEntry[]>([]);
  const [replaySessionId, setReplaySessionId] = useState<string | null>(null);
  const [replayEvents, setReplayEvents] = useState<any[] | null>(null);
  const [replayLoading, setReplayLoading] = useState(false);
  const [totalEvents, setTotalEvents] = useState(0);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);

  // Filter state
  const [filterRole, setFilterRole] = useState<"" | "patient" | "physician">("");
  const [filterVisitType, setFilterVisitType] = useState<"" | "first" | "followup">("");
  const [filterFile, setFilterFile] = useState("");
  const [filterEventType, setFilterEventType] = useState("");
  const [filterSession, setFilterSession] = useState("");

  // Pagination & tabs
  const [page, setPage] = useState(0);
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  // UI state
  const [loading, setLoading] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  // ────────────────────────────────────────────────────────────────────────────
  // Fetch helpers
  // ────────────────────────────────────────────────────────────────────────────

  // Helper to build common query params
  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (filterRole) params.set("role", filterRole);
    if (filterVisitType) params.set("visit_type", filterVisitType);
    return params;
  }, [filterRole, filterVisitType]);

  const fetchStats = useCallback(async () => {
    try {
      const qs = buildParams().toString();
      const res = await fetch(`${API_BASE_URL}/api/tracking/stats${qs ? `?${qs}` : ""}`, {
        headers: getHeaders(),
      });
      if (res.ok) setStats(await res.json());
    } catch (e) {
      console.error("[Admin] Failed to fetch stats:", e);
    }
  }, [buildParams]);

  const fetchPatients = useCallback(async () => {
    try {
      const qs = buildParams().toString();
      const res = await fetch(`${API_BASE_URL}/api/tracking/patients${qs ? `?${qs}` : ""}`, {
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setPatients(data.patients || []);
      }
    } catch (e) {
      console.error("[Admin] Failed to fetch patients:", e);
    }
  }, [buildParams]);

  const fetchRecordings = useCallback(async () => {
    try {
      const qs = buildParams().toString();
      const res = await fetch(`${API_BASE_URL}/api/tracking/recordings${qs ? `?${qs}` : ""}`, {
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setRecordings(data.recordings || []);
      }
    } catch (e) {
      console.error("[Admin] Failed to fetch recordings:", e);
    }
  }, [buildParams]);

  const loadReplay = useCallback(async (sessionId: string) => {
    setReplayLoading(true);
    setReplaySessionId(sessionId);
    setReplayEvents(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/tracking/recordings/${sessionId}`, {
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setReplayEvents(data.events || []);
      }
    } catch (e) {
      console.error("[Admin] Failed to load replay:", e);
    } finally {
      setReplayLoading(false);
    }
  }, []);

  const fetchBehavior = useCallback(async () => {
    try {
      const qs = buildParams().toString();
      const res = await fetch(`${API_BASE_URL}/api/tracking/patient-behavior${qs ? `?${qs}` : ""}`, {
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setBehaviorSessions(data.sessions || []);
      }
    } catch (e) {
      console.error("[Admin] Failed to fetch behavior:", e);
    }
  }, [buildParams]);

  const fetchAnalytics = useCallback(async () => {
    try {
      const qs = buildParams().toString();
      const res = await fetch(`${API_BASE_URL}/api/tracking/analytics${qs ? `?${qs}` : ""}`, {
        headers: getHeaders(),
      });
      if (res.ok) setAnalytics(await res.json());
    } catch (e) {
      console.error("[Admin] Failed to fetch analytics:", e);
    }
  }, [buildParams]);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const params = buildParams();
      if (filterFile) params.set("file", filterFile);
      if (filterEventType) params.set("event_type", filterEventType);
      if (filterSession) params.set("session_id", filterSession);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));

      const res = await fetch(
        `${API_BASE_URL}/api/tracking/events?${params.toString()}`,
        { headers: getHeaders() },
      );
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
        setTotalEvents(data.total || 0);
      }
    } catch (e) {
      console.error("[Admin] Failed to fetch events:", e);
    } finally {
      setLoading(false);
    }
  }, [buildParams, filterFile, filterEventType, filterSession, page]);

  // ────────────────────────────────────────────────────────────────────────────
  // Effects
  // ────────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchStats();
    fetchPatients();
    fetchAnalytics();
    fetchBehavior();
    fetchRecordings();
  }, [fetchStats, fetchPatients, fetchAnalytics, fetchBehavior, fetchRecordings]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    setPage(0);
  }, [filterRole, filterVisitType, filterFile, filterEventType, filterSession]);

  // ────────────────────────────────────────────────────────────────────────────
  // Derived data for charts
  // ────────────────────────────────────────────────────────────────────────────

  const eventTypePieData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.event_type_counts).map(([name, value]) => ({
      name,
      value,
      color: EVENT_TYPE_COLORS[name] || CHART_COLORS[0],
    }));
  }, [stats]);

  const timelineData = useMemo(() => {
    if (!analytics?.timeline) return [];
    return analytics.timeline.map((t) => ({
      ...t,
      label: t.hour
        ? new Date(t.hour).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
          })
        : "",
    }));
  }, [analytics]);

  const patientBarData = useMemo(() => {
    if (!analytics?.by_patient) return [];
    const allTypes = new Set<string>();
    analytics.by_patient.forEach((p) =>
      Object.keys(p.types).forEach((t) => allTypes.add(t)),
    );
    return analytics.by_patient.map((p) => {
      const entry: Record<string, any> = {
        name: p.file.replace(/\.xlsx$/i, "").replace(/^quality-coded-nlp-pilot-/, ""),
      };
      allTypes.forEach((t) => {
        entry[t] = p.types[t] || 0;
      });
      return entry;
    });
  }, [analytics]);

  const patientBarKeys = useMemo(() => {
    if (!analytics?.by_patient) return [];
    const allTypes = new Set<string>();
    analytics.by_patient.forEach((p) =>
      Object.keys(p.types).forEach((t) => allTypes.add(t)),
    );
    return Array.from(allTypes);
  }, [analytics]);

  const hourlyData = useMemo(() => {
    if (!analytics?.hourly_heatmap) return [];
    const full = Array.from({ length: 24 }, (_, i) => ({
      hour: `${i.toString().padStart(2, "0")}:00`,
      count: 0,
    }));
    analytics.hourly_heatmap.forEach((h) => {
      full[h.hour].count = h.count;
    });
    return full;
  }, [analytics]);

  // ────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────────────────────

  const totalPages = Math.ceil(totalEvents / PAGE_SIZE);

  function formatTimestamp(ts: string | null): string {
    if (!ts) return "—";
    try {
      return new Date(ts).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return ts;
    }
  }

  function truncate(s: string | null, maxLen: number = 30): string {
    if (!s) return "—";
    return s.length > maxLen ? s.slice(0, maxLen) + "…" : s;
  }

  function formatDuration(sec: number | null): string {
    if (sec === null || sec === undefined) return "—";
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }

  function refreshAll() {
    fetchStats();
    fetchPatients();
    fetchAnalytics();
    fetchBehavior();
    fetchRecordings();
    fetchEvents();
    setReplaySessionId(null);
    setReplayEvents(null);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Shared styles
  // ────────────────────────────────────────────────────────────────────────────

  const cardCls = isDarkMode
    ? "bg-slate-900/50 border-slate-800 rounded-xl border"
    : "bg-white border-slate-200 rounded-xl border shadow-sm";

  const chartTextColor = isDarkMode ? "#94a3b8" : "#64748b";
  const chartGridColor = isDarkMode ? "#1e293b" : "#f1f5f9";

  // ────────────────────────────────────────────────────────────────────────────
  // Custom tooltip
  // ────────────────────────────────────────────────────────────────────────────

  const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div
        className={`rounded-lg shadow-lg p-3 text-xs border ${
          isDarkMode ? "bg-slate-800 border-slate-700 text-slate-200" : "bg-white border-slate-200 text-slate-800"
        }`}
      >
        <div className="font-medium mb-1">{label}</div>
        {payload.map((entry: any, i: number) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="opacity-60">{entry.name || entry.dataKey}:</span>
            <span className="font-semibold">{entry.value}</span>
          </div>
        ))}
      </div>
    );
  };

  // Chart empty state
  const ChartEmpty = ({ text = "No data" }: { text?: string }) => (
    <div className={`h-full flex items-center justify-center text-xs ${
      isDarkMode ? "text-slate-600" : "text-slate-300"
    }`}>
      {text}
    </div>
  );

  // ────────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────────

  return (
    <div className={`min-h-screen flex flex-col ${
      isDarkMode
        ? "bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100"
        : "bg-gradient-to-br from-slate-50 via-white to-blue-50 text-slate-900"
    }`}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className={`sticky top-0 z-30 border-b backdrop-blur-sm ${
        isDarkMode ? "border-slate-800/60 bg-slate-900/80" : "border-slate-200/60 bg-white/80"
      }`}>
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <h1 className={`text-lg font-semibold tracking-tight ${
            isDarkMode ? "text-slate-100" : "text-slate-900"
          }`}>
            User Interaction Tracking
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={refreshAll}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                isDarkMode
                  ? "bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/20"
                  : "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-100"
              }`}
            >
              Refresh
            </button>
            <a
              href="/"
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                isDarkMode
                  ? "bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
                  : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200 shadow-sm"
              }`}
            >
              Back
            </a>
          </div>
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────────────────── */}
      <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-6 py-6">

        {/* ── Role Filter + Stats ─────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
          {/* Role pills */}
          <div className="flex items-center gap-1.5">
            <span className={`text-xs font-medium mr-1 ${
              isDarkMode ? "text-slate-500" : "text-slate-400"
            }`}>Source:</span>
            {([
              { value: "" as const, label: "All" },
              { value: "patient" as const, label: "Patient" },
              { value: "physician" as const, label: "Physician" },
            ]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilterRole(opt.value)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  filterRole === opt.value
                    ? isDarkMode
                      ? "bg-blue-600 text-white"
                      : "bg-slate-900 text-white"
                    : isDarkMode
                      ? "bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700"
                      : "bg-white text-slate-500 hover:text-slate-700 border border-slate-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Visit type pills */}
          <div className="flex items-center gap-1.5">
            <span className={`text-xs font-medium mr-1 ${
              isDarkMode ? "text-slate-500" : "text-slate-400"
            }`}>Visit:</span>
            {([
              { value: "" as const, label: "All" },
              { value: "first" as const, label: "First" },
              { value: "followup" as const, label: "Follow-up" },
            ]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilterVisitType(opt.value)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  filterVisitType === opt.value
                    ? isDarkMode
                      ? "bg-teal-600 text-white"
                      : "bg-teal-700 text-white"
                    : isDarkMode
                      ? "bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700"
                      : "bg-white text-slate-500 hover:text-slate-700 border border-slate-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Counts */}
          <div className={`flex gap-4 text-xs ${
            isDarkMode ? "text-slate-500" : "text-slate-400"
          }`}>
            {stats?.role_counts && (
              <>
                <span>Patient: <strong className={isDarkMode ? "text-slate-300" : "text-slate-600"}>{stats.role_counts.patient ?? 0}</strong></span>
                <span>Physician: <strong className={isDarkMode ? "text-slate-300" : "text-slate-600"}>{stats.role_counts.physician ?? 0}</strong></span>
              </>
            )}
            {stats?.visit_type_counts && (
              <>
                <span>First: <strong className={isDarkMode ? "text-slate-300" : "text-slate-600"}>{stats.visit_type_counts.first ?? 0}</strong></span>
                <span>Follow-up: <strong className={isDarkMode ? "text-slate-300" : "text-slate-600"}>{stats.visit_type_counts.followup ?? 0}</strong></span>
              </>
            )}
          </div>
        </div>

        {/* ── Stats Cards ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total Events", value: stats?.total_events ?? "—", color: isDarkMode ? "text-blue-400" : "text-blue-600" },
            { label: "Sessions", value: stats?.total_sessions ?? "—", color: isDarkMode ? "text-emerald-400" : "text-emerald-600" },
            { label: "Patients", value: stats?.total_patients ?? "—", color: isDarkMode ? "text-violet-400" : "text-violet-600" },
            { label: "Event Types", value: stats?.total_event_types ?? "—", color: isDarkMode ? "text-amber-400" : "text-amber-600" },
          ].map((card) => (
            <div key={card.label} className={`p-4 ${cardCls}`}>
              <div className={`text-2xl lg:text-3xl font-bold tabular-nums ${card.color}`}>
                {typeof card.value === "number" ? card.value.toLocaleString() : card.value}
              </div>
              <div className={`text-xs mt-1 ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>
                {card.label}
              </div>
            </div>
          ))}
        </div>

        {/* ── Tabs ────────────────────────────────────────────────────── */}
        <div className={`flex gap-0.5 mb-0 border-b ${
          isDarkMode ? "border-slate-800" : "border-slate-200"
        }`}>
          {(
            [
              { id: "overview", label: "Overview" },
              { id: "behavior", label: "Patient Behavior" },
              { id: "recordings", label: "Recordings" },
              { id: "sessions", label: "Sessions" },
              { id: "elements", label: "Elements" },
              { id: "events", label: "Event Log" },
            ] as { id: TabId; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              className={`px-4 py-2.5 text-xs font-medium transition-all relative ${
                activeTab === tab.id
                  ? isDarkMode
                    ? "text-blue-400"
                    : "text-blue-600"
                  : isDarkMode
                    ? "text-slate-500 hover:text-slate-300"
                    : "text-slate-400 hover:text-slate-600"
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              {activeTab === tab.id && (
                <span className={`absolute bottom-0 left-0 right-0 h-0.5 ${
                  isDarkMode ? "bg-blue-400" : "bg-blue-600"
                }`} />
              )}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* TAB: Overview                                                  */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {activeTab === "overview" && (
          <div className="space-y-4 pt-4">
            {/* Row 1: Timeline + Event Type Pie */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Activity Timeline */}
              <div className={`lg:col-span-2 p-4 ${cardCls}`}>
                <h2 className={`text-xs font-semibold uppercase tracking-wider mb-4 ${
                  isDarkMode ? "text-slate-500" : "text-slate-400"
                }`}>
                  Activity Timeline
                </h2>
                <div className="w-full h-56 lg:h-64 min-w-0">
                  {timelineData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={timelineData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorEvents" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: chartTextColor }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: chartTextColor }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} fill="url(#colorEvents)" name="Events" />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <ChartEmpty />
                  )}
                </div>
              </div>

              {/* Event Type Distribution */}
              <div className={`p-4 ${cardCls}`}>
                <h2 className={`text-xs font-semibold uppercase tracking-wider mb-4 ${
                  isDarkMode ? "text-slate-500" : "text-slate-400"
                }`}>
                  Event Types
                </h2>
                <div className="w-full h-56 lg:h-64 min-w-0">
                  {eventTypePieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={eventTypePieData}
                          cx="50%"
                          cy="45%"
                          innerRadius={40}
                          outerRadius={70}
                          dataKey="value"
                          nameKey="name"
                          stroke="none"
                        >
                          {eventTypePieData.map((entry, idx) => (
                            <Cell key={idx} fill={entry.color || CHART_COLORS[idx % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 10, color: chartTextColor }} iconSize={6} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <ChartEmpty />
                  )}
                </div>
              </div>
            </div>

            {/* Row 2: Patient Breakdown + Hourly Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Events by Patient */}
              <div className={`p-4 ${cardCls}`}>
                <h2 className={`text-xs font-semibold uppercase tracking-wider mb-4 ${
                  isDarkMode ? "text-slate-500" : "text-slate-400"
                }`}>
                  Events by Patient
                </h2>
                <div className="w-full min-w-0" style={{ height: Math.max(200, patientBarData.length * 36 + 40) }}>
                  {patientBarData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={patientBarData} layout="vertical" margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10, fill: chartTextColor }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: chartTextColor }} width={100} axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 10, color: chartTextColor }} iconSize={6} />
                        {patientBarKeys.map((key, idx) => (
                          <Bar key={key} dataKey={key} stackId="a" fill={EVENT_TYPE_COLORS[key] || CHART_COLORS[idx % CHART_COLORS.length]} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <ChartEmpty />
                  )}
                </div>
              </div>

              {/* Hourly Activity */}
              <div className={`p-4 ${cardCls}`}>
                <h2 className={`text-xs font-semibold uppercase tracking-wider mb-4 ${
                  isDarkMode ? "text-slate-500" : "text-slate-400"
                }`}>
                  Activity by Hour
                </h2>
                <div className="w-full h-56 lg:h-64 min-w-0">
                  {hourlyData.some((h) => h.count > 0) ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={hourlyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                        <XAxis dataKey="hour" tick={{ fontSize: 9, fill: chartTextColor }} axisLine={false} tickLine={false} interval={2} />
                        <YAxis tick={{ fontSize: 10, fill: chartTextColor }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="count" name="Events" radius={[2, 2, 0, 0]}>
                          {hourlyData.map((entry, idx) => (
                            <Cell
                              key={idx}
                              fill={
                                entry.count > 0
                                  ? `rgba(59, 130, 246, ${Math.min(0.3 + (entry.count / Math.max(...hourlyData.map((h) => h.count), 1)) * 0.7, 1)})`
                                  : isDarkMode ? "#1e293b" : "#f1f5f9"
                              }
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <ChartEmpty />
                  )}
                </div>
              </div>
            </div>

            {/* Row 3: Device + Event Type Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Device Breakdown */}
              <div className={`p-4 ${cardCls}`}>
                <h2 className={`text-xs font-semibold uppercase tracking-wider mb-4 ${
                  isDarkMode ? "text-slate-500" : "text-slate-400"
                }`}>
                  Devices
                </h2>
                <div className="w-full h-48 min-w-0">
                  {analytics?.device_breakdown && analytics.device_breakdown.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={analytics.device_breakdown}
                          cx="50%"
                          cy="50%"
                          outerRadius={60}
                          dataKey="count"
                          nameKey="device"
                          label={({ device, percent }) => `${device} ${(percent * 100).toFixed(0)}%`}
                          labelLine={false}
                          stroke="none"
                        >
                          {analytics.device_breakdown.map((_, idx) => (
                            <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <ChartEmpty />
                  )}
                </div>
              </div>

              {/* Event type breakdown bars */}
              <div className={`lg:col-span-2 p-4 ${cardCls}`}>
                <h2 className={`text-xs font-semibold uppercase tracking-wider mb-4 ${
                  isDarkMode ? "text-slate-500" : "text-slate-400"
                }`}>
                  Event Type Breakdown
                </h2>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {stats &&
                    Object.entries(stats.event_type_counts)
                      .sort(([, a], [, b]) => b - a)
                      .map(([type, count]) => {
                        const pct = stats.total_events ? (count / stats.total_events) * 100 : 0;
                        return (
                          <div key={type} className="flex items-center gap-3">
                            <div className={`w-28 text-xs font-medium truncate ${
                              isDarkMode ? "text-slate-400" : "text-slate-600"
                            }`}>{type}</div>
                            <div className={`flex-1 h-4 rounded-full overflow-hidden ${
                              isDarkMode ? "bg-slate-800" : "bg-slate-100"
                            }`}>
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${pct}%`,
                                  backgroundColor: EVENT_TYPE_COLORS[type] || CHART_COLORS[0],
                                }}
                              />
                            </div>
                            <div className={`w-20 text-xs text-right font-mono tabular-nums ${
                              isDarkMode ? "text-slate-400" : "text-slate-500"
                            }`}>
                              {count.toLocaleString()} <span className="opacity-50">({pct.toFixed(0)}%)</span>
                            </div>
                          </div>
                        );
                      })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* TAB: Patient Behavior                                          */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {activeTab === "behavior" && (() => {
          // Group sessions by patient file
          const byPatient: Record<string, PatientBehaviorSession[]> = {};
          behaviorSessions.forEach((s) => {
            const key = s.file || "unknown";
            if (!byPatient[key]) byPatient[key] = [];
            byPatient[key].push(s);
          });

          // Merge domains across all sessions for a patient
          const ALL_DOMAINS = ["Cancer Prognosis", "Urinary Incontinence", "Erectile Dysfunction",
            "Irritative Urinary Symptoms", "Life Expectancy"];

          return (
            <div className="pt-4 space-y-4">
              {Object.keys(byPatient).length === 0 ? (
                <div className={`py-16 text-center text-xs ${isDarkMode ? "text-slate-600" : "text-slate-300"}`}>
                  No behavior data found. Visit a patient page to generate tracking events.
                </div>
              ) : (
                Object.entries(byPatient).map(([file, sessions]) => {
                  const match = file.match(/sid[\s_-]*(\d+)/i);
                  const label = match ? `SID-${match[1]}` : file;
                  const totalEvents = sessions.reduce((sum, s) => sum + s.total_events, 0);
                  const visitTypes = [...new Set(sessions.map(s => s.visit_type).filter(Boolean))];

                  // Merge domains across all sessions
                  const mergedDomains: Record<string, {
                    opened: boolean; closed: boolean; evidence_opened: boolean;
                    rated: boolean; rating_value: number | null;
                    dwell_time_ms: number; event_count: number;
                  }> = {};
                  ALL_DOMAINS.forEach(dom => {
                    mergedDomains[dom] = {
                      opened: false, closed: false, evidence_opened: false,
                      rated: false, rating_value: null, dwell_time_ms: 0, event_count: 0,
                    };
                  });
                  sessions.forEach(s => {
                    Object.entries(s.domains).forEach(([dom, d]) => {
                      if (!mergedDomains[dom]) return;
                      const m = mergedDomains[dom];
                      if (d.opened) m.opened = true;
                      if (d.closed) m.closed = true;
                      if (d.evidence_opened) m.evidence_opened = true;
                      if (d.rated) { m.rated = true; m.rating_value = d.rating_value; }
                      m.dwell_time_ms += d.dwell_time_ms;
                      m.event_count += d.event_count;
                    });
                  });

                  // Merge survey progress
                  const mergedSurvey: Record<string, { answers: number; unique_questions: number }> = {};
                  sessions.forEach(s => {
                    Object.entries(s.survey_progress).forEach(([survey, data]) => {
                      if (!mergedSurvey[survey]) mergedSurvey[survey] = { answers: 0, unique_questions: 0 };
                      mergedSurvey[survey].answers += data.answers;
                      mergedSurvey[survey].unique_questions = Math.max(mergedSurvey[survey].unique_questions, data.unique_questions);
                    });
                  });

                  return (
                    <div key={file} className={`${cardCls} overflow-hidden`}>
                      {/* Patient header */}
                      <div className={`px-4 py-3 flex flex-wrap items-center gap-3 ${
                        isDarkMode ? "bg-slate-800/50" : "bg-slate-50"
                      }`}>
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${
                          isDarkMode ? "bg-blue-500/10 text-blue-400" : "bg-blue-50 text-blue-600"
                        }`}>
                          {match ? match[1] : "?"}
                        </div>
                        <span className={`font-semibold text-sm ${isDarkMode ? "text-slate-200" : "text-slate-700"}`}>
                          {label}
                        </span>
                        {visitTypes.map(vt => (
                          <span key={vt} className={`px-2 py-0.5 rounded text-xs font-medium ${
                            vt === "first"
                              ? isDarkMode ? "bg-blue-500/10 text-blue-400" : "bg-blue-50 text-blue-700"
                              : isDarkMode ? "bg-teal-500/10 text-teal-400" : "bg-teal-50 text-teal-700"
                          }`}>
                            {vt === "first" ? "First Visit" : "Follow-up"}
                          </span>
                        ))}
                        <span className={`text-xs ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>
                          {sessions.length} session{sessions.length !== 1 ? "s" : ""}
                        </span>
                        <span className={`text-xs ${isDarkMode ? "text-slate-600" : "text-slate-300"}`}>
                          {totalEvents} total events
                        </span>
                      </div>

                      {/* Merged domain behavior table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className={isDarkMode ? "bg-slate-800/30" : "bg-slate-50/50"}>
                              <th className={`px-4 py-2 text-left font-semibold ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Domain</th>
                              <th className={`px-3 py-2 text-center font-semibold ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Opened</th>
                              <th className={`px-3 py-2 text-center font-semibold ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Closed</th>
                              <th className={`px-3 py-2 text-center font-semibold ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Evidence</th>
                              <th className={`px-3 py-2 text-center font-semibold ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Rated</th>
                              <th className={`px-3 py-2 text-right font-semibold ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Dwell</th>
                              <th className={`px-3 py-2 text-right font-semibold ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Events</th>
                            </tr>
                          </thead>
                          <tbody className={`divide-y ${isDarkMode ? "divide-slate-800" : "divide-slate-100"}`}>
                            {ALL_DOMAINS.map((domain) => {
                              const d = mergedDomains[domain];
                              return (
                                <tr key={domain} className={`transition-colors ${
                                  d.event_count > 0
                                    ? isDarkMode ? "hover:bg-slate-800/30" : "hover:bg-slate-50"
                                    : isDarkMode ? "opacity-40" : "opacity-30"
                                }`}>
                                  <td className={`px-4 py-2 font-medium ${isDarkMode ? "text-slate-200" : "text-slate-700"}`}>{domain}</td>
                                  <td className="px-3 py-2 text-center">
                                    {d.opened ? <span className="text-emerald-500">Yes</span> : <span className={isDarkMode ? "text-slate-600" : "text-slate-300"}>—</span>}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    {d.closed ? <span className="text-emerald-500">Yes</span>
                                      : d.opened ? <span className="text-amber-500">Still open</span>
                                      : <span className={isDarkMode ? "text-slate-600" : "text-slate-300"}>—</span>}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    {d.evidence_opened ? <span className="text-emerald-500">Yes</span> : <span className={isDarkMode ? "text-slate-600" : "text-slate-300"}>—</span>}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    {d.rated ? <span className="text-amber-400">{d.rating_value != null ? `${d.rating_value}` : "Yes"}</span> : <span className={isDarkMode ? "text-slate-600" : "text-slate-300"}>—</span>}
                                  </td>
                                  <td className={`px-3 py-2 text-right tabular-nums ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>
                                    {d.dwell_time_ms > 0 ? `${(d.dwell_time_ms / 1000).toFixed(1)}s` : "—"}
                                  </td>
                                  <td className={`px-3 py-2 text-right tabular-nums font-medium ${
                                    d.event_count > 0 ? isDarkMode ? "text-slate-200" : "text-slate-700" : isDarkMode ? "text-slate-600" : "text-slate-300"
                                  }`}>
                                    {d.event_count || "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Survey progress */}
                      {Object.keys(mergedSurvey).length > 0 && (
                        <div className={`px-4 py-3 border-t ${isDarkMode ? "border-slate-800" : "border-slate-100"}`}>
                          <span className={`text-xs font-semibold ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Survey Progress:</span>
                          <div className="flex flex-wrap gap-3 mt-1">
                            {Object.entries(mergedSurvey)
                              .filter(([survey]) => survey !== "unknown")
                              .map(([survey, data]) => {
                                const displayName: Record<string, string> = {
                                  dcs: "Decisional Conflict (DCS)",
                                  sdm: "Shared Decision Making (SDM)",
                                  risk_perception: "Risk Perception",
                                  satisfaction: "Satisfaction",
                                };
                                return (
                                  <span key={survey} className={`text-xs px-2 py-1 rounded ${isDarkMode ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-600"}`}>
                                    <strong>{displayName[survey] || survey.toUpperCase()}</strong>: {data.unique_questions} questions answered
                                  </span>
                                );
                              })}
                          </div>
                        </div>
                      )}

                      {/* Session list (collapsed details) */}
                      <div className={`px-4 py-2 border-t ${isDarkMode ? "border-slate-800" : "border-slate-100"}`}>
                        <span className={`text-xs ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>
                          Sessions: {sessions.map(s => {
                            const vl = s.visit_type === "first" ? "F" : s.visit_type === "followup" ? "FU" : "Dr";
                            const time = s.first_event ? new Date(s.first_event).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "—";
                            return `${vl} ${time} (${s.total_events}ev)`;
                          }).join(" | ")}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          );
        })()}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* TAB: Recordings (rrweb session replay)                         */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {activeTab === "recordings" && (
          <div className="pt-4 space-y-4">
            {/* Replay player */}
            {replaySessionId && (
              <div className={`${cardCls} overflow-hidden`}>
                <div className={`px-4 py-3 flex items-center justify-between ${
                  isDarkMode ? "bg-slate-800/50" : "bg-slate-50"
                }`}>
                  <span className={`text-sm font-semibold ${isDarkMode ? "text-slate-200" : "text-slate-700"}`}>
                    Session Replay
                  </span>
                  <button
                    onClick={() => { setReplaySessionId(null); setReplayEvents(null); }}
                    className={`px-3 py-1 rounded text-xs font-medium ${
                      isDarkMode ? "bg-slate-700 text-slate-300 hover:bg-slate-600" : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                    }`}
                  >
                    Close
                  </button>
                </div>
                <div className="p-4">
                  {replayLoading ? (
                    <div className={`flex items-center justify-center py-12 text-xs ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>
                      <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Loading recording...
                    </div>
                  ) : replayEvents && replayEvents.length > 0 ? (
                    <div
                      className="w-full flex justify-center"
                      ref={(el) => {
                        if (!el || el.children.length > 0) return;
                        // Dynamically import rrweb-player to avoid SSR issues
                        import("rrweb-player").then(({ default: RRWebPlayer }) => {
                          new RRWebPlayer({
                            target: el,
                            props: {
                              events: replayEvents,
                              width: Math.min(el.parentElement?.clientWidth || 900, 900),
                              height: 500,
                              showController: true,
                              autoPlay: false,
                            },
                          });
                        }).catch((err) => {
                          el.innerHTML = `<div style="padding:20px;text-align:center;color:#ef4444;">Failed to load player: ${err.message}</div>`;
                        });
                      }}
                    />
                  ) : (
                    <div className={`text-center py-8 text-xs ${isDarkMode ? "text-slate-600" : "text-slate-300"}`}>
                      No events in this recording.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Recording list */}
            <div className={`overflow-hidden ${cardCls}`}>
              <div className={`px-4 py-3 ${isDarkMode ? "bg-slate-800/50" : "bg-slate-50"}`}>
                <span className={`text-xs font-semibold uppercase tracking-wider ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>
                  Session Recordings ({recordings.length})
                </span>
              </div>
              {recordings.length === 0 ? (
                <div className={`py-12 text-center text-xs ${isDarkMode ? "text-slate-600" : "text-slate-300"}`}>
                  No recordings yet. Visit a patient page to start recording.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className={isDarkMode ? "bg-slate-800/30" : "bg-slate-50/50"}>
                        {["Patient", "Visit", "Started", "Chunks", "Events", "Action"].map((h, i) => (
                          <th key={h} className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider ${
                            i === 5 ? "text-center" : "text-left"
                          } ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isDarkMode ? "divide-slate-800" : "divide-slate-100"}`}>
                      {recordings.map((r) => {
                        const match = r.file?.match(/sid[\s_-]*(\d+)/i);
                        const label = match ? `SID-${match[1]}` : r.file || "—";
                        return (
                          <tr key={r.session_id} className={`transition-colors ${isDarkMode ? "hover:bg-slate-800/50" : "hover:bg-slate-50"}`}>
                            <td className={`px-4 py-2.5 font-medium text-xs ${isDarkMode ? "text-slate-200" : "text-slate-700"}`}>
                              {label}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                r.visit_type === "first"
                                  ? isDarkMode ? "bg-blue-500/10 text-blue-400" : "bg-blue-50 text-blue-700"
                                  : r.visit_type === "followup"
                                    ? isDarkMode ? "bg-teal-500/10 text-teal-400" : "bg-teal-50 text-teal-700"
                                    : isDarkMode ? "bg-slate-700 text-slate-400" : "bg-slate-100 text-slate-500"
                              }`}>
                                {r.visit_type === "first" ? "First" : r.visit_type === "followup" ? "Follow-up" : "—"}
                              </span>
                            </td>
                            <td className={`px-4 py-2.5 text-xs ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>
                              {r.started_at ? new Date(r.started_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                            </td>
                            <td className={`px-4 py-2.5 text-xs tabular-nums ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>
                              {r.chunks}
                            </td>
                            <td className={`px-4 py-2.5 text-xs tabular-nums font-medium ${isDarkMode ? "text-slate-200" : "text-slate-700"}`}>
                              {r.total_events}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <button
                                onClick={() => loadReplay(r.session_id)}
                                disabled={replayLoading && replaySessionId === r.session_id}
                                className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                                  replaySessionId === r.session_id
                                    ? isDarkMode ? "bg-blue-600 text-white" : "bg-blue-600 text-white"
                                    : isDarkMode
                                      ? "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20"
                                      : "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-100"
                                }`}
                              >
                                {replayLoading && replaySessionId === r.session_id ? "Loading..." : replaySessionId === r.session_id ? "Playing" : "Replay"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* TAB: Sessions                                                  */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {activeTab === "sessions" && (
          <div className={`mt-4 overflow-hidden ${cardCls}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={isDarkMode ? "bg-slate-800/50" : "bg-slate-50"}>
                    {["Session ID", "Patient", "Device", "Events", "Start", "End", "Duration"].map((h, i) => (
                      <th key={h} className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider ${
                        i === 3 || i === 6 ? "text-right" : "text-left"
                      } ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDarkMode ? "divide-slate-800" : "divide-slate-100"}`}>
                  {analytics?.sessions && analytics.sessions.length > 0 ? (
                    analytics.sessions.map((s) => (
                      <tr
                        key={s.session_id}
                        className={`cursor-pointer transition-colors ${
                          isDarkMode ? "hover:bg-slate-800/50" : "hover:bg-slate-50"
                        }`}
                        onClick={() => {
                          setFilterSession(s.session_id);
                          setActiveTab("events");
                        }}
                      >
                        <td className="px-4 py-3 font-mono text-xs">{truncate(s.session_id, 20)}</td>
                        <td className="px-4 py-3 text-xs" title={s.file}>{truncate(s.file, 30)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs ${
                            isDarkMode ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-600"
                          }`}>
                            {s.device_type || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-xs">{s.event_count}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs">{formatTimestamp(s.first_event)}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs">{formatTimestamp(s.last_event)}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs">{formatDuration(s.duration_sec)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className={`px-4 py-12 text-center text-xs ${
                        isDarkMode ? "text-slate-600" : "text-slate-300"
                      }`}>
                        No sessions found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* TAB: Elements                                                  */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {activeTab === "elements" && (
          <div className="space-y-4 pt-4">
            {/* Top Elements Bar Chart */}
            <div className={`p-4 ${cardCls}`}>
              <h2 className={`text-xs font-semibold uppercase tracking-wider mb-4 ${
                isDarkMode ? "text-slate-500" : "text-slate-400"
              }`}>
                Most Interacted Elements
              </h2>
              <div className="w-full min-w-0" style={{ height: Math.max(200, (analytics?.top_elements?.length ?? 0) * 28 + 40) }}>
                {analytics?.top_elements && analytics.top_elements.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={analytics.top_elements.map((el) => ({
                        name: el.element_id.length > 30 ? el.element_id.slice(0, 30) + "…" : el.element_id,
                        fullName: el.element_id,
                        count: el.count,
                        event_type: el.event_type,
                      }))}
                      layout="vertical"
                      margin={{ top: 5, right: 10, left: 10, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: chartTextColor }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: chartTextColor }} width={200} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="count" name="Interactions" radius={[0, 3, 3, 0]}>
                        {analytics.top_elements.map((el, idx) => (
                          <Cell key={idx} fill={EVENT_TYPE_COLORS[el.event_type] || CHART_COLORS[idx % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <ChartEmpty text="No element data" />
                )}
              </div>
            </div>

            {/* Elements Table */}
            <div className={`overflow-hidden ${cardCls}`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={isDarkMode ? "bg-slate-800/50" : "bg-slate-50"}>
                      {["#", "Element ID", "Event Type", "Count"].map((h, i) => (
                        <th key={h} className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider ${
                          i === 3 ? "text-right" : "text-left"
                        } ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDarkMode ? "divide-slate-800" : "divide-slate-100"}`}>
                    {analytics?.top_elements?.map((el, idx) => (
                      <tr key={`${el.element_id}-${el.event_type}`} className={`transition-colors ${
                        isDarkMode ? "hover:bg-slate-800/50" : "hover:bg-slate-50"
                      }`}>
                        <td className={`px-4 py-2.5 font-mono text-xs ${isDarkMode ? "text-slate-600" : "text-slate-300"}`}>{idx + 1}</td>
                        <td className="px-4 py-2.5 font-mono text-xs">{el.element_id}</td>
                        <td className="px-4 py-2.5">
                          <span
                            className="inline-block px-2 py-0.5 rounded text-xs font-medium"
                            style={{
                              backgroundColor: EVENT_TYPE_COLORS[el.event_type] ? `${EVENT_TYPE_COLORS[el.event_type]}15` : undefined,
                              color: EVENT_TYPE_COLORS[el.event_type] || undefined,
                            }}
                          >
                            {el.event_type}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{el.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* TAB: Event Log                                                 */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {activeTab === "events" && (
          <div className="pt-4 space-y-0">
            {/* Filters */}
            <div className={`p-4 rounded-t-xl border border-b-0 ${
              isDarkMode ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"
            }`}>
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex flex-col min-w-0">
                  <label className={`text-xs font-medium mb-1 ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>Patient</label>
                  <select
                    value={filterFile}
                    onChange={(e) => setFilterFile(e.target.value)}
                    className={`rounded-md border px-3 py-1.5 text-xs ${
                      isDarkMode
                        ? "bg-slate-800 border-slate-700 text-slate-200"
                        : "bg-white border-slate-200 text-slate-700"
                    }`}
                  >
                    <option value="">All patients</option>
                    {patients.map((p) => (
                      <option key={p.file} value={p.file}>{p.file} ({p.event_count})</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col min-w-0">
                  <label className={`text-xs font-medium mb-1 ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>Event Type</label>
                  <select
                    value={filterEventType}
                    onChange={(e) => setFilterEventType(e.target.value)}
                    className={`rounded-md border px-3 py-1.5 text-xs ${
                      isDarkMode
                        ? "bg-slate-800 border-slate-700 text-slate-200"
                        : "bg-white border-slate-200 text-slate-700"
                    }`}
                  >
                    <option value="">All types</option>
                    {stats && Object.entries(stats.event_type_counts).map(([type, count]) => (
                      <option key={type} value={type}>{type} ({count})</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col min-w-0">
                  <label className={`text-xs font-medium mb-1 ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>Session ID</label>
                  <input
                    type="text"
                    value={filterSession}
                    onChange={(e) => setFilterSession(e.target.value)}
                    placeholder="Filter by session…"
                    className={`rounded-md border px-3 py-1.5 text-xs w-44 ${
                      isDarkMode
                        ? "bg-slate-800 border-slate-700 text-slate-200 placeholder-slate-600"
                        : "bg-white border-slate-200 text-slate-700 placeholder-slate-300"
                    }`}
                  />
                </div>
                {(filterFile || filterEventType || filterSession || filterRole || filterVisitType) && (
                  <button
                    onClick={() => {
                      setFilterRole("");
                      setFilterVisitType("");
                      setFilterFile("");
                      setFilterEventType("");
                      setFilterSession("");
                    }}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      isDarkMode
                        ? "bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700"
                        : "bg-slate-100 text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Table */}
            <div className={`overflow-hidden rounded-b-xl border ${
              isDarkMode ? "border-slate-800" : "border-slate-200"
            }`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={isDarkMode ? "bg-slate-800/50" : "bg-slate-50"}>
                      {["#", "Time", "Role", "Patient", "Session", "Event", "Element", "Device", ""].map((h, i) => (
                        <th key={i} className={`px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider ${
                          isDarkMode ? "text-slate-400" : "text-slate-500"
                        }`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDarkMode ? "divide-slate-800" : "divide-slate-100"}`}>
                    {loading ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-12 text-center">
                          <div className={`flex items-center justify-center gap-2 text-xs ${
                            isDarkMode ? "text-slate-500" : "text-slate-400"
                          }`}>
                            <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Loading events...
                          </div>
                        </td>
                      </tr>
                    ) : events.length === 0 ? (
                      <tr>
                        <td colSpan={9} className={`px-4 py-12 text-center text-xs ${
                          isDarkMode ? "text-slate-600" : "text-slate-300"
                        }`}>
                          No events found
                        </td>
                      </tr>
                    ) : (
                      events.map((ev, idx) => (
                        <tr key={ev.id} className="group">
                          <td colSpan={9} className="p-0">
                            <div
                              className={`flex items-center px-3 py-2.5 cursor-pointer transition-colors ${
                                isDarkMode ? "hover:bg-slate-800/50" : "hover:bg-slate-50"
                              }`}
                              onClick={() => setExpandedRow(expandedRow === ev.id ? null : ev.id)}
                            >
                              <div className={`w-10 font-mono text-xs ${isDarkMode ? "text-slate-600" : "text-slate-300"}`}>
                                {page * PAGE_SIZE + idx + 1}
                              </div>
                              <div className="w-36 text-xs whitespace-nowrap">{formatTimestamp(ev.client_timestamp)}</div>
                              <div className="w-20">
                                <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                                  ev.role === "physician"
                                    ? isDarkMode ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-700"
                                    : isDarkMode ? "bg-blue-500/10 text-blue-400" : "bg-blue-50 text-blue-700"
                                }`}>
                                  {ev.role || "patient"}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0 text-xs truncate" title={ev.file}>{truncate(ev.file, 25)}</div>
                              <div className="w-28 font-mono text-xs truncate" title={ev.session_id}>{truncate(ev.session_id, 12)}</div>
                              <div className="w-28">
                                <span
                                  className="inline-block px-1.5 py-0.5 rounded text-xs font-medium"
                                  style={{
                                    backgroundColor: EVENT_TYPE_COLORS[ev.event_type] ? `${EVENT_TYPE_COLORS[ev.event_type]}15` : undefined,
                                    color: EVENT_TYPE_COLORS[ev.event_type] || undefined,
                                  }}
                                >
                                  {ev.event_type}
                                </span>
                              </div>
                              <div className="w-32 text-xs truncate" title={ev.element_id ?? ""}>{truncate(ev.element_id, 20)}</div>
                              <div className="w-16 text-xs">{ev.device_type ?? "—"}</div>
                              <div className={`w-6 text-xs text-center ${isDarkMode ? "text-slate-600" : "text-slate-300"}`}>
                                {expandedRow === ev.id ? "▲" : "▼"}
                              </div>
                            </div>
                            {expandedRow === ev.id && (
                              <div className={`mx-3 mb-3 rounded-lg p-3 text-xs font-mono ${
                                isDarkMode ? "bg-slate-950 border border-slate-800" : "bg-slate-50 border border-slate-100"
                              }`}>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                                  <div><strong className="opacity-50">File:</strong> {ev.file}</div>
                                  <div><strong className="opacity-50">Speaker:</strong> {ev.speaker}</div>
                                  <div><strong className="opacity-50">Element:</strong> {ev.element_id ?? "—"}</div>
                                  <div><strong className="opacity-50">Session:</strong> {ev.session_id}</div>
                                  <div><strong className="opacity-50">Client:</strong> {formatTimestamp(ev.client_timestamp)}</div>
                                  <div><strong className="opacity-50">Server:</strong> {formatTimestamp(ev.created_at)}</div>
                                </div>
                                {ev.event_data && (
                                  <div>
                                    <strong className="opacity-50">Metadata:</strong>
                                    <pre className="mt-1 whitespace-pre-wrap break-all overflow-x-auto">
                                      {JSON.stringify(ev.event_data, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className={`flex items-center justify-between px-4 py-3 border-t ${
                isDarkMode ? "border-slate-800" : "border-slate-100"
              }`}>
                <span className={`text-xs ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>
                  {totalEvents > 0
                    ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, totalEvents)} of ${totalEvents.toLocaleString()}`
                    : "No events"}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    className={`px-2.5 py-1 rounded text-xs font-medium disabled:opacity-20 transition-all ${
                      isDarkMode
                        ? "bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
                        : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"
                    }`}
                  >
                    Prev
                  </button>
                  <span className={`px-2 text-xs tabular-nums ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>
                    {totalPages > 0 ? `${page + 1} / ${totalPages}` : "—"}
                  </span>
                  <button
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => p + 1)}
                    className={`px-2.5 py-1 rounded text-xs font-medium disabled:opacity-20 transition-all ${
                      isDarkMode
                        ? "bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
                        : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"
                    }`}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
