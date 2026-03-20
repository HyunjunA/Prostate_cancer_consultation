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
import PatientReportFirstVisit from "@/components/PatientInitialVisitReportV35";

// // These below components are the one with feedback from Dr. Timothy
// 수정되었으나 한질문이 한페이지에 나오는 버전은 아님.
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
import BetaConsentMoal from "@/components/BetaConsentModal";
import BetaConsentModalNonAIAPI from "@/components/BetaConsentModalNonAIAPI";

import { DashboardFooter } from "@/components/DashboardFooter";
import { ReportDownload } from "@/components/ReportDownloadNonAIAPI";

import { useWindowSizeStore } from "@/stores/useWindowSizeStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { usePatientId } from "@/stores/usePatientId";
import { useFileId } from "@/stores/useFileId";
import { useDoctorId } from "@/stores/useDoctorId";

import { useTracking } from "@/tracking/hooks";
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

  // User behavior Tracking hook
  useTracking();

  // ═══════════════════════════════════════════════════════════
  // Selection Screen (shown when no URL parameters)
  // ═══════════════════════════════════════════════════════════
  const SelectionScreen = () => (
    <div
      className={`min-h-screen flex items-center justify-center ${
        isDarkMode ? "bg-slate-900" : "bg-gray-50"
      }`}
    >
      <div className="text-center max-w-3xl mx-auto p-8">
        <h1
          className={`text-3xl font-semibold mb-4 ${
            isDarkMode ? "text-slate-100" : "text-gray-900"
          }`}
        >
          Patient Consultation System
        </h1>
        <p
          className={`text-lg mb-8 ${
            isDarkMode ? "text-slate-400" : "text-gray-600"
          }`}
        >
          Please access this page with the appropriate URL parameters.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Patient First Visit Card */}
          <div
            className={`p-5 rounded-lg border ${
              isDarkMode
                ? "bg-slate-800 border-slate-700"
                : "bg-white border-gray-200"
            }`}
          >
            <div
              className={`text-lg font-medium mb-2 ${
                isDarkMode ? "text-blue-400" : "text-blue-600"
              }`}
            >
              👤 First Visit
            </div>
            <p
              className={`text-sm mb-4 ${
                isDarkMode ? "text-slate-400" : "text-gray-500"
              }`}
            >
              View consultation summary.
              <br />
              No surveys required.
            </p>
            <code
              className={`block text-xs p-2 rounded break-all ${
                isDarkMode
                  ? "bg-slate-900 text-slate-300"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              ?fileid=...&patid=...
              <br />
              <span className="text-blue-500 font-semibold">&visit=first</span>
            </code>
          </div>

          {/* Patient Follow-up Visit Card */}
          <div
            className={`p-5 rounded-lg border ${
              isDarkMode
                ? "bg-slate-800 border-slate-700"
                : "bg-white border-gray-200"
            }`}
          >
            <div
              className={`text-lg font-medium mb-2 ${
                isDarkMode ? "text-cyan-400" : "text-cyan-600"
              }`}
            >
              👤 Follow-up Visit
            </div>
            <p
              className={`text-sm mb-4 ${
                isDarkMode ? "text-slate-400" : "text-gray-500"
              }`}
            >
              Complete surveys after
              <br />
              your follow-up visit.
            </p>
            <code
              className={`block text-xs p-2 rounded break-all ${
                isDarkMode
                  ? "bg-slate-900 text-slate-300"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              ?fileid=...&patid=...
              <br />
              <span className="text-cyan-500 font-semibold">
                &visit=followup
              </span>
            </code>
          </div>

          {/* Doctor Access Card */}
          <div
            className={`p-5 rounded-lg border ${
              isDarkMode
                ? "bg-slate-800 border-slate-700"
                : "bg-white border-gray-200"
            }`}
          >
            <div
              className={`text-lg font-medium mb-2 ${
                isDarkMode ? "text-green-400" : "text-green-600"
              }`}
            >
              👨‍⚕️ Doctor Access
            </div>
            <p
              className={`text-sm mb-4 ${
                isDarkMode ? "text-slate-400" : "text-gray-500"
              }`}
            >
              Review quality reports
              <br />
              and AI rewrites.
            </p>
            <code
              className={`block text-xs p-2 rounded break-all ${
                isDarkMode
                  ? "bg-slate-900 text-slate-300"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              ?fileid=...
              <br />
              <span className="text-green-500 font-semibold">
                &doctorid=...
              </span>
            </code>
          </div>
          {/* Admin Tracking Card */}
          <a
            href="/admin/tracking"
            className={`p-5 rounded-lg border block text-left transition-colors ${
              isDarkMode
                ? "bg-slate-800 border-slate-700 hover:border-amber-500"
                : "bg-white border-gray-200 hover:border-amber-400"
            }`}
          >
            <div
              className={`text-lg font-medium mb-2 ${
                isDarkMode ? "text-amber-400" : "text-amber-600"
              }`}
            >
              Admin Tracking
            </div>
            <p
              className={`text-sm mb-4 ${
                isDarkMode ? "text-slate-400" : "text-gray-500"
              }`}
            >
              View user interaction
              <br />
              tracking data.
            </p>
            <code
              className={`block text-xs p-2 rounded break-all ${
                isDarkMode
                  ? "bg-slate-900 text-slate-300"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              <span className="text-amber-500 font-semibold">
                /admin/tracking
              </span>
            </code>
          </a>
        </div>

        {/* Quick Test Links */}
        <div className="mt-8">
          <p
            className={`text-sm mb-3 ${
              isDarkMode ? "text-slate-500" : "text-gray-400"
            }`}
          >
            Quick Test Links:
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href="/?fileid=quality-coded-nlp-pilot-sid-1.xlsx&patid=Patient_quality-coded-nlp-pilot-sid-1&visit=first"
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isDarkMode
                  ? "bg-blue-600 text-white hover:bg-blue-500"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              Patient First Visit
            </a>
            <a
              href="/?fileid=quality-coded-nlp-pilot-sid-1.xlsx&patid=Patient_quality-coded-nlp-pilot-sid-1&visit=followup"
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isDarkMode
                  ? "bg-cyan-600 text-white hover:bg-cyan-500"
                  : "bg-cyan-600 text-white hover:bg-cyan-700"
              }`}
            >
              Patient Follow-up
            </a>
            <a
              href="/?fileid=quality-coded-nlp-pilot-sid-1.xlsx&doctorid=Interviewer:"
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isDarkMode
                  ? "bg-green-600 text-white hover:bg-green-500"
                  : "bg-green-600 text-white hover:bg-green-700"
              }`}
            >
              Doctor Demo
            </a>
            <a
              href="/admin/tracking"
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isDarkMode
                  ? "bg-amber-600 text-white hover:bg-amber-500"
                  : "bg-amber-600 text-white hover:bg-amber-700"
              }`}
            >
              Admin Tracking
            </a>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={`flex min-h-screen ${
        isDarkMode ? "dark bg-gray-900 text-white" : "bg-white text-black"
      }`}
    >
      {/* <FilterSidebar isDarkMode={isDarkMode} /> */}
      <div className="flex-1">
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

        {/* <BetaConsentMoal /> */}
        {/* <BetaConsentModalNonAIAPI /> */}

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
        {currentView === "selection" && <SelectionScreen />}

        {/* ═══════════════════════════════════════════════════════════
            APITestDashboard - Only visible in Dev Mode
        ═══════════════════════════════════════════════════════════ */}
        {isDevMode && <APITestDashboard />}

        {/* <ReportDownload /> */}
        <DashboardFooter />
      </div>
    </div>
  );
}
