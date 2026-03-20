"use client";

import React, { useState, useEffect, useCallback } from "react";
import Joyride, { Step, CallBackProps, STATUS, ACTIONS, EVENTS } from "react-joyride";

// ═══════════════════════════════════════════════════════════
// Tour Steps — per view
// ═══════════════════════════════════════════════════════════

const DASHBOARD_STEPS: Step[] = [
  {
    target: "[data-tour='rubric-button']",
    content:
      "Welcome to the Physician Dashboard! This is the Scoring Rubric button. Click it anytime to view the 0–5 scoring criteria for all five risk communication domains. You can hover or click each score level to see cumulative rubric details.",
    title: "Scoring Rubric Guide",
    placement: "bottom-end",
    disableBeacon: true,
  },
  {
    target: "[data-tour='search-filters']",
    content:
      "Use the search bar to quickly find patients by name, ID, or file name. The filter buttons let you narrow the list by performance band: All, High Quality (4–5), Standard (3), or Needs Improvement (0–2).",
    title: "Search & Filter",
    placement: "bottom",
  },
  {
    target: "[data-tour='summary-cards']",
    content:
      "These four cards summarize your overall performance. Click any card to filter the patient list below by that performance band. Each card shows the count of patients in that category.",
    title: "Summary Cards",
    placement: "bottom",
  },
  {
    target: "[data-tour='trajectory-chart']",
    content:
      "This chart tracks your Overall Quality of Risk Communication Score over time. Each point represents a cumulative average across all patients scored so far. Hover over data points to see individual patient breakdowns.",
    title: "Score Trajectory",
    placement: "bottom",
  },
  {
    target: "[data-tour='summary-box']",
    content:
      "This summary panel shows your average score and a breakdown by performance band: High (4–5), Standard (3), and Low (0–2). The color-coded dots represent individual patient scores.",
    title: "Performance Summary",
    placement: "left",
  },
  {
    target: "[data-tour='patient-list']",
    content:
      "Here you'll find all patient consultation reports. Each row shows the patient ID, overall score, and a color-coded badge. Click \"View Report\" to see the detailed scoring breakdown for any patient.",
    title: "Patient Reports List",
    placement: "top-start",
  },
];

const GRID_STEPS: Step[] = [
  {
    target: "[data-tour='grid-overall']",
    content:
      "This card shows the selected patient's overall communication score and basic information. The score is an average across all five risk communication domains.",
    title: "Patient Overall Score",
    placement: "bottom",
    disableBeacon: true,
  },
  {
    target: "[data-tour='grid-topics-table']",
    content:
      "This table breaks down the patient's score by each of the five risk communication domains: Cancer Prognosis, Life Expectancy, Erectile Dysfunction, Urinary Incontinence, and Irritative Symptoms.\n\n• Click a topic name to see the detailed sentence-level view\n• The \"How to Improve\" column shows actionable steps to reach the next score level",
    title: "Domain Scores & Details",
    placement: "top-start",
  },
  {
    target: "[data-tour='grid-your-score']",
    content:
      "Click any score badge in this column to open the Scoring Rubric for that specific domain. The rubric shows exactly what criteria each score level requires.",
    title: "Score Badges — Click for Rubric",
    placement: "bottom",
  },
  {
    target: "[data-tour='rubric-button']",
    content:
      "You can also open the Scoring Rubric anytime by clicking this button. It shows the full 0–5 scoring criteria for all five risk communication domains.",
    title: "Scoring Rubric Guide",
    placement: "bottom-end",
  },
];

const DETAIL_STEPS: Step[] = [
  {
    target: "[data-tour='detail-topic-trajectory']",
    content:
      "This chart shows every patient's score for the selected domain. The red dot highlights the current patient. Hover over any point to see the patient name and score.",
    title: "Topic Score Overview",
    placement: "bottom",
    disableBeacon: true,
  },
  {
    target: "[data-tour='detail-consultation-scoring']",
    content:
      "This panel displays all relevant sentences from the consultation, ordered by score. Click any sentence to select it for the Re-write Practice below. The score scale at the bottom shows the current score position.",
    title: "Consultation Scoring",
    placement: "top-start",
  },
  {
    target: ".consultation-scoring-scale",
    content:
      "This is the score scale. The blue indicator shows the current score position. Hover over or click each number (0–5) to see cumulative rubric criteria — what each score level requires for this domain.",
    title: "Score Scale & Rubric",
    placement: "top",
  },
  {
    target: "[data-tour='detail-rewrite-panel']",
    content:
      "Practice improving your communication here. The original sentence is shown with its current score. Type your improved version in the text box and click \"Try & Score\" to see how your rewrite scores.\n\nTip: Click an improvement suggestion in the scoring panel above to get a targeted hint.",
    title: "Re-write Practice",
    placement: "top-start",
  },
  {
    target: "[data-tour='rubric-button']",
    content:
      "Remember, you can always open the Scoring Rubric from this button to review the full criteria for all five domains.",
    title: "Scoring Rubric Guide",
    placement: "bottom-end",
  },
];

// ═══════════════════════════════════════════════════════════
// Tour styles
// ═══════════════════════════════════════════════════════════

const getTourStyles = (isDarkMode: boolean) => ({
  options: {
    arrowColor: isDarkMode ? "#1e293b" : "#ffffff",
    backgroundColor: isDarkMode ? "#1e293b" : "#ffffff",
    overlayColor: "rgba(0, 0, 0, 0.5)",
    primaryColor: "#06b6d4",
    textColor: isDarkMode ? "#e2e8f0" : "#1e293b",
    zIndex: 10000,
  },
  tooltip: {
    borderRadius: "12px",
    padding: "20px",
    maxWidth: "420px",
    boxShadow: isDarkMode
      ? "0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(100, 116, 139, 0.2)"
      : "0 20px 60px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(226, 232, 240, 0.8)",
  },
  tooltipTitle: {
    fontSize: "16px",
    fontWeight: 700,
    marginBottom: "8px",
    color: isDarkMode ? "#67e8f9" : "#0891b2",
  },
  tooltipContent: {
    fontSize: "14px",
    lineHeight: "1.6",
    whiteSpace: "pre-line" as const,
  },
  buttonNext: {
    backgroundColor: "#06b6d4",
    borderRadius: "8px",
    padding: "8px 20px",
    fontSize: "13px",
    fontWeight: 600,
  },
  buttonBack: {
    color: isDarkMode ? "#94a3b8" : "#64748b",
    fontSize: "13px",
    fontWeight: 500,
    marginRight: "8px",
  },
  buttonSkip: {
    color: isDarkMode ? "#64748b" : "#94a3b8",
    fontSize: "12px",
  },
  buttonClose: {
    color: isDarkMode ? "#94a3b8" : "#64748b",
  },
  spotlight: {
    borderRadius: "12px",
  },
});

// ═══════════════════════════════════════════════════════════
// localStorage keys
// ═══════════════════════════════════════════════════════════
const TOUR_COMPLETED_KEY = "physician-dashboard-tour-completed";
const TOUR_VIEW_KEY = "physician-dashboard-tour-view";

// ═══════════════════════════════════════════════════════════
// OnboardingTour Component
// ═══════════════════════════════════════════════════════════

interface OnboardingTourProps {
  isDarkMode: boolean;
  currentView: "dashboard" | "grid" | "detail";
}

const OnboardingTour: React.FC<OnboardingTourProps> = ({
  isDarkMode,
  currentView,
}) => {
  const [run, setRun] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [stepIndex, setStepIndex] = useState(0);

  // Determine steps based on current view
  useEffect(() => {
    let viewSteps: Step[] = [];
    switch (currentView) {
      case "dashboard":
        viewSteps = DASHBOARD_STEPS;
        break;
      case "grid":
        viewSteps = GRID_STEPS;
        break;
      case "detail":
        viewSteps = DETAIL_STEPS;
        break;
    }
    setSteps(viewSteps);
    setStepIndex(0);

    // Check if tour was already completed for this view
    const completedViews = JSON.parse(
      localStorage.getItem(TOUR_COMPLETED_KEY) || "{}",
    );
    const lastTourView = localStorage.getItem(TOUR_VIEW_KEY);

    if (!completedViews[currentView]) {
      // First visit to this view — auto-start tour after short delay
      const timer = setTimeout(() => setRun(true), 800);
      return () => clearTimeout(timer);
    } else if (lastTourView !== currentView) {
      // View changed but already completed — don't auto-start
      setRun(false);
    }

    localStorage.setItem(TOUR_VIEW_KEY, currentView);
  }, [currentView]);

  const handleCallback = useCallback(
    (data: CallBackProps) => {
      const { status, action, index, type } = data;
      const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];

      if (finishedStatuses.includes(status)) {
        setRun(false);
        // Mark this view's tour as completed
        const completedViews = JSON.parse(
          localStorage.getItem(TOUR_COMPLETED_KEY) || "{}",
        );
        completedViews[currentView] = true;
        localStorage.setItem(
          TOUR_COMPLETED_KEY,
          JSON.stringify(completedViews),
        );
      }

      if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
        setStepIndex(index + (action === ACTIONS.PREV ? -1 : 1));
      }
    },
    [currentView],
  );

  // Public method to restart tour (exposed via custom event)
  useEffect(() => {
    const handleRestart = () => {
      setStepIndex(0);
      setRun(true);
    };
    window.addEventListener("restart-tour", handleRestart);
    return () => window.removeEventListener("restart-tour", handleRestart);
  }, []);

  if (steps.length === 0) return null;

  return (
    <Joyride
      steps={steps}
      run={run}
      stepIndex={stepIndex}
      continuous
      showProgress
      showSkipButton
      scrollToFirstStep
      disableOverlayClose
      spotlightClicks
      callback={handleCallback}
      styles={getTourStyles(isDarkMode)}
      locale={{
        back: "Back",
        close: "Close",
        last: "Got it!",
        next: "Next",
        skip: "Skip tour",
      }}
      floaterProps={{
        disableAnimation: false,
      }}
    />
  );
};

// ═══════════════════════════════════════════════════════════
// RestartTourButton — small button to re-trigger the tour
// ═══════════════════════════════════════════════════════════

interface RestartTourButtonProps {
  isDarkMode: boolean;
}

export const RestartTourButton: React.FC<RestartTourButtonProps> = ({
  isDarkMode,
}) => {
  const handleRestart = () => {
    // Clear completed status for current view so it runs again
    const completedViews = JSON.parse(
      localStorage.getItem(TOUR_COMPLETED_KEY) || "{}",
    );
    const currentView = localStorage.getItem(TOUR_VIEW_KEY) || "dashboard";
    delete completedViews[currentView];
    localStorage.setItem(TOUR_COMPLETED_KEY, JSON.stringify(completedViews));

    window.dispatchEvent(new CustomEvent("restart-tour"));
  };

  return (
    <button
      onClick={handleRestart}
      className={`fixed bottom-4 right-4 z-[55] flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition-all hover:scale-105 ${
        isDarkMode
          ? "bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 shadow-lg"
          : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200 shadow-md"
      }`}
      title="Restart guided tour"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      Tour Guide
    </button>
  );
};

export default OnboardingTour;
