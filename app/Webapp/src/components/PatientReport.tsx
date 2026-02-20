import React, { useState, useEffect } from "react";
import * as XLSX from "xlsx";

interface PatientReportProps {
  isDarkMode?: boolean;
}

const PatientReport: React.FC<PatientReportProps> = ({
  isDarkMode = false,
}) => {
  const [patientData, setPatientData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("Cancer Prognosis");
  const [viewMode, setViewMode] = useState("tab"); // "tab" or "full"

  // Sample patient consultation data
  const generateSamplePatientData = () => {
    return {
      patientName: "Patient A",
      patientId: "P001",
      consultationDate: "September 4, 2025",
      physicianName: "Dr. John",
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
            "Based on your situation, you have a tumor that is considered intermediate-risk, which is on the higher end of that scale. However, considering your young age and the fact that you have many years ahead of you, surgery would provide you with good local control and the option for additional treatment if needed in the future. Although the likelihood of it potentially threatening your life over the next 40 years is around 40%, we need to plan for the long-term and ensure that we take all necessary measures to address this.",
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
            "Your doctor emphasized that you have many productive years ahead of you - approximately 40 years. This long life expectancy is an important factor in treatment planning because it means there's significant time for the cancer to potentially progress if left untreated. Your young age is actually an advantage in treatment, as you're likely to recover well from interventions and have many healthy years to benefit from successful treatment.",
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
            "Your doctor discussed the potential impact on erectile function, noting there's approximately a 40-50% chance of maintaining your current level of function after treatment. Recovery can be gradual, and it's important to have realistic expectations about the timeline. Your medical team emphasized that various treatment options are available to help address any changes that might occur, ensuring you have support throughout the recovery process.",
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
            "The outlook for urinary control after treatment is generally very positive. Most men (about 90%) regain normal bladder control within a year of treatment. While some temporary leakage may occur initially as part of the normal healing process, this typically resolves as your body recovers. Only a small percentage of patients require additional procedures to address persistent issues, and your medical team will closely monitor your progress.",
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
            "Currently, you don't experience bothersome urinary symptoms like urgency or frequent urination. Your doctor explained how different treatments might affect these symptoms differently. While radiation can sometimes cause temporary bladder irritation, surgical approaches typically result in fewer irritative symptoms. Any symptoms that do develop are generally temporary and improve as healing progresses.",
        },
      },
    };
  };

  // Load patient data
  const loadPatientData = async () => {
    try {
      setLoading(true);

      // Try to read Excel file first
      try {
        const response = await window.fs.readFile(
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

        // Process Excel data for patient report format
        const processedData = processExcelDataForPatient(jsonData);
        setPatientData(processedData);
      } catch (fileError) {
        console.log("Excel file not found. Using sample data.");
        const sampleData = generateSamplePatientData();
        setPatientData(sampleData);
        setActiveTab(Object.keys(sampleData.consultationTopics)[0]);
      }
    } catch (err) {
      setError("Error loading consultation data: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Process Excel data for patient report
  const processExcelDataForPatient = (rawData) => {
    // This would process the Excel data into patient report format
    // For now, return sample data
    return generateSamplePatientData();
  };

  useEffect(() => {
    loadPatientData();
  }, []);

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
            Loading consultation summary...
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
            <div
              className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${
                isDarkMode ? "bg-red-900" : "bg-red-100"
              }`}
            >
              <svg
                className={`w-8 h-8 ${
                  isDarkMode ? "text-red-400" : "text-red-600"
                }`}
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
              className={`text-xl font-semibold mb-2 ${
                isDarkMode ? "text-red-100" : "text-red-900"
              }`}
            >
              Unable to Load Report
            </h2>
            <p
              className={`mb-6 text-sm ${
                isDarkMode ? "text-red-200" : "text-red-700"
              }`}
            >
              {error}
            </p>
            <button
              onClick={loadPatientData}
              className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
                isDarkMode
                  ? "bg-red-800 text-red-100 hover:bg-red-700"
                  : "bg-red-600 text-white hover:bg-red-700"
              }`}
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!patientData) {
    return null;
  }

  const topicKeys = Object.keys(patientData.consultationTopics);
  const currentTopicData = patientData.consultationTopics[activeTab];

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
            <div className="text-center">
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
                    {patientData.patientName}
                  </div>
                  <div
                    className={`text-sm ${
                      isDarkMode ? "text-slate-400" : "text-gray-500"
                    }`}
                  >
                    ID: {patientData.patientId}
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
                    {patientData.consultationDate}
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
                    {patientData.physicianName}
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
                {topicKeys.map((topic, index) => (
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
                        {topicKeys.indexOf(activeTab) + 1}
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
                      const currentIndex = topicKeys.indexOf(activeTab);
                      if (currentIndex > 0) {
                        setActiveTab(topicKeys[currentIndex - 1]);
                      }
                    }}
                    disabled={topicKeys.indexOf(activeTab) === 0}
                    className={`flex items-center px-6 py-3 rounded-lg font-medium transition-colors ${
                      topicKeys.indexOf(activeTab) === 0
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
                    {topicKeys.indexOf(activeTab) + 1} of {topicKeys.length}
                  </span>

                  <button
                    onClick={() => {
                      const currentIndex = topicKeys.indexOf(activeTab);
                      if (currentIndex < topicKeys.length - 1) {
                        setActiveTab(topicKeys[currentIndex + 1]);
                      }
                    }}
                    disabled={
                      topicKeys.indexOf(activeTab) === topicKeys.length - 1
                    }
                    className={`flex items-center px-6 py-3 rounded-lg font-medium transition-colors ${
                      topicKeys.indexOf(activeTab) === topicKeys.length - 1
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

                {Object.entries(patientData.consultationTopics).map(
                  ([topicName, topicData], index) => (
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
                      {index <
                        Object.entries(patientData.consultationTopics).length -
                          1 && (
                        <div
                          className={`mt-16 border-b ${
                            isDarkMode ? "border-slate-700" : "border-gray-200"
                          }`}
                        />
                      )}
                    </div>
                  )
                )}
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
        >
          {/* <div className="px-12 py-8">
            <div className="text-center">
              <div
                className={`text-xs font-medium uppercase tracking-wider mb-2 ${
                  isDarkMode ? "text-slate-400" : "text-gray-500"
                }`}
              >
                Report Generation
              </div>
              <div
                className={`text-sm ${
                  isDarkMode ? "text-slate-300" : "text-gray-600"
                }`}
              >
                This consultation summary was generated using advanced natural
                language processing technology to help you review and understand
                the key points discussed during your appointment.
              </div>
              <div
                className={`text-xs mt-4 ${
                  isDarkMode ? "text-slate-500" : "text-gray-400"
                }`}
              >
                Generated:{" "}
                {new Date().toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                | Document ID: {patientData.patientId}-
                {new Date().getFullYear()}
              </div>
            </div>
          </div> */}
        </div>
      </div>
    </div>
  );
};

export default PatientReport;

// import React, { useState, useEffect } from "react";
// import * as XLSX from "xlsx";

// interface PatientReportProps {
//   isDarkMode?: boolean;
// }

// type ConsultationTopic = {
//   extractedSentences: string[];
//   aiSummary: string;
// };

// type Visit = {
//   consultationDate: string; // e.g., "September 4, 2025"
//   physicianName: string;    // e.g., "Dr. John"
//   consultationTopics: Record<string, ConsultationTopic>;
// };

// type PatientData = {
//   patientName: string;
//   patientId: string;
//   visits: Visit[];
// };

// const PatientReport: React.FC<PatientReportProps> = ({ isDarkMode = false }) => {
//   const [patientData, setPatientData] = useState<PatientData | null>(null);
//   const [loading, setLoading] = useState<boolean>(true);
//   const [error, setError] = useState<string | null>(null);

//   // NEW: which visit (date) is active
//   const [activeVisitIdx, setActiveVisitIdx] = useState<number>(0);

//   // which topic is active (per-visit)
//   const [activeTab, setActiveTab] = useState<string>("Cancer Prognosis");

//   const [viewMode, setViewMode] = useState<"tab" | "full">("tab");

//   // ---------- Sample Data (multi-visit) ----------
//   const generateSamplePatientData = (): PatientData => {
//     const baseTopics: Record<string, ConsultationTopic> = {
//       "Cancer Prognosis": {
//         extractedSentences: [
//           "So 12% risk of death from prostate cancer at 15 years is small in the grand scheme of things",
//           "but it's a little bit too high for doctors, so 1 in 10 chance",
//           "actually 1.2 in 10 chance of dying of prostate cancer is too much",
//           "We would treat with surgery or radiation",
//           "For the majority of these unfavorable risks, I do recommend treatment",
//         ],
//         aiSummary:
//           "Based on your situation, you have an intermediate-risk tumor on the higher end. Considering your age and long horizon, surgery offers good local control and keeps options open for future salvage therapy if needed.",
//       },
//       "Life Expectancy": {
//         extractedSentences: [
//           "like i said, you've got 40 years ahead of you",
//           "so that's a good thing for a patient who has a lot of years ahead of them",
//           "for you, having many years ahead of you, you have an intermediate-risk tumor on the high end",
//           "surgery gives you good local control, and options for salvage therapy",
//         ],
//         aiSummary:
//           "You likely have ~40 years ahead. Long life expectancy matters in planning; earlier definitive therapy can reduce long-term risk.",
//       },
//       "Erectile Dysfunction": {
//         extractedSentences: [
//           "For erectile function, again, I quoted you a 40-50% chance",
//           "of getting to your baseline function",
//           "Recovery may take time",
//           "There are various treatment options available",
//         ],
//         aiSummary:
//           "There is ~40–50% chance of returning to baseline erectile function; recovery is gradual. Supportive options are available.",
//       },
//       "Urinary Incontinence": {
//         extractedSentences: [
//           "By a year, ~90% of men will not need a pad",
//           "Only ~5% may need a surgery to correct persistent leakage",
//         ],
//         aiSummary:
//           "Most regain continence within a year; a minority may need additional procedures. We will monitor and support recovery.",
//       },
//       "Irritative Urinary Symptoms": {
//         extractedSentences: [
//           "You don't really have many urinary symptoms now",
//           "After radiation, urgency/frequency can worsen transiently",
//           "Surgery may have fewer irritative symptoms",
//         ],
//         aiSummary:
//           "Current irritative symptoms are minimal. Radiation can cause temporary bladder irritation; surgery often causes fewer such symptoms.",
//       },
//     };

//     const visit1: Visit = {
//       consultationDate: "September 4, 2025",
//       physicianName: "Dr. John",
//       consultationTopics: baseTopics,
//     };

//     // Example second visit with slightly adjusted summaries (to simulate another day)
//     const visit2: Visit = {
//       consultationDate: "September 18, 2025",
//       physicianName: "Dr. John",
//       consultationTopics: {
//         ...baseTopics,
//         "Cancer Prognosis": {
//           ...baseTopics["Cancer Prognosis"],
//           aiSummary:
//             "Follow-up: imaging and labs unchanged. Given continued intermediate risk and your long life expectancy, curative therapy remains reasonable.",
//         },
//       },
//     };

//     return {
//       patientName: "Patient A",
//       patientId: "P001",
//       visits: [visit1, visit2],
//     };
//   };

//   // ---------- Excel -> PatientData (multi-visit) ----------
//   const processExcelDataForPatient = (rawData: any[]): PatientData => {
//     // TODO: 여기에 실제 컬럼 스키마에 맞게 그룹핑/매핑 로직 구현
//     // 예시: rows를 date별로 그룹핑 => topic별로 묶고 {extractedSentences[], aiSummary} 조합
//     // 현재는 데모 목적으로 샘플 데이터를 반환
//     return generateSamplePatientData();
//   };

//   const loadPatientData = async () => {
//     try {
//       setLoading(true);
//       try {
//         const response = await (window as any).fs.readFile(
//           "nlpextractedsentences_subset.xlsx"
//         );
//         const workbook = XLSX.read(response, {
//           cellStyles: true,
//           cellFormulas: true,
//           cellDates: true,
//           cellNF: true,
//           sheetStubs: true,
//         });
//         const firstSheetName = workbook.SheetNames[0];
//         const worksheet = workbook.Sheets[firstSheetName];
//         const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet);

//         const processed = processExcelDataForPatient(jsonData);
//         setPatientData(processed);
//         setActiveVisitIdx(0);
//         const firstTopics = Object.keys(
//           processed.visits[0].consultationTopics ?? {}
//         );
//         setActiveTab(firstTopics[0] ?? "Cancer Prognosis");
//       } catch {
//         // 파일이 없으면 샘플 데이터
//         const sample = generateSamplePatientData();
//         setPatientData(sample);
//         setActiveVisitIdx(0);
//         const firstTopics = Object.keys(sample.visits[0].consultationTopics);
//         setActiveTab(firstTopics[0]);
//       }
//     } catch (err: any) {
//       setError("Error loading consultation data: " + err?.message);
//     } finally {
//       setLoading(false);
//     }
//   };

//   // 방문(날짜) 바뀌면 토픽도 그 방문의 첫 토픽으로 리셋
//   useEffect(() => {
//     if (!patientData) return;
//     const topics = Object.keys(
//       patientData.visits[activeVisitIdx]?.consultationTopics ?? {}
//     );
//     if (topics.length > 0) setActiveTab(topics[0]);
//   }, [activeVisitIdx, patientData]);

//   useEffect(() => {
//     loadPatientData();
//   }, []);

//   if (loading) {
//     return (
//       <div
//         className={`min-h-screen flex items-center justify-center ${
//           isDarkMode ? "bg-slate-950" : "bg-gray-50"
//         }`}
//       >
//         <div className="text-center">
//           <div
//             className={`animate-spin rounded-full h-12 w-12 border-b-2 mb-4 mx-auto ${
//               isDarkMode ? "border-blue-400" : "border-blue-600"
//             }`}
//           />
//           <div
//             className={`text-lg font-medium ${
//               isDarkMode ? "text-slate-300" : "text-gray-700"
//             }`}
//           >
//             Loading consultation summary...
//           </div>
//         </div>
//       </div>
//     );
//   }

//   if (error) {
//     return (
//       <div
//         className={`min-h-screen flex items-center justify-center p-8 ${
//           isDarkMode ? "bg-slate-950" : "bg-gray-50"
//         }`}
//       >
//         <div
//           className={`max-w-md w-full p-8 rounded-xl shadow-2xl ${
//             isDarkMode
//               ? "bg-red-950 border border-red-800"
//               : "bg-white border border-red-200"
//           }`}
//         >
//           <div className="text-center">
//             <div
//               className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${
//                 isDarkMode ? "bg-red-900" : "bg-red-100"
//               }`}
//             >
//               <svg
//                 className={`w-8 h-8 ${
//                   isDarkMode ? "text-red-400" : "text-red-600"
//                 }`}
//                 fill="none"
//                 stroke="currentColor"
//                 viewBox="0 0 24 24"
//               >
//                 <path
//                   strokeLinecap="round"
//                   strokeLinejoin="round"
//                   strokeWidth={2}
//                   d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
//                 />
//               </svg>
//             </div>
//             <h2
//               className={`text-xl font-semibold mb-2 ${
//                 isDarkMode ? "text-red-100" : "text-red-900"
//               }`}
//             >
//               Unable to Load Report
//             </h2>
//             <p
//               className={`mb-6 text-sm ${
//                 isDarkMode ? "text-red-200" : "text-red-700"
//               }`}
//             >
//               {error}
//             </p>
//             <button
//               onClick={loadPatientData}
//               className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
//                 isDarkMode
//                   ? "bg-red-800 text-red-100 hover:bg-red-700"
//                   : "bg-red-600 text-white hover:bg-red-700"
//               }`}
//             >
//               Try Again
//             </button>
//           </div>
//         </div>
//       </div>
//     );
//   }

//   if (!patientData) return null;

//   // 현재 활성 방문
//   const visit = patientData.visits[activeVisitIdx];
//   const topicKeys = Object.keys(visit.consultationTopics);
//   const currentTopicData = visit.consultationTopics[activeTab];

//   return (
//     <div className={`min-h-screen ${isDarkMode ? "bg-slate-950" : "bg-gray-50"}`}>
//       <div className="max-w-6xl mx-auto">
//         {/* Header */}
//         <div
//           className={`${
//             isDarkMode
//               ? "bg-gradient-to-r from-slate-900 to-slate-800 border-b border-slate-700"
//               : "bg-gradient-to-r from-white to-gray-50 border-b border-gray-200"
//           } shadow-lg`}
//         >
//           <div className="px-12 py-10">
//             <div className="text-center">
//               <div
//                 className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-6 ${
//                   isDarkMode
//                     ? "bg-blue-900 border-2 border-blue-700"
//                     : "bg-blue-100 border-2 border-blue-300"
//                 }`}
//               >
//                 <svg
//                   className={`w-8 h-8 ${
//                     isDarkMode ? "text-blue-400" : "text-blue-600"
//                   }`}
//                   fill="none"
//                   stroke="currentColor"
//                   viewBox="0 0 24 24"
//                 >
//                   <path
//                     strokeLinecap="round"
//                     strokeLinejoin="round"
//                     strokeWidth={2}
//                     d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
//                   />
//                 </svg>
//               </div>

//               <h1
//                 className={`text-4xl font-light mb-3 tracking-wide ${
//                   isDarkMode ? "text-slate-100" : "text-gray-900"
//                 }`}
//               >
//                 PATIENT CONSULTATION REPORT
//               </h1>

//               <div
//                 className={`text-sm font-medium tracking-wider uppercase mb-8 ${
//                   isDarkMode ? "text-slate-400" : "text-gray-500"
//                 }`}
//               >
//                 Prostate Cancer Treatment Discussion Summary
//               </div>

//               {/* View Mode Toggle */}
//               <div className="mb-8">
//                 <div
//                   className={`inline-flex rounded-lg p-1 ${
//                     isDarkMode ? "bg-slate-800" : "bg-gray-100"
//                   }`}
//                 >
//                   <button
//                     onClick={() => setViewMode("tab")}
//                     className={`px-6 py-2 text-sm font-medium rounded-md transition-colors ${
//                       viewMode === "tab"
//                         ? isDarkMode
//                           ? "bg-blue-700 text-blue-100"
//                           : "bg-blue-600 text-white"
//                         : isDarkMode
//                         ? "text-slate-400 hover:text-slate-200"
//                         : "text-gray-600 hover:text-gray-800"
//                     }`}
//                   >
//                     Topic View
//                   </button>
//                   <button
//                     onClick={() => setViewMode("full")}
//                     className={`px-6 py-2 text-sm font-medium rounded-md transition-colors ${
//                       viewMode === "full"
//                         ? isDarkMode
//                           ? "bg-blue-700 text-blue-100"
//                           : "bg-blue-600 text-white"
//                         : isDarkMode
//                         ? "text-slate-400 hover:text-slate-200"
//                         : "text-gray-600 hover:text-gray-800"
//                     }`}
//                   >
//                     Full Report
//                   </button>
//                 </div>
//                 <div
//                   className={`text-xs mt-2 text-center ${
//                     isDarkMode ? "text-slate-500" : "text-gray-500"
//                   }`}
//                 >
//                   {viewMode === "tab"
//                     ? "Browse topics one at a time"
//                     : "View all topics in a continuous format"}
//                 </div>
//               </div>

//               {/* Patient + Current Visit Meta */}
//               <div
//                 className={`grid grid-cols-1 md:grid-cols-3 gap-6 text-center ${
//                   isDarkMode ? "text-slate-200" : "text-gray-700"
//                 }`}
//               >
//                 <div>
//                   <div
//                     className={`text-xs font-semibold uppercase tracking-wider mb-1 ${
//                       isDarkMode ? "text-slate-400" : "text-gray-500"
//                     }`}
//                   >
//                     Patient
//                   </div>
//                   <div className="text-lg font-medium">{patientData.patientName}</div>
//                   <div
//                     className={`text-sm ${
//                       isDarkMode ? "text-slate-400" : "text-gray-500"
//                     }`}
//                   >
//                     ID: {patientData.patientId}
//                   </div>
//                 </div>
//                 <div>
//                   <div
//                     className={`text-xs font-semibold uppercase tracking-wider mb-1 ${
//                       isDarkMode ? "text-slate-400" : "text-gray-500"
//                     }`}
//                   >
//                     Consultation Date
//                   </div>
//                   <div className="text-lg font-medium">{visit.consultationDate}</div>
//                 </div>
//                 <div>
//                   <div
//                     className={`text-xs font-semibold uppercase tracking-wider mb-1 ${
//                       isDarkMode ? "text-slate-400" : "text-gray-500"
//                     }`}
//                   >
//                     Attending Physician
//                   </div>
//                   <div className="text-lg font-medium">{visit.physicianName}</div>
//                 </div>
//               </div>
//             </div>
//           </div>
//         </div>

//         {/* NEW: Visit (Date) Selector – sticky, horizontally scrollable */}
//         <div
//           className={`${
//             isDarkMode
//               ? "bg-slate-900 border-b border-slate-700"
//               : "bg-white border-b border-gray-200"
//           } shadow-lg sticky top-0 z-20`}
//         >
//           <div className="px-6 py-3">
//             <div className="flex items-center justify-between mb-2">
//               <div
//                 className={`text-xs font-semibold uppercase tracking-wider ${
//                   isDarkMode ? "text-slate-400" : "text-gray-500"
//                 }`}
//               >
//                 Visits ({patientData.visits.length})
//               </div>
//               <div className="space-x-2 hidden sm:block">
//                 <button
//                   onClick={() =>
//                     setActiveVisitIdx((v) => Math.max(0, v - 1))
//                   }
//                   disabled={activeVisitIdx === 0}
//                   className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
//                     activeVisitIdx === 0
//                       ? isDarkMode
//                         ? "bg-slate-800 text-slate-500 cursor-not-allowed"
//                         : "bg-gray-100 text-gray-400 cursor-not-allowed"
//                       : isDarkMode
//                       ? "bg-slate-800 text-slate-200 hover:bg-slate-700"
//                       : "bg-gray-100 text-gray-700 hover:bg-gray-200"
//                   }`}
//                 >
//                   Prev Visit
//                 </button>
//                 <button
//                   onClick={() =>
//                     setActiveVisitIdx((v) =>
//                       Math.min(patientData.visits.length - 1, v + 1)
//                     )
//                   }
//                   disabled={activeVisitIdx === patientData.visits.length - 1}
//                   className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
//                     activeVisitIdx === patientData.visits.length - 1
//                       ? isDarkMode
//                         ? "bg-slate-800 text-slate-500 cursor-not-allowed"
//                         : "bg-gray-100 text-gray-400 cursor-not-allowed"
//                       : isDarkMode
//                       ? "bg-slate-800 text-slate-200 hover:bg-slate-700"
//                       : "bg-gray-100 text-gray-700 hover:bg-gray-200"
//                   }`}
//                 >
//                   Next Visit
//                 </button>
//               </div>
//             </div>

//             <div className="flex overflow-x-auto scrollbar-hide gap-2 pb-1">
//               {patientData.visits.map((v, idx) => {
//                 const selected = idx === activeVisitIdx;
//                 return (
//                   <button
//                     key={`${v.consultationDate}-${idx}`}
//                     onClick={() => setActiveVisitIdx(idx)}
//                     className={`flex-shrink-0 px-4 py-2 rounded-lg border text-sm font-medium whitespace-nowrap transition-colors ${
//                       selected
//                         ? isDarkMode
//                           ? "bg-blue-700 text-blue-100 border-blue-600"
//                           : "bg-blue-600 text-white border-blue-600"
//                         : isDarkMode
//                         ? "bg-slate-800 text-slate-300 border-slate-600 hover:bg-slate-700"
//                         : "bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200"
//                     }`}
//                     title={`Visit ${idx + 1} • ${v.physicianName}`}
//                   >
//                     <span className="mr-2">{idx + 1}.</span>
//                     <span>{v.consultationDate}</span>
//                   </button>
//                 );
//               })}
//             </div>
//           </div>
//         </div>

//         {/* Tab Navigation - Only in tab mode */}
//         {viewMode === "tab" && (
//           <div
//             className={`${
//               isDarkMode
//                 ? "bg-slate-900 border-b border-slate-700"
//                 : "bg-white border-b border-gray-200"
//             } shadow-lg sticky top-[56px] z-10`} // sits under visit selector
//           >
//             <div className="px-6">
//               <div className="flex overflow-x-auto scrollbar-hide">
//                 {topicKeys.map((topic, index) => (
//                   <button
//                     key={topic}
//                     onClick={() => setActiveTab(topic)}
//                     className={`flex-shrink-0 px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
//                       activeTab === topic
//                         ? isDarkMode
//                           ? "border-blue-400 text-blue-400 bg-slate-800"
//                           : "border-blue-600 text-blue-600 bg-blue-50"
//                         : isDarkMode
//                         ? "border-transparent text-slate-400 hover:text-slate-300 hover:border-slate-600"
//                         : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
//                     }`}
//                   >
//                     <div className="flex items-center space-x-3">
//                       <span
//                         className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
//                           activeTab === topic
//                             ? isDarkMode
//                               ? "bg-blue-800 text-blue-200"
//                               : "bg-blue-600 text-white"
//                             : isDarkMode
//                             ? "bg-slate-700 text-slate-400"
//                             : "bg-gray-200 text-gray-600"
//                         }`}
//                       >
//                         {index + 1}
//                       </span>
//                       <span className="hidden sm:inline">{topic}</span>
//                       <span className="sm:hidden">{topic.split(" ")[0]}</span>
//                     </div>
//                   </button>
//                 ))}
//               </div>
//             </div>
//           </div>
//         )}

//         {/* Content */}
//         <div className={`${isDarkMode ? "bg-slate-900" : "bg-white"} shadow-xl min-h-screen`}>
//           <div className="px-12 py-12">
//             {viewMode === "tab" ? (
//               <>
//                 {/* Current Topic Header */}
//                 <div className="mb-12">
//                   <div className="flex items-center mb-6">
//                     <div
//                       className={`flex items-center justify-center w-16 h-16 rounded-full mr-6 ${
//                         isDarkMode
//                           ? "bg-blue-900 border-2 border-blue-700"
//                           : "bg-blue-100 border-2 border-blue-300"
//                       }`}
//                     >
//                       <span
//                         className={`text-2xl font-bold ${
//                           isDarkMode ? "text-blue-300" : "text-blue-700"
//                         }`}
//                       >
//                         {topicKeys.indexOf(activeTab) + 1}
//                       </span>
//                     </div>
//                     <div>
//                       <h2
//                         className={`text-3xl font-semibold tracking-wide ${
//                           isDarkMode ? "text-slate-100" : "text-gray-900"
//                         }`}
//                       >
//                         {activeTab}
//                       </h2>
//                       <div
//                         className={`text-sm font-medium uppercase tracking-wider mt-2 ${
//                           isDarkMode ? "text-slate-400" : "text-gray-500"
//                         }`}
//                       >
//                         Clinical Discussion Points
//                       </div>
//                     </div>
//                   </div>
//                 </div>

//                 {/* Extracted Sentences */}
//                 <div className="mb-12">
//                   <div
//                     className={`p-8 rounded-xl border-l-4 ${
//                       isDarkMode
//                         ? "bg-slate-800 border-l-blue-500 border border-slate-700"
//                         : "bg-gray-50 border-l-blue-600 border border-gray-200"
//                     }`}
//                   >
//                     <h3
//                       className={`text-xl font-semibold mb-8 ${
//                         isDarkMode ? "text-slate-200" : "text-gray-800"
//                       }`}
//                     >
//                       Key Statements from Consultation
//                     </h3>
//                     <div className="space-y-6">
//                       {currentTopicData.extractedSentences.map((sentence, idx) => (
//                         <div key={idx} className="flex items-start">
//                           <div
//                             className={`flex-shrink-0 w-3 h-3 rounded-full mt-2 mr-6 ${
//                               isDarkMode ? "bg-blue-400" : "bg-blue-600"
//                             }`}
//                           />
//                           <p
//                             className={`text-lg leading-relaxed ${
//                               isDarkMode ? "text-slate-300" : "text-gray-700"
//                             }`}
//                           >
//                             "{sentence}"
//                           </p>
//                         </div>
//                       ))}
//                     </div>
//                   </div>
//                 </div>

//                 {/* AI Summary */}
//                 <div>
//                   <div
//                     className={`p-8 rounded-xl ${
//                       isDarkMode
//                         ? "bg-gradient-to-br from-slate-800 to-slate-700 border border-slate-600"
//                         : "bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200"
//                     }`}
//                   >
//                     <div className="flex items-center mb-8">
//                       <div
//                         className={`flex items-center justify-center w-10 h-10 rounded-lg mr-4 ${
//                           isDarkMode
//                             ? "bg-blue-800 border border-blue-600"
//                             : "bg-blue-600 border border-blue-500"
//                         }`}
//                       >
//                         <svg
//                           className={`w-5 h-5 ${
//                             isDarkMode ? "text-blue-300" : "text-white"
//                           }`}
//                           fill="none"
//                           stroke="currentColor"
//                           viewBox="0 0 24 24"
//                         >
//                           <path
//                             strokeLinecap="round"
//                             strokeLinejoin="round"
//                             strokeWidth={2}
//                             d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
//                           />
//                         </svg>
//                       </div>
//                       <h3
//                         className={`text-xl font-semibold ${
//                           isDarkMode ? "text-slate-200" : "text-gray-800"
//                         }`}
//                       >
//                         Clinical Summary
//                       </h3>
//                     </div>
//                     <p
//                       className={`text-lg leading-relaxed ${
//                         isDarkMode ? "text-slate-300" : "text-gray-700"
//                       }`}
//                     >
//                       {currentTopicData.aiSummary}
//                     </p>
//                   </div>
//                 </div>

//                 {/* Topic Navigation */}
//                 <div className="flex justify-between items-center mt-12 pt-8 border-t border-gray-200">
//                   <button
//                     onClick={() => {
//                       const currentIndex = topicKeys.indexOf(activeTab);
//                       if (currentIndex > 0) setActiveTab(topicKeys[currentIndex - 1]);
//                     }}
//                     disabled={topicKeys.indexOf(activeTab) === 0}
//                     className={`flex items-center px-6 py-3 rounded-lg font-medium transition-colors ${
//                       topicKeys.indexOf(activeTab) === 0
//                         ? isDarkMode
//                           ? "bg-slate-800 text-slate-500 cursor-not-allowed"
//                           : "bg-gray-100 text-gray-400 cursor-not-allowed"
//                         : isDarkMode
//                         ? "bg-slate-800 text-slate-200 hover:bg-slate-700"
//                         : "bg-gray-100 text-gray-700 hover:bg-gray-200"
//                     }`}
//                   >
//                     <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
//                     </svg>
//                     Previous
//                   </button>

//                   <span
//                     className={`text-sm font-medium ${
//                       isDarkMode ? "text-slate-400" : "text-gray-500"
//                     }`}
//                   >
//                     {topicKeys.indexOf(activeTab) + 1} of {topicKeys.length}
//                   </span>

//                   <button
//                     onClick={() => {
//                       const currentIndex = topicKeys.indexOf(activeTab);
//                       if (currentIndex < topicKeys.length - 1)
//                         setActiveTab(topicKeys[currentIndex + 1]);
//                     }}
//                     disabled={topicKeys.indexOf(activeTab) === topicKeys.length - 1}
//                     className={`flex items-center px-6 py-3 rounded-lg font-medium transition-colors ${
//                       topicKeys.indexOf(activeTab) === topicKeys.length - 1
//                         ? isDarkMode
//                           ? "bg-slate-800 text-slate-500 cursor-not-allowed"
//                           : "bg-gray-100 text-gray-400 cursor-not-allowed"
//                         : isDarkMode
//                         ? "bg-slate-800 text-slate-200 hover:bg-slate-700"
//                         : "bg-gray-100 text-gray-700 hover:bg-gray-200"
//                     }`}
//                   >
//                     Next
//                     <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
//                     </svg>
//                   </button>
//                 </div>
//               </>
//             ) : (
//               // Full View: all topics in the active visit
//               <div className="space-y-16">
//                 <div className="text-center mb-12">
//                   <h2
//                     className={`text-3xl font-semibold tracking-wide mb-4 ${
//                       isDarkMode ? "text-slate-100" : "text-gray-900"
//                     }`}
//                   >
//                     Complete Consultation Summary
//                   </h2>
//                   <div
//                     className={`text-sm font-medium uppercase tracking-wider ${
//                       isDarkMode ? "text-slate-400" : "text-gray-500"
//                     }`}
//                   >
//                     All Discussion Topics (Visit {activeVisitIdx + 1} – {visit.consultationDate})
//                   </div>
//                 </div>

//                 {Object.entries(visit.consultationTopics).map(([topicName, topicData], index) => (
//                   <div key={topicName} className="relative">
//                     {/* Topic Header */}
//                     <div className="flex items-center mb-8">
//                       <div
//                         className={`flex items-center justify-center w-12 h-12 rounded-full mr-6 ${
//                           isDarkMode
//                             ? "bg-blue-900 border-2 border-blue-700"
//                             : "bg-blue-100 border-2 border-blue-300"
//                         }`}
//                       >
//                         <span
//                           className={`text-lg font-bold ${
//                             isDarkMode ? "text-blue-300" : "text-blue-700"
//                           }`}
//                         >
//                           {index + 1}
//                         </span>
//                       </div>
//                       <div>
//                         <h2
//                           className={`text-2xl font-semibold tracking-wide ${
//                             isDarkMode ? "text-slate-100" : "text-gray-900"
//                           }`}
//                         >
//                           {topicName}
//                         </h2>
//                         <div
//                           className={`text-sm font-medium uppercase tracking-wider mt-1 ${
//                             isDarkMode ? "text-slate-400" : "text-gray-500"
//                           }`}
//                         >
//                           Clinical Discussion Points
//                         </div>
//                       </div>
//                     </div>

//                     {/* Extracted Sentences */}
//                     <div className="mb-10">
//                       <div
//                         className={`p-8 rounded-xl border-l-4 ${
//                           isDarkMode
//                             ? "bg-slate-800 border-l-blue-500 border border-slate-700"
//                             : "bg-gray-50 border-l-blue-600 border border-gray-200"
//                         }`}
//                       >
//                         <h3
//                           className={`text-lg font-semibold mb-6 ${
//                             isDarkMode ? "text-slate-200" : "text-gray-800"
//                           }`}
//                         >
//                           Key Statements from Consultation
//                         </h3>
//                         <div className="space-y-4">
//                           {topicData.extractedSentences.map((sentence, idx) => (
//                             <div key={idx} className="flex items-start">
//                               <div
//                                 className={`flex-shrink-0 w-2 h-2 rounded-full mt-2.5 mr-4 ${
//                                   isDarkMode ? "bg-blue-400" : "bg-blue-600"
//                                 }`}
//                               />
//                               <p
//                                 className={`text-base leading-relaxed ${
//                                   isDarkMode ? "text-slate-300" : "text-gray-700"
//                                 }`}
//                               >
//                                 "{sentence}"
//                               </p>
//                             </div>
//                           ))}
//                         </div>
//                       </div>
//                     </div>

//                     {/* AI Summary */}
//                     <div>
//                       <div
//                         className={`p-8 rounded-xl ${
//                           isDarkMode
//                             ? "bg-gradient-to-br from-slate-800 to-slate-700 border border-slate-600"
//                             : "bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200"
//                         }`}
//                       >
//                         <div className="flex items-center mb-6">
//                           <div
//                             className={`flex items-center justify-center w-8 h-8 rounded-lg mr-3 ${
//                               isDarkMode
//                                 ? "bg-blue-800 border border-blue-600"
//                                 : "bg-blue-600 border border-blue-500"
//                             }`}
//                           >
//                             <svg
//                               className={`w-4 h-4 ${
//                                 isDarkMode ? "text-blue-300" : "text-white"
//                               }`}
//                               fill="none"
//                               stroke="currentColor"
//                               viewBox="0 0 24 24"
//                             >
//                               <path
//                                 strokeLinecap="round"
//                                 strokeLinejoin="round"
//                                 strokeWidth={2}
//                                 d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
//                               />
//                             </svg>
//                           </div>
//                           <h3
//                             className={`text-lg font-semibold ${
//                               isDarkMode ? "text-slate-200" : "text-gray-800"
//                             }`}
//                           >
//                             Clinical Summary
//                           </h3>
//                         </div>
//                         <p
//                           className={`text-base leading-relaxed ${
//                             isDarkMode ? "text-slate-300" : "text-gray-700"
//                           }`}
//                         >
//                           {topicData.aiSummary}
//                         </p>
//                       </div>
//                     </div>

//                     {/* Divider */}
//                     {index < Object.entries(visit.consultationTopics).length - 1 && (
//                       <div
//                         className={`mt-16 border-b ${
//                           isDarkMode ? "border-slate-700" : "border-gray-200"
//                         }`}
//                       />
//                     )}
//                   </div>
//                 ))}
//               </div>
//             )}
//           </div>
//         </div>

//         {/* Footer (kept but commented out in your original) */}
//         <div
//           className={`${
//             isDarkMode
//               ? "bg-gradient-to-r from-slate-900 to-slate-800 border-t border-slate-700"
//               : "bg-gradient-to-r from-gray-100 to-gray-50 border-t border-gray-200"
//           } shadow-lg`}
//         />
//       </div>
//     </div>
//   );
// };

// export default PatientReport;
