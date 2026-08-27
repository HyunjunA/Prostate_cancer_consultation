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
// import PatientReportFirstVisit from "@/components/PatientInitialVisitReportV40";
// import PatientReportFirstVisit from "@/components/PatientInitialVisitReportV41";
import PatientReportFirstVisit from "@/components/PatientInitialVisitReportV42";

// // These below components are the one with feedback from Dr. Timothy
// Modified but not the version where one question appears per page.
// import PatientFollowUpReport from "@/components/PatientFollowUpReportV31";

// import PatientFollowUpReport from "@/components/PatientFollowUpReportV31Re";

// second meeting patient report component
// import PatientFollowUpReport from "@/components/PatientFollowUpReportV33";

// import PatientFollowUpReport from "@/components/PatientFollowUpReportV33Re";

// import PatientFollowUpReport from "@/components/PatientFollowUpReportV35";

// import PatientFollowUpReport from "@/components/PatientFollowUpReportV37";

// V38: one-way (forward-only) navigation for the Total Survey (elderly-friendly).
// Copied from V31Re; V31Re preserved above, re-enable by swapping the imports.
import PatientFollowUpReport from "@/components/PatientFollowUpReportV38";

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
// "selection" is the public landing screen shown when no patient/doctor
// parameter is present. It carries no index of patients or doctors — those
// moved behind the admin login on 2026-08-27 (/admin/patients,
// /admin/physicians). See src/middleware.ts for the gate.
type ViewType = "patient" | "doctor" | "selection";

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
    // Anything else (including a bare "/") stays on the public landing screen.
    // The physician roster used to live here behind ?select=physician; it is now
    // at /admin/physicians, behind the admin login.
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
    // split tracked in patient_report_page_behavior (migration 016).
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
  // Public landing screen — rendered when the URL carries no patient or
  // doctor parameter. It deliberately lists nothing: the browsable patient
  // and physician indexes moved behind the admin login on 2026-08-27
  // (/admin/patients, /admin/physicians). Patients and physicians still
  // reach their own pages through the personal link they were given, which
  // is a public "/?f=..." / "/?doctorid=..." URL handled above.
  // ═══════════════════════════════════════════════════════════
  const SelectionScreen = () => (
    <div
      className={`min-h-screen flex flex-col ${
        isDarkMode
          ? "bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950"
          : "bg-gradient-to-br from-slate-50 via-white to-blue-50"
      }`}
    >
      {/* Header */}
      <header
        className={`border-b backdrop-blur-sm ${
          isDarkMode
            ? "border-slate-800/60 bg-slate-900/70"
            : "border-slate-200/60 bg-white/70"
        }`}
      >
        <div className="max-w-6xl mx-auto px-6 py-5">
          <h1
            className={`text-lg font-semibold tracking-tight ${
              isDarkMode ? "text-slate-100" : "text-slate-900"
            }`}
          >
            Patient Consultation System
          </h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-start justify-center py-16 px-6">
        <div className="w-full max-w-xl text-center">
          <p
            className={`text-base ${
              isDarkMode ? "text-slate-300" : "text-slate-700"
            }`}
          >
            This page is accessed through the personal link you were given.
          </p>
          <p
            className={`mt-3 text-sm ${
              isDarkMode ? "text-slate-400" : "text-slate-500"
            }`}
          >
            If you have a link, please open it directly. If you reached this page
            by mistake, you can close this window.
          </p>
          <a
            href="/admin/login"
            className={`mt-10 inline-block text-xs transition-colors ${
              isDarkMode
                ? "text-slate-500 hover:text-slate-300"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            Staff sign-in →
          </a>
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

        {/* Patient Report - First Visit (report or survey). The survey's
            completion chains to the follow-up via a real URL — carrying the same
            flow marker: ?combined=1 (Total Survey, unused here since it goes
            straight to follow-up) or ?seq=1 (Combined 2-step → normal follow-up). */}
        {currentView === "patient" && visitType === "first" && (
          <PatientReportFirstVisit
            isDarkMode={isDarkMode}
            // Combined 2-step flow (seq=1): the standalone Risk survey is the sole
            // Risk logger, so record it to patient_followup_survey_page_behavior as
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
