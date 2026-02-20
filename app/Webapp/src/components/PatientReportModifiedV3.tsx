"use client";

// PatientReport.tsx
// Language: TypeScript/React (TailwindCSS for styling)
// NOTE: This file includes explicit "CHANGE" comments to make refactoring easy.

import React, { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";

interface PatientReportProps {
  isDarkMode?: boolean;
}

/* ---------------------------------------------
   SMALL UTILS
---------------------------------------------- */
const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");

/* ---------------------------------------------
   CHANGE 4: Reusable Star Rating (Overall + per-topic feedback)
---------------------------------------------- */
const StarRating: React.FC<{
  value: number;
  onChange: (v: number) => void;
  label?: string;
  isDark?: boolean;
}> = ({ value, onChange, label, isDark }) => {
  return (
    <div className="flex items-center gap-3">
      {label && (
        <span
          className={cx(
            "text-sm font-medium",
            isDark ? "text-slate-300" : "text-gray-700"
          )}
        >
          {label}
        </span>
      )}
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            aria-label={`Rate ${i}`}
            onClick={() => onChange(i)}
            className={cx(
              "w-8 h-8 rounded-full grid place-items-center border transition",
              isDark
                ? "border-slate-700 hover:bg-slate-800"
                : "border-gray-300 hover:bg-gray-100",
              value >= i
                ? isDark
                  ? "bg-blue-700 text-blue-100"
                  : "bg-blue-600 text-white"
                : isDark
                ? "text-slate-400"
                : "text-gray-500"
            )}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
};

/* ---------------------------------------------
   MAIN COMPONENT
---------------------------------------------- */
const PatientReport: React.FC<PatientReportProps> = ({
  isDarkMode = false,
}) => {
  const [patientData, setPatientData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ---------------------------------------------
     CHANGE 1: IA Shift — Landing = Overall Summary
     - activeTab === null → landing (Overall Summary only).
     - Selecting a topic hides Overall Summary and shows that topic.
  ---------------------------------------------- */
  const [activeTab, setActiveTab] = useState<string | null>(null);

  /* ---------------------------------------------
     CHANGE 5: viewMode
     - "topics": landing + selected topic
     - "full": continuous view (Overall + all topics)
  ---------------------------------------------- */
  const [viewMode, setViewMode] = useState<"topics" | "full">("topics");

  /* ---------------------------------------------
     CHANGE 4 (cont.): Ratings State
  ---------------------------------------------- */
  const [ratings, setRatings] = useState<{
    overall: number;
    [k: string]: number;
  }>({ overall: 0 });

  /* ---------------------------------------------
     CHANGE 3: Key Statements default = collapsed
  ---------------------------------------------- */
  const [showKeys, setShowKeys] = useState<{ [k: string]: boolean }>({});

  /* ---------------------------------------------
     DATA: Sample + reader
     - Added "overallSummary" for landing card.
  ---------------------------------------------- */
  const generateSamplePatientData = () => {
    return {
      patientName: "Patient A",
      patientId: "P001",
      consultationDate: "September 4, 2025",
      physicianName: "Dr. Smith",
      /* CHANGE 1: New overall summary */
      overallSummary:
        "You have an intermediate-risk prostate cancer, on the higher end of the scale. Although the 15-year mortality risk (about 12%) is relatively low, your young age and long life expectancy make active treatment advisable. Surgery offers strong local control and future treatment options if needed. There is a 40–50% chance of recovering baseline erectile function, though recovery may take time and supportive therapies are available. Most patients regain bladder control within a year, and only a few require further procedures. Since you currently have minimal urinary symptoms, surgery may help avoid bladder irritation that can occur with radiation.Overall, proactive treatment provides the best long-term outlook.",
      consultationTopics: {
        "Cancer Prognosis": {
          extractedSentences: [
            "So 12% risk of death from prostate cancer at 15 years is small in the grand scheme of things",
            "but it's a little bit too high for doctors, so 1 in 10 chance",
            "actually 1.2 in 10 chance of dying of prostate cancer is too much",
            "We would treat with surgery or radiation",
            "For the majority of these unfavorable risks, I do recommend treatment",
          ],
          aiSummary:
            "Based on your situation, you have a tumor that is considered intermediate-risk, on the higher end. Given your young age, surgery offers good local control and options for future therapy if needed. While the long-term risk is not negligible, planning for the long term helps ensure the best outcomes.",
        },
        "Life Expectancy": {
          extractedSentences: [
            "like i said, you've got 40 years ahead of you",
            "so that's a good thing for a patient who has a lot of years ahead of them",
            "but for a person like you who is young and has, you know, you know, you've got 40 years ahead of you",
            "but for you, having many years ahead of you, you have an intermediate-risk tumor that's kind of on the high end of the intermediate-risk scale",
            "but personally, i think, you know, you're a young man, you've got a ton of years ahead of you, surgery gives you good local control, and it gives you the options for salvage therapy if you need it in the future",
          ],
          aiSummary:
            "Your care team emphasized that you have many productive years ahead. This influences planning: there is enough time for cancer to progress if untreated, but also strong capacity to benefit from treatment and recovery.",
        },
        "Erectile Dysfunction": {
          extractedSentences: [
            "For erectile function, again, I quoted you a 40-50% chance",
            "of getting to your baseline function",
            "Surgery gives you good local control",
            "Recovery may take time",
            "There are various treatment options available",
          ],
          aiSummary:
            "There is an estimated 40–50% chance of maintaining baseline erectile function. Recovery is gradual, and supportive options are available to help along the way.",
        },
        "Urinary Incontinence": {
          extractedSentences: [
            "But by a year 90% of men will not need a pad beyond a year",
            "and only 5% of men would need potentially a surgery",
            "to correct a lot of leakage",
            "Temporary incontinence may occur",
            "Most patients improve over time",
          ],
          aiSummary:
            "Most patients recover bladder control within a year. A small minority need additional procedures; your team will monitor and support recovery.",
        },
        "Irritative Urinary Symptoms": {
          extractedSentences: [
            "You don't really have many urinary symptoms now",
            "no urgency, frequency, but those symptoms get worse after radiation",
            "because the beam hits the bladder and makes the bladder irritable",
            "Surgery may have fewer such symptoms",
            "Most symptoms improve over time",
          ],
          aiSummary:
            "You have few urinary symptoms now. Radiation can temporarily irritate the bladder; surgical approaches often have fewer irritative symptoms. Any changes typically improve with healing.",
        },
      },
    };
  };

  /* ORIGINAL: Load-from-Excel-first, fallback to sample */
  const loadPatientData = async () => {
    try {
      setLoading(true);
      try {
        const response = await (window as any).fs.readFile(
          "nlpextractedsentences_subset.xlsx"
        );
        const workbook = XLSX.read(response, {
          cellStyles: true,
          cellFormulas: true,
          cellDates: true,
          cellNF: true,
          sheetStubs: true,
        });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        const processedData = processExcelDataForPatient(jsonData);
        setPatientData(processedData);
      } catch (fileError) {
        console.log("Excel file not found. Using sample data.");
        const sampleData = generateSamplePatientData();
        setPatientData(sampleData);
      }
    } catch (err: any) {
      setError("Error loading consultation data: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  /* ORIGINAL: Processing stub (kept) */
  const processExcelDataForPatient = (rawData: any[]) => {
    // TODO: Map rawData -> {overallSummary, consultationTopics}
    return generateSamplePatientData();
  };

  useEffect(() => {
    loadPatientData();

    // Add print styles
    const style = document.createElement("style");
    style.textContent = `
      @media print {
        body * {
          visibility: hidden;
        }
        #report-content, #report-content * {
          visibility: visible;
        }
        #report-content {
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
        }
        .no-print {
          display: none !important;
        }
        button {
          display: none !important;
        }
        @page {
          size: A4;
          margin: 1.5cm;
        }
        * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  /* ORIGINAL: Topic keys + safe current topic pointer */
  const topicKeys: string[] = useMemo(
    () => (patientData ? Object.keys(patientData.consultationTopics) : []),
    [patientData]
  );
  const currentTopicData = activeTab
    ? patientData?.consultationTopics?.[activeTab]
    : null;

  /* CHANGE 3: Toggle key-statements visibility per topic */
  const toggleKeyVisibility = (topic: string) =>
    setShowKeys((s) => ({ ...s, [topic]: !s[topic] }));

  /* CHANGE 4: Set per-topic rating */
  const setTopicRating = (topic: string, v: number) =>
    setRatings((r) => ({ ...r, [topic]: v }));

  /* PDF Download Handler */
  const handleDownloadPdf = async () => {
    const originalViewMode = viewMode;
    const originalActiveTab = activeTab;

    setViewMode("full");
    setActiveTab(null);

    await new Promise((resolve) => setTimeout(resolve, 500));

    window.print();

    setTimeout(() => {
      setViewMode(originalViewMode);
      setActiveTab(originalActiveTab);
    }, 1000);
  };

  /* ---------------------------------------------
     LOADING / ERROR STATES (unchanged styling)
  ---------------------------------------------- */
  if (loading) {
    return (
      <div
        className={cx(
          "min-h-screen flex items-center justify-center",
          isDarkMode ? "bg-slate-950" : "bg-gray-50"
        )}
      >
        <div className="text-center">
          <div
            className={cx(
              "animate-spin rounded-full h-12 w-12 border-b-2 mb-4 mx-auto",
              isDarkMode ? "border-blue-400" : "border-blue-600"
            )}
          />
          <div
            className={cx(
              "text-lg font-medium",
              isDarkMode ? "text-slate-300" : "text-gray-700"
            )}
          >
            Loading consultation summary...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cx(
          "min-h-screen flex items-center justify-center p-8",
          isDarkMode ? "bg-slate-950" : "bg-gray-50"
        )}
      >
        <div
          className={cx(
            "max-w-md w-full p-8 rounded-xl shadow-2xl",
            isDarkMode
              ? "bg-red-950 border border-red-800"
              : "bg-white border border-red-200"
          )}
        >
          <div className="text-center">
            <div
              className={cx(
                "w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center",
                isDarkMode ? "bg-red-900" : "bg-red-100"
              )}
            >
              <svg
                className={cx(
                  "w-8 h-8",
                  isDarkMode ? "text-red-400" : "text-red-600"
                )}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <h2
              className={cx(
                "text-xl font-semibold mb-2",
                isDarkMode ? "text-red-100" : "text-red-900"
              )}
            >
              Unable to Load Report
            </h2>
            <p
              className={cx(
                "mb-6 text-sm",
                isDarkMode ? "text-red-200" : "text-red-700"
              )}
            >
              {error}
            </p>
            <button
              onClick={loadPatientData}
              className={cx(
                "px-6 py-2 rounded-lg text-sm font-medium transition-colors",
                isDarkMode
                  ? "bg-red-800 text-red-100 hover:bg-red-700"
                  : "bg-red-600 text-white hover:bg-red-700"
              )}
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!patientData) return null;

  /* ---------------------------------------------
     PAGE SHELL
  ---------------------------------------------- */
  return (
    <div
      className={cx("min-h-screen", isDarkMode ? "bg-slate-950" : "bg-gray-50")}
    >
      <div className="max-w-6xl mx-auto" id="report-content">
        {/* HEADER (unchanged visuals) */}
        <div
          className={cx(
            isDarkMode
              ? "bg-gradient-to-r from-slate-900 to-slate-800 border-b border-slate-700"
              : "bg-gradient-to-r from-white to-gray-50 border-b border-gray-200",
            "shadow-lg"
          )}
        >
          <div className="px-12 py-10">
            <div className="text-center">
              <div
                className={cx(
                  "inline-flex items-center justify-center w-16 h-16 rounded-full mb-6",
                  isDarkMode
                    ? "bg-blue-900 border-2 border-blue-700"
                    : "bg-blue-100 border-2 border-blue-300"
                )}
              >
                <svg
                  className={cx(
                    "w-8 h-8",
                    isDarkMode ? "text-blue-400" : "text-blue-600"
                  )}
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
                className={cx(
                  "text-4xl font-light mb-3 tracking-wide",
                  isDarkMode ? "text-slate-100" : "text-gray-900"
                )}
              >
                PATIENT CONSULTATION REPORT
              </h1>
              <div
                className={cx(
                  "text-sm font-medium tracking-wider uppercase mb-8",
                  isDarkMode ? "text-slate-400" : "text-gray-500"
                )}
              >
                Prostate Cancer Treatment Discussion Summary
              </div>

              {/* PDF Download Button */}
              <div className="mb-8 no-print">
                <button
                  onClick={handleDownloadPdf}
                  className={cx(
                    "inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all",
                    isDarkMode
                      ? "bg-blue-700 text-blue-100 hover:bg-blue-600 shadow-lg hover:shadow-xl"
                      : "bg-blue-600 text-white hover:bg-blue-700 shadow-lg hover:shadow-xl"
                  )}
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                    />
                  </svg>
                  <span>Print / Save as PDF</span>
                </button>
              </div>

              {/* View mode toggle (kept) */}
              <div className="mb-8 no-print">
                <div
                  className={cx(
                    "inline-flex rounded-lg p-1",
                    isDarkMode ? "bg-slate-800" : "bg-gray-100"
                  )}
                >
                  <button
                    onClick={() => setViewMode("topics")}
                    className={cx(
                      "px-6 py-2 text-sm font-medium rounded-md transition-colors",
                      viewMode === "topics"
                        ? isDarkMode
                          ? "bg-blue-700 text-blue-100"
                          : "bg-blue-600 text-white"
                        : isDarkMode
                        ? "text-slate-400 hover:text-slate-200"
                        : "text-gray-600 hover:text-gray-800"
                    )}
                  >
                    Summary & Topics
                  </button>
                  <button
                    onClick={() => setViewMode("full")}
                    className={cx(
                      "px-6 py-2 text-sm font-medium rounded-md transition-colors",
                      viewMode === "full"
                        ? isDarkMode
                          ? "bg-blue-700 text-blue-100"
                          : "bg-blue-600 text-white"
                        : isDarkMode
                        ? "text-slate-400 hover:text-slate-200"
                        : "text-gray-600 hover:text-gray-800"
                    )}
                  >
                    Full Report
                  </button>
                </div>
                <div
                  className={cx(
                    "text-xs mt-2 text-center",
                    isDarkMode ? "text-slate-500" : "text-gray-500"
                  )}
                >
                  {viewMode === "topics"
                    ? "Start with the overall summary, then explore topics."
                    : "View all topics continuously."}
                </div>
              </div>

              {/* Patient meta */}
              <div
                className={cx(
                  "grid grid-cols-1 md:grid-cols-3 gap-6 text-center",
                  isDarkMode ? "text-slate-200" : "text-gray-700"
                )}
              >
                <div>
                  <div
                    className={cx(
                      "text-xs font-semibold uppercase tracking-wider mb-1",
                      isDarkMode ? "text-slate-400" : "text-gray-500"
                    )}
                  >
                    Patient
                  </div>
                  <div className="text-lg font-medium">
                    {patientData.patientName}
                  </div>
                  <div
                    className={cx(
                      "text-sm",
                      isDarkMode ? "text-slate-400" : "text-gray-500"
                    )}
                  >
                    ID: {patientData.patientId}
                  </div>
                </div>
                <div>
                  <div
                    className={cx(
                      "text-xs font-semibold uppercase tracking-wider mb-1",
                      isDarkMode ? "text-slate-400" : "text-gray-500"
                    )}
                  >
                    Consultation Date
                  </div>
                  <div className="text-lg font-medium">
                    {patientData.consultationDate}
                  </div>
                </div>
                <div>
                  <div
                    className={cx(
                      "text-xs font-semibold uppercase tracking-wider mb-1",
                      isDarkMode ? "text-slate-400" : "text-gray-500"
                    )}
                  >
                    Attending Physician
                  </div>
                  <div className="text-lg font-medium">
                    {patientData.physicianName}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ---------------------------------------------
           BODY
        ---------------------------------------------- */}
        {viewMode === "topics" ? (
          <div
            className={cx(
              isDarkMode ? "bg-slate-900" : "bg-white",
              "shadow-xl min-h-screen"
            )}
          >
            <div className="px-6 lg:px-12 py-12 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-10">
              {/* MAIN COLUMN */}
              <div>
                {/* CHANGE 1: Overall Summary shown ONLY on landing (activeTab === null) */}
                {activeTab === null && (
                  <section
                    className={cx(
                      "p-8 rounded-xl mb-10",
                      isDarkMode
                        ? "bg-gradient-to-br from-slate-800 to-slate-700 border border-slate-600"
                        : "bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200"
                    )}
                  >
                    <div className="flex items-start justify-between gap-4 mb-6">
                      <h2
                        className={cx(
                          "text-2xl font-semibold",
                          isDarkMode ? "text-slate-100" : "text-gray-900"
                        )}
                      >
                        Overall Summary
                      </h2>
                      <StarRating
                        value={ratings.overall || 0}
                        onChange={(v) =>
                          setRatings((r) => ({ ...r, overall: v }))
                        }
                        label="Was this helpful?"
                        isDark={isDarkMode}
                      />
                    </div>
                    <p
                      className={cx(
                        "text-lg leading-relaxed",
                        isDarkMode ? "text-slate-300" : "text-gray-700"
                      )}
                    >
                      {patientData.overallSummary}
                    </p>
                  </section>
                )}

                {/* CHANGE 1 + CHANGE 6: Topic detail when selected; Key Statements moved BELOW Summary */}
                {activeTab !== null && (
                  <section>
                    {/* Topic Header */}
                    <div className="mb-8">
                      <div className="flex items-center mb-3">
                        <div
                          className={cx(
                            "flex items-center justify-center w-14 h-14 rounded-full mr-4",
                            isDarkMode
                              ? "bg-blue-900 border-2 border-blue-700"
                              : "bg-blue-100 border-2 border-blue-300"
                          )}
                        >
                          <span
                            className={cx(
                              "text-xl font-bold",
                              isDarkMode ? "text-blue-300" : "text-blue-700"
                            )}
                          >
                            {topicKeys.indexOf(activeTab) + 1 || 1}
                          </span>
                        </div>
                        <h3
                          className={cx(
                            "text-2xl font-semibold tracking-wide",
                            isDarkMode ? "text-slate-100" : "text-gray-900"
                          )}
                        >
                          {activeTab}
                        </h3>
                      </div>
                    </div>

                    {/* Topic Summary + Rating */}
                    <div
                      className={cx(
                        "p-8 rounded-xl mb-6",
                        isDarkMode
                          ? "bg-gradient-to-br from-slate-800 to-slate-700 border border-slate-600"
                          : "bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200"
                      )}
                    >
                      <div className="flex items-start justify-between gap-4 mb-6">
                        <h4
                          className={cx(
                            "text-xl font-semibold",
                            isDarkMode ? "text-slate-200" : "text-gray-800"
                          )}
                        >
                          Summary for {activeTab}
                        </h4>
                        <StarRating
                          value={ratings[activeTab] || 0}
                          onChange={(v) => setTopicRating(activeTab, v)}
                          label="Rate clarity"
                          isDark={isDarkMode}
                        />
                      </div>
                      <p
                        className={cx(
                          "text-lg leading-relaxed",
                          isDarkMode ? "text-slate-300" : "text-gray-700"
                        )}
                      >
                        {currentTopicData?.aiSummary}
                      </p>
                    </div>

                    {/* CHANGE 6: Key Statements BELOW Summary (collapsed by default) */}
                    <div className="mb-8">
                      <button
                        type="button"
                        onClick={() => toggleKeyVisibility(activeTab)}
                        className={cx(
                          "px-4 py-2 rounded-lg text-sm font-medium mb-4",
                          isDarkMode
                            ? "bg-slate-800 text-slate-200 hover:bg-slate-700"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        )}
                      >
                        {showKeys[activeTab]
                          ? "Hide key statements"
                          : "Show key statements"}
                      </button>

                      {showKeys[activeTab] && (
                        <div
                          className={cx(
                            "p-6 rounded-xl border-l-4",
                            isDarkMode
                              ? "bg-slate-800 border-l-blue-500 border border-slate-700"
                              : "bg-gray-50 border-l-blue-600 border border-gray-200"
                          )}
                        >
                          <h4
                            className={cx(
                              "text-lg font-semibold mb-4",
                              isDarkMode ? "text-slate-200" : "text-gray-800"
                            )}
                          >
                            Key Statements from Consultation
                          </h4>
                          <div className="space-y-4">
                            {currentTopicData?.extractedSentences?.map(
                              (sentence: string, idx: number) => (
                                <div key={idx} className="flex items-start">
                                  <div
                                    className={cx(
                                      "flex-shrink-0 w-2 h-2 rounded-full mt-2 mr-4",
                                      isDarkMode ? "bg-blue-400" : "bg-blue-600"
                                    )}
                                  />
                                  <p
                                    className={cx(
                                      "text-base leading-relaxed",
                                      isDarkMode
                                        ? "text-slate-300"
                                        : "text-gray-700"
                                    )}
                                  >
                                    "{sentence}"
                                  </p>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </section>
                )}
              </div>

              {/* CHANGE 2: Right Sidebar Navigation */}
              <aside className={cx("lg:sticky lg:top-6 h-max no-print")}>
                <div
                  className={cx(
                    "rounded-2xl p-4",
                    isDarkMode
                      ? "bg-slate-800 border border-slate-700"
                      : "bg-white border border-gray-200 shadow-sm"
                  )}
                >
                  <h3
                    className={cx(
                      "text-sm font-semibold mb-3",
                      isDarkMode ? "text-slate-200" : "text-gray-800"
                    )}
                  >
                    Navigate
                  </h3>
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab(null)}
                      className={cx(
                        "w-full text-left px-3 py-2 rounded-lg text-sm font-medium",
                        activeTab === null
                          ? isDarkMode
                            ? "bg-blue-700 text-blue-100"
                            : "bg-blue-600 text-white"
                          : isDarkMode
                          ? "text-slate-300 hover:bg-slate-700"
                          : "text-gray-700 hover:bg-gray-100"
                      )}
                    >
                      Overall Summary
                    </button>
                    {topicKeys.map((topic, idx) => (
                      <button
                        type="button"
                        key={topic}
                        onClick={() => setActiveTab(topic)}
                        className={cx(
                          "w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2",
                          activeTab === topic
                            ? isDarkMode
                              ? "bg-blue-700 text-blue-100"
                              : "bg-blue-600 text-white"
                            : isDarkMode
                            ? "text-slate-300 hover:bg-slate-700"
                            : "text-gray-700 hover:bg-gray-100"
                        )}
                      >
                        <span
                          className={cx(
                            "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold",
                            activeTab === topic
                              ? isDarkMode
                                ? "bg-blue-800 text-blue-200"
                                : "bg-blue-500 text-white"
                              : isDarkMode
                              ? "bg-slate-700 text-slate-300"
                              : "bg-gray-200 text-gray-700"
                          )}
                        >
                          {idx + 1}
                        </span>
                        {topic}
                      </button>
                    ))}
                  </div>
                </div>
              </aside>
            </div>
          </div>
        ) : (
          /* FULL MODE: Continuous reading — Overall at top + all topics,
             and CHANGE 6 applied: Key Statements shown BELOW each topic Summary. */
          <div
            className={cx(
              isDarkMode ? "bg-slate-900" : "bg-white",
              "shadow-xl min-h-screen"
            )}
          >
            <div className="px-12 py-12">
              <div className="text-center mb-12">
                <h2
                  className={cx(
                    "text-3xl font-semibold tracking-wide mb-4",
                    isDarkMode ? "text-slate-100" : "text-gray-900"
                  )}
                >
                  Complete Consultation Summary
                </h2>
                <div
                  className={cx(
                    "text-sm font-medium uppercase tracking-wider",
                    isDarkMode ? "text-slate-400" : "text-gray-500"
                  )}
                >
                  All Discussion Topics
                </div>
              </div>

              {/* Overall Summary at top (full mode) */}
              <section
                className={cx(
                  "p-8 rounded-xl mb-12",
                  isDarkMode
                    ? "bg-gradient-to-br from-slate-800 to-slate-700 border border-slate-600"
                    : "bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200"
                )}
              >
                <div className="flex items-start justify-between gap-4 mb-6">
                  <h3
                    className={cx(
                      "text-2xl font-semibold",
                      isDarkMode ? "text-slate-100" : "text-gray-900"
                    )}
                  >
                    Overall Summary
                  </h3>
                  <StarRating
                    value={ratings.overall || 0}
                    onChange={(v) => setRatings((r) => ({ ...r, overall: v }))}
                    label="Was this helpful?"
                    isDark={isDarkMode}
                  />
                </div>
                <p
                  className={cx(
                    "text-lg leading-relaxed",
                    isDarkMode ? "text-slate-300" : "text-gray-700"
                  )}
                >
                  {patientData.overallSummary}
                </p>
              </section>

              {/* Divider after Overall Summary */}
              <div className="py-8">
                <div
                  className={cx(
                    "border-t-2",
                    isDarkMode ? "border-slate-700" : "border-gray-300"
                  )}
                />
              </div>

              {Object.entries<any>(patientData.consultationTopics).map(
                ([topicName, topicData], index) => (
                  <div key={topicName} className="relative">
                    {/* Topic Header */}
                    <div className="flex items-center mb-6">
                      <div
                        className={cx(
                          "flex items-center justify-center w-12 h-12 rounded-full mr-6",
                          isDarkMode
                            ? "bg-blue-900 border-2 border-blue-700"
                            : "bg-blue-100 border-2 border-blue-300"
                        )}
                      >
                        <span
                          className={cx(
                            "text-lg font-bold",
                            isDarkMode ? "text-blue-300" : "text-blue-700"
                          )}
                        >
                          {index + 1}
                        </span>
                      </div>
                      <div>
                        <h2
                          className={cx(
                            "text-2xl font-semibold tracking-wide",
                            isDarkMode ? "text-slate-100" : "text-gray-900"
                          )}
                        >
                          {topicName}
                        </h2>
                      </div>
                    </div>

                    {/* Topic Summary + Rating */}
                    <div
                      className={cx(
                        "p-8 rounded-xl mb-6",
                        isDarkMode
                          ? "bg-gradient-to-br from-slate-800 to-slate-700 border border-slate-600"
                          : "bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200"
                      )}
                    >
                      <div className="flex items-start justify-between gap-4 mb-6">
                        <h3
                          className={cx(
                            "text-lg font-semibold",
                            isDarkMode ? "text-slate-200" : "text-gray-800"
                          )}
                        >
                          Summary
                        </h3>
                        <StarRating
                          value={ratings[topicName] || 0}
                          onChange={(v) => setTopicRating(topicName, v)}
                          label="Rate clarity"
                          isDark={isDarkMode}
                        />
                      </div>
                      <p
                        className={cx(
                          "text-base leading-relaxed",
                          isDarkMode ? "text-slate-300" : "text-gray-700"
                        )}
                      >
                        {topicData.aiSummary}
                      </p>
                    </div>

                    {/* CHANGE 6 (full-mode): Key Statements BELOW Summary */}
                    <div className="mb-12">
                      <button
                        type="button"
                        onClick={() => toggleKeyVisibility(topicName)}
                        className={cx(
                          "px-4 py-2 rounded-lg text-sm font-medium mb-4",
                          isDarkMode
                            ? "bg-slate-800 text-slate-200 hover:bg-slate-700"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        )}
                      >
                        {showKeys[topicName]
                          ? "Hide key statements"
                          : "Show key statements"}
                      </button>

                      {showKeys[topicName] && (
                        <div
                          className={cx(
                            "p-6 rounded-xl border-l-4",
                            isDarkMode
                              ? "bg-slate-800 border-l-blue-500 border border-slate-700"
                              : "bg-gray-50 border-l-blue-600 border border-gray-200"
                          )}
                        >
                          <h3
                            className={cx(
                              "text-lg font-semibold mb-4",
                              isDarkMode ? "text-slate-200" : "text-gray-800"
                            )}
                          >
                            Key Statements from Consultation
                          </h3>
                          <div className="space-y-3">
                            {topicData.extractedSentences.map(
                              (sentence: string, idx: number) => (
                                <div key={idx} className="flex items-start">
                                  <div
                                    className={cx(
                                      "flex-shrink-0 w-2 h-2 rounded-full mt-2 mr-4",
                                      isDarkMode ? "bg-blue-400" : "bg-blue-600"
                                    )}
                                  />
                                  <p
                                    className={cx(
                                      "text-base leading-relaxed",
                                      isDarkMode
                                        ? "text-slate-300"
                                        : "text-gray-700"
                                    )}
                                  >
                                    "{sentence}"
                                  </p>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Divider */}
                    {index <
                      Object.keys(patientData.consultationTopics).length -
                        1 && (
                      <div className="py-8">
                        <div
                          className={cx(
                            "border-t-2",
                            isDarkMode ? "border-slate-700" : "border-gray-300"
                          )}
                        />
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {/* FOOTER (minimal / kept) */}
        <div
          className={cx(
            isDarkMode
              ? "bg-gradient-to-r from-slate-900 to-slate-800 border-t border-slate-700"
              : "bg-gradient-to-r from-gray-100 to-gray-50 border-t border-gray-200",
            "shadow-lg"
          )}
        />
      </div>
    </div>
  );
};

export default PatientReport;
