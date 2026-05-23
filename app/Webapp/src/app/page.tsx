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
import PatientReportFirstVisit from "@/components/PatientInitialVisitReportV38";

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
type ViewType = "patient" | "doctor" | "selection";

// ═══════════════════════════════════════════════════════════
// Visit Type: first visit or follow-up visit
// first:    PatientReportFirstVisit (summary only, no surveys)
// followup: PatientFollowUpReport (with surveys)
// ═══════════════════════════════════════════════════════════
type VisitType = "first" | "followup";

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
    const fileIdFromUrl = searchParams.get("fileid");
    const patIdFromUrl = searchParams.get("patid");
    const doctorIdFromUrl = searchParams.get("doctorid");
    const visitTypeFromUrl = searchParams.get("visit");

    console.log("🔍 URL Parameters:", {
      fileid: fileIdFromUrl,
      patid: patIdFromUrl,
      doctorid: doctorIdFromUrl,
      visit: visitTypeFromUrl,
    });

    // Process File ID (common for both views)
    if (fileIdFromUrl) {
      setFileId(fileIdFromUrl);
      console.log("📁 File ID from URL:", fileIdFromUrl);
    } else {
      initFileFromStorage();
    }

    // ═══════════════════════════════════════════════════════════
    // IF Doctor ID is present → Doctor View
    // ═══════════════════════════════════════════════════════════
    if (doctorIdFromUrl) {
      setDoctorId(doctorIdFromUrl);
      clearPatientId(); // Patient ID Clear
      if (!fileIdFromUrl) {
        clearFileId(); // No fileid in URL → start at landing view (all patients)
      }
      setCurrentView("doctor");
      console.log("👨‍⚕️ Doctor ID from URL:", doctorIdFromUrl);
      console.log("🏥 Switching to Doctor View");
    }
    // ═══════════════════════════════════════════════════════════
    // IF Patient ID is present → Patient View
    // ═══════════════════════════════════════════════════════════
    else if (patIdFromUrl) {
      setPatientId(patIdFromUrl);
      clearDoctorId(); // Doctor ID Clear
      setCurrentView("patient");
      console.log("👤 Patient ID from URL:", patIdFromUrl);
      console.log("🏥 Switching to Patient View");

      // ═══════════════════════════════════════════════════════════
      // Process Visit Type: "first" or "followup" (default)
      // ═══════════════════════════════════════════════════════════
      if (visitTypeFromUrl === "first") {
        setVisitType("first");
        console.log("📋 Visit Type: First Visit (summary only)");
      } else {
        setVisitType("followup");
        console.log("📋 Visit Type: Follow-up Visit (with surveys)");
      }
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
    if (currentView === "selection" || !fileId) return;
    let area: "patient_first" | "patient_followup" | "doctor" | null = null;
    if (currentView === "doctor") area = "doctor";
    else if (currentView === "patient" && visitType === "first") area = "patient_first";
    else if (currentView === "patient" && visitType === "followup") area = "patient_followup";
    if (!area) return;
    stopRecording(); // stop previous recording if any
    const sessionId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    startRecording(sessionId, fileId, area);
    return () => { stopRecording(); };
  }, [currentView, fileId, visitType]);

  // ═══════════════════════════════════════════════════════════
  // Selection Screen — Patient list + visit type buttons
  // ═══════════════════════════════════════════════════════════
  const [patientList, setPatientList] = useState<any[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);

  useEffect(() => {
    if (currentView === "selection") {
      setLoadingPatients(true);
      fetch(`/api/backend/patient/files`)
        .then((r) => r.json())
        .then((data) => {
          console.log("[SelectionScreen] Patient files loaded:", data);
          setPatientList(data.files || data.patients || []);
        })
        .catch((err) => console.error("[SelectionScreen] Failed to load patients:", err))
        .finally(() => setLoadingPatients(false));
    }
  }, [currentView]);

  const handlePatientSelect = (file: string, visit: "first" | "followup") => {
    const stem = file.replace(/\.(xlsx|csv)$/i, "");
    const speaker = `Patient_${stem}`;
    // Navigate with URL parameters (same format as before)
    const params = new URLSearchParams({
      fileid: file,
      patid: speaker,
      visit: visit,
    });
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
              href="/?doctorid=auto"
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
              Select a patient to view their consultation report.
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
              <table className="w-full">
                <thead>
                  <tr className={isDarkMode ? "bg-slate-800/50" : "bg-slate-50"}>
                    <th className={`px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider ${
                      isDarkMode ? "text-slate-400" : "text-slate-500"
                    }`}>
                      Patient ID
                    </th>
                    <th className={`px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider hidden sm:table-cell ${
                      isDarkMode ? "text-slate-400" : "text-slate-500"
                    }`}>
                      Source File
                    </th>
                    <th className={`px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider ${
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
                    const label = match ? `SID-${match[1]}` : file;
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
                            <span className={`font-medium text-sm ${
                              isDarkMode ? "text-slate-200" : "text-slate-800"
                            }`}>
                              {label}
                            </span>
                          </div>
                        </td>
                        <td className={`px-5 py-4 hidden sm:table-cell`}>
                          <span className={`text-xs font-mono ${
                            isDarkMode ? "text-slate-500" : "text-slate-400"
                          }`}>
                            {file}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handlePatientSelect(file, "first")}
                              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                isDarkMode
                                  ? "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300 border border-blue-500/20"
                                  : "bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800 border border-blue-100"
                              }`}
                            >
                              First Visit
                            </button>
                            {/* Follow-up entry button (restored 2026-05-22). */}
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

        {/* Patient Report - First Visit (summary only, no surveys) */}
        {currentView === "patient" && visitType === "first" && (
          <PatientReportFirstVisit isDarkMode={isDarkMode} />
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
