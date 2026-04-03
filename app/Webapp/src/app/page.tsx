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

  // User behavior Tracking hook
  useTracking();

  // ═══════════════════════════════════════════════════════════
  // Selection Screen — Patient list + visit type buttons
  // ═══════════════════════════════════════════════════════════
  const [patientList, setPatientList] = useState<any[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);

  useEffect(() => {
    if (currentView === "selection") {
      setLoadingPatients(true);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const apiKey = process.env.NEXT_PUBLIC_API_KEY || "";
      fetch(`${apiUrl}/api/patient/files`, {
        headers: apiKey ? { "X-API-Key": apiKey } : {},
      })
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
      className={`min-h-screen flex items-center justify-center ${
        isDarkMode ? "bg-slate-900" : "bg-gray-50"
      }`}
    >
      <div className="text-center max-w-4xl mx-auto p-8">
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
          Select a patient and visit type below.
        </p>

        {/* Patient List */}
        {loadingPatients ? (
          <p className={isDarkMode ? "text-slate-400" : "text-gray-500"}>Loading patients...</p>
        ) : patientList.length === 0 ? (
          <p className={isDarkMode ? "text-slate-400" : "text-gray-500"}>No patients found.</p>
        ) : (
          <div className="w-full">
            <table className={`w-full border-collapse rounded-lg overflow-hidden ${
              isDarkMode ? "bg-slate-800" : "bg-white"
            }`}>
              <thead>
                <tr className={isDarkMode ? "bg-slate-700" : "bg-gray-100"}>
                  <th className={`px-6 py-3 text-left text-sm font-semibold ${isDarkMode ? "text-slate-200" : "text-gray-700"}`}>
                    Patient
                  </th>
                  <th className={`px-6 py-3 text-center text-sm font-semibold ${isDarkMode ? "text-slate-200" : "text-gray-700"}`}>
                    First Visit
                  </th>
                  <th className={`px-6 py-3 text-center text-sm font-semibold ${isDarkMode ? "text-slate-200" : "text-gray-700"}`}>
                    Follow-up
                  </th>
                </tr>
              </thead>
              <tbody>
                {patientList.map((file, idx) => {
                  const match = file.match(/sid[\s_-]*(\d+)/i);
                  const label = match ? `SID-${match[1]}` : file;
                  return (
                    <tr
                      key={file}
                      className={`border-t ${
                        isDarkMode
                          ? "border-slate-700 hover:bg-slate-700/50"
                          : "border-gray-100 hover:bg-gray-50"
                      }`}
                    >
                      <td className={`px-6 py-4 ${isDarkMode ? "text-slate-200" : "text-gray-800"}`}>
                        <div className="font-medium">{label}</div>
                        <div className={`text-xs ${isDarkMode ? "text-slate-500" : "text-gray-400"}`}>
                          {file}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => handlePatientSelect(file, "first")}
                          className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                        >
                          First Visit
                        </button>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => handlePatientSelect(file, "followup")}
                          className="px-4 py-2 rounded-lg text-sm font-medium bg-cyan-600 text-white hover:bg-cyan-500 transition-colors"
                        >
                          Follow-up
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Quick Links */}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a
            href="/?doctorid=auto"
            className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-500 transition-colors"
          >
            Doctor Demo
          </a>
          <a
            href="/admin/tracking"
            className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-500 transition-colors"
          >
            Admin Tracking
          </a>
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
