/**
 * Tests for the main page component — URL-based routing logic.
 *
 * Mock strategy:
 * - next/navigation: useSearchParams is mocked to return controlled URL params
 * - All heavy child components are stubbed as simple divs with data-testid
 * - Zustand stores are used directly (real lightweight stores)
 * - Tracking hooks are mocked to prevent side effects
 *
 * The page component determines which view to render based on URL params:
 * - No params                         -> Selection screen
 * - ?fileid=...&patid=...&visit=first -> PatientReportFirstVisit
 * - ?fileid=...&patid=...&visit=followup -> PatientFollowUpReport
 * - ?fileid=...&doctorid=...          -> PhysicianReports (doctor view)
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { useSearchParams } from "next/navigation";

// ──────────────────────────────────────────────────────────────────────────────
// Mocks — must be before importing the component under test
// ──────────────────────────────────────────────────────────────────────────────

// Mock next/navigation
jest.mock("next/navigation", () => ({
  useSearchParams: jest.fn(),
}));

// Mock heavy child components as stubs
jest.mock("@/components/PhysicianReportsModifiedV41Timothy", () => {
  return function MockPhysicianReports() {
    return <div data-testid="doctor-view">Doctor View</div>;
  };
});

jest.mock("@/components/PatientInitialVisitReportV37", () => {
  return function MockPatientFirstVisit() {
    return <div data-testid="patient-first">Patient First Visit</div>;
  };
});

jest.mock("@/components/PatientFollowUpReportV31Re", () => {
  return function MockPatientFollowUp() {
    return <div data-testid="patient-followup">Patient Follow-up</div>;
  };
});

jest.mock("@/components/PatientConsultationReports", () => {
  return function MockPatientConsultationReports() {
    return <div data-testid="patient-consultation" />;
  };
});

jest.mock("@/components/FilterSidebarV3", () => {
  return function MockFilterSidebar() {
    return <div data-testid="filter-sidebar" />;
  };
});

jest.mock("@/components/Dashboard", () => {
  return function MockDashboard() {
    return <div data-testid="dashboard" />;
  };
});

jest.mock("@/components/ThemeToggle", () => {
  return function MockThemeToggle() {
    return <div data-testid="theme-toggle">Theme Toggle</div>;
  };
});

jest.mock("@/components/BetaConsentModal", () => {
  return function MockBetaConsentModal() {
    return null;
  };
});

jest.mock("@/components/BetaConsentModalNonAIAPI", () => {
  return function MockBetaConsentModalNonAIAPI() {
    return null;
  };
});

jest.mock("@/components/DashboardFooter", () => ({
  DashboardFooter: function MockDashboardFooter() {
    return <div data-testid="footer">Dashboard Footer</div>;
  },
}));

jest.mock("@/components/ReportDownloadNonAIAPI", () => ({
  ReportDownload: function MockReportDownload() {
    return null;
  },
}));

jest.mock("@/components/ApiTestDashboard", () => {
  return function MockAPITestDashboard() {
    return <div data-testid="api-test-dashboard" />;
  };
});

// Mock tracking hooks to prevent side effects
jest.mock("@/tracking/hooks", () => ({
  useTracking: jest.fn(() => ({
    isEnabled: false,
    trackClick: jest.fn(),
    scrollDepth: {},
    navigation: {},
    cursorProximity: { isEnabled: false, trackedElementsCount: 0 },
  })),
}));

// ──────────────────────────────────────────────────────────────────────────────
// Import the component under test AFTER mocks
// ──────────────────────────────────────────────────────────────────────────────

import Home from "@/app/page";
import { usePatientId } from "@/stores/usePatientId";
import { useFileId } from "@/stores/useFileId";
import { useDoctorId } from "@/stores/useDoctorId";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Configure useSearchParams mock to return URLSearchParams built from params.
 */
function mockSearchParams(params: Record<string, string> = {}): void {
  const sp = new URLSearchParams(params);
  (useSearchParams as jest.Mock).mockReturnValue(sp);
}

/**
 * Reset Zustand stores to their initial state between tests.
 */
function resetStores(): void {
  usePatientId.setState({ patientId: null });
  useFileId.setState({ fileId: null });
  useDoctorId.setState({ doctorId: null });
}

// ──────────────────────────────────────────────────────────────────────────────
// Setup / Teardown
// ──────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  resetStores();
  // Suppress console.log noise from the page component
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe("Home page — URL-based routing", () => {
  // ── 1. Selection screen (no params) ─────────────────────────────────────
  test("shows selection screen when no URL params are provided", () => {
    mockSearchParams({});
    render(<Home />);

    expect(screen.getByText("Patient Consultation System")).toBeInTheDocument();
    expect(
      screen.getByText(/Select a patient to view their consultation report/)
    ).toBeInTheDocument();
  });

  // ── 2. Patient first visit ─────────────────────────────────────────────
  test("shows PatientReportFirstVisit when ?fileid&patid&visit=first", async () => {
    mockSearchParams({
      fileid: "test-file.xlsx",
      patid: "patient-001",
      visit: "first",
    });

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByTestId("patient-first")).toBeInTheDocument();
    });

    // Selection screen should NOT be visible
    expect(
      screen.queryByText("Patient Consultation System")
    ).not.toBeInTheDocument();
  });

  // ── 3. Patient follow-up visit ─────────────────────────────────────────
  test("shows PatientFollowUpReport when ?fileid&patid&visit=followup", async () => {
    mockSearchParams({
      fileid: "test-file.xlsx",
      patid: "patient-001",
      visit: "followup",
    });

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByTestId("patient-followup")).toBeInTheDocument();
    });
  });

  // ── 4. Doctor view ─────────────────────────────────────────────────────
  test("shows PhysicianReports when ?fileid&doctorid", async () => {
    mockSearchParams({
      fileid: "test-file.xlsx",
      doctorid: "doctor-001",
    });

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByTestId("doctor-view")).toBeInTheDocument();
    });
  });

  // ── 5. ThemeToggle is always rendered ──────────────────────────────────
  test("renders ThemeToggle component in all views", () => {
    mockSearchParams({});
    render(<Home />);

    expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
  });

  // ── 6. DashboardFooter is always rendered ──────────────────────────────
  test("renders DashboardFooter component in all views", () => {
    mockSearchParams({});
    render(<Home />);

    expect(screen.getByTestId("footer")).toBeInTheDocument();
  });

  // ── 7. Sets fileId in store from URL params ────────────────────────────
  test("sets fileId in store from URL params", async () => {
    mockSearchParams({
      fileid: "quality-coded-file.xlsx",
      doctorid: "doc-1",
    });

    render(<Home />);

    await waitFor(() => {
      expect(useFileId.getState().fileId).toBe("quality-coded-file.xlsx");
    });
  });

  // ── 8. Sets patientId in store from URL params ─────────────────────────
  test("sets patientId in store from URL params", async () => {
    mockSearchParams({
      fileid: "file.xlsx",
      patid: "patient-ABC",
      visit: "followup",
    });

    render(<Home />);

    await waitFor(() => {
      expect(usePatientId.getState().patientId).toBe("patient-ABC");
    });
  });

  // ── 9. Sets doctorId in store from URL params ──────────────────────────
  test("sets doctorId in store from URL params", async () => {
    mockSearchParams({
      fileid: "file.xlsx",
      doctorid: "Interviewer:",
    });

    render(<Home />);

    await waitFor(() => {
      expect(useDoctorId.getState().doctorId).toBe("Interviewer:");
    });
  });

  // ── 10. Falls back to follow-up for unknown visit type ─────────────────
  test("defaults to follow-up view when visit param is unrecognized", async () => {
    mockSearchParams({
      fileid: "file.xlsx",
      patid: "patient-001",
      visit: "unknown",
    });

    render(<Home />);

    // The page defaults visitType to "followup" for anything other than "first"
    await waitFor(() => {
      expect(screen.getByTestId("patient-followup")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("patient-first")).not.toBeInTheDocument();
  });
});
