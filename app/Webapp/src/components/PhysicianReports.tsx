import React, { useState, useEffect, use } from "react";
import * as XLSX from "xlsx";
import { useProstateCancelData } from "@/hooks/useProstateCancelData";
import ConsultationScoring from "./ConsultationScoring";

interface PhysicianReportsProps {
  isDarkMode?: boolean;
}

const PhysicianReports: React.FC<PhysicianReportsProps> = ({
  isDarkMode = false,
}) => {
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [currentView, setCurrentView] = useState("dashboard"); // dashboard, grid, detail
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newSentence, setNewSentence] = useState("");
  const [rescoring, setRescoring] = useState(false);

  // SARSCOV Data
  const { nlpPilotManualScoresData } = useProstateCancelData();

  console.log("NLP Pilot Manual Scores Data:", nlpPilotManualScoresData);

  // Professional medical color scheme based on PDF requirements
  const getScoreColor = (score) => {
    if (isDarkMode) {
      const darkColors = {
        1: "bg-gradient-to-br from-red-600 to-red-700 text-red-100 border border-red-500 shadow-lg",
        2: "bg-gradient-to-br from-pink-600 to-pink-700 text-pink-100 border border-pink-500 shadow-lg",
        3: "bg-gradient-to-br from-yellow-600 to-yellow-700 text-yellow-100 border border-yellow-500 shadow-lg",
        4: "bg-gradient-to-br from-green-600 to-green-700 text-green-100 border border-green-500 shadow-lg",
        5: "bg-gradient-to-br from-emerald-600 to-emerald-700 text-emerald-100 border-2 border-emerald-400 font-semibold shadow-lg",
      };
      return (
        darkColors[score] ||
        "bg-gradient-to-br from-slate-700 to-slate-600 text-slate-300 border border-slate-600 shadow-lg"
      );
    } else {
      const lightColors = {
        1: "bg-gradient-to-br from-red-500 to-red-600 text-white border border-red-400 shadow-lg",
        2: "bg-gradient-to-br from-pink-500 to-pink-600 text-white border border-pink-400 shadow-lg",
        3: "bg-gradient-to-br from-yellow-500 to-yellow-600 text-white border border-yellow-400 shadow-lg",
        4: "bg-gradient-to-br from-green-500 to-green-600 text-white border border-green-400 shadow-lg",
        5: "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-2 border-emerald-400 font-semibold shadow-lg",
      };
      return (
        lightColors[score] ||
        "bg-gradient-to-br from-slate-400 to-slate-500 text-white border border-slate-300 shadow-lg"
      );
    }
  };

  // Improvement suggestions based on PDF
  const getImprovementSuggestions = (domain, currentScore) => {
    const suggestions = {
      "Cancer Prognosis": {
        1: "Discuss potential for risk of cancer death, metastasis, or progression",
        2: 'Provide a generalization of magnitude of risk ("high"/"low")',
        3: "Provide a quantified estimate of risk",
        4: "Provide quantified estimates both with treatment and without treatment at an arbitrary timepoint",
        5: "Provide quantified estimates both with and without treatment at the patient's life expectancy",
      },
      "Life Expectancy": {
        1: "Discuss the concept of competing risks of mortality",
        2: 'Provide a generalization of duration of life expectancy ("long"/"short")',
        3: 'Provide a rough quantified estimate of life expectancy (e.g., "about 15-20 years")',
        4: "Provide a probability of living to an arbitrary timepoint",
        5: "Provide a specific number of years and mention calculation based on patient's age and health status",
      },
      "Erectile Dysfunction": {
        1: "Discuss the potential risk of erectile dysfunction",
        2: 'Provide a generalization of risk ("high"/"low")',
        3: "Provide an average probability of ED without a time horizon",
        4: "Provide an average probability of ED with a time horizon",
        5: "Provide a patient-specific probability of ED with a time horizon, mentioning patient-specific factors",
      },
      "Urinary Incontinence": {
        1: "Discuss the potential risk of urinary incontinence",
        2: 'Provide a generalization of risk ("high"/"low")',
        3: "Provide an average probability of UI without a time horizon",
        4: "Provide an average probability of UI with a time horizon",
        5: "Provide a patient-specific probability of UI with a time horizon, mentioning patient-specific factors",
      },
      "Irritative Symptoms": {
        1: "Discuss the potential risk of irritative urinary symptoms",
        2: 'Provide a generalization of risk ("high"/"low")',
        3: "Provide an average probability of LUTS without a time horizon",
        4: "Provide an average probability of LUTS with a time horizon",
        5: "Provide a patient-specific probability of LUTS with a time horizon, mentioning patient-specific factors",
      },
    };

    const domainSuggestions = suggestions[domain] || {};
    const applicableSuggestions = [];

    for (let score = currentScore + 1; score <= 5; score++) {
      if (domainSuggestions[score]) {
        applicableSuggestions.push({
          targetScore: score,
          suggestion: domainSuggestions[score],
        });
      }
    }

    return applicableSuggestions;
  };

  // Mock AI rescoring function
  const rescoreSentence = async (sentence, domain) => {
    setRescoring(true);
    // Simulate API call delay
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Mock scoring logic based on sentence complexity and keywords
    let score = 1;
    const lowerSentence = sentence.toLowerCase();

    if (lowerSentence.includes("%") || lowerSentence.includes("percent"))
      score = Math.max(score, 3);
    if (lowerSentence.includes("year") || lowerSentence.includes("month"))
      score = Math.max(score, 4);
    if (lowerSentence.includes("your") && lowerSentence.includes("age"))
      score = Math.max(score, 4);
    if (
      lowerSentence.includes("based on") ||
      lowerSentence.includes("specific")
    )
      score = Math.max(score, 5);

    setRescoring(false);
    return Math.min(score, 5);
  };

  // Excel file reading function
  const loadExcelData = async () => {
    try {
      setLoading(true);

      // Attempt to read Excel file
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

        // Transform data structure
        const processedPatients = processExcelData(jsonData);
        setPatients(processedPatients);
      } catch (fileError) {
        console.log("Excel file not found. Using sample data.");
        // Use sample data
        const sampleData = generateSampleData();
        setPatients(sampleData);
      }
    } catch (err) {
      setError("Error loading data: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Excel data processing function
  const processExcelData = (rawData) => {
    // Expected columns: PatientID, PatientName, ConsultationDate, Topic, ExtractedSentence, Score etc.
    const patientMap = new Map();

    rawData.forEach((row) => {
      const patientId =
        row["PatientID"] || row["Patient ID"] || row["patient_id"];
      const patientName =
        row["PatientName"] || row["Patient Name"] || row["patient_name"];
      const consultationDate =
        row["ConsultationDate"] ||
        row["Consultation Date"] ||
        row["consultation_date"];
      const topic = row["Topic"] || row["topic"];
      const extractedSentence =
        row["ExtractedSentence"] ||
        row["Extracted Sentence"] ||
        row["extracted_sentence"];
      const score = row["Score"] || row["score"];

      if (!patientMap.has(patientId)) {
        patientMap.set(patientId, {
          id: patientId,
          name: patientName,
          consultationDate: consultationDate,
          topics: {},
        });
      }

      const patient = patientMap.get(patientId);
      if (!patient.topics[topic]) {
        patient.topics[topic] = {
          sentences: [],
          score: score,
        };
      }

      patient.topics[topic].sentences.push(extractedSentence);
    });

    return Array.from(patientMap.values());
  };

  // Sample data generation function
  const generateSampleData = () => {
    return [
      {
        id: "P001",
        name: "Patient A",
        consultationDate: "2025-09-04",
        status: "completed",
        overallScore: 2.8,
        topics: {
          "Cancer Prognosis": {
            score: 3,
            sentences: [
              "So 12% risk of death from prostate cancer at 15 years is small in the grand scheme of things,So 12% risk of death from prostate cancer at 15 years is small in the grand scheme of things,So 12% risk of death from prostate cancer at 15 years is small in the grand scheme of things,So 12% risk of death from prostate cancer at 15 years is small in the grand scheme of things,So 12% risk of death from prostate cancer at 15 years is small in the grand scheme of things,So 12% risk of death from prostate cancer at 15 years is small in the grand scheme of things,So 12% risk of death from prostate cancer at 15 years is small in the grand scheme of things,So 12% risk of death from prostate cancer at 15 years is small in the grand scheme of things,So 12% risk of death from prostate cancer at 15 years is small in the grand scheme of things",
              "but it's a little bit too high for doctors, so 1 in 10 chance",
              "actually 1.2 in 10 chance of dying of prostate cancer is too much",
              "We would treat with surgery or radiation",
              "For the majority of these unfavorable risks, I do recommend treatment",
            ],
          },
          "Life Expectancy": {
            score: 2,
            sentences: [
              "Now, this is based on your age and at 71, on average",
              "you have about 13 years life expectancy",
              "We want to plan for those 40 years",
              "You're about 20 years ahead of the game",
              "The likelihood it would threaten your life over that 40-year period",
            ],
          },
          "Erectile Dysfunction": {
            score: 3,
            sentences: [
              "For erectile function, again, I quoted you a 40-50% chance",
              "of getting to your baseline function",
              "Surgery gives you good local control",
              "Recovery may take time",
              "There are various treatment options available",
            ],
          },
          "Urinary Incontinence": {
            score: 4,
            sentences: [
              "But by a year 90% of men will not need a pad beyond a year",
              "and only 5% of men would need potentially a surgery",
              "to correct a lot of leakage",
              "Temporary incontinence may occur",
              "Most patients improve over time",
            ],
          },
          "Irritative Symptoms": {
            score: 2,
            sentences: [
              "You don't really have many urinary symptoms now",
              "no urgency, frequency, but those symptoms get worse after radiation",
              "because the beam hits the bladder and makes the bladder irritable",
              "Surgery may have fewer such symptoms",
              "Most symptoms improve over time",
            ],
          },
        },
      },
      {
        id: "P002",
        name: "Patient B",
        consultationDate: "2025-09-03",
        status: "completed",
        overallScore: 3.4,
        topics: {
          "Cancer Prognosis": {
            score: 4,
            sentences: [
              "Your cancer has a 15% chance of progression in 10 years",
              "With treatment, we can reduce this to about 7%",
              "Surgery would provide excellent local control",
              "The risk-benefit ratio favors treatment",
              "We have good data on outcomes for your risk category",
            ],
          },
          "Life Expectancy": {
            score: 4,
            sentences: [
              "At your age of 65, you have approximately 18 years life expectancy",
              "You have an 85% chance of living to age 80",
              "Your overall health is excellent",
              "We need to consider the long-term implications",
              "Treatment now prevents future complications",
            ],
          },
          "Erectile Dysfunction": {
            score: 3,
            sentences: [
              "Given your age and current function",
              "there's about 30-40% risk of erectile dysfunction",
              "This may improve over 12-24 months",
              "We have several treatment options",
              "Many men maintain satisfactory function",
            ],
          },
          "Urinary Incontinence": {
            score: 5,
            sentences: [
              "Based on your anatomy and my surgical experience",
              "you have less than 5% risk of needing pads long-term",
              "Your pelvic muscle strength is excellent",
              "Recovery typically occurs within 6 months",
              "I expect you'll have excellent continence outcomes",
            ],
          },
          "Irritative Symptoms": {
            score: 3,
            sentences: [
              "You may experience some urinary frequency initially",
              "About 20% chance of persistent symptoms at 1 year",
              "These are usually mild and manageable",
              "Symptoms tend to improve with time",
              "Surgery generally causes fewer irritative symptoms than radiation",
            ],
          },
        },
      },
      {
        id: "P003",
        name: "Patient C",
        consultationDate: "2025-09-02",
        status: "completed",
        overallScore: 1.8,
        topics: {
          "Cancer Prognosis": {
            score: 1,
            sentences: [
              "You have cancer",
              "It needs to be treated",
              "Surgery is an option",
              "We should discuss treatment",
              "This is something we need to address",
            ],
          },
          "Life Expectancy": {
            score: 1,
            sentences: [
              "You're still young",
              "You have many years ahead",
              "Health is important",
              "We should think about the future",
              "Treatment decisions matter",
            ],
          },
          "Erectile Dysfunction": {
            score: 2,
            sentences: [
              "There might be some effects on function",
              "This is a possible side effect",
              "We should discuss this risk",
              "Function might be affected",
              "This is something to consider",
            ],
          },
          "Urinary Incontinence": {
            score: 2,
            sentences: [
              "There could be some leakage",
              "This might be temporary",
              "Most men do well",
              "We'll monitor this closely",
              "Recovery varies",
            ],
          },
          "Irritative Symptoms": {
            score: 3,
            sentences: [
              "You might have some urinary symptoms",
              "About 25% of patients experience this",
              "These usually get better",
              "We can manage symptoms if they occur",
              "Surgery tends to have fewer symptoms",
            ],
          },
        },
      },
    ];
  };

  useEffect(() => {
    loadExcelData();
  }, []);

  // Main dashboard view
  const DashboardView = () => (
    <div className="space-y-8">
      <div
        className={`border-b pb-6 ${
          isDarkMode ? "border-slate-600" : "border-slate-200"
        }`}
      >
        <h1
          className={`text-4xl font-light mb-3 ${
            isDarkMode ? "text-slate-100" : "text-slate-900"
          }`}
        >
          Physician Reports
        </h1>
        <p
          className={`text-lg ${
            isDarkMode ? "text-slate-400" : "text-slate-600"
          }`}
        >
          Communication Quality Assessment • Prostate Cancer Consultations •{" "}
          {patients.length} patient reports
        </p>
      </div>

      {/* Overall statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div
          className={`border p-8 rounded-xl shadow-lg ${
            isDarkMode
              ? "bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700"
              : "bg-gradient-to-br from-white to-slate-50 border-slate-200"
          }`}
        >
          <div
            className={`text-sm font-semibold uppercase tracking-wider mb-2 ${
              isDarkMode ? "text-cyan-400" : "text-cyan-600"
            }`}
          >
            Total Reports
          </div>
          <div
            className={`text-4xl font-light ${
              isDarkMode ? "text-slate-100" : "text-slate-900"
            }`}
          >
            {patients.length}
          </div>
        </div>
        <div
          className={`border p-8 rounded-xl shadow-lg ${
            isDarkMode
              ? "bg-gradient-to-br from-emerald-900 to-emerald-800 border-emerald-700"
              : "bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200"
          }`}
        >
          <div
            className={`text-sm font-semibold uppercase tracking-wider mb-2 ${
              isDarkMode ? "text-emerald-300" : "text-emerald-700"
            }`}
          >
            High Quality
          </div>
          <div
            className={`text-4xl font-light ${
              isDarkMode ? "text-emerald-100" : "text-emerald-900"
            }`}
          >
            {patients.filter((p) => p.overallScore >= 4).length}
          </div>
          <div
            className={`text-sm mt-1 ${
              isDarkMode ? "text-emerald-400" : "text-emerald-600"
            }`}
          >
            Score 4-5
          </div>
        </div>
        <div
          className={`border p-8 rounded-xl shadow-lg ${
            isDarkMode
              ? "bg-gradient-to-br from-yellow-900 to-yellow-800 border-yellow-700"
              : "bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200"
          }`}
        >
          <div
            className={`text-sm font-semibold uppercase tracking-wider mb-2 ${
              isDarkMode ? "text-yellow-300" : "text-yellow-700"
            }`}
          >
            Standard Quality
          </div>
          <div
            className={`text-4xl font-light ${
              isDarkMode ? "text-yellow-100" : "text-yellow-900"
            }`}
          >
            {
              patients.filter((p) => p.overallScore >= 3 && p.overallScore < 4)
                .length
            }
          </div>
          <div
            className={`text-sm mt-1 ${
              isDarkMode ? "text-yellow-400" : "text-yellow-600"
            }`}
          >
            Score 3
          </div>
        </div>
        <div
          className={`border p-8 rounded-xl shadow-lg ${
            isDarkMode
              ? "bg-gradient-to-br from-red-900 to-pink-900 border-red-700"
              : "bg-gradient-to-br from-red-50 to-pink-100 border-red-200"
          }`}
        >
          <div
            className={`text-sm font-semibold uppercase tracking-wider mb-2 ${
              isDarkMode ? "text-red-300" : "text-red-700"
            }`}
          >
            Needs Improvement
          </div>
          <div
            className={`text-4xl font-light ${
              isDarkMode ? "text-red-100" : "text-red-900"
            }`}
          >
            {patients.filter((p) => p.overallScore < 3).length}
          </div>
          <div
            className={`text-sm mt-1 ${
              isDarkMode ? "text-red-400" : "text-red-600"
            }`}
          >
            Score 1-2
          </div>
        </div>
      </div>

      {/* Patient reports table */}
      <div
        className={`border rounded-xl shadow-xl overflow-hidden ${
          isDarkMode
            ? "bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700"
            : "bg-gradient-to-br from-white to-slate-50 border-slate-200"
        }`}
      >
        <div
          className={`px-8 py-6 border-b ${
            isDarkMode
              ? "bg-gradient-to-r from-slate-700 to-slate-800 border-slate-600"
              : "bg-gradient-to-r from-slate-100 to-slate-50 border-slate-200"
          }`}
        >
          <h2
            className={`text-xl font-semibold ${
              isDarkMode ? "text-slate-100" : "text-slate-900"
            }`}
          >
            Physician Communication Reports
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead
              className={`border-b ${
                isDarkMode
                  ? "bg-gradient-to-r from-slate-700 to-slate-800 border-slate-600"
                  : "bg-gradient-to-r from-slate-100 to-slate-50 border-slate-200"
              }`}
            >
              <tr>
                <th
                  className={`px-8 py-4 text-left text-sm font-semibold uppercase tracking-wider ${
                    isDarkMode ? "text-slate-300" : "text-slate-700"
                  }`}
                >
                  Patient Information
                </th>
                <th
                  className={`px-8 py-4 text-left text-sm font-semibold uppercase tracking-wider ${
                    isDarkMode ? "text-slate-300" : "text-slate-700"
                  }`}
                >
                  Consultation Date
                </th>
                <th
                  className={`px-8 py-4 text-center text-sm font-semibold uppercase tracking-wider ${
                    isDarkMode ? "text-slate-300" : "text-slate-700"
                  }`}
                >
                  Overall Quality Score
                </th>
                <th
                  className={`px-8 py-4 text-center text-sm font-semibold uppercase tracking-wider ${
                    isDarkMode ? "text-slate-300" : "text-slate-700"
                  }`}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody
              className={`divide-y ${
                isDarkMode
                  ? "bg-gradient-to-br from-slate-800 to-slate-900 divide-slate-700"
                  : "bg-gradient-to-br from-white to-slate-50 divide-slate-200"
              }`}
            >
              {patients.map((patient) => (
                <tr
                  key={patient.id}
                  className={`transition-colors duration-200 ${
                    isDarkMode
                      ? "hover:bg-slate-700/50"
                      : "hover:bg-slate-100/50"
                  }`}
                >
                  <td className="px-8 py-6">
                    <div>
                      <div
                        className={`text-lg font-semibold ${
                          isDarkMode ? "text-slate-100" : "text-slate-900"
                        }`}
                      >
                        {patient.name}
                      </div>
                      <div
                        className={`text-sm font-medium ${
                          isDarkMode ? "text-cyan-400" : "text-cyan-600"
                        }`}
                      >
                        {patient.id}
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div
                      className={`text-sm font-medium ${
                        isDarkMode ? "text-slate-200" : "text-slate-700"
                      }`}
                    >
                      {patient.consultationDate}
                    </div>
                  </td>
                  <td className="px-8 py-6 text-center">
                    <span
                      className={`inline-flex items-center justify-center w-12 h-12 rounded-xl text-lg font-bold ${getScoreColor(
                        Math.round(patient.overallScore)
                      )}`}
                    >
                      {patient.overallScore.toFixed(1)}
                    </span>
                  </td>
                  <td className="px-8 py-6 text-center">
                    <button
                      onClick={() => {
                        setSelectedPatient(patient);
                        setCurrentView("grid");
                      }}
                      className={`px-6 py-3 rounded-lg text-sm font-semibold transition-all duration-200 ${
                        isDarkMode
                          ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-500 hover:to-blue-500 shadow-lg"
                          : "bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:from-cyan-600 hover:to-blue-600 shadow-lg"
                      }`}
                    >
                      View Report
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Data management section */}
      {/* <div
        className={`border-2 border-dashed rounded-xl p-10 text-center ${
          isDarkMode
            ? "bg-gradient-to-br from-slate-800 to-slate-900 border-slate-600"
            : "bg-gradient-to-br from-slate-50 to-white border-slate-300"
        }`}
      >
        <div className="max-w-md mx-auto">
          <h3
            className={`text-lg font-semibold mb-3 ${
              isDarkMode ? "text-slate-200" : "text-slate-900"
            }`}
          >
            Report Data Management
          </h3>
          <p
            className={`text-sm mb-6 ${
              isDarkMode ? "text-slate-400" : "text-slate-600"
            }`}
          >
            Load physician consultation data from Excel file
            (nlpextractedsentences_subset.xlsx)
          </p>
          <button
            onClick={loadExcelData}
            className={`px-8 py-3 rounded-lg text-sm font-semibold transition-all duration-200 ${
              isDarkMode
                ? "bg-gradient-to-r from-slate-700 to-slate-600 border border-slate-600 text-slate-200 hover:from-slate-600 hover:to-slate-500 shadow-lg"
                : "bg-gradient-to-r from-white to-slate-50 border border-slate-300 text-slate-700 hover:from-slate-50 hover:to-slate-100 shadow-lg"
            }`}
          >
            Refresh Dataset
          </button>
        </div>
      </div> */}
    </div>
  );

  // Grid Summary View (Individual physician report view)
  const PhysicianReportView = ({ patient }) => (
    <div className="space-y-8">
      <div
        className={`border-b pb-6 ${
          isDarkMode ? "border-slate-600" : "border-slate-200"
        }`}
      >
        <button
          onClick={() => setCurrentView("dashboard")}
          className={`mb-4 flex items-center gap-2 text-sm font-medium transition-colors ${
            isDarkMode
              ? "text-cyan-400 hover:text-cyan-300"
              : "text-cyan-600 hover:text-cyan-800"
          }`}
        >
          ← Return to Reports Dashboard
        </button>
        <h1
          className={`text-3xl font-light mb-3 ${
            isDarkMode ? "text-slate-100" : "text-slate-900"
          }`}
        >
          Grid Summary — {patient.name}
        </h1>
        <div
          className={`text-lg ${
            isDarkMode ? "text-slate-400" : "text-slate-600"
          }`}
        >
          <span>Consultation: {patient.consultationDate}</span>
          <span className="mx-3">•</span>
          <span>Overall Quality Score: {patient.overallScore.toFixed(1)}</span>
        </div>
      </div>

      <div
        className={`border rounded-xl shadow-xl overflow-hidden ${
          isDarkMode
            ? "bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700"
            : "bg-gradient-to-br from-white to-slate-50 border-slate-200"
        }`}
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead
              className={`border-b ${
                isDarkMode
                  ? "bg-gradient-to-r from-slate-700 to-slate-800 border-slate-600"
                  : "bg-gradient-to-r from-slate-100 to-slate-50 border-slate-200"
              }`}
            >
              <tr>
                <th
                  className={`px-6 py-5 text-left text-sm font-semibold uppercase tracking-wider ${
                    isDarkMode ? "text-slate-300" : "text-slate-700"
                  }`}
                >
                  Topic
                </th>
                <th
                  className={`px-6 py-5 text-center text-sm font-semibold uppercase tracking-wider ${
                    isDarkMode ? "text-slate-300" : "text-slate-700"
                  }`}
                >
                  Your Score
                </th>
                <th
                  className={`px-6 py-5 text-left text-sm font-semibold uppercase tracking-wider ${
                    isDarkMode ? "text-slate-300" : "text-slate-700"
                  }`}
                >
                  Representative Sentence
                </th>
                <th
                  className={`px-6 py-5 text-left text-sm font-semibold uppercase tracking-wider ${
                    isDarkMode ? "text-slate-300" : "text-slate-700"
                  }`}
                >
                  Suggestions for Improvement
                </th>
                <th
                  className={`px-6 py-5 text-left text-sm font-semibold uppercase tracking-wider ${
                    isDarkMode ? "text-slate-300" : "text-slate-700"
                  }`}
                >
                  Suggested Rephrasing
                </th>
              </tr>
            </thead>
            <tbody
              className={`divide-y ${
                isDarkMode ? "divide-slate-700" : "divide-slate-200"
              }`}
            >
              {Object.entries(patient.topics).map(([topicName, topicData]) => {
                const suggestions = getImprovementSuggestions(
                  topicName,
                  topicData.score
                );
                return (
                  <tr
                    key={topicName}
                    className={`transition-colors duration-200 ${
                      isDarkMode
                        ? "hover:bg-slate-700/50"
                        : "hover:bg-slate-100/50"
                    }`}
                  >
                    <td className="px-6 py-6">
                      <button
                        onClick={() => {
                          setSelectedTopic({
                            name: topicName,
                            data: topicData,
                            patient,
                          });
                          setCurrentView("detail");
                        }}
                        className={`text-base font-semibold underline transition-colors text-left ${
                          isDarkMode
                            ? "text-cyan-400 hover:text-cyan-300"
                            : "text-cyan-600 hover:text-cyan-800"
                        }`}
                      >
                        {topicName}
                      </button>
                    </td>
                    <td className="px-6 py-6 text-center">
                      <span
                        className={`inline-flex items-center justify-center w-10 h-10 rounded-lg text-lg font-bold ${getScoreColor(
                          topicData.score
                        )}`}
                      >
                        {topicData.score}
                      </span>
                    </td>
                    <td className="px-6 py-6 max-w-xs">
                      <div
                        className={`text-sm leading-relaxed ${
                          isDarkMode ? "text-slate-300" : "text-slate-600"
                        }`}
                      >
                        "{topicData.sentences[0]?.substring(0, 120)}..."
                      </div>
                    </td>
                    <td className="px-6 py-6 max-w-xs">
                      {suggestions.length > 0 ? (
                        <div className="space-y-1">
                          {suggestions.slice(0, 2).map((suggestion, idx) => (
                            <div
                              key={idx}
                              className={`text-xs ${
                                isDarkMode ? "text-slate-400" : "text-slate-600"
                              }`}
                            >
                              • To achieve score {suggestion.targetScore}:{" "}
                              {suggestion.suggestion}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div
                          className={`text-xs ${
                            isDarkMode ? "text-emerald-400" : "text-emerald-600"
                          }`}
                        >
                          No suggestions needed
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-6 max-w-xs">
                      <button
                        onClick={() => {
                          setSelectedTopic({
                            name: topicName,
                            data: topicData,
                            patient,
                          });
                          setCurrentView("detail");
                        }}
                        className={`text-sm font-medium transition-colors underline ${
                          isDarkMode
                            ? "text-cyan-400 hover:text-cyan-300"
                            : "text-cyan-600 hover:text-cyan-800"
                        }`}
                      >
                        AI Re-write →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // Detailed analysis view with improvement tools
  const DetailedAnalysisView = () => {
    const handleRescoring = async () => {
      if (!newSentence.trim()) return;

      const newScore = await rescoreSentence(newSentence, selectedTopic.name);

      // Update the patient data
      const updatedPatients = patients.map((p) => {
        if (p.id === selectedTopic.patient.id) {
          return {
            ...p,
            topics: {
              ...p.topics,
              [selectedTopic.name]: {
                ...p.topics[selectedTopic.name],
                sentences: [
                  ...p.topics[selectedTopic.name].sentences,
                  newSentence,
                ],
                score: Math.max(p.topics[selectedTopic.name].score, newScore),
              },
            },
          };
        }
        return p;
      });

      setPatients(updatedPatients);

      // Update selected topic
      const updatedPatient = updatedPatients.find(
        (p) => p.id === selectedTopic.patient.id
      );
      setSelectedTopic({
        ...selectedTopic,
        data: updatedPatient.topics[selectedTopic.name],
        patient: updatedPatient,
      });

      setNewSentence("");
    };

    const leftLabelByTopic = (topic: string) => {
      switch (topic) {
        case "Cancer Prognosis":
          return "Cancer\nPrognosis";
        case "Life Expectancy":
          return "Life\nExpectancy";
        case "Erectile Dysfunction":
          return "Erectile\nDysfunction";
        case "Urinary Incontinence":
          return "Urinary\nIncontinence";
        case "Irritative Symptoms":
          return "Irritative\nSymptoms";
        default:
          return topic;
      }
    };

    const titleByScore = (score: number) => {
      const name =
        score === 0
          ? "No mention"
          : score === 1
          ? "Name Only"
          : score === 2
          ? "Generalization"
          : score === 3
          ? "Imprecise Quantification"
          : score === 4
          ? "Specific Quantification"
          : "Patient-centered Estimate";
      return `Consultation Scoring: ${score} (${name})`;
    };

    return (
      <div className="space-y-8">
        <button
          onClick={() => setCurrentView("grid")}
          className={`flex items-center gap-2 text-sm font-medium transition-colors ${
            isDarkMode
              ? "text-cyan-400 hover:text-cyan-300"
              : "text-cyan-600 hover:text-cyan-800"
          }`}
        >
          ← Return to Grid Summary
        </button>

        <div
          className={`border rounded-xl p-8 shadow-xl ${
            isDarkMode
              ? "bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700"
              : "bg-gradient-to-br from-white to-slate-50 border-slate-200"
          }`}
        >
          {/* Header */}
          <div
            className={`border-b pb-6 mb-8 ${
              isDarkMode ? "border-slate-700" : "border-slate-200"
            }`}
          >
            <h2
              className={`text-3xl font-light mb-2 ${
                isDarkMode ? "text-slate-100" : "text-slate-900"
              }`}
            >
              {selectedTopic.name}
            </h2>
            <p
              className={`text-lg ${
                isDarkMode ? "text-slate-400" : "text-slate-600"
              }`}
            >
              {selectedTopic.patient.name} • Consultation:{" "}
              {selectedTopic.patient.consultationDate}
            </p>

            {/* <ConsultationScoring /> */}
            <ConsultationScoring
              isDarkMode={isDarkMode}
              title={titleByScore(selectedTopic.data.score)}
              subtitle="Quality of Risk Communication"
              highlightedQuote={
                // 대표 문장(없을 때 안전 처리)
                selectedTopic.data.sentences?.[0] ??
                "No representative sentence available."
              }
              highlightPosition={selectedTopic.data.score}
              leftLabel={leftLabelByTopic(selectedTopic.name)}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column - Current Score and Scale */}
            <div className="lg:col-span-1">
              <div
                className={`border rounded-lg p-6 mb-6 ${
                  isDarkMode
                    ? "bg-slate-800 border-slate-600"
                    : "bg-slate-50 border-slate-200"
                }`}
              >
                <h4
                  className={`text-sm font-semibold uppercase tracking-wider mb-4 ${
                    isDarkMode ? "text-slate-300" : "text-slate-700"
                  }`}
                >
                  Consultation Scoring
                </h4>
                <div className="text-center mb-6">
                  <div
                    className={`text-lg font-medium mb-2 ${
                      isDarkMode ? "text-slate-300" : "text-slate-600"
                    }`}
                  >
                    {selectedTopic.data.score} (
                    {selectedTopic.data.score === 1
                      ? "No mention"
                      : selectedTopic.data.score === 2
                      ? "Generalization"
                      : selectedTopic.data.score === 3
                      ? "Imprecise Quantification"
                      : selectedTopic.data.score === 4
                      ? "Specific Quantification"
                      : "Patient-centered Estimate"}
                    )
                  </div>
                </div>

                {/* Horizontal Quality Scale */}
                <div className="mb-6">
                  <div
                    className={`text-xs font-medium mb-3 ${
                      isDarkMode ? "text-slate-400" : "text-slate-600"
                    }`}
                  >
                    Quality of Risk Communication
                  </div>
                  <div className="grid grid-cols-6 gap-2 mb-2">
                    {[0, 1, 2, 3, 4, 5].map((score) => (
                      <div
                        key={score}
                        className="flex flex-col items-center space-y-2"
                      >
                        <span
                          className={`inline-flex items-center justify-center w-10 h-10 rounded-lg text-sm font-bold ${
                            score === 0
                              ? isDarkMode
                                ? "bg-slate-600 text-slate-400 border border-slate-500"
                                : "bg-slate-200 text-slate-500 border border-slate-300"
                              : getScoreColor(score)
                          } ${
                            selectedTopic.data.score === score
                              ? "ring-2 ring-blue-400 shadow-lg transform scale-110"
                              : ""
                          }`}
                        >
                          {score}
                        </span>
                        <span
                          className={`text-xs text-center leading-tight ${
                            isDarkMode ? "text-slate-400" : "text-slate-600"
                          }`}
                        >
                          {score === 0 && "No mention"}
                          {score === 1 && "Name Only"}
                          {score === 2 && "General-ization"}
                          {score === 3 && "Imprecise Quant."}
                          {score === 4 && "Specific Quant."}
                          {score === 5 && "Patient-centered Estimate"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Suggestions for Improvement */}
              <div
                className={`border rounded-lg p-6 ${
                  isDarkMode
                    ? "bg-slate-800 border-slate-600"
                    : "bg-slate-50 border-slate-200"
                }`}
              >
                <h4
                  className={`text-sm font-semibold uppercase tracking-wider mb-4 ${
                    isDarkMode ? "text-slate-300" : "text-slate-700"
                  }`}
                >
                  Suggestions for Improvement
                </h4>
                <div className="space-y-3">
                  {getImprovementSuggestions(
                    selectedTopic.name,
                    selectedTopic.data.score
                  ).map((suggestion, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg border ${
                        isDarkMode
                          ? "bg-slate-700 border-slate-600"
                          : "bg-white border-slate-200"
                      }`}
                    >
                      <div className="flex items-start space-x-3">
                        <span
                          className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${getScoreColor(
                            suggestion.targetScore
                          )}`}
                        >
                          {suggestion.targetScore}
                        </span>
                        <div>
                          <div
                            className={`text-xs font-medium mb-1 ${
                              isDarkMode ? "text-slate-200" : "text-slate-900"
                            }`}
                          >
                            To achieve score {suggestion.targetScore}:
                          </div>
                          <div
                            className={`text-xs ${
                              isDarkMode ? "text-slate-400" : "text-slate-600"
                            }`}
                          >
                            {suggestion.suggestion}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {getImprovementSuggestions(
                    selectedTopic.name,
                    selectedTopic.data.score
                  ).length === 0 && (
                    <div
                      className={`text-sm font-medium ${
                        isDarkMode ? "text-emerald-400" : "text-emerald-600"
                      }`}
                    >
                      Excellent communication quality - no improvements needed
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column - AI Re-write */}
            <div className="lg:col-span-2">
              <div
                className={`border rounded-lg p-6 h-full ${
                  isDarkMode
                    ? "bg-slate-800 border-slate-600"
                    : "bg-slate-50 border-slate-200"
                }`}
              >
                <h4
                  className={`text-sm font-semibold uppercase tracking-wider mb-4 ${
                    isDarkMode ? "text-slate-300" : "text-slate-700"
                  }`}
                >
                  AI Re-write
                </h4>
                <p
                  className={`text-sm mb-4 ${
                    isDarkMode ? "text-slate-400" : "text-slate-600"
                  }`}
                >
                  Test how alternative phrasing would score using our AI
                  assessment tool.
                </p>
                <div className="space-y-4">
                  <textarea
                    value={newSentence}
                    onChange={(e) => setNewSentence(e.target.value)}
                    placeholder="Enter an alternative way to communicate this information..."
                    className={`w-full p-4 rounded-lg border text-sm ${
                      isDarkMode
                        ? "bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-400"
                        : "bg-white border-slate-300 text-slate-900 placeholder-slate-500"
                    }`}
                    rows={6}
                  />
                  <button
                    onClick={handleRescoring}
                    disabled={!newSentence.trim() || rescoring}
                    className={`px-6 py-3 rounded-lg text-sm font-semibold transition-all duration-200 ${
                      !newSentence.trim() || rescoring
                        ? isDarkMode
                          ? "bg-slate-600 text-slate-400 cursor-not-allowed"
                          : "bg-slate-200 text-slate-500 cursor-not-allowed"
                        : isDarkMode
                        ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-500 hover:to-blue-500 shadow-lg"
                        : "bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:from-cyan-600 hover:to-blue-600 shadow-lg"
                    }`}
                  >
                    {rescoring
                      ? "Analyzing Communication Quality..."
                      : "Assess Communication Quality"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Full Context Section */}
          <div className="mt-8">
            <h4
              className={`text-sm font-semibold uppercase tracking-wider mb-4 ${
                isDarkMode ? "text-slate-300" : "text-slate-700"
              }`}
            >
              Full Context
            </h4>
            <div
              className={`border rounded-lg p-6 ${
                isDarkMode
                  ? "bg-slate-800 border-slate-600"
                  : "bg-slate-50 border-slate-200"
              }`}
            >
              <div className="space-y-4">
                {selectedTopic.data.sentences.map((sentence, idx) => (
                  <div
                    key={idx}
                    className={`pl-4 border-l-4 ${
                      isDarkMode ? "border-cyan-600" : "border-cyan-400"
                    }`}
                  >
                    <div
                      className={`text-sm leading-relaxed ${
                        isDarkMode ? "text-slate-300" : "text-slate-700"
                      }`}
                    >
                      "{sentence}"
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div
        className={`max-w-7xl mx-auto p-8 min-h-screen ${
          isDarkMode ? "bg-slate-900" : "bg-slate-50"
        }`}
      >
        <div className="flex justify-center items-center h-64">
          <div
            className={`text-lg font-medium ${
              isDarkMode ? "text-slate-400" : "text-slate-600"
            }`}
          >
            Loading physician communication reports...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`max-w-7xl mx-auto p-8 min-h-screen ${
          isDarkMode ? "bg-slate-900" : "bg-slate-50"
        }`}
      >
        <div
          className={`border rounded-xl p-8 shadow-lg ${
            isDarkMode
              ? "bg-gradient-to-br from-red-900 to-red-800 border-red-700"
              : "bg-gradient-to-br from-red-50 to-red-100 border-red-200"
          }`}
        >
          <h2
            className={`text-xl font-semibold mb-3 ${
              isDarkMode ? "text-red-100" : "text-red-900"
            }`}
          >
            Report System Error
          </h2>
          <p className={`mb-6 ${isDarkMode ? "text-red-200" : "text-red-700"}`}>
            {error}
          </p>
          <button
            onClick={loadExcelData}
            className={`px-6 py-3 rounded-lg text-sm font-semibold ${
              isDarkMode
                ? "bg-red-700 text-red-100 hover:bg-red-600"
                : "bg-red-600 text-white hover:bg-red-700"
            }`}
          >
            Retry Data Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`max-w-7xl mx-auto p-8 min-h-screen ${
        isDarkMode ? "bg-slate-900" : "bg-slate-50"
      }`}
    >
      {currentView === "dashboard" && <DashboardView />}
      {currentView === "grid" && selectedPatient && (
        <PhysicianReportView patient={selectedPatient} />
      )}
      {currentView === "detail" && selectedTopic && <DetailedAnalysisView />}
    </div>
  );
};

export default PhysicianReports;
