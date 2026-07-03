"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useShallow } from "zustand/react/shallow";

// import PhysicianReports from "@/components/PhysicianReportsModifiedV33";

// import PhysicianReports from "@/components/PhysicianReportsModifiedV35";

// PhysicianReportsModifiedV37 is based on the plan from dr timothy.
// import PhysicianReports from "@/components/PhysicianReportsModifiedV37";

// import PhysicianReports from "@/components/PhysicianReportsModifiedV37Timothy";

// import PhysicianReports from "@/components/PhysicianReportsModifiedV38Timothy";

// import PhysicianReports from "@/components/PhysicianReportsModifiedV39Timothy";

// PhysicianReportsModifiedV39 is based on my own plan.
// import PhysicianReports from "@/components/PhysicianReportsModifiedV39";

import PhysicianReports from "@/components/PhysicianReportsModifiedV41Timothy";

import PatientConsultationReports from "@/components/PatientConsultationReports";

// first meeting patient report component
// import PatientReport from "@/components/PatientInitialVisitReportV29";
// import PatientReportFirstVisit from "@/components/PatientInitialVisitReportV31";
// import PatientReportFirstVisit from "@/components/PatientInitialVisitReportV33";
// import PatientReportFirstVisit from "@/components/PatientInitialVisitReportV37";
// import PatientReportFirstVisit from "@/components/PatientInitialVisitReportV38";
// import PatientReportFirstVisit from "@/components/PatientInitialVisitReportV39";
// import PatientReportFirstVisit from "@/components/PatientInitialVisitReportV40";
import PatientReportFirstVisit from "@/components/PatientInitialVisitReportV41";

// // These below components are the one with feedback from Dr. Timothy
// Modified but not the version where one question appears per page.
// import PatientFollowUpReport from "@/components/PatientFollowUpReportV31";

import PatientFollowUpReport from "@/components/PatientFollowUpReportV31Re";

// second meeting patient report component
// import PatientFollowUpReport from "@/components/PatientFollowUpReportV33";

// import PatientFollowUpReport from "@/components/PatientFollowUpReportV33Re";

// import PatientFollowUpReport from "@/components/PatientFollowUpReportV35";

// import PatientFollowUpReport from "@/components/PatientFollowUpReportV37";

import FilterSidebar from "@/components/FilterSidebarV3";
import Dashboard from "../components/Dashboard";
import ThemeToggle from "@/components/ThemeToggle";
import { DashboardFooter } from "@/components/DashboardFooter";
import { ReportDownload } from "@/components/ReportDownloadNonAIAPI";

import { useWindowSizeStore } from "@/stores/useWindowSizeStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { usePatientId } from "@/stores/usePatientId";
import { useFileId } from "@/stores/useFileId";
import { useDoctorId } from "@/stores/useDoctorId";

import { useTracking } from "@/tracking/hooks";
import { startRecording, stopRecording } from "@/tracking/lib/sessionRecorder";
import APITestDashboard from "@/components/ApiTestDashboard";

// ═══════════════════════════════════════════════════════════
// View Type: decision based on URL parameters
// Patient: ?fileid=xxx&patid=yyy&visit=first|followup
// Doctor:  ?fileid=xxx&doctorid=zzz
// ═══════════════════════════════════════════════════════════
type ViewType = "patient" | "doctor" | "doctorSelect" | "selection";

// Doctor-selection screen: lists doctors (from /api/doctor/list) and links each
// to ?doctorid=<hashed>. Replaces the removed "?doctorid=auto" (= all patients)
// entry so the physician view is always scoped to one doctor.
function DoctorSelectionScreen({ isDarkMode }: { isDarkMode: boolean }) {
  const [doctors, setDoctors] = useState<
    { doctor_id: string; patient_count: number }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/backend/doctor/list`)
      .then((r) => r.json())
      .then((d) => setDoctors(d.doctors || []))
      .catch((e) => console.error("[DoctorSelect] load failed:", e))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div
      className={`min-h-screen p-8 ${
        isDarkMode ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900"
      }`}
    >
      <div className="max-w-2xl mx-auto">
        <a
          href="/"
          className={`text-sm hover:underline ${
            isDarkMode ? "text-slate-400" : "text-slate-500"
          }`}
        >
          ← Back
        </a>
        <h1 className="text-2xl font-bold mt-4 mb-1">Select a physician</h1>
        <p
          className={`text-sm mb-6 ${
            isDarkMode ? "text-slate-400" : "text-slate-500"
          }`}
        >
          Choose a doctor to view only their patients.
        </p>
        {loading ? (
          <p className="text-sm opacity-70">Loading doctors…</p>
        ) : doctors.length === 0 ? (
          <p className="text-sm opacity-70">No doctors found.</p>
        ) : (
          <ul className="space-y-2">
            {doctors.map((d) => (
              <li key={d.doctor_id}>
                <a
                  href={`/?doctorid=${encodeURIComponent(d.doctor_id)}`}
                  className={`flex items-center justify-between rounded-lg border px-4 py-3 transition-all ${
                    isDarkMode
                      ? "border-slate-800 bg-slate-900 hover:bg-slate-800"
                      : "border-slate-200 bg-white hover:bg-slate-50 shadow-sm"
                  }`}
                >
                  <span className="font-medium">Doctor {d.doctor_id}</span>
                  <span className="text-xs opacity-70">
                    {d.patient_count} patient{d.patient_count !== 1 ? "s" : ""}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Visit Type: first visit or follow-up visit
// first:    PatientReportFirstVisit (summary only, no surveys)
// followup: PatientFollowUpReport (with surveys)
// ═══════════════════════════════════════════════════════════
type VisitType = "first" | "followup" | "combined";

// ═══════════════════════════════════════════════════════════
// localStorage key
// ═══════════════════════════════════════════════════════════
const DEV_MODE_KEY = "prostatecancerapp_dev_mode";

export default function Home() {
  const searchParams = useSearchParams();
  const { width, height, setWindowSize } = useWindowSizeStore(
    useShallow((state) => ({
      width: state.width,
      height: state.height,
      setWindowSize: state.setWindowSize,
    }))
  );
  const isDarkMode = useThemeStore((state) => state.isDarkMode);

  // ═══════════════════════════════════════════════════════════
  // controls debug UI visibility
  // ═══════════════════════════════════════════════════════════
  const [isDevMode, setIsDevMode] = useState(false);

  // Patient ID store
  const {
    patientId,
    setPatientId,
    clearPatientId,
    initFromStorage: initPatientFromStorage,
  } = usePatientId(
    useShallow((state) => ({
      patientId: state.patientId,
      setPatientId: state.setPatientId,
      clearPatientId: state.clearPatientId,
      initFromStorage: state.initFromStorage,
    }))
  );

  // File ID store
  const {
    fileId,
    setFileId,
    clearFileId,
    initFromStorage: initFileFromStorage,
  } = useFileId(
    useShallow((state) => ({
      fileId: state.fileId,
      setFileId: state.setFileId,
      clearFileId: state.clearFileId,
      initFromStorage: state.initFromStorage,
    }))
  );

  // ═══════════════════════════════════════════════════════════
  // Doctor ID store
  // ═══════════════════════════════════════════════════════════
  const {
    doctorId,
    setDoctorId,
    clearDoctorId,
    initFromStorage: initDoctorFromStorage,
  } = useDoctorId(
    useShallow((state) => ({
      doctorId: state.doctorId,
      setDoctorId: state.setDoctorId,
      clearDoctorId: state.clearDoctorId,
      initFromStorage: state.initFromStorage,
    }))
  );

  // ═══════════════════════════════════════════════════════════
  // Current view state - patient/doctor/selection
  // ═══════════════════════════════════════════════════════════
  const [currentView, setCurrentView] = useState<ViewType>("selection");

  // ═══════════════════════════════════════════════════════════
  // Visit type state - first visit or follow-up
  // Default: "followup" (for backward compatibility)
  // ═══════════════════════════════════════════════════════════
  const [visitType, setVisitType] = useState<VisitType>("followup");

  // ═══════════════════════════════════════════════════════════
  // Initialize Dev Mode from localStorage
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    const storedDevMode = localStorage.getItem(DEV_MODE_KEY);
    if (storedDevMode === "true") {
      setIsDevMode(true);
      console.log("🛠️ Dev Mode enabled");
    }
  }, []);

  // ═══════════════════════════════════════════════════════════
  // URL parameter handling:
  // ?fileid=xxx&patid=yyy&visit=first|followup
  // OR ?fileid=xxx&doctorid=zzz
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    const fFromUrl = searchParams.get("f");
    const fileIdFromUrl = searchParams.get("fileid");
    const patIdFromUrl = searchParams.get("patid");
    const doctorIdFromUrl = searchParams.get("doctorid");
    const visitTypeFromUrl = searchParams.get("visit"); // legacy
    // Self-descriptive params (new): survey=first-visit|follow-up, view=first-report.
    const surveyFromUrl = searchParams.get("survey");
    const viewFromUrl = searchParams.get("view");
    const combinedFromUrl = searchParams.get("combined") === "1";

    // Minimized URL carries a single stem "?f=<hashedPatient>_<hashedDoctor>_<date>".
    // Reconstruct the full filename (<stem>.csv) and speaker (Patient_<stem>) the
    // stores/APIs expect. Old "?fileid=&patid=" links still work (2nd/3rd branch).
    let reconFileId: string | null = null;
    let reconPatId: string | null = null;
    if (fFromUrl) {
      reconFileId = `${fFromUrl}.csv`;
      reconPatId = `Patient_${fFromUrl}`;
    } else if (fileIdFromUrl) {
      reconFileId = fileIdFromUrl;
      reconPatId =
        patIdFromUrl || `Patient_${fileIdFromUrl.replace(/\.(xlsx|csv)$/i, "")}`;
    } else if (patIdFromUrl) {
      reconPatId = patIdFromUrl;
    }

    console.log("🔍 URL Parameters:", {
      f: fFromUrl,
      fileid: fileIdFromUrl,
      patid: patIdFromUrl,
      doctorid: doctorIdFromUrl,
      visit: visitTypeFromUrl,
      survey: surveyFromUrl,
      view: viewFromUrl,
      combined: combinedFromUrl,
    });

    // Process File ID (common for both views)
    if (reconFileId) {
      setFileId(reconFileId);
      console.log("📁 File ID (reconstructed):", reconFileId);
    } else {
      initFileFromStorage();
    }

    // ═══════════════════════════════════════════════════════════
    // IF Doctor ID is present → Doctor View
    // ═══════════════════════════════════════════════════════════
    if (doctorIdFromUrl) {
      setDoctorId(doctorIdFromUrl);
      clearPatientId(); // Patient ID Clear
      if (!reconFileId) {
        clearFileId(); // No file in URL → start at landing view (all patients)
      }
      setCurrentView("doctor");
      console.log("👨‍⚕️ Doctor ID from URL:", doctorIdFromUrl);
      console.log("🏥 Switching to Doctor View");
    }
    // ═══════════════════════════════════════════════════════════
    // IF Patient ID is present → Patient View
    // ═══════════════════════════════════════════════════════════
    else if (reconPatId) {
      setPatientId(reconPatId);
      clearDoctorId(); // Doctor ID Clear
      setCurrentView("patient");
      console.log("👤 Patient ID from URL:", patIdFromUrl);
      console.log("🏥 Switching to Patient View");

      // ═══════════════════════════════════════════════════════════
      // Process Visit Type: "first" or "followup" (default)
      // ═══════════════════════════════════════════════════════════
      // New self-descriptive params take priority; legacy visit=/mode= still work.
      // Combined is no longer its own visit type — it is the first-visit survey
      // carrying ?combined=1, which chains to the follow-up survey on completion.
      if (surveyFromUrl === "follow-up" || visitTypeFromUrl === "followup") {
        setVisitType("followup");
        console.log("📋 Visit Type: Follow-up Survey");
      } else if (
        surveyFromUrl === "first-visit" ||
        viewFromUrl === "first-report" ||
        visitTypeFromUrl === "first" ||
        visitTypeFromUrl === "combined"
      ) {
        setVisitType("first");
        console.log(
          `📋 Visit Type: First Visit${combinedFromUrl ? " (combined → follow-up)" : ""}`,
        );
      } else {
        setVisitType("followup");
        console.log("📋 Visit Type: Follow-up Survey (default)");
      }
    }
    // ═══ Doctor-selection screen (?select=physician) — pick a doctor, no "auto" ═══
    else if (searchParams.get("select") === "physician") {
      clearDoctorId();
      clearPatientId();
      setCurrentView("doctorSelect");
    }
  }, [
    searchParams,
    setFileId,
    setPatientId,
    setDoctorId,
    clearPatientId,
    clearDoctorId,
    initFileFromStorage,
    initPatientFromStorage,
    initDoctorFromStorage,
  ]);

  useEffect(() => {
    // handler for window size changes
    const handleResize = () => {
      setWindowSize(window.innerWidth, window.innerHeight);
      console.log("Window size changed:", {
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    // Register event listener
    window.addEventListener("resize", handleResize);

    // Remove event listener on component unmount
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [setWindowSize]);

  // User behavior Tracking hook — pass context for backend bridge
  useTracking({
    role: currentView === "doctor" ? "physician" : "patient",
    file: fileId || "",
    speaker: currentView === "doctor" ? (doctorId || "") : (patientId || ""),
    visitType: currentView === "patient" ? visitType : "",
  });

  // rrweb session recording with PHI masking — Pattern A area-aware.
  // Start a new capture whenever the visible view/file changes; tag it with
  // the matching area so admin can filter recordings by interface.
  useEffect(() => {
    if (currentView === "selection") return;
    // [area] First-visit splits into report vs survey. New URLs use
    // ?survey=first-visit; legacy links use ?mode=survey. Both map to the same
    // split tracked in patient_first_behavior (migration 016).
    const isSurveyMode =
      searchParams.get("survey") === "first-visit" ||
      searchParams.get("mode") === "survey";
    let area:
      | "patient_first_report"
      | "patient_first_survey"
      | "patient_followup"
      | "physician"
      | null = null;
    if (currentView === "doctor") area = "physician";
    else if (currentView === "patient" && visitType === "first")
      area = isSurveyMode ? "patient_first_survey" : "patient_first_report";
    else if (currentView === "patient" && visitType === "followup") area = "patient_followup";
    if (!area) return;
    // Record every view even when no patient file is present. Prefer the
    // patient file id, then the doctor id, and finally fall back to the
    // area name so the recording is always tagged with something (e.g. a
    // patient page opened without ?fileid= is tagged "patient_first_report").
    // `area` is always set here, so fileTag is never empty.
    const fileTag = fileId || doctorId || area;
    stopRecording(); // stop previous recording if any
    const sessionId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    startRecording(sessionId, fileTag, area);
    return () => { stopRecording(); };
  }, [currentView, fileId, visitType, searchParams, doctorId]);

  // ═══════════════════════════════════════════════════════════
  // Selection Screen — Patient list + visit type buttons
  // ═══════════════════════════════════════════════════════════
  const [patientList, setPatientList] = useState<any[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);

  useEffect(() => {
    if (currentView === "selection") {
      setLoadingPatients(true);
      // Scope the picker to a doctor when ?doctorid=<id> is present (not "auto").
      const d = searchParams.get("doctorid");
      const filesUrl = d
        ? `/api/backend/patient/files?doctor_id=${encodeURIComponent(d)}`
        : `/api/backend/patient/files`;
      fetch(filesUrl)
        .then((r) => r.json())
        .then((data) => {
          console.log("[SelectionScreen] Patient files loaded:", data);
          setPatientList(data.files || data.patients || []);
        })
        .catch((err) => console.error("[SelectionScreen] Failed to load patients:", err))
        .finally(() => setLoadingPatients(false));
    }
  }, [currentView]);

  const handlePatientSelect = (
    file: string,
    visit: "first" | "followup" | "combined" | "sequential",
    survey = false,
  ) => {
    const stem = file.replace(/\.(xlsx|csv)$/i, "");
    // Self-descriptive URL: the survey type is stated directly.
    //   report        → ?f=<stem>&view=first-report
    //   1st survey     → ?f=<stem>&survey=first-visit
    //   follow-up      → ?f=<stem>&survey=follow-up
    //   combined       → ?f=<stem>&survey=first-visit&combined=1  (chains to
    //                    ?f=<stem>&survey=follow-up&combined=1 when the survey ends)
    const params = new URLSearchParams({ f: stem });
    if (visit === "combined") {
      // Total Survey = one unified follow-up flow (?combined=1). The follow-up
      // re-enables its Risk step and renders the 1st survey (V41) there, so
      // there is no separate first-visit phase.
      params.set("survey", "follow-up");
      params.set("combined", "1");
    } else if (visit === "sequential") {
      // Combined (2-step) = the previous form: the 1st survey runs first as its
      // own screen (?seq=1), then chains to a normal follow-up (?survey=follow-up
      // &seq=1) with the Risk step NOT embedded.
      params.set("survey", "first-visit");
      params.set("seq", "1");
    } else if (visit === "followup") {
      params.set("survey", "follow-up");
    } else if (survey) {
      params.set("survey", "first-visit");
    } else {
      params.set("view", "first-report");
    }
    window.location.href = `/?${params.toString()}`;
  };

  const SelectionScreen = () => (
    <div
      className={`min-h-screen flex flex-col ${
        isDarkMode
          ? "bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950"
          : "bg-gradient-to-br from-slate-50 via-white to-blue-50"
      }`}
    >
      {/* Header */}
      <header className={`border-b backdrop-blur-sm ${
        isDarkMode ? "border-slate-800/60 bg-slate-900/70" : "border-slate-200/60 bg-white/70"
      }`}>
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <h1 className={`text-lg font-semibold tracking-tight ${
            isDarkMode ? "text-slate-100" : "text-slate-900"
          }`}>
            Patient Consultation System
          </h1>
          <div className="flex items-center gap-2">
            <a
              href="/?select=physician"
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                isDarkMode
                  ? "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700"
                  : "bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-slate-200 shadow-sm"
              }`}
            >
              Physician View
            </a>
            <a
              href="/admin/tracking"
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                isDarkMode
                  ? "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700"
                  : "bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-slate-200 shadow-sm"
              }`}
            >
              Admin
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-start justify-center py-12 px-6">
        <div className="w-full max-w-3xl">
          {/* Section Header */}
          <div className="mb-6">
            <h2 className={`text-sm font-semibold uppercase tracking-wider ${
              isDarkMode ? "text-slate-500" : "text-slate-400"
            }`}>
              Patient Records
            </h2>
            <p className={`mt-1 text-sm ${
              isDarkMode ? "text-slate-400" : "text-slate-500"
            }`}>
              Pick a patient, then an entry point: 1st · Report (read-only AI
              summary), 1st · Survey (questionnaire), or Follow-up.
            </p>
          </div>

          {/* Patient List */}
          {loadingPatients ? (
            <div className="flex items-center justify-center py-20">
              <div className={`flex items-center gap-3 ${
                isDarkMode ? "text-slate-400" : "text-slate-500"
              }`}>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm">Loading patients...</span>
              </div>
            </div>
          ) : patientList.length === 0 ? (
            <div className={`text-center py-20 rounded-xl border-2 border-dashed ${
              isDarkMode ? "border-slate-800 text-slate-500" : "border-slate-200 text-slate-400"
            }`}>
              <p className="text-sm">No patients found.</p>
            </div>
          ) : (
            <div className={`rounded-xl overflow-hidden border ${
              isDarkMode ? "border-slate-800 bg-slate-900/50" : "border-slate-200 bg-white shadow-sm"
            }`}>
              <table className="w-full table-fixed">
                <thead>
                  <tr className={isDarkMode ? "bg-slate-800/50" : "bg-slate-50"}>
                    <th className={`w-[34%] px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider ${
                      isDarkMode ? "text-slate-400" : "text-slate-500"
                    }`}>
                      Patient ID
                    </th>
                    <th className={`w-[28%] px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider hidden sm:table-cell ${
                      isDarkMode ? "text-slate-400" : "text-slate-500"
                    }`}>
                      Source File
                    </th>
                    <th className={`w-[38%] px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider ${
                      isDarkMode ? "text-slate-400" : "text-slate-500"
                    }`}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${
                  isDarkMode ? "divide-slate-800" : "divide-slate-100"
                }`}>
                  {patientList.map((file, idx) => {
                    const match = file.match(/sid[\s_-]*(\d+)/i);
                    const label = match
                      ? `SID-${match[1]}`
                      : file
                          .replace(/\.[^.]+$/, "")
                          .replace(/_[^_]+_\d{8}$/, "") // strip 3-part "_<doctor>_<date>"
                          .replace(/_\d{8}$/, ""); // strip legacy 2-part "_<date>"
                    // Hard-truncate the displayed text (auto-layout tables ignore
                    // a child's max-width for long unbreakable hashed names, which
                    // then overflow the overflow-hidden container). Full value on
                    // hover via title.
                    const shorten = (s: string, n = 22) =>
                      s.length > n ? `${s.slice(0, n)}…` : s;
                    const labelShort = shorten(label, 16);
                    const fileShort = shorten(file, 18);
                    return (
                      <tr
                        key={file}
                        className={`group transition-colors ${
                          isDarkMode
                            ? "hover:bg-slate-800/50"
                            : "hover:bg-slate-50/80"
                        }`}
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                              isDarkMode
                                ? "bg-blue-500/10 text-blue-400"
                                : "bg-blue-50 text-blue-600"
                            }`}>
                              {match ? match[1] : (idx + 1)}
                            </div>
                            <span
                              title={label}
                              className={`block truncate max-w-[200px] font-medium text-sm ${
                                isDarkMode ? "text-slate-200" : "text-slate-800"
                              }`}
                            >
                              {labelShort}
                            </span>
                          </div>
                        </td>
                        <td className={`px-5 py-4 hidden sm:table-cell`}>
                          <span
                            title={file}
                            className={`block truncate max-w-[240px] text-xs font-mono ${
                              isDarkMode ? "text-slate-500" : "text-slate-400"
                            }`}
                          >
                            {fileShort}
                          </span>
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2 shrink-0">
                            <button
                              onClick={() => handlePatientSelect(file, "first")}
                              title="First visit — AI summary report (read-only)"
                              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                isDarkMode
                                  ? "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300 border border-blue-500/20"
                                  : "bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800 border border-blue-100"
                              }`}
                            >
                              1st · Report
                            </button>
                            {/* 1st·Survey and Follow-up buttons hidden temporarily (2026-07-02).
                            <button
                              onClick={() => handlePatientSelect(file, "first", true)}
                              title="First visit — survey questionnaire"
                              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                isDarkMode
                                  ? "bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 hover:text-violet-300 border border-violet-500/20"
                                  : "bg-violet-50 text-violet-700 hover:bg-violet-100 hover:text-violet-800 border border-violet-100"
                              }`}
                            >
                              1st · Survey
                            </button>
                            <button
                              onClick={() => handlePatientSelect(file, "followup")}
                              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                isDarkMode
                                  ? "bg-teal-500/10 text-teal-400 hover:bg-teal-500/20 hover:text-teal-300 border border-teal-500/20"
                                  : "bg-teal-50 text-teal-700 hover:bg-teal-100 hover:text-teal-800 border border-teal-100"
                              }`}
                            >
                              Follow-up
                            </button>
                            */}
                            {/* Total Survey entry — 1st survey then follow-up. */}
                            <button
                              onClick={() => handlePatientSelect(file, "combined")}
                              title="Total Survey — 1st·Survey questions, then the Follow-up surveys"
                              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                isDarkMode
                                  ? "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 hover:text-amber-300 border border-amber-500/20"
                                  : "bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800 border border-amber-100"
                              }`}
                            >
                              Total Survey
                            </button>
                            {/* Combined (2-step) — previous form: 1st survey as
                                its own screen, then a normal follow-up (Risk not
                                embedded). Distinct ?seq=1 marker. */}
                            <button
                              onClick={() => handlePatientSelect(file, "sequential")}
                              title="Combined — 1st·Survey screen first, then the Follow-up surveys (2-step)"
                              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                isDarkMode
                                  ? "bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 hover:text-orange-300 border border-orange-500/20"
                                  : "bg-orange-50 text-orange-700 hover:bg-orange-100 hover:text-orange-800 border border-orange-100"
                              }`}
                            >
                              Combined
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Table Footer */}
              <div className={`px-5 py-3 flex items-center justify-between border-t ${
                isDarkMode ? "border-slate-800 bg-slate-800/30" : "border-slate-100 bg-slate-50/50"
              }`}>
                <span className={`text-xs ${
                  isDarkMode ? "text-slate-500" : "text-slate-400"
                }`}>
                  {patientList.length} patient{patientList.length !== 1 ? "s" : ""}
                </span>
                <span className={`text-xs ${
                  isDarkMode ? "text-slate-600" : "text-slate-300"
                }`}>
                  &nbsp;
                </span>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );

  return (
    <div
      className={`flex flex-col min-h-screen ${
        isDarkMode ? "dark bg-gray-900 text-white" : "bg-white text-black"
      }`}
    >
      {/* <FilterSidebar isDarkMode={isDarkMode} /> */}
      {/* `flex-1` so the active view fills the viewport and DashboardFooter
          (rendered as a sibling below) hugs the bottom — fixes the empty
          space that appeared under the footer when the active view's own
          `min-h-screen` no longer matched the outer flex layout. */}
      <div className="flex-1 flex flex-col">
        {/* ═══════════════════════════════════════════════════════════
            Debug UI - Only visible when Dev Mode is enabled
            To enable: localStorage.setItem("prostatecancerapp_dev_mode", "true")
            To disable: localStorage.removeItem("prostatecancerapp_dev_mode")
        ═══════════════════════════════════════════════════════════ */}
        {isDevMode && (
          <div className="fixed top-4 right-4 flex flex-col gap-1 z-50">
            <div
              className={`px-3 py-1 rounded text-sm font-medium ${
                currentView === "doctor"
                  ? "bg-green-600 text-white"
                  : currentView === "patient"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-600 text-white"
              }`}
            >
              {currentView === "doctor"
                ? "🏥 Doctor View"
                : currentView === "patient"
                  ? "🏥 Patient View"
                  : "🏥 Selection"}
            </div>

            {/* Visit Type Badge (Patient View Only) */}
            {currentView === "patient" && (
              <div
                className={`px-3 py-1 rounded text-xs font-medium ${
                  visitType === "first"
                    ? "bg-blue-500 text-white"
                    : "bg-cyan-500 text-white"
                }`}
              >
                {visitType === "first" ? "📋 First Visit" : "📋 Follow-up"}
              </div>
            )}

            {fileId && (
              <div className="bg-purple-600 text-white px-3 py-1 rounded text-xs">
                📁 {fileId}
              </div>
            )}
            {patientId && currentView === "patient" && (
              <div className="bg-blue-500 text-white px-3 py-1 rounded text-xs">
                👤 {patientId}
              </div>
            )}
            {doctorId && currentView === "doctor" && (
              <div className="bg-green-500 text-white px-3 py-1 rounded text-xs">
                👨‍⚕️ {doctorId}
              </div>
            )}
          </div>
        )}

        {/* Theme toggle button */}
        <div className="fixed bottom-8 left-4 right-4 flex justify-between items-center pointer-events-none z-50">
          <div className="pointer-events-auto">
            <ThemeToggle />
          </div>
        </div>


        {/* ═══════════════════════════════════════════════════════
            Conditional Rendering based on currentView and visitType
            - doctor:              PhysicianReports rendering
            - patient + first:     PatientReportFirstVisit rendering
            - patient + followup:  PatientFollowUpReport rendering
            - selection:           SelectionScreen rendering
        ═══════════════════════════════════════════════════════ */}

        {/* Physician report - Doctor View */}
        {currentView === "doctor" && (
          <PhysicianReports isDarkMode={isDarkMode} />
        )}

        {/* Doctor-selection screen (?select=physician) */}
        {currentView === "doctorSelect" && (
          <DoctorSelectionScreen isDarkMode={isDarkMode} />
        )}

        {/* Patient Report - First Visit (report or survey). The survey's
            completion chains to the follow-up via a real URL — carrying the same
            flow marker: ?combined=1 (Total Survey, unused here since it goes
            straight to follow-up) or ?seq=1 (Combined 2-step → normal follow-up). */}
        {currentView === "patient" && visitType === "first" && (
          <PatientReportFirstVisit
            isDarkMode={isDarkMode}
            // Combined 2-step flow (seq=1): the standalone Risk survey is the sole
            // Risk logger, so record it to patient_followup_survey as
            // risk_perception — identical to the Total Survey's embedded Risk.
            // (Not combined=1: there the follow-up embeds Risk itself.)
            trackToFollowup={searchParams.get("seq") === "1"}
            onComplete={
              searchParams.get("seq") === "1"
                ? () => {
                    const f = searchParams.get("f");
                    window.location.href = `/?f=${f}&survey=follow-up&seq=1`;
                  }
                : searchParams.get("combined") === "1"
                  ? () => {
                      const f = searchParams.get("f");
                      window.location.href = `/?f=${f}&survey=follow-up&combined=1`;
                    }
                  : undefined
            }
          />
        )}

        {/* Patient Report - Follow-up Visit (with surveys) */}
        {currentView === "patient" && visitType === "followup" && (
          <PatientFollowUpReport isDarkMode={isDarkMode} />
        )}

        {/* Selection Screen - No URL parameters */}
        {currentView === "selection" && (
          <>
            {/* COMPASS brand header — landing screen only.
                Hidden on Patient first / Patient follow-up / Doctor views
                so those workspaces stay focused. */}
            <header
              className={`border-b px-6 py-3 ${
                isDarkMode
                  ? "border-slate-800 bg-slate-900"
                  : "border-gray-200 bg-white"
              }`}
            >
              <h1
                className={`text-xl font-bold tracking-tight ${
                  isDarkMode ? "text-slate-100" : "text-gray-900"
                }`}
              >
                COMPASS
              </h1>
              <p
                className={`text-xs mt-0.5 ${
                  isDarkMode ? "text-slate-400" : "text-gray-500"
                }`}
              >
                <span className="font-semibold">Com</span>munication of{" "}
                <span className="font-semibold">P</span>rognosis,{" "}
                <span className="font-semibold">A</span>lternatives, and{" "}
                <span className="font-semibold">S</span>ide Effects for{" "}
                <span className="font-semibold">S</span>hared Decision Making
              </p>
            </header>
            <SelectionScreen />
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════
            APITestDashboard - Only visible in Dev Mode
        ═══════════════════════════════════════════════════════════ */}
        {isDevMode && <APITestDashboard />}

        {/* <ReportDownload /> */}
      </div>
      {/* Footer is a sibling of the view container so it always sits at
          the bottom regardless of how short the view content is. */}
      <DashboardFooter />
    </div>
  );
}
