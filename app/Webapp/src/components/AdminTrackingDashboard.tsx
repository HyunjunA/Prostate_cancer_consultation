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
}

interface TrackingStats {
  total_events: number;
  total_sessions: number;
  total_patients: number;
  total_event_types: number;
  event_type_counts: Record<string, number>;
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

type TabId = "overview" | "sessions" | "elements" | "events";

// ══════════════════════════════════════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════════════════════════════════════

export default function AdminTrackingDashboard() {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);

  // Data state
  const [stats, setStats] = useState<TrackingStats | null>(null);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [events, setEvents] = useState<TrackingEvent[]>([]);
  const [totalEvents, setTotalEvents] = useState(0);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);

  // Filter state
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

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/tracking/stats`, {
        headers: getHeaders(),
      });
      if (res.ok) setStats(await res.json());
    } catch (e) {
      console.error("[Admin] Failed to fetch stats:", e);
    }
  }, []);

  const fetchPatients = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/tracking/patients`, {
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setPatients(data.patients || []);
      }
    } catch (e) {
      console.error("[Admin] Failed to fetch patients:", e);
    }
  }, []);

  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/tracking/analytics`, {
        headers: getHeaders(),
      });
      if (res.ok) setAnalytics(await res.json());
    } catch (e) {
      console.error("[Admin] Failed to fetch analytics:", e);
    }
  }, []);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
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
  }, [filterFile, filterEventType, filterSession, page]);

  // ────────────────────────────────────────────────────────────────────────────
  // Effects
  // ────────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchStats();
    fetchPatients();
    fetchAnalytics();
  }, [fetchStats, fetchPatients, fetchAnalytics]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    setPage(0);
  }, [filterFile, filterEventType, filterSession]);

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
    fetchEvents();
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Styles
  // ────────────────────────────────────────────────────────────────────────────

  const bg = isDarkMode ? "bg-gray-900 text-gray-100" : "bg-gray-50 text-gray-900";
  const cardBg = isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200";
  const tableBg = isDarkMode ? "bg-gray-800" : "bg-white";
  const tableHeaderBg = isDarkMode ? "bg-gray-700 text-gray-200" : "bg-gray-100 text-gray-700";
  const tableRowHover = isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-50";
  const inputBg = isDarkMode
    ? "bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400"
    : "bg-white border-gray-300 text-gray-900 placeholder-gray-500";
  const badgeBg = isDarkMode ? "bg-gray-600 text-gray-200" : "bg-gray-200 text-gray-700";
  const chartTextColor = isDarkMode ? "#9ca3af" : "#6b7280";
  const chartGridColor = isDarkMode ? "#374151" : "#e5e7eb";

  const tabClass = (tab: TabId) =>
    `px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium rounded-t-lg transition-colors ${
      activeTab === tab
        ? isDarkMode
          ? "bg-gray-800 text-white border-b-2 border-blue-500"
          : "bg-white text-gray-900 border-b-2 border-blue-600"
        : isDarkMode
          ? "text-gray-400 hover:text-gray-200"
          : "text-gray-500 hover:text-gray-700"
    }`;

  // ────────────────────────────────────────────────────────────────────────────
  // Custom tooltip
  // ────────────────────────────────────────────────────────────────────────────

  const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div
        className={`rounded-lg shadow-lg p-3 text-xs border ${
          isDarkMode ? "bg-gray-800 border-gray-600 text-gray-200" : "bg-white border-gray-200 text-gray-800"
        }`}
      >
        <div className="font-medium mb-1">{label}</div>
        {payload.map((entry: any, i: number) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="opacity-70">{entry.name || entry.dataKey}:</span>
            <span className="font-medium">{entry.value}</span>
          </div>
        ))}
      </div>
    );
  };

  // ────────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────────

  return (
    <div className={`min-h-screen p-3 sm:p-4 lg:p-6 ${bg}`}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 sm:mb-6 gap-3">
          <div>
            <h1 className="text-lg sm:text-xl lg:text-2xl font-bold">User Interaction Tracking Dashboard</h1>
            <p className="text-sm opacity-50 mt-1">
              Real-time analytics from user_interaction_log
            </p>
          </div>
          <div className="flex gap-2">
            <a
              href="/"
              className={`px-3 py-2 rounded-md text-sm transition-colors ${
                isDarkMode ? "bg-gray-700 hover:bg-gray-600" : "bg-gray-200 hover:bg-gray-300"
              }`}
            >
              Back to Home
            </a>
            <button
              onClick={refreshAll}
              className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Refresh All
            </button>
          </div>
        </div>

        {/* ── Stats Cards ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 lg:gap-4 mb-4 sm:mb-6">
          {[
            { label: "Total Events", value: stats?.total_events ?? "—", color: "text-blue-500" },
            { label: "Sessions", value: stats?.total_sessions ?? "—", color: "text-green-500" },
            { label: "Patients", value: stats?.total_patients ?? "—", color: "text-purple-500" },
            { label: "Event Types", value: stats?.total_event_types ?? "—", color: "text-amber-500" },
          ].map((card) => (
            <div key={card.label} className={`rounded-lg border p-3 sm:p-4 ${cardBg}`}>
              <div className={`text-xl sm:text-2xl lg:text-3xl font-bold ${card.color}`}>{card.value}</div>
              <div className="text-sm opacity-60 mt-1">{card.label}</div>
            </div>
          ))}
        </div>

        {/* ── Tabs ────────────────────────────────────────────────────────── */}
        <div className="flex gap-1 mb-0 overflow-x-auto">
          {(
            [
              { id: "overview", label: "Overview" },
              { id: "sessions", label: "Sessions" },
              { id: "elements", label: "Elements" },
              { id: "events", label: "Event Log" },
            ] as { id: TabId; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              className={tabClass(tab.id)}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* TAB: Overview                                                  */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {activeTab === "overview" && (
          <div className="space-y-6 mt-0">
            {/* Row 1: Timeline + Event Type Pie */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Activity Timeline */}
              <div className={`lg:col-span-2 rounded-lg border p-3 sm:p-4 lg:p-5 ${cardBg}`}>
                <h2 className="text-xs sm:text-sm font-semibold mb-3 sm:mb-4 opacity-80">
                  Activity Timeline (events/hour)
                </h2>
                <div className="h-48 sm:h-56 lg:h-64">
                  {timelineData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={timelineData}>
                        <defs>
                          <linearGradient id="colorEvents" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 11, fill: chartTextColor }}
                          axisLine={{ stroke: chartGridColor }}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: chartTextColor }}
                          axisLine={{ stroke: chartGridColor }}
                          allowDecimals={false}
                        />
                        <Tooltip content={<ChartTooltip />} />
                        <Area
                          type="monotone"
                          dataKey="count"
                          stroke="#3b82f6"
                          strokeWidth={2}
                          fill="url(#colorEvents)"
                          name="Events"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center opacity-40">
                      No timeline data
                    </div>
                  )}
                </div>
              </div>

              {/* Event Type Distribution */}
              <div className={`rounded-lg border p-3 sm:p-4 lg:p-5 ${cardBg}`}>
                <h2 className="text-xs sm:text-sm font-semibold mb-3 sm:mb-4 opacity-80">
                  Event Type Distribution
                </h2>
                <div className="h-48 sm:h-56 lg:h-64">
                  {eventTypePieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={eventTypePieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={80}
                          dataKey="value"
                          nameKey="name"
                          stroke="none"
                        >
                          {eventTypePieData.map((entry, idx) => (
                            <Cell
                              key={idx}
                              fill={entry.color || CHART_COLORS[idx % CHART_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                        <Legend
                          wrapperStyle={{ fontSize: 11, color: chartTextColor }}
                          iconSize={8}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center opacity-40">
                      No data
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Row 2: Patient Breakdown + Hourly Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Events by Patient (Stacked Bar) */}
              <div className={`rounded-lg border p-3 sm:p-4 lg:p-5 ${cardBg}`}>
                <h2 className="text-xs sm:text-sm font-semibold mb-3 sm:mb-4 opacity-80">
                  Events by Patient (by type)
                </h2>
                <div className="h-48 sm:h-56 lg:h-64">
                  {patientBarData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={patientBarData} layout="vertical">
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke={chartGridColor}
                          horizontal={false}
                        />
                        <XAxis
                          type="number"
                          tick={{ fontSize: 11, fill: chartTextColor }}
                          axisLine={{ stroke: chartGridColor }}
                          allowDecimals={false}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          tick={{ fontSize: 11, fill: chartTextColor }}
                          width={80}
                          axisLine={{ stroke: chartGridColor }}
                        />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend
                          wrapperStyle={{ fontSize: 11, color: chartTextColor }}
                          iconSize={8}
                        />
                        {patientBarKeys.map((key, idx) => (
                          <Bar
                            key={key}
                            dataKey={key}
                            stackId="a"
                            fill={
                              EVENT_TYPE_COLORS[key] ||
                              CHART_COLORS[idx % CHART_COLORS.length]
                            }
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center opacity-40">
                      No data
                    </div>
                  )}
                </div>
              </div>

              {/* Hourly Activity Heatmap */}
              <div className={`rounded-lg border p-3 sm:p-4 lg:p-5 ${cardBg}`}>
                <h2 className="text-xs sm:text-sm font-semibold mb-3 sm:mb-4 opacity-80">
                  Activity by Hour of Day
                </h2>
                <div className="h-48 sm:h-56 lg:h-64">
                  {hourlyData.some((h) => h.count > 0) ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={hourlyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                        <XAxis
                          dataKey="hour"
                          tick={{ fontSize: 10, fill: chartTextColor }}
                          axisLine={{ stroke: chartGridColor }}
                          interval={1}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: chartTextColor }}
                          axisLine={{ stroke: chartGridColor }}
                          allowDecimals={false}
                        />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="count" name="Events" radius={[3, 3, 0, 0]}>
                          {hourlyData.map((entry, idx) => (
                            <Cell
                              key={idx}
                              fill={
                                entry.count > 0
                                  ? `rgba(59, 130, 246, ${Math.min(0.3 + (entry.count / Math.max(...hourlyData.map((h) => h.count))) * 0.7, 1)})`
                                  : isDarkMode
                                    ? "#374151"
                                    : "#e5e7eb"
                              }
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center opacity-40">
                      No data
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Row 3: Device Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className={`rounded-lg border p-3 sm:p-4 lg:p-5 ${cardBg}`}>
                <h2 className="text-xs sm:text-sm font-semibold mb-3 sm:mb-4 opacity-80">
                  Device Breakdown
                </h2>
                <div className="h-48">
                  {analytics?.device_breakdown && analytics.device_breakdown.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={analytics.device_breakdown}
                          cx="50%"
                          cy="50%"
                          outerRadius={65}
                          dataKey="count"
                          nameKey="device"
                          label={({ device, percent }) =>
                            `${device} ${(percent * 100).toFixed(0)}%`
                          }
                          labelLine={false}
                          stroke="none"
                        >
                          {analytics.device_breakdown.map((_, idx) => (
                            <Cell
                              key={idx}
                              fill={CHART_COLORS[idx % CHART_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center opacity-40">
                      No data
                    </div>
                  )}
                </div>
              </div>

              {/* Event type counts list */}
              <div className={`lg:col-span-2 rounded-lg border p-3 sm:p-4 lg:p-5 ${cardBg}`}>
                <h2 className="text-xs sm:text-sm font-semibold mb-3 sm:mb-4 opacity-80">
                  Event Type Breakdown
                </h2>
                <div className="space-y-2">
                  {stats &&
                    Object.entries(stats.event_type_counts).map(([type, count]) => {
                      const pct = stats.total_events
                        ? (count / stats.total_events) * 100
                        : 0;
                      return (
                        <div key={type} className="flex items-center gap-3">
                          <div className="w-28 text-xs font-medium truncate">{type}</div>
                          <div className="flex-1 h-5 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${pct}%`,
                                backgroundColor:
                                  EVENT_TYPE_COLORS[type] || CHART_COLORS[0],
                              }}
                            />
                          </div>
                          <div className="w-16 text-xs text-right font-mono">
                            {count}{" "}
                            <span className="opacity-50">({pct.toFixed(0)}%)</span>
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
        {/* TAB: Sessions                                                  */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {activeTab === "sessions" && (
          <div className={`rounded-lg border overflow-hidden mt-0 ${cardBg}`}>
            <div className="overflow-x-auto">
              <table className={`w-full text-sm ${tableBg}`}>
                <thead>
                  <tr className={tableHeaderBg}>
                    <th className="px-2 py-2 sm:px-4 sm:py-3 text-left font-medium">Session ID</th>
                    <th className="px-2 py-2 sm:px-4 sm:py-3 text-left font-medium">Patient</th>
                    <th className="px-2 py-2 sm:px-4 sm:py-3 text-left font-medium">Device</th>
                    <th className="px-2 py-2 sm:px-4 sm:py-3 text-right font-medium">Events</th>
                    <th className="px-2 py-2 sm:px-4 sm:py-3 text-left font-medium">Start</th>
                    <th className="px-2 py-2 sm:px-4 sm:py-3 text-left font-medium">End</th>
                    <th className="px-2 py-2 sm:px-4 sm:py-3 text-right font-medium">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {analytics?.sessions && analytics.sessions.length > 0 ? (
                    analytics.sessions.map((s) => (
                      <tr
                        key={s.session_id}
                        className={`${tableRowHover} cursor-pointer transition-colors`}
                        onClick={() => {
                          setFilterSession(s.session_id);
                          setActiveTab("events");
                        }}
                      >
                        <td className="px-4 py-2 font-mono text-xs">
                          {truncate(s.session_id, 20)}
                        </td>
                        <td className="px-4 py-2" title={s.file}>
                          {truncate(s.file, 30)}
                        </td>
                        <td className="px-4 py-2">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs ${badgeBg}`}>
                            {s.device_type || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right font-medium">
                          {s.event_count}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-xs">
                          {formatTimestamp(s.first_event)}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-xs">
                          {formatTimestamp(s.last_event)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-xs">
                          {formatDuration(s.duration_sec)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center opacity-50">
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
          <div className="space-y-6 mt-0">
            {/* Top Elements Bar Chart */}
            <div className={`rounded-lg border p-3 sm:p-4 lg:p-5 ${cardBg}`}>
              <h2 className="text-xs sm:text-sm font-semibold mb-3 sm:mb-4 opacity-80">
                Most Interacted Elements (Top 20)
              </h2>
              <div className="h-80">
                {analytics?.top_elements && analytics.top_elements.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={analytics.top_elements.map((el) => ({
                        name: el.element_id.length > 25
                          ? el.element_id.slice(0, 25) + "…"
                          : el.element_id,
                        fullName: el.element_id,
                        count: el.count,
                        event_type: el.event_type,
                      }))}
                      layout="vertical"
                      margin={{ left: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11, fill: chartTextColor }}
                        axisLine={{ stroke: chartGridColor }}
                        allowDecimals={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fontSize: 10, fill: chartTextColor }}
                        width={180}
                        axisLine={{ stroke: chartGridColor }}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="count" name="Interactions" radius={[0, 4, 4, 0]}>
                        {analytics.top_elements.map((el, idx) => (
                          <Cell
                            key={idx}
                            fill={
                              EVENT_TYPE_COLORS[el.event_type] ||
                              CHART_COLORS[idx % CHART_COLORS.length]
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center opacity-40">
                    No element data
                  </div>
                )}
              </div>
            </div>

            {/* Elements Table */}
            <div className={`rounded-lg border overflow-hidden ${cardBg}`}>
              <div className="overflow-x-auto">
                <table className={`w-full text-sm ${tableBg}`}>
                  <thead>
                    <tr className={tableHeaderBg}>
                      <th className="px-2 py-2 sm:px-4 sm:py-3 text-left font-medium">#</th>
                      <th className="px-2 py-2 sm:px-4 sm:py-3 text-left font-medium">Element ID</th>
                      <th className="px-2 py-2 sm:px-4 sm:py-3 text-left font-medium">Event Type</th>
                      <th className="px-2 py-2 sm:px-4 sm:py-3 text-right font-medium">Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {analytics?.top_elements?.map((el, idx) => (
                      <tr key={`${el.element_id}-${el.event_type}`} className={tableRowHover}>
                        <td className="px-4 py-2 font-mono text-xs opacity-50">{idx + 1}</td>
                        <td className="px-4 py-2 font-mono text-xs">{el.element_id}</td>
                        <td className="px-4 py-2">
                          <span
                            className="inline-block px-2 py-0.5 rounded text-xs font-medium"
                            style={{
                              backgroundColor: EVENT_TYPE_COLORS[el.event_type]
                                ? `${EVENT_TYPE_COLORS[el.event_type]}20`
                                : undefined,
                              color: EVENT_TYPE_COLORS[el.event_type] || undefined,
                            }}
                          >
                            {el.event_type}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right font-bold">{el.count}</td>
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
          <div className="space-y-0 mt-0">
            {/* Filters */}
            <div className={`rounded-t-lg border border-b-0 p-4 ${cardBg}`}>
              <div className="flex flex-wrap gap-3 sm:gap-4 items-end">
                <div className="flex flex-col w-full sm:w-auto">
                  <label className="text-xs font-medium mb-1 opacity-70">Patient</label>
                  <select
                    value={filterFile}
                    onChange={(e) => setFilterFile(e.target.value)}
                    className={`rounded-md border px-3 py-2 text-sm w-full sm:w-auto ${inputBg}`}
                  >
                    <option value="">All patients</option>
                    {patients.map((p) => (
                      <option key={p.file} value={p.file}>
                        {p.file} ({p.event_count})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col w-full sm:w-auto">
                  <label className="text-xs font-medium mb-1 opacity-70">Event Type</label>
                  <select
                    value={filterEventType}
                    onChange={(e) => setFilterEventType(e.target.value)}
                    className={`rounded-md border px-3 py-2 text-sm w-full sm:w-auto ${inputBg}`}
                  >
                    <option value="">All types</option>
                    {stats &&
                      Object.entries(stats.event_type_counts).map(([type, count]) => (
                        <option key={type} value={type}>
                          {type} ({count})
                        </option>
                      ))}
                  </select>
                </div>
                <div className="flex flex-col w-full sm:w-auto">
                  <label className="text-xs font-medium mb-1 opacity-70">Session ID</label>
                  <input
                    type="text"
                    value={filterSession}
                    onChange={(e) => setFilterSession(e.target.value)}
                    placeholder="Filter by session…"
                    className={`rounded-md border px-3 py-2 text-sm w-full sm:w-52 ${inputBg}`}
                  />
                </div>
                {(filterFile || filterEventType || filterSession) && (
                  <button
                    onClick={() => {
                      setFilterFile("");
                      setFilterEventType("");
                      setFilterSession("");
                    }}
                    className={`px-3 py-2 rounded-md text-sm transition-colors ${
                      isDarkMode ? "bg-gray-700 hover:bg-gray-600" : "bg-gray-200 hover:bg-gray-300"
                    }`}
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            </div>

            {/* Table */}
            <div className={`rounded-b-lg border overflow-hidden ${cardBg}`}>
              <div className="overflow-x-auto">
                <table className={`w-full text-sm ${tableBg}`}>
                  <thead>
                    <tr className={tableHeaderBg}>
                      <th className="px-2 py-2 sm:px-4 sm:py-3 text-left font-medium">#</th>
                      <th className="px-2 py-2 sm:px-4 sm:py-3 text-left font-medium">Time</th>
                      <th className="px-2 py-2 sm:px-4 sm:py-3 text-left font-medium">Patient</th>
                      <th className="px-2 py-2 sm:px-4 sm:py-3 text-left font-medium">Session</th>
                      <th className="px-2 py-2 sm:px-4 sm:py-3 text-left font-medium">Event Type</th>
                      <th className="px-2 py-2 sm:px-4 sm:py-3 text-left font-medium">Element</th>
                      <th className="px-2 py-2 sm:px-4 sm:py-3 text-left font-medium">Device</th>
                      <th className="px-2 py-2 sm:px-4 sm:py-3 text-left font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {loading ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center opacity-50">
                          Loading…
                        </td>
                      </tr>
                    ) : events.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center opacity-50">
                          No events found
                        </td>
                      </tr>
                    ) : (
                      events.map((ev, idx) => (
                        <>
                          <tr
                            key={ev.id}
                            className={`${tableRowHover} cursor-pointer transition-colors`}
                            onClick={() =>
                              setExpandedRow(expandedRow === ev.id ? null : ev.id)
                            }
                          >
                            <td className="px-4 py-2 font-mono text-xs opacity-50">
                              {page * PAGE_SIZE + idx + 1}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap">
                              {formatTimestamp(ev.client_timestamp)}
                            </td>
                            <td className="px-4 py-2" title={ev.file}>
                              {truncate(ev.file, 25)}
                            </td>
                            <td
                              className="px-4 py-2 font-mono text-xs"
                              title={ev.session_id}
                            >
                              {truncate(ev.session_id, 12)}
                            </td>
                            <td className="px-4 py-2">
                              <span
                                className="inline-block px-2 py-0.5 rounded text-xs font-medium"
                                style={{
                                  backgroundColor: EVENT_TYPE_COLORS[ev.event_type]
                                    ? `${EVENT_TYPE_COLORS[ev.event_type]}20`
                                    : undefined,
                                  color: EVENT_TYPE_COLORS[ev.event_type] || undefined,
                                }}
                              >
                                {ev.event_type}
                              </span>
                            </td>
                            <td className="px-4 py-2" title={ev.element_id ?? ""}>
                              {truncate(ev.element_id, 25)}
                            </td>
                            <td className="px-4 py-2 text-xs">
                              {ev.device_type ?? "—"}
                            </td>
                            <td className="px-4 py-2 text-xs opacity-50">
                              {expandedRow === ev.id ? "▲" : "▼"}
                            </td>
                          </tr>
                          {expandedRow === ev.id && (
                            <tr key={`${ev.id}-detail`}>
                              <td colSpan={8} className="px-2 py-2 sm:px-4 sm:py-3">
                                <div
                                  className={`rounded p-3 text-xs font-mono overflow-x-auto ${
                                    isDarkMode ? "bg-gray-900" : "bg-gray-100"
                                  }`}
                                >
                                  <div className="grid grid-cols-2 gap-2 mb-2">
                                    <div>
                                      <strong>Full File:</strong> {ev.file}
                                    </div>
                                    <div>
                                      <strong>Speaker:</strong> {ev.speaker}
                                    </div>
                                    <div>
                                      <strong>Element ID:</strong>{" "}
                                      {ev.element_id ?? "—"}
                                    </div>
                                    <div>
                                      <strong>Session:</strong> {ev.session_id}
                                    </div>
                                    <div>
                                      <strong>Client Time:</strong>{" "}
                                      {formatTimestamp(ev.client_timestamp)}
                                    </div>
                                    <div>
                                      <strong>Server Time:</strong>{" "}
                                      {formatTimestamp(ev.created_at)}
                                    </div>
                                  </div>
                                  {ev.event_data && (
                                    <div>
                                      <strong>Metadata:</strong>
                                      <pre className="mt-1 whitespace-pre-wrap break-all">
                                        {JSON.stringify(ev.event_data, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div
                className={`flex items-center justify-between px-2 py-2 sm:px-4 sm:py-3 border-t ${
                  isDarkMode ? "border-gray-700" : "border-gray-200"
                }`}
              >
                <div className="text-sm opacity-60">
                  {totalEvents > 0
                    ? `Showing ${page * PAGE_SIZE + 1}–${Math.min(
                        (page + 1) * PAGE_SIZE,
                        totalEvents,
                      )} of ${totalEvents}`
                    : "No events"}
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    className="px-2 py-1 sm:px-3 rounded border text-xs sm:text-sm disabled:opacity-30 hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Prev
                  </button>
                  <span className="px-2 py-1 sm:px-3 text-xs sm:text-sm">
                    {totalPages > 0 ? `${page + 1} / ${totalPages}` : "—"}
                  </span>
                  <button
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-2 py-1 sm:px-3 rounded border text-xs sm:text-sm disabled:opacity-30 hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
