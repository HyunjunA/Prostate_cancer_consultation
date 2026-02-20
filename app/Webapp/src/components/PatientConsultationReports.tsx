import React, { useEffect, useMemo, useState } from "react";

/** -------------------- Topic schema (exactly 5 topics) -------------------- */
const TOPIC_ORDER = [
  "Cancer Prognosis",
  "Life Expectancy",
  "Erectile Dysfunction",
  "Urinary Incontinence",
  "Irritative Urinary Symptoms",
] as const;

type TopicName = (typeof TOPIC_ORDER)[number];

type TopicBlock = {
  extractedSentences: string[];
  aiSummary: string;
};

type ConsultationTopics = Record<TopicName, TopicBlock>;

export interface ConsultationReport {
  patientName: string;
  patientId: string;
  consultationDate: string; // human readable or ISO
  physicianName: string;
  consultationTopics: ConsultationTopics; // ALWAYS has 5 topics
}

interface PatientConsultationReportsProps {
  isDarkMode?: boolean;
}

/** -------------------- Helpers -------------------- */
function emptyTopics(): ConsultationTopics {
  const obj = {} as ConsultationTopics;
  TOPIC_ORDER.forEach((t) => {
    obj[t] = {
      extractedSentences: [],
      aiSummary: "No summary available.",
    };
  });
  return obj;
}

function ensureFiveTopics(
  topicsPartial: Partial<Record<string, TopicBlock>>
): ConsultationTopics {
  // Map any incoming topic names to the canonical 5 topics when possible
  const canon: ConsultationTopics = emptyTopics();

  // Simple mapping heuristic: direct match or case-insensitive contains
  const normalize = (s: string) => s.toLowerCase();

  const aliasMap: Record<TopicName, string[]> = {
    "Cancer Prognosis": [
      "cancer prognosis",
      "prognosis",
      "oncologic risk",
      "risk",
    ],
    "Life Expectancy": [
      "life expectancy",
      "years ahead",
      "survival",
      "longevity",
    ],
    "Erectile Dysfunction": ["erectile dysfunction", "ed", "sexual function"],
    "Urinary Incontinence": [
      "urinary incontinence",
      "incontinence",
      "continence",
    ],
    "Irritative Urinary Symptoms": [
      "irritative urinary symptoms",
      "irritative",
      "urinary symptoms",
      "bladder",
    ],
  };

  // Try to fit incoming topics into canonical buckets
  for (const [incomingName, block] of Object.entries(topicsPartial)) {
    if (!block) continue;
    const n = normalize(incomingName);

    // Exact canonical match first
    if (TOPIC_ORDER.includes(incomingName as TopicName)) {
      const t = incomingName as TopicName;
      canon[t] = {
        extractedSentences: block.extractedSentences ?? [],
        aiSummary:
          block.aiSummary && block.aiSummary.trim().length > 0
            ? block.aiSummary
            : canon[t].aiSummary,
      };
      continue;
    }

    // Heuristic alias match
    let matched: TopicName | null = null;
    for (const t of TOPIC_ORDER) {
      if (n === normalize(t) || aliasMap[t].some((a) => n.includes(a))) {
        matched = t;
        break;
      }
    }
    if (matched) {
      const existing = canon[matched];
      canon[matched] = {
        extractedSentences: [
          ...existing.extractedSentences,
          ...(block.extractedSentences ?? []),
        ],
        aiSummary:
          existing.aiSummary !== "No summary available."
            ? existing.aiSummary
            : block.aiSummary && block.aiSummary.trim().length > 0
            ? block.aiSummary
            : existing.aiSummary,
      };
    }
  }

  // If any topic still has no summary but has sentences, add a short fallback
  TOPIC_ORDER.forEach((t) => {
    const blk = canon[t];
    if (
      (!blk.aiSummary || blk.aiSummary === "No summary available.") &&
      blk.extractedSentences.length > 0
    ) {
      canon[
        t
      ].aiSummary = `Discussion captured ${blk.extractedSentences.length} key statements for "${t}".`;
    }
  });

  return canon;
}

/** -------------------- Sample multi-report dataset -------------------- */
function buildSampleReports(): ConsultationReport[] {
  const baseTopics: ConsultationTopics = {
    "Cancer Prognosis": {
      extractedSentences: [
        "12% 15-year prostate cancer mortality risk was mentioned.",
        "1.2 in 10 chance considered high by clinicians.",
        "Surgery or radiation was discussed for control.",
      ],
      aiSummary:
        "Intermediate-risk disease leaning high; definitive therapy recommended to optimize long-term control.",
    },
    "Life Expectancy": {
      extractedSentences: [
        "Approximately 40 years ahead was emphasized.",
        "Long horizon affects treatment planning.",
      ],
      aiSummary:
        "Young age and long life expectancy favor definitive therapy to reduce lifetime progression risk.",
    },
    "Erectile Dysfunction": {
      extractedSentences: [
        "40–50% chance to return to baseline function.",
        "Recovery is gradual.",
      ],
      aiSummary:
        "Expect gradual recovery; supportive treatments available if baseline function does not fully return.",
    },
    "Urinary Incontinence": {
      extractedSentences: [
        "~90% pad-free by 12 months.",
        "~5% might need corrective procedure.",
      ],
      aiSummary:
        "Most recover continence by 1 year; persistent cases are treatable.",
    },
    "Irritative Urinary Symptoms": {
      extractedSentences: [
        "Radiation can transiently irritate the bladder.",
        "Surgery may present fewer irritative symptoms.",
      ],
      aiSummary:
        "Side-effect profiles differ; irritative symptoms typically improve over time.",
    },
  };

  const make = (
    overrides: Partial<ConsultationReport>
  ): ConsultationReport => ({
    patientName: "Patient A",
    patientId: "P001",
    consultationDate: "September 4, 2025",
    physicianName: "Dr. John",
    consultationTopics: baseTopics,
    ...overrides,
  });

  const datesA = [
    "September 4, 2025",
    "June 21, 2025",
    "April 15, 2025",
    "December 2, 2024",
    "August 18, 2024",
  ];
  const a = datesA.map((d, i) =>
    make({
      consultationDate: d,
      physicianName: i % 2 === 0 ? "Dr. John" : "Dr. Lee",
    })
  );

  const b = [
    make({
      patientName: "Patient B",
      patientId: "P002",
      consultationDate: "July 9, 2025",
      physicianName: "Dr. Kim",
    }),
    make({
      patientName: "Patient B",
      patientId: "P002",
      consultationDate: "May 2, 2025",
      physicianName: "Dr. Green",
    }),
    make({
      patientName: "Patient B",
      patientId: "P002",
      consultationDate: "February 11, 2025",
      physicianName: "Dr. Kim",
    }),
    make({
      patientName: "Patient B",
      patientId: "P002",
      consultationDate: "October 3, 2024",
      physicianName: "Dr. Green",
    }),
  ];

  return [...a, ...b];
}

/** -------------------- Topic section (detail) -------------------- */
const TopicSection: React.FC<{
  topicName: TopicName;
  data: TopicBlock;
  isDarkMode?: boolean;
}> = ({ topicName, data, isDarkMode = false }) => {
  return (
    <section className="mb-10">
      <h2
        className={`text-2xl font-semibold mb-4 ${
          isDarkMode ? "text-slate-100" : "text-gray-900"
        }`}
      >
        {topicName}
      </h2>
      <div
        className={`p-6 rounded-xl border-l-4 mb-6 ${
          isDarkMode
            ? "bg-slate-800 border-l-blue-500 border border-slate-700"
            : "bg-gray-50 border-l-blue-600 border border-gray-200"
        }`}
      >
        <h3
          className={`text-lg font-semibold mb-4 ${
            isDarkMode ? "text-slate-200" : "text-gray-800"
          }`}
        >
          Key Statements
        </h3>
        {data.extractedSentences.length === 0 ? (
          <p className={isDarkMode ? "text-slate-400" : "text-gray-500"}>
            No extracted statements.
          </p>
        ) : (
          <ul className="space-y-3">
            {data.extractedSentences.map((s, i) => (
              <li key={i} className="flex items-start">
                <span
                  className={`mt-2 mr-3 inline-block w-2 h-2 rounded-full ${
                    isDarkMode ? "bg-blue-400" : "bg-blue-600"
                  }`}
                />
                <p className={isDarkMode ? "text-slate-300" : "text-gray-700"}>
                  “{s}”
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div
        className={`p-6 rounded-xl ${
          isDarkMode
            ? "bg-gradient-to-br from-slate-800 to-slate-700 border border-slate-600"
            : "bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200"
        }`}
      >
        <h3
          className={`text-lg font-semibold mb-2 ${
            isDarkMode ? "text-slate-200" : "text-gray-800"
          }`}
        >
          Clinical Summary
        </h3>
        <p className={isDarkMode ? "text-slate-300" : "text-gray-700"}>
          {data.aiSummary}
        </p>
      </div>
    </section>
  );
};

/** -------------------- Detail view (your original report, refactored) -------------------- */
/** -------------------- Updated Detail view (using second code's professional design) -------------------- */
const PatientReportDetail: React.FC<{
  report: ConsultationReport;
  isDarkMode?: boolean;
  onBack?: () => void;
}> = ({ report, isDarkMode = false, onBack }) => {
  const [activeTab, setActiveTab] = useState<TopicName>(TOPIC_ORDER[0]);
  const [viewMode, setViewMode] = useState<"tab" | "full">("tab");

  useEffect(() => {
    setActiveTab(TOPIC_ORDER[0]);
  }, [report]);

  const currentTopicData = report.consultationTopics[activeTab];

  return (
    <div
      className={`min-h-screen ${isDarkMode ? "bg-slate-950" : "bg-gray-50"}`}
    >
      <div className="max-w-6xl mx-auto">
        {/* Medical Report Header */}
        <div
          className={`${
            isDarkMode
              ? "bg-gradient-to-r from-slate-900 to-slate-800 border-b border-slate-700"
              : "bg-gradient-to-r from-white to-gray-50 border-b border-gray-200"
          } shadow-lg`}
        >
          <div className="px-12 py-10">
            <div className="text-center relative">
              {/* Back button positioned absolutely */}
              {onBack && (
                <button
                  onClick={onBack}
                  className={`
                    absolute top-0 left-0
                    h-9 px-3 rounded-lg whitespace-nowrap
                    flex items-center gap-2
                    font-medium text-sm
                    transition-all duration-200
                    shadow-sm hover:shadow-md
                    border
                    ${
                      isDarkMode
                        ? "bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-600/50 hover:border-slate-500"
                        : "bg-white/80 hover:bg-gray-50 text-gray-600 border-gray-200/50 hover:border-gray-300"
                    }
                    backdrop-blur-sm
                    transform hover:scale-105 active:scale-95
                  `}
                  title="Back to Index"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeJoin="round"
                      strokeWidth={2}
                      d="M10 19l-7-7m0 0l7-7m-7 7h18"
                    />
                  </svg>
                  Back
                </button>
              )}

              {/* Medical icon */}
              <div
                className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-6 ${
                  isDarkMode
                    ? "bg-blue-900 border-2 border-blue-700"
                    : "bg-blue-100 border-2 border-blue-300"
                }`}
              >
                <svg
                  className={`w-8 h-8 ${
                    isDarkMode ? "text-blue-400" : "text-blue-600"
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>

              <h1
                className={`text-4xl font-light mb-3 tracking-wide ${
                  isDarkMode ? "text-slate-100" : "text-gray-900"
                }`}
              >
                PATIENT CONSULTATION REPORT
              </h1>

              <div
                className={`text-sm font-medium tracking-wider uppercase mb-8 ${
                  isDarkMode ? "text-slate-400" : "text-gray-500"
                }`}
              >
                Prostate Cancer Treatment Discussion Summary
              </div>

              {/* View Mode Toggle */}
              <div className="mb-8">
                <div
                  className={`inline-flex rounded-lg p-1 ${
                    isDarkMode ? "bg-slate-800" : "bg-gray-100"
                  }`}
                >
                  <button
                    onClick={() => setViewMode("tab")}
                    className={`px-6 py-2 text-sm font-medium rounded-md transition-colors ${
                      viewMode === "tab"
                        ? isDarkMode
                          ? "bg-blue-700 text-blue-100"
                          : "bg-blue-600 text-white"
                        : isDarkMode
                        ? "text-slate-400 hover:text-slate-200"
                        : "text-gray-600 hover:text-gray-800"
                    }`}
                  >
                    Topic View
                  </button>
                  <button
                    onClick={() => setViewMode("full")}
                    className={`px-6 py-2 text-sm font-medium rounded-md transition-colors ${
                      viewMode === "full"
                        ? isDarkMode
                          ? "bg-blue-700 text-blue-100"
                          : "bg-blue-600 text-white"
                        : isDarkMode
                        ? "text-slate-400 hover:text-slate-200"
                        : "text-gray-600 hover:text-gray-800"
                    }`}
                  >
                    Full Report
                  </button>
                </div>
                <div
                  className={`text-xs mt-2 text-center ${
                    isDarkMode ? "text-slate-500" : "text-gray-500"
                  }`}
                >
                  {viewMode === "tab"
                    ? "Browse topics one at a time"
                    : "View all topics in a continuous format"}
                </div>
              </div>

              {/* Patient Information Grid */}
              <div
                className={`grid grid-cols-1 md:grid-cols-3 gap-6 text-center ${
                  isDarkMode ? "text-slate-200" : "text-gray-700"
                }`}
              >
                <div>
                  <div
                    className={`text-xs font-semibold uppercase tracking-wider mb-1 ${
                      isDarkMode ? "text-slate-400" : "text-gray-500"
                    }`}
                  >
                    Patient
                  </div>
                  <div className="text-lg font-medium">
                    {report.patientName}
                  </div>
                  <div
                    className={`text-sm ${
                      isDarkMode ? "text-slate-400" : "text-gray-500"
                    }`}
                  >
                    ID: {report.patientId}
                  </div>
                </div>
                <div>
                  <div
                    className={`text-xs font-semibold uppercase tracking-wider mb-1 ${
                      isDarkMode ? "text-slate-400" : "text-gray-500"
                    }`}
                  >
                    Consultation Date
                  </div>
                  <div className="text-lg font-medium">
                    {report.consultationDate}
                  </div>
                </div>
                <div>
                  <div
                    className={`text-xs font-semibold uppercase tracking-wider mb-1 ${
                      isDarkMode ? "text-slate-400" : "text-gray-500"
                    }`}
                  >
                    Attending Physician
                  </div>
                  <div className="text-lg font-medium">
                    {report.physicianName}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation - Only show in tab mode */}
        {viewMode === "tab" && (
          <div
            className={`${
              isDarkMode
                ? "bg-slate-900 border-b border-slate-700"
                : "bg-white border-b border-gray-200"
            } shadow-lg sticky top-0 z-10`}
          >
            <div className="px-6">
              <div className="flex overflow-x-auto scrollbar-hide">
                {TOPIC_ORDER.map((topic, index) => (
                  <button
                    key={topic}
                    onClick={() => setActiveTab(topic)}
                    className={`flex-shrink-0 px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                      activeTab === topic
                        ? isDarkMode
                          ? "border-blue-400 text-blue-400 bg-slate-800"
                          : "border-blue-600 text-blue-600 bg-blue-50"
                        : isDarkMode
                        ? "border-transparent text-slate-400 hover:text-slate-300 hover:border-slate-600"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <span
                        className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                          activeTab === topic
                            ? isDarkMode
                              ? "bg-blue-800 text-blue-200"
                              : "bg-blue-600 text-white"
                            : isDarkMode
                            ? "bg-slate-700 text-slate-400"
                            : "bg-gray-200 text-gray-600"
                        }`}
                      >
                        {index + 1}
                      </span>
                      <span className="hidden sm:inline">{topic}</span>
                      <span className="sm:hidden">{topic.split(" ")[0]}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Content Area */}
        <div
          className={`${
            isDarkMode ? "bg-slate-900" : "bg-white"
          } shadow-xl min-h-screen`}
        >
          <div className="px-12 py-12">
            {viewMode === "tab" ? (
              // Tab View Content
              <>
                {/* Current Topic Header */}
                <div className="mb-12">
                  <div className="flex items-center mb-6">
                    <div
                      className={`flex items-center justify-center w-16 h-16 rounded-full mr-6 ${
                        isDarkMode
                          ? "bg-blue-900 border-2 border-blue-700"
                          : "bg-blue-100 border-2 border-blue-300"
                      }`}
                    >
                      <span
                        className={`text-2xl font-bold ${
                          isDarkMode ? "text-blue-300" : "text-blue-700"
                        }`}
                      >
                        {TOPIC_ORDER.indexOf(activeTab) + 1}
                      </span>
                    </div>
                    <div>
                      <h2
                        className={`text-3xl font-semibold tracking-wide ${
                          isDarkMode ? "text-slate-100" : "text-gray-900"
                        }`}
                      >
                        {activeTab}
                      </h2>
                      <div
                        className={`text-sm font-medium uppercase tracking-wider mt-2 ${
                          isDarkMode ? "text-slate-400" : "text-gray-500"
                        }`}
                      >
                        Clinical Discussion Points
                      </div>
                    </div>
                  </div>
                </div>

                {/* Extracted Sentences */}
                <div className="mb-12">
                  <div
                    className={`p-8 rounded-xl border-l-4 ${
                      isDarkMode
                        ? "bg-slate-800 border-l-blue-500 border border-slate-700"
                        : "bg-gray-50 border-l-blue-600 border border-gray-200"
                    }`}
                  >
                    <h3
                      className={`text-xl font-semibold mb-8 ${
                        isDarkMode ? "text-slate-200" : "text-gray-800"
                      }`}
                    >
                      Key Statements from Consultation
                    </h3>
                    <div className="space-y-6">
                      {currentTopicData.extractedSentences.map(
                        (sentence, idx) => (
                          <div key={idx} className="flex items-start">
                            <div
                              className={`flex-shrink-0 w-3 h-3 rounded-full mt-2 mr-6 ${
                                isDarkMode ? "bg-blue-400" : "bg-blue-600"
                              }`}
                            />
                            <p
                              className={`text-lg leading-relaxed ${
                                isDarkMode ? "text-slate-300" : "text-gray-700"
                              }`}
                            >
                              "{sentence}"
                            </p>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                </div>

                {/* AI Summary */}
                <div>
                  <div
                    className={`p-8 rounded-xl ${
                      isDarkMode
                        ? "bg-gradient-to-br from-slate-800 to-slate-700 border border-slate-600"
                        : "bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200"
                    }`}
                  >
                    <div className="flex items-center mb-8">
                      <div
                        className={`flex items-center justify-center w-10 h-10 rounded-lg mr-4 ${
                          isDarkMode
                            ? "bg-blue-800 border border-blue-600"
                            : "bg-blue-600 border border-blue-500"
                        }`}
                      >
                        <svg
                          className={`w-5 h-5 ${
                            isDarkMode ? "text-blue-300" : "text-white"
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                          />
                        </svg>
                      </div>
                      <h3
                        className={`text-xl font-semibold ${
                          isDarkMode ? "text-slate-200" : "text-gray-800"
                        }`}
                      >
                        Clinical Summary
                      </h3>
                    </div>
                    <p
                      className={`text-lg leading-relaxed ${
                        isDarkMode ? "text-slate-300" : "text-gray-700"
                      }`}
                    >
                      {currentTopicData.aiSummary}
                    </p>
                  </div>
                </div>

                {/* Navigation Footer */}
                <div className="flex justify-between items-center mt-12 pt-8 border-t border-gray-200">
                  <button
                    onClick={() => {
                      const currentIndex = TOPIC_ORDER.indexOf(activeTab);
                      if (currentIndex > 0) {
                        setActiveTab(TOPIC_ORDER[currentIndex - 1]);
                      }
                    }}
                    disabled={TOPIC_ORDER.indexOf(activeTab) === 0}
                    className={`flex items-center px-6 py-3 rounded-lg font-medium transition-colors ${
                      TOPIC_ORDER.indexOf(activeTab) === 0
                        ? isDarkMode
                          ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                          : "bg-gray-100 text-gray-400 cursor-not-allowed"
                        : isDarkMode
                        ? "bg-slate-800 text-slate-200 hover:bg-slate-700"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    <svg
                      className="w-5 h-5 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                    Previous
                  </button>

                  <span
                    className={`text-sm font-medium ${
                      isDarkMode ? "text-slate-400" : "text-gray-500"
                    }`}
                  >
                    {TOPIC_ORDER.indexOf(activeTab) + 1} of {TOPIC_ORDER.length}
                  </span>

                  <button
                    onClick={() => {
                      const currentIndex = TOPIC_ORDER.indexOf(activeTab);
                      if (currentIndex < TOPIC_ORDER.length - 1) {
                        setActiveTab(TOPIC_ORDER[currentIndex + 1]);
                      }
                    }}
                    disabled={
                      TOPIC_ORDER.indexOf(activeTab) === TOPIC_ORDER.length - 1
                    }
                    className={`flex items-center px-6 py-3 rounded-lg font-medium transition-colors ${
                      TOPIC_ORDER.indexOf(activeTab) === TOPIC_ORDER.length - 1
                        ? isDarkMode
                          ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                          : "bg-gray-100 text-gray-400 cursor-not-allowed"
                        : isDarkMode
                        ? "bg-slate-800 text-slate-200 hover:bg-slate-700"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    Next
                    <svg
                      className="w-5 h-5 ml-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </button>
                </div>
              </>
            ) : (
              // Full View Content
              <div className="space-y-16">
                <div className="text-center mb-12">
                  <h2
                    className={`text-3xl font-semibold tracking-wide mb-4 ${
                      isDarkMode ? "text-slate-100" : "text-gray-900"
                    }`}
                  >
                    Complete Consultation Summary
                  </h2>
                  <div
                    className={`text-sm font-medium uppercase tracking-wider ${
                      isDarkMode ? "text-slate-400" : "text-gray-500"
                    }`}
                  >
                    All Discussion Topics
                  </div>
                </div>

                {TOPIC_ORDER.map((topicName, index) => {
                  const topicData = report.consultationTopics[topicName];
                  return (
                    <div key={topicName} className="relative">
                      {/* Topic Header */}
                      <div className="flex items-center mb-8">
                        <div
                          className={`flex items-center justify-center w-12 h-12 rounded-full mr-6 ${
                            isDarkMode
                              ? "bg-blue-900 border-2 border-blue-700"
                              : "bg-blue-100 border-2 border-blue-300"
                          }`}
                        >
                          <span
                            className={`text-lg font-bold ${
                              isDarkMode ? "text-blue-300" : "text-blue-700"
                            }`}
                          >
                            {index + 1}
                          </span>
                        </div>
                        <div>
                          <h2
                            className={`text-2xl font-semibold tracking-wide ${
                              isDarkMode ? "text-slate-100" : "text-gray-900"
                            }`}
                          >
                            {topicName}
                          </h2>
                          <div
                            className={`text-sm font-medium uppercase tracking-wider mt-1 ${
                              isDarkMode ? "text-slate-400" : "text-gray-500"
                            }`}
                          >
                            Clinical Discussion Points
                          </div>
                        </div>
                      </div>

                      {/* Extracted Sentences */}
                      <div className="mb-10">
                        <div
                          className={`p-8 rounded-xl border-l-4 ${
                            isDarkMode
                              ? "bg-slate-800 border-l-blue-500 border border-slate-700"
                              : "bg-gray-50 border-l-blue-600 border border-gray-200"
                          }`}
                        >
                          <h3
                            className={`text-lg font-semibold mb-6 ${
                              isDarkMode ? "text-slate-200" : "text-gray-800"
                            }`}
                          >
                            Key Statements from Consultation
                          </h3>
                          <div className="space-y-4">
                            {topicData.extractedSentences.map(
                              (sentence, idx) => (
                                <div key={idx} className="flex items-start">
                                  <div
                                    className={`flex-shrink-0 w-2 h-2 rounded-full mt-2.5 mr-4 ${
                                      isDarkMode ? "bg-blue-400" : "bg-blue-600"
                                    }`}
                                  />
                                  <p
                                    className={`text-base leading-relaxed ${
                                      isDarkMode
                                        ? "text-slate-300"
                                        : "text-gray-700"
                                    }`}
                                  >
                                    "{sentence}"
                                  </p>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      </div>

                      {/* AI Summary */}
                      <div>
                        <div
                          className={`p-8 rounded-xl ${
                            isDarkMode
                              ? "bg-gradient-to-br from-slate-800 to-slate-700 border border-slate-600"
                              : "bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200"
                          }`}
                        >
                          <div className="flex items-center mb-6">
                            <div
                              className={`flex items-center justify-center w-8 h-8 rounded-lg mr-3 ${
                                isDarkMode
                                  ? "bg-blue-800 border border-blue-600"
                                  : "bg-blue-600 border border-blue-500"
                              }`}
                            >
                              <svg
                                className={`w-4 h-4 ${
                                  isDarkMode ? "text-blue-300" : "text-white"
                                }`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                                />
                              </svg>
                            </div>
                            <h3
                              className={`text-lg font-semibold ${
                                isDarkMode ? "text-slate-200" : "text-gray-800"
                              }`}
                            >
                              Clinical Summary
                            </h3>
                          </div>
                          <p
                            className={`text-base leading-relaxed ${
                              isDarkMode ? "text-slate-300" : "text-gray-700"
                            }`}
                          >
                            {topicData.aiSummary}
                          </p>
                        </div>
                      </div>

                      {/* Divider for all but last item */}
                      {index < TOPIC_ORDER.length - 1 && (
                        <div
                          className={`mt-16 border-b ${
                            isDarkMode ? "border-slate-700" : "border-gray-200"
                          }`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Professional Footer */}
        <div
          className={`${
            isDarkMode
              ? "bg-gradient-to-r from-slate-900 to-slate-800 border-t border-slate-700"
              : "bg-gradient-to-r from-gray-100 to-gray-50 border-t border-gray-200"
          } shadow-lg`}
        />
      </div>
    </div>
  );
};

/** -------------------- Index + Data loader + Detail switcher -------------------- */
const PAGE_SIZE_DEFAULT = 10;

const PatientConsultationReports: React.FC<PatientConsultationReportsProps> = ({
  isDarkMode = false,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reports, setReports] = useState<ConsultationReport[]>([]);
  const [selected, setSelected] = useState<ConsultationReport | null>(null);

  // Index UI state
  const [q, setQ] = useState("");
  const [patientFilter, setPatientFilter] = useState<string>("ALL");
  const [sortKey, setSortKey] = useState<
    "date_desc" | "date_asc" | "patient_asc"
  >("date_desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  const [dateFrom, setDateFrom] = useState<string>(() => {
    // Set to cover all sample data (start from 2024)
    return "2024-01-01";
  });

  const [dateTo, setDateTo] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });

  // Load sample data only
  useEffect(() => {
    try {
      setLoading(true);
      setError(null);

      const sampleReports = buildSampleReports();
      setReports(sampleReports);
    } catch (e: any) {
      setError(`Failed to load reports: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const patients = useMemo(() => {
    const names = Array.from(
      new Set(reports.map((r) => `${r.patientName} (${r.patientId})`))
    );
    return ["ALL", ...names];
  }, [reports]);

  // Filtering / sorting / pagination
  const filtered = useMemo(() => {
    const norm = (s: string) => s.toLowerCase();
    const qn = norm(q);

    let arr = reports.filter((r) => {
      const matchesQ =
        !qn ||
        norm(r.patientName).includes(qn) ||
        norm(r.patientId).includes(qn) ||
        norm(r.physicianName).includes(qn) ||
        norm(r.consultationDate).includes(qn);

      const matchesPatient =
        patientFilter === "ALL" ||
        `${r.patientName} (${r.patientId})` === patientFilter;

      const t = Date.parse(r.consultationDate);
      const fromOk = !dateFrom || (!isNaN(t) && t >= Date.parse(dateFrom));
      const toOk = !dateTo || (!isNaN(t) && t <= Date.parse(dateTo));

      return matchesQ && matchesPatient && fromOk && toOk;
    });

    arr.sort((a, b) => {
      if (sortKey === "date_desc") {
        return (
          (Date.parse(b.consultationDate) || 0) -
          (Date.parse(a.consultationDate) || 0)
        );
      } else if (sortKey === "date_asc") {
        return (
          (Date.parse(a.consultationDate) || 0) -
          (Date.parse(b.consultationDate) || 0)
        );
      } else {
        const aKey = `${a.patientName} ${a.patientId}`.toLowerCase();
        const bKey = `${b.patientName} ${b.patientId}`.toLowerCase();
        return aKey.localeCompare(bKey);
      }
    });

    return arr;
  }, [reports, q, patientFilter, sortKey, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageSlice = useMemo(() => {
    const start = (pageSafe - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageSafe, pageSize]);

  /** -------------------- Shared control styles for the filter bar -------------------- */
  const controlBase =
    (isDarkMode
      ? "bg-slate-800/80 text-slate-100 placeholder-slate-400 border border-slate-700 focus:ring-blue-600/50"
      : "bg-gray-100 text-gray-900 placeholder-gray-500 border border-gray-300 focus:ring-blue-500/40") +
    " rounded-lg px-3 h-10 w-full outline-none focus:ring-2 transition disabled:opacity-60";
  const selectBase = controlBase + " pr-9 appearance-none";
  const inputBase = controlBase + " py-2";

  /** -------------------- Loading / Error -------------------- */
  if (loading) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${
          isDarkMode ? "bg-slate-950" : "bg-gray-50"
        }`}
      >
        <div className="text-center">
          <div
            className={`animate-spin rounded-full h-12 w-12 border-b-2 mb-4 mx-auto ${
              isDarkMode ? "border-blue-400" : "border-blue-600"
            }`}
          />
          <div
            className={`text-lg font-medium ${
              isDarkMode ? "text-slate-300" : "text-gray-700"
            }`}
          >
            Loading reports...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center p-8 ${
          isDarkMode ? "bg-slate-950" : "bg-gray-50"
        }`}
      >
        <div
          className={`max-w-md w-full p-8 rounded-xl shadow-2xl ${
            isDarkMode
              ? "bg-red-950 border border-red-800"
              : "bg-white border border-red-200"
          }`}
        >
          <div className="text-center">
            <h2
              className={`text-xl font-semibold mb-2 ${
                isDarkMode ? "text-red-100" : "text-red-900"
              }`}
            >
              Unable to Load Reports
            </h2>
            <p
              className={`${
                isDarkMode ? "text-red-200" : "text-red-700"
              } mb-6 text-sm`}
            >
              {error}
            </p>
            <button
              onClick={() => window.location.reload()}
              className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
                isDarkMode
                  ? "bg-red-800 text-red-100 hover:bg-red-700"
                  : "bg-red-600 text-white hover:bg-red-700"
              }`}
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }

  /** -------------------- Detail mode -------------------- */
  if (selected) {
    return (
      <PatientReportDetail
        report={selected}
        isDarkMode={isDarkMode}
        onBack={() => setSelected(null)}
      />
    );
  }

  /** -------------------- Index (table) -------------------- */
  return (
    <div
      className={
        isDarkMode ? "bg-slate-950 min-h-screen" : "bg-gray-50 min-h-screen"
      }
    >
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-6">
          <h1
            className={
              isDarkMode
                ? "text-slate-100 text-3xl font-semibold"
                : "text-gray-900 text-3xl font-semibold"
            }
          >
            Consultation Reports
          </h1>
          {/* <p
            className={
              isDarkMode ? "text-slate-400 mt-1" : "text-gray-600 mt-1"
            }
          >
            Browse, filter, and open any report. Supports thousands of records.
          </p> */}
        </div>

        {/* Controls */}
        <div
          className={`rounded-xl mb-6 p-4 ${
            isDarkMode
              ? "bg-slate-900/70 border border-slate-800"
              : "bg-white border border-gray-200"
          }`}
        >
          {/* 1 col on mobile → 2 on md → 6 on lg */}

          <div
            className={`bg-white ${
              isDarkMode ? "dark:bg-slate-800" : ""
            } rounded-lg border ${
              isDarkMode ? "border-slate-700" : "border-gray-200"
            } shadow-sm p-6 mb-6`}
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
              {/* Patient Filter */}
              <div className="lg:col-span-4">
                <label
                  className={`block text-sm font-medium mb-2 ${
                    isDarkMode ? "text-slate-200" : "text-gray-700"
                  }`}
                >
                  Patient
                </label>
                <div className="relative">
                  <select
                    className={`${selectBase} truncate appearance-none w-full pr-10`}
                    value={patientFilter}
                    onChange={(e) => {
                      setPatientFilter(e.target.value);
                      setPage(1);
                    }}
                  >
                    {patients.map((p) => (
                      <option key={p} value={p}>
                        {p === "ALL" ? "All patients" : p}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                    <svg
                      className={`h-4 w-4 ${
                        isDarkMode ? "text-slate-400" : "text-gray-400"
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Sort */}
              <div className="lg:col-span-3">
                <label
                  className={`block text-sm font-medium mb-2 ${
                    isDarkMode ? "text-slate-200" : "text-gray-700"
                  }`}
                >
                  Sort by
                </label>
                <div className="relative">
                  <select
                    className={`${selectBase} truncate appearance-none w-full pr-10`}
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as any)}
                  >
                    <option value="date_desc">Newest first</option>
                    <option value="date_asc">Oldest first</option>
                    <option value="patient_asc">Patient A→Z</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                    <svg
                      className={`h-4 w-4 ${
                        isDarkMode ? "text-slate-400" : "text-gray-400"
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Date Range */}
              <div className="lg:col-span-5">
                <label
                  className={`block text-sm font-medium mb-2 ${
                    isDarkMode ? "text-slate-200" : "text-gray-700"
                  }`}
                >
                  Date Range
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="relative">
                    <input
                      type="date"
                      className={`${inputBase} w-full`}
                      value={dateFrom}
                      onChange={(e) => {
                        setDateFrom(e.target.value);
                        setPage(1);
                      }}
                      max={dateTo || new Date().toISOString().split("T")[0]}
                    />
                    <label
                      className={`absolute -top-2 left-3 bg-white ${
                        isDarkMode ? "dark:bg-slate-800" : ""
                      } px-1 text-xs ${
                        isDarkMode ? "text-slate-400" : "text-gray-500"
                      }`}
                    >
                      From
                    </label>
                  </div>
                  <div className="relative">
                    <input
                      type="date"
                      className={`${inputBase} w-full`}
                      value={dateTo}
                      onChange={(e) => {
                        setDateTo(e.target.value);
                        setPage(1);
                      }}
                      min={dateFrom}
                      max={new Date().toISOString().split("T")[0]}
                    />
                    <label
                      className={`absolute -top-2 left-3 bg-white ${
                        isDarkMode ? "dark:bg-slate-800" : ""
                      } px-1 text-xs ${
                        isDarkMode ? "text-slate-400" : "text-gray-500"
                      }`}
                    >
                      To
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div
          className={`rounded-xl overflow-hidden ${
            isDarkMode
              ? "bg-slate-900 border border-slate-800"
              : "bg-white border border-gray-200"
          }`}
        >
          <div
            className={`grid grid-cols-12 px-4 py-3 text-xs font-semibold uppercase tracking-wider ${
              isDarkMode ? "text-slate-400" : "text-gray-500"
            }`}
          >
            <div className="col-span-5">Patient</div>
            <div className="col-span-4">Consultation Date</div>
            <div className="col-span-3">Physician</div>
          </div>

          {pageSlice.length === 0 ? (
            <div
              className={
                isDarkMode ? "text-slate-400 p-6" : "text-gray-600 p-6"
              }
            >
              No reports match your filters.
            </div>
          ) : (
            pageSlice.map((r, idx) => {
              return (
                <button
                  key={`${r.patientId}-${r.consultationDate}-${idx}`}
                  onClick={() => setSelected(r)}
                  className={`grid grid-cols-12 w-full text-left px-4 py-4 border-t ${
                    isDarkMode
                      ? "border-slate-800 hover:bg-slate-800/70"
                      : "border-gray-100 hover:bg-gray-50"
                  }`}
                >
                  <div className="col-span-5">
                    <div
                      className={
                        isDarkMode ? "text-slate-100" : "text-gray-900"
                      }
                    >
                      {r.patientName}{" "}
                      <span className="opacity-60">({r.patientId})</span>
                    </div>
                  </div>
                  <div
                    className={
                      isDarkMode
                        ? "col-span-4 text-slate-200"
                        : "col-span-4 text-gray-800"
                    }
                  >
                    {r.consultationDate}
                  </div>
                  <div
                    className={
                      isDarkMode
                        ? "col-span-3 text-slate-200"
                        : "col-span-3 text-gray-800"
                    }
                  >
                    {r.physicianName}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Pagination */}
        <div className="mt-4 flex items-center justify-between">
          <div
            className={
              isDarkMode ? "text-slate-400 text-sm" : "text-gray-600 text-sm"
            }
          >
            Showing {(pageSafe - 1) * pageSize + 1}–
            {Math.min(pageSafe * pageSize, filtered.length)} of{" "}
            {filtered.length}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(parseInt(e.target.value, 10));
                setPage(1);
              }}
              className={`px-3 py-2 rounded-lg ${
                isDarkMode
                  ? "bg-slate-900 border border-slate-700 text-slate-100"
                  : "bg-white border border-gray-300 text-gray-900"
              }`}
              title="Rows per page"
            >
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>

            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pageSafe === 1}
              className={`px-3 py-2 rounded-lg ${
                pageSafe === 1
                  ? isDarkMode
                    ? "bg-slate-900 border border-slate-800 text-slate-600 cursor-not-allowed"
                    : "bg-white border border-gray-200 text-gray-400 cursor-not-allowed"
                  : isDarkMode
                  ? "bg-slate-900 border border-slate-700 text-slate-100 hover:bg-slate-800"
                  : "bg-white border border-gray-300 text-gray-900 hover:bg-gray-100"
              }`}
              title="Previous page"
            >
              ←
            </button>
            <span className={isDarkMode ? "text-slate-300" : "text-gray-800"}>
              {pageSafe} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={pageSafe === totalPages}
              className={`px-3 py-2 rounded-lg ${
                pageSafe === totalPages
                  ? isDarkMode
                    ? "bg-slate-900 border border-slate-800 text-slate-600 cursor-not-allowed"
                    : "bg-white border border-gray-200 text-gray-400 cursor-not-allowed"
                  : isDarkMode
                  ? "bg-slate-900 border border-slate-700 text-slate-100 hover:bg-slate-800"
                  : "bg-white border border-gray-300 text-gray-900 hover:bg-gray-100"
              }`}
              title="Next page"
            >
              →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PatientConsultationReports;
