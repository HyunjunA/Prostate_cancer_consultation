// PhysicianReportsModified.tsx
// Language: TypeScript/React (TailwindCSS)
// NOTE: 모든 API 호출을 useDoctorData 훅으로 통합, store에서 fileId/doctorId 사용

import React, { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import { useProstateCancelData } from "@/hooks/useProstateCancelData";
import ConsultationScoring from "./ConsultationScoring";
import { useDoctorData } from "@/hooks/useDoctorData";

// ═══════════════════════════════════════════════════════════
// ✅ Store imports 추가
// ═══════════════════════════════════════════════════════════
import { useFileId } from "@/stores/useFileId";
import { useDoctorId } from "@/stores/useDoctorId";

// Types
type TopicName =
  | "Cancer Prognosis"
  | "Life Expectancy"
  | "Erectile Dysfunction"
  | "Urinary Incontinence"
  | "Irritative Symptoms"
  | string;

interface TopicData {
  score: number;
  sentences: string[];
}

interface PatientRow {
  id: string;
  name: string;
  consultationDate: string;
  status?: string;
  overallScore: number;
  topics: Record<TopicName, TopicData>;
}

interface PhysicianReportsProps {
  isDarkMode?: boolean;
}

const PhysicianReports: React.FC<PhysicianReportsProps> = ({
  isDarkMode = false,
}) => {
  // DATA
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientRow | null>(
    null
  );

  // ═══════════════════════════════════════════════════════════
  // ✅ Store에서 fileId, doctorId 가져오기
  // ═══════════════════════════════════════════════════════════
  const { fileId } = useFileId();
  const { doctorId } = useDoctorId();

  // ═══════════════════════════════════════════════════════════
  // ✅ useDoctorData 훅 통합
  // ═══════════════════════════════════════════════════════════
  const {
    files,
    sentences,
    rewritesAll,
    rewritesFiltered,
    rewritesPaginated,
    fetchFiles,
    fetchSentences,
    fetchRewritesAll,
    fetchRewritesFiltered,
    fetchRewritesPaginated,
  } = useDoctorData();

  // ═══════════════════════════════════════════════════════════
  // ✅ UI 상태 변수 - store 값으로 초기화
  // ═══════════════════════════════════════════════════════════
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>("");
  const [skipValue, setSkipValue] = useState<number>(0);
  const [limitValue, setLimitValue] = useState<number>(50);
  const [activeTab, setActiveTab] = useState<string>("sentences");

  // ═══════════════════════════════════════════════════════════
  // ✅ Store 값이 변경되면 로컬 상태 업데이트
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (fileId) {
      setSelectedFile(fileId);
      console.log("📁 PhysicianReports - File ID from store:", fileId);
    }
  }, [fileId]);

  useEffect(() => {
    if (doctorId) {
      setSelectedSpeaker(doctorId);
      console.log("👨‍⚕️ PhysicianReports - Doctor ID from store:", doctorId);
    }
  }, [doctorId]);

  // ═══════════════════════════════════════════════════════════
  // ✅ useEffect - 초기 파일 목록 로드 (한 번만)
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    console.log("📁 Fetching files...");
    fetchFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ═══════════════════════════════════════════════════════════
  // ✅ useEffect - files 데이터 변경 감시
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (files) {
      console.log("✅ Physician-Files loaded:", files);
    }
  }, [files]);

  // ═══════════════════════════════════════════════════════════
  // ✅ useEffect - 기본 파일 자동 선택 (store 값이 없을 때만)
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (files && files.length > 0 && !selectedFile && !fileId) {
      // Store에 값이 없고, 로컬 상태도 없으면 기본값 설정
      const defaultFile = files[0] || "quality-coded-nlp-pilot-sid-1.xlsx";
      setSelectedFile(defaultFile);
      console.log("📌 Physician-Default file selected:", defaultFile);
    }
  }, [files, selectedFile, fileId]);

  // ═══════════════════════════════════════════════════════════
  // ✅ useEffect - 기본 스피커 자동 선택 (store 값이 없을 때만)
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (!selectedSpeaker && !doctorId) {
      const defaultSpeaker = "Interviewer:";
      setSelectedSpeaker(defaultSpeaker);
      console.log("📌 Physician-Default speaker selected:", defaultSpeaker);
    }
  }, [selectedSpeaker, doctorId]);

  // ═══════════════════════════════════════════════════════════
  // ✅ useEffect - 파일/스피커 변경 시 데이터 자동 로드
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (selectedFile && selectedSpeaker) {
      console.log(
        `📄 Fetching sentences for: ${selectedFile} / ${selectedSpeaker}`
      );
      fetchSentences(selectedFile, selectedSpeaker);
    }
  }, [selectedFile, selectedSpeaker]);

  // ═══════════════════════════════════════════════════════════
  // ✅ useEffect - sentences 데이터 변경 감시
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (sentences) {
      console.log("✅ Physician-Sentences Data loaded:", sentences);
      if (sentences.data) {
        console.table(sentences.data);
      }
    }
  }, [sentences]);

  // ═══════════════════════════════════════════════════════════
  // ✅ useEffect - rewritesAll 데이터 변경 감시
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (rewritesAll) {
      console.log("✅ Physician-All Rewrites Data loaded:", rewritesAll);
      if (rewritesAll.data) {
        console.table(rewritesAll.data);
      }
    }
  }, [rewritesAll]);

  // ═══════════════════════════════════════════════════════════
  // ✅ useEffect - rewritesFiltered 데이터 변경 감시
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (rewritesFiltered) {
      console.log(
        "✅ Physician-Filtered Rewrites Data loaded:",
        rewritesFiltered
      );
      if (rewritesFiltered.data) {
        console.table(rewritesFiltered.data);
      }
    }
  }, [rewritesFiltered]);

  // ═══════════════════════════════════════════════════════════
  // ✅ useEffect - rewritesPaginated 데이터 변경 감시
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (rewritesPaginated) {
      console.log(
        "✅ Physician-Paginated Rewrites Data loaded:",
        rewritesPaginated
      );
      if (rewritesPaginated.data) {
        console.table(rewritesPaginated.data);
      }
    }
  }, [rewritesPaginated]);

  // ═══════════════════════════════════════════════════════════
  // ✅ 핸들러 함수 - 모든 Rewrites 로드
  // ═══════════════════════════════════════════════════════════
  const handleLoadAllRewrites = () => {
    console.log("🔄 Physician-Loading all rewrites...");
    fetchRewritesAll();
    setActiveTab("rewrites");
  };

  // ═══════════════════════════════════════════════════════════
  // ✅ 핸들러 함수 - 필터된 Rewrites 로드
  // ═══════════════════════════════════════════════════════════
  const handleLoadFilteredRewrites = () => {
    if (selectedFile && selectedSpeaker) {
      console.log(
        `🔍 Physician-Loading filtered rewrites for: ${selectedFile} / ${selectedSpeaker}`
      );
      fetchRewritesFiltered(selectedFile, selectedSpeaker);
      setActiveTab("rewrites");
    } else {
      console.warn("⚠️ File and speaker must be selected");
    }
  };

  // ═══════════════════════════════════════════════════════════
  // ✅ 핸들러 함수 - 페이지네이션 Rewrites 로드
  // ═══════════════════════════════════════════════════════════
  const handleLoadPaginatedRewrites = () => {
    console.log(
      `📊 Physician-Loading paginated rewrites with skip=${skipValue}, limit=${limitValue}`
    );
    fetchRewritesPaginated(skipValue, limitValue);
    setActiveTab("rewrites");
  };

  // ═══════════════════════════════════════════════════════════
  // ✅ 핸들러 함수 - 파일 새로고침
  // ═══════════════════════════════════════════════════════════
  const handleRefreshFiles = () => {
    console.log("🔃 Physician-Refreshing files...");
    fetchFiles();
  };

  // NAV
  const [currentView, setCurrentView] = useState<
    "dashboard" | "grid" | "detail"
  >("dashboard");
  const [selectedTopic, setSelectedTopic] = useState<{
    name: TopicName;
    data: TopicData;
    patient: PatientRow;
  } | null>(null);

  // STATUS
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // REWRITE/RESCORE
  const [newSentence, setNewSentence] = useState("");
  const [rescoring, setRescoring] = useState(false);

  // UI helpers
  const cx = (...classes: (string | false | null | undefined)[]) =>
    classes.filter(Boolean).join(" ");

  const getScoreColor = (score: number) => {
    if (isDarkMode) {
      const darkColors: Record<number, string> = {
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
    }
    const lightColors: Record<number, string> = {
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
  };

  const getImprovementSuggestions = (
    domain: TopicName,
    currentScore: number
  ) => {
    const suggestions: Record<string, Record<number, string>> = {
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
        3: 'Provide a rough quantified estimate of life expectancy (e.g., "about 15–20 years")',
        4: "Provide a probability of living to an arbitrary timepoint",
        5: "Provide a specific number of years and mention calculation based on patient's age/health",
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
    const applicable = [];
    for (let score = currentScore + 1; score <= 5; score++) {
      if (domainSuggestions[score]) {
        applicable.push({
          targetScore: score,
          suggestion: domainSuggestions[score],
        });
      }
    }
    return applicable;
  };

  const rescoreSentence = async (sentence: string) => {
    setRescoring(true);
    await new Promise((r) => setTimeout(r, 1200));
    let score = 1;
    const s = sentence.toLowerCase();
    if (s.includes("%") || s.includes("percent")) score = Math.max(score, 3);
    if (s.includes("year") || s.includes("month")) score = Math.max(score, 4);
    if (s.includes("based on") || s.includes("specific"))
      score = Math.max(score, 5);
    setRescoring(false);
    return Math.min(score, 5);
  };

  const loadExcelData = async () => {
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
        const processed = processExcelData(jsonData as any[]);
        setPatients(processed);
      } catch (fileErr) {
        console.log("Excel file not found. Using sample data.");
        setPatients(generateSampleData());
      }
    } catch (err: any) {
      setError("Error loading data: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const processExcelData = (rows: any[]): PatientRow[] => {
    const patientMap = new Map<string, PatientRow>();
    rows.forEach((row) => {
      const patientId =
        row["PatientID"] || row["Patient ID"] || row["patient_id"];
      const patientName =
        row["PatientName"] || row["Patient Name"] || row["patient_name"];
      const consultationDate =
        row["ConsultationDate"] ||
        row["Consultation Date"] ||
        row["consultation_date"];
      const topic = (row["Topic"] || row["topic"]) as TopicName;
      const extractedSentence =
        row["ExtractedSentence"] ||
        row["Extracted Sentence"] ||
        row["extracted_sentence"];
      const score = Number(row["Score"] || row["score"] || 0);

      if (!patientMap.has(patientId)) {
        patientMap.set(patientId, {
          id: patientId,
          name: patientName,
          consultationDate,
          status: "completed",
          overallScore: 0,
          topics: {},
        });
      }
      const patient = patientMap.get(patientId)!;
      if (!patient.topics[topic]) {
        patient.topics[topic] = { sentences: [], score };
      }
      patient.topics[topic].sentences.push(String(extractedSentence ?? ""));
      patient.overallScore =
        Object.values(patient.topics).reduce(
          (acc, t) => acc + (t as TopicData).score,
          0
        ) / Object.values(patient.topics).length;
    });
    return Array.from(patientMap.values());
  };

  const generateSampleData = (): PatientRow[] => [
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
            "So 12% risk of death from prostate cancer at 15 years is small in the grand scheme of things",
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
          ],
        },
        "Erectile Dysfunction": {
          score: 3,
          sentences: [
            "For erectile function, I quoted you a 40–50% chance",
            "of getting to your baseline function",
          ],
        },
        "Urinary Incontinence": {
          score: 4,
          sentences: [
            "By one year ~90% of men will not need a pad",
            "Only ~5% might need surgery to correct significant leakage",
          ],
        },
        "Irritative Symptoms": {
          score: 2,
          sentences: [
            "You don't really have many urinary symptoms now",
            "Radiation can increase irritative symptoms for a while",
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
          ],
        },
        "Life Expectancy": {
          score: 4,
          sentences: [
            "At age 65, you have approximately 18 years life expectancy",
            "You have an 85% chance of living to age 80",
          ],
        },
        "Erectile Dysfunction": {
          score: 3,
          sentences: ["30–40% risk of ED; may improve over 12–24 months"],
        },
        "Urinary Incontinence": {
          score: 5,
          sentences: ["Less than 5% risk of long-term pad use"],
        },
        "Irritative Symptoms": {
          score: 3,
          sentences: [
            "~20% chance of persistent irritative symptoms at 1 year",
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
        "Cancer Prognosis": { score: 1, sentences: ["You have cancer"] },
        "Life Expectancy": {
          score: 1,
          sentences: ["You have many years ahead"],
        },
        "Erectile Dysfunction": {
          score: 2,
          sentences: ["There might be effects"],
        },
        "Urinary Incontinence": {
          score: 2,
          sentences: ["There could be leakage"],
        },
        "Irritative Symptoms": {
          score: 3,
          sentences: ["Some urinary symptoms"],
        },
      },
    },
  ];

  useEffect(() => {
    loadExcelData();
  }, []);

  const [search, setSearch] = useState("");
  const [scoreBand, setScoreBand] = useState<"ALL" | "HIGH" | "STD" | "LOW">(
    "ALL"
  );

  const filteredPatients = useMemo(() => {
    const q = search.trim().toLowerCase();
    let arr = patients;
    if (scoreBand === "HIGH") arr = arr.filter((p) => p.overallScore >= 4);
    if (scoreBand === "STD")
      arr = arr.filter((p) => p.overallScore >= 3 && p.overallScore < 4);
    if (scoreBand === "LOW") arr = arr.filter((p) => p.overallScore < 3);
    if (q) {
      arr = arr.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          p.consultationDate.toLowerCase().includes(q)
      );
    }
    return arr;
  }, [patients, search, scoreBand]);

  // DashboardView
  const DashboardView = () => (
    <div className="space-y-8">
      <div
        className={cx(
          "border-b pb-6",
          isDarkMode ? "border-slate-600" : "border-slate-200"
        )}
      >
        <h1
          className={cx(
            "text-4xl font-light mb-3",
            isDarkMode ? "text-slate-100" : "text-slate-900"
          )}
        >
          Physician Reports
        </h1>
        <p
          className={cx(
            "text-lg",
            isDarkMode ? "text-slate-400" : "text-slate-600"
          )}
        >
          Communication Quality Assessment • Prostate Cancer Consultations •{" "}
          {patients.length} patient reports
        </p>
        {/* ✅ 현재 선택된 파일/스피커 표시 */}
        <div className="mt-2 flex gap-4 text-sm">
          <span className={isDarkMode ? "text-cyan-400" : "text-cyan-600"}>
            📁 File: {selectedFile || "Not selected"}
          </span>
          <span className={isDarkMode ? "text-green-400" : "text-green-600"}>
            👨‍⚕️ Speaker: {selectedSpeaker || "Not selected"}
          </span>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by patient / ID / date..."
          className={cx(
            "w-full md:max-w-sm px-4 py-2 rounded-lg border",
            isDarkMode
              ? "bg-slate-800 border-slate-600 text-slate-200 placeholder-slate-500"
              : "bg-white border-slate-300 text-slate-900 placeholder-slate-500"
          )}
          aria-label="Search reports"
        />
        <div
          className={cx(
            "inline-flex rounded-lg p-1",
            isDarkMode ? "bg-slate-800" : "bg-slate-100"
          )}
        >
          {[
            { k: "ALL", label: "All" },
            { k: "HIGH", label: "High (4–5)" },
            { k: "STD", label: "Standard (3)" },
            { k: "LOW", label: "Needs Improvement (1–2)" },
          ].map(({ k, label }) => (
            <button
              key={k}
              onClick={() => setScoreBand(k as any)}
              className={cx(
                "px-3 py-2 text-sm rounded-md",
                scoreBand === (k as any)
                  ? isDarkMode
                    ? "bg-blue-700 text-blue-100"
                    : "bg-blue-600 text-white"
                  : isDarkMode
                  ? "text-slate-300 hover:bg-slate-700"
                  : "text-slate-700 hover:bg-slate-200"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <button
          onClick={() => setScoreBand("ALL")}
          className={cx(
            "border p-8 rounded-xl shadow-lg text-left transition",
            isDarkMode
              ? "bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700 hover:ring-2 hover:ring-cyan-600/30"
              : "bg-gradient-to-br from-white to-slate-50 border-slate-200 hover:ring-2 hover:ring-cyan-400/30"
          )}
          aria-label="Filter: All"
        >
          <div
            className={cx(
              "text-sm font-semibold uppercase tracking-wider mb-2",
              isDarkMode ? "text-cyan-400" : "text-cyan-600"
            )}
          >
            Total Reports
          </div>
          <div
            className={cx(
              "text-4xl font-light",
              isDarkMode ? "text-slate-100" : "text-slate-900"
            )}
          >
            {patients.length}
          </div>
        </button>

        <button
          onClick={() => setScoreBand("HIGH")}
          className={cx(
            "border p-8 rounded-xl shadow-lg text-left transition",
            isDarkMode
              ? "bg-gradient-to-br from-emerald-900 to-emerald-800 border-emerald-700 hover:ring-2 hover:ring-emerald-500/30"
              : "bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200 hover:ring-2 hover:ring-emerald-400/30"
          )}
          aria-label="Filter: High quality"
        >
          <div
            className={cx(
              "text-sm font-semibold uppercase tracking-wider mb-2",
              isDarkMode ? "text-emerald-300" : "text-emerald-700"
            )}
          >
            High Quality
          </div>
          <div
            className={cx(
              "text-4xl font-light",
              isDarkMode ? "text-emerald-100" : "text-emerald-900"
            )}
          >
            {patients.filter((p) => p.overallScore >= 4).length}
          </div>
          <div
            className={cx(
              "text-sm mt-1",
              isDarkMode ? "text-emerald-400" : "text-emerald-600"
            )}
          >
            Score 4–5
          </div>
        </button>

        <button
          onClick={() => setScoreBand("STD")}
          className={cx(
            "border p-8 rounded-xl shadow-lg text-left transition",
            isDarkMode
              ? "bg-gradient-to-br from-yellow-900 to-yellow-800 border-yellow-700 hover:ring-2 hover:ring-yellow-500/30"
              : "bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200 hover:ring-2 hover:ring-yellow-400/30"
          )}
          aria-label="Filter: Standard"
        >
          <div
            className={cx(
              "text-sm font-semibold uppercase tracking-wider mb-2",
              isDarkMode ? "text-yellow-300" : "text-yellow-700"
            )}
          >
            Standard Quality
          </div>
          <div
            className={cx(
              "text-4xl font-light",
              isDarkMode ? "text-yellow-100" : "text-yellow-900"
            )}
          >
            {
              patients.filter((p) => p.overallScore >= 3 && p.overallScore < 4)
                .length
            }
          </div>
          <div
            className={cx(
              "text-sm mt-1",
              isDarkMode ? "text-yellow-400" : "text-yellow-600"
            )}
          >
            Score 3
          </div>
        </button>

        <button
          onClick={() => setScoreBand("LOW")}
          className={cx(
            "border p-8 rounded-xl shadow-lg text-left transition",
            isDarkMode
              ? "bg-gradient-to-br from-red-900 to-pink-900 border-red-700 hover:ring-2 hover:ring-red-500/30"
              : "bg-gradient-to-br from-red-50 to-pink-100 border-red-200 hover:ring-2 hover:ring-red-400/30"
          )}
          aria-label="Filter: Needs improvement"
        >
          <div
            className={cx(
              "text-sm font-semibold uppercase tracking-wider mb-2",
              isDarkMode ? "text-red-300" : "text-red-700"
            )}
          >
            Needs Improvement
          </div>
          <div
            className={cx(
              "text-4xl font-light",
              isDarkMode ? "text-red-100" : "text-red-900"
            )}
          >
            {patients.filter((p) => p.overallScore < 3).length}
          </div>
          <div
            className={cx(
              "text-sm mt-1",
              isDarkMode ? "text-red-400" : "text-red-600"
            )}
          >
            Score 1–2
          </div>
        </button>
      </div>

      <div
        className={cx(
          "border rounded-xl shadow-xl overflow-hidden",
          isDarkMode
            ? "bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700"
            : "bg-gradient-to-br from-white to-slate-50 border-slate-200"
        )}
      >
        <div
          className={cx(
            "px-8 py-6 border-b",
            isDarkMode
              ? "bg-gradient-to-r from-slate-700 to-slate-800 border-slate-600"
              : "bg-gradient-to-r from-slate-100 to-slate-50 border-slate-200"
          )}
        >
          <h2
            className={cx(
              "text-xl font-semibold",
              isDarkMode ? "text-slate-100" : "text-slate-900"
            )}
          >
            Physician Communication Reports
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead
              className={cx(
                "border-b",
                isDarkMode
                  ? "bg-gradient-to-r from-slate-700 to-slate-800 border-slate-600"
                  : "bg-gradient-to-r from-slate-100 to-slate-50 border-slate-200"
              )}
            >
              <tr>
                <th
                  className={cx(
                    "px-8 py-4 text-left text-sm font-semibold uppercase tracking-wider",
                    isDarkMode ? "text-slate-300" : "text-slate-700"
                  )}
                >
                  Patient Information
                </th>
                <th
                  className={cx(
                    "px-8 py-4 text-left text-sm font-semibold uppercase tracking-wider",
                    isDarkMode ? "text-slate-300" : "text-slate-700"
                  )}
                >
                  Consultation Date
                </th>
                <th
                  className={cx(
                    "px-8 py-4 text-center text-sm font-semibold uppercase tracking-wider",
                    isDarkMode ? "text-slate-300" : "text-slate-700"
                  )}
                >
                  Overall Quality Score
                </th>
                <th
                  className={cx(
                    "px-8 py-4 text-center text-sm font-semibold uppercase tracking-wider",
                    isDarkMode ? "text-slate-300" : "text-slate-700"
                  )}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody
              className={cx(
                "divide-y",
                isDarkMode
                  ? "bg-gradient-to-br from-slate-800 to-slate-900 divide-slate-700"
                  : "bg-gradient-to-br from-white to-slate-50 divide-slate-200"
              )}
            >
              {filteredPatients.map((patient) => (
                <tr
                  key={patient.id}
                  className={cx(
                    "transition-colors duration-200",
                    isDarkMode
                      ? "hover:bg-slate-700/50"
                      : "hover:bg-slate-100/50"
                  )}
                >
                  <td className="px-8 py-6">
                    <div>
                      <div
                        className={cx(
                          "text-lg font-semibold",
                          isDarkMode ? "text-slate-100" : "text-slate-900"
                        )}
                      >
                        {patient.name}
                      </div>
                      <div
                        className={cx(
                          "text-sm font-medium",
                          isDarkMode ? "text-cyan-400" : "text-cyan-600"
                        )}
                      >
                        {patient.id}
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div
                      className={cx(
                        "text-sm font-medium",
                        isDarkMode ? "text-slate-200" : "text-slate-700"
                      )}
                    >
                      {patient.consultationDate}
                    </div>
                  </td>
                  <td className="px-8 py-6 text-center">
                    <span
                      className={cx(
                        "inline-flex items-center justify-center w-12 h-12 rounded-xl text-lg font-bold",
                        getScoreColor(Math.round(patient.overallScore))
                      )}
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
                      className={cx(
                        "px-6 py-3 rounded-lg text-sm font-semibold transition-all duration-200",
                        isDarkMode
                          ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-500 hover:to-blue-500 shadow-lg"
                          : "bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:from-cyan-600 hover:to-blue-600 shadow-lg"
                      )}
                      aria-label={`View report for ${patient.name}`}
                    >
                      View Report
                    </button>
                  </td>
                </tr>
              ))}
              {filteredPatients.length === 0 && (
                <tr>
                  <td className="px-8 py-10 text-center text-sm" colSpan={4}>
                    {search || scoreBand !== "ALL"
                      ? "No matching reports. Try clearing filters."
                      : "No reports available."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const PhysicianReportView: React.FC<{ patient: PatientRow }> = ({
    patient,
  }) => {
    const [showContext, setShowContext] = useState(false);

    const representativeSnippets = useMemo(
      () =>
        Object.entries(patient.topics).flatMap(([t, d]) =>
          d.sentences.length ? [`${t}: ${d.sentences[0]}`] : []
        ),
      [patient]
    );

    return (
      <div className="space-y-8">
        <div
          className={cx(
            "border-b pb-6",
            isDarkMode ? "border-slate-600" : "border-slate-200"
          )}
        >
          <button
            onClick={() => setCurrentView("dashboard")}
            className={cx(
              "mb-4 flex items-center gap-2 text-sm font-medium transition-colors",
              isDarkMode
                ? "text-cyan-400 hover:text-cyan-300"
                : "text-cyan-600 hover:text-cyan-800"
            )}
          >
            ← Return to Reports Dashboard
          </button>
          <h1
            className={cx(
              "text-3xl font-light mb-3",
              isDarkMode ? "text-slate-100" : "text-slate-900"
            )}
          >
            Grid Summary — {patient.name}
          </h1>
          <div
            className={cx(
              "text-lg",
              isDarkMode ? "text-slate-400" : "text-slate-600"
            )}
          >
            <span>Consultation: {patient.consultationDate}</span>
            <span className="mx-3">•</span>
            <span>
              Overall Quality Score: {patient.overallScore.toFixed(1)}
            </span>
          </div>
        </div>

        <div
          className={cx(
            "rounded-xl border",
            isDarkMode
              ? "border-slate-700 bg-slate-800"
              : "border-slate-200 bg-slate-50"
          )}
        >
          <button
            onClick={() => setShowContext((s) => !s)}
            className={cx(
              "w-full text-left px-6 py-4 font-medium",
              isDarkMode ? "text-slate-200" : "text-slate-800"
            )}
            aria-expanded={showContext}
          >
            {showContext ? "Hide Full Context" : "Show Full Context"}
          </button>
          {showContext && (
            <div className="px-6 pb-6 space-y-3">
              {representativeSnippets.map((line, i) => (
                <div
                  key={i}
                  className={cx(
                    "pl-4 border-l-4 text-sm",
                    isDarkMode
                      ? "border-cyan-600 text-slate-300"
                      : "border-cyan-400 text-slate-700"
                  )}
                >
                  "{line}"
                </div>
              ))}
              {representativeSnippets.length === 0 && (
                <div className="px-1 py-2 text-sm">No context available.</div>
              )}
            </div>
          )}
        </div>

        <div
          className={cx(
            "border rounded-xl shadow-xl overflow-hidden",
            isDarkMode
              ? "bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700"
              : "bg-gradient-to-br from-white to-slate-50 border-slate-200"
          )}
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead
                className={cx(
                  "border-b",
                  isDarkMode
                    ? "bg-gradient-to-r from-slate-700 to-slate-800 border-slate-600"
                    : "bg-gradient-to-r from-slate-100 to-slate-50 border-slate-200"
                )}
              >
                <tr>
                  <th
                    className={cx(
                      "px-6 py-5 text-left text-sm font-semibold uppercase tracking-wider",
                      isDarkMode ? "text-slate-300" : "text-slate-700"
                    )}
                  >
                    Topic
                  </th>
                  <th
                    className={cx(
                      "px-6 py-5 text-center text-sm font-semibold uppercase tracking-wider",
                      isDarkMode ? "text-slate-300" : "text-slate-700"
                    )}
                  >
                    Your Score
                  </th>
                  <th
                    className={cx(
                      "px-6 py-5 text-left text-sm font-semibold uppercase tracking-wider",
                      isDarkMode ? "text-slate-300" : "text-slate-700"
                    )}
                  >
                    Representative Sentence
                  </th>
                  <th
                    className={cx(
                      "px-6 py-5 text-left text-sm font-semibold uppercase tracking-wider",
                      isDarkMode ? "text-slate-300" : "text-slate-700"
                    )}
                  >
                    Suggestions for Improvement
                  </th>
                  <th
                    className={cx(
                      "px-6 py-5 text-left text-sm font-semibold uppercase tracking-wider",
                      isDarkMode ? "text-slate-300" : "text-slate-700"
                    )}
                  >
                    Suggested Rephrasing
                  </th>
                </tr>
              </thead>
              <tbody
                className={cx(
                  "divide-y",
                  isDarkMode ? "divide-slate-700" : "divide-slate-200"
                )}
              >
                {Object.entries(patient.topics).map(
                  ([topicName, topicData]) => {
                    const suggestions = getImprovementSuggestions(
                      topicName,
                      topicData.score
                    );
                    return (
                      <tr
                        key={topicName}
                        className={cx(
                          "transition-colors duration-200",
                          isDarkMode
                            ? "hover:bg-slate-700/50"
                            : "hover:bg-slate-100/50"
                        )}
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
                            className={cx(
                              "text-base font-semibold underline transition-colors text-left",
                              isDarkMode
                                ? "text-cyan-400 hover:text-cyan-300"
                                : "text-cyan-600 hover:text-cyan-800"
                            )}
                          >
                            {topicName}
                          </button>
                        </td>
                        <td className="px-6 py-6 text-center">
                          <span
                            className={cx(
                              "inline-flex items-center justify-center w-10 h-10 rounded-lg text-lg font-bold",
                              getScoreColor(topicData.score)
                            )}
                          >
                            {topicData.score}
                          </span>
                        </td>
                        <td className="px-6 py-6 max-w-xs">
                          <div
                            className={cx(
                              "text-sm leading-relaxed",
                              isDarkMode ? "text-slate-300" : "text-slate-600"
                            )}
                          >
                            "
                            {topicData.sentences[0]?.substring(0, 120) ??
                              "No sentence"}
                            ..."
                          </div>
                        </td>
                        <td className="px-6 py-6 max-w-xs">
                          {suggestions.length > 0 ? (
                            <div className="space-y-1">
                              {suggestions.slice(0, 2).map((s, idx) => (
                                <div
                                  key={idx}
                                  className={cx(
                                    "text-xs",
                                    isDarkMode
                                      ? "text-slate-400"
                                      : "text-slate-600"
                                  )}
                                >
                                  • To achieve score {s.targetScore}:{" "}
                                  {s.suggestion}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div
                              className={cx(
                                "text-xs",
                                isDarkMode
                                  ? "text-emerald-400"
                                  : "text-emerald-600"
                              )}
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
                            className={cx(
                              "text-sm font-medium transition-colors underline",
                              isDarkMode
                                ? "text-cyan-400 hover:text-cyan-300"
                                : "text-cyan-600 hover:text-cyan-800"
                            )}
                          >
                            AI Re-write →
                          </button>
                        </td>
                      </tr>
                    );
                  }
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const DetailedAnalysisView: React.FC = () => {
    const [showAI, setShowAI] = useState(false);

    if (!selectedTopic) return null;

    const { name: topicName, data, patient } = selectedTopic;

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

    const handleRescoring = async () => {
      if (!newSentence.trim()) return;
      const newScore = await rescoreSentence(newSentence);

      const updated = patients.map((p) => {
        if (p.id !== patient.id) return p;
        const prevTopic = p.topics[topicName];
        return {
          ...p,
          topics: {
            ...p.topics,
            [topicName]: {
              ...prevTopic,
              sentences: [...prevTopic.sentences, newSentence],
              score: Math.max(prevTopic.score, newScore),
            },
          },
        };
      });
      setPatients(updated);

      const nextPatient = updated.find((p) => p.id === patient.id)!;
      setSelectedTopic({
        name: topicName,
        data: nextPatient.topics[topicName],
        patient: nextPatient,
      });

      setNewSentence("");
    };

    return (
      <div className="space-y-8">
        <button
          onClick={() => setCurrentView("grid")}
          className={cx(
            "flex items-center gap-2 text-sm font-medium transition-colors",
            isDarkMode
              ? "text-cyan-400 hover:text-cyan-300"
              : "text-cyan-600 hover:text-cyan-800"
          )}
        >
          ← Return to Grid Summary
        </button>

        <div
          className={cx(
            "border rounded-xl p-8 shadow-xl",
            isDarkMode
              ? "bg-slate-800/70 border-slate-700"
              : "bg-white border-slate-200"
          )}
        >
          <div
            className={cx(
              "border-b pb-6 mb-8",
              isDarkMode ? "border-slate-700" : "border-slate-200"
            )}
          >
            <h2
              className={cx(
                "text-3xl font-light mb-2",
                isDarkMode ? "text-slate-100" : "text-slate-900"
              )}
            >
              {topicName}
            </h2>
            <p
              className={cx(
                "text-lg",
                isDarkMode ? "text-slate-400" : "text-slate-600"
              )}
            >
              {patient.name} • Consultation: {patient.consultationDate}
            </p>
          </div>

          <div className="mb-8">
            <h4
              className={cx(
                "text-sm font-semibold uppercase tracking-wider mb-4",
                isDarkMode ? "text-slate-300" : "text-slate-700"
              )}
            >
              Full Context
            </h4>
            <div
              className={cx(
                "border rounded-lg p-6",
                isDarkMode
                  ? "bg-slate-800 border-slate-600"
                  : "bg-slate-50 border-slate-200"
              )}
            >
              <div className="space-y-4">
                {data.sentences.map((s, idx) => (
                  <div
                    key={idx}
                    className={cx(
                      "pl-4 border-l-4",
                      idx === 0
                        ? isDarkMode
                          ? "border-cyan-500/80"
                          : "border-cyan-500"
                        : isDarkMode
                        ? "border-slate-600"
                        : "border-slate-300"
                    )}
                  >
                    <div
                      className={cx(
                        "text-sm leading-relaxed",
                        isDarkMode ? "text-slate-300" : "text-slate-700"
                      )}
                    >
                      "{s}"
                    </div>
                  </div>
                ))}
                {data.sentences.length === 0 && (
                  <div className="text-sm">No context available.</div>
                )}
              </div>
            </div>
          </div>

          <div className="mb-8">
            <ConsultationScoring
              isDarkMode={isDarkMode}
              title={titleByScore(data.score)}
              subtitle="Quality of Risk Communication"
              highlightedQuote={
                data.sentences?.[0] ?? "No representative sentence available."
              }
              highlightPosition={data.score}
              leftLabel={leftLabelByTopic(topicName)}
            />
          </div>

          <div className="mb-8">
            <h4
              className={cx(
                "text-sm font-semibold uppercase tracking-wider mb-4",
                isDarkMode ? "text-slate-300" : "text-slate-700"
              )}
            >
              Suggestions for Improvement
            </h4>
            <div className="grid md:grid-cols-2 gap-4">
              {getImprovementSuggestions(topicName, data.score).map((s, i) => (
                <div
                  key={i}
                  className={cx(
                    "p-4 rounded-lg border",
                    isDarkMode
                      ? "bg-slate-800 border-slate-600"
                      : "bg-slate-50 border-slate-200"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cx(
                        "inline-flex items-center justify-center w-7 h-7 rounded text-xs font-bold",
                        getScoreColor(s.targetScore)
                      )}
                    >
                      {s.targetScore}
                    </span>
                    <div>
                      <div
                        className={cx(
                          "text-xs font-medium mb-1",
                          isDarkMode ? "text-slate-200" : "text-slate-900"
                        )}
                      >
                        To achieve score {s.targetScore}:
                      </div>
                      <div
                        className={cx(
                          "text-xs",
                          isDarkMode ? "text-slate-400" : "text-slate-600"
                        )}
                      >
                        {s.suggestion}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {getImprovementSuggestions(topicName, data.score).length ===
                0 && (
                <div
                  className={cx(
                    "text-sm font-medium",
                    isDarkMode ? "text-emerald-400" : "text-emerald-600"
                  )}
                >
                  Excellent communication quality — no improvements needed.
                </div>
              )}
            </div>
          </div>

          <div className="mb-3">
            <button
              onClick={() => setShowAI((s) => !s)}
              className={cx(
                "px-4 py-2 rounded-md text-sm font-semibold transition",
                isDarkMode
                  ? "bg-slate-700 text-slate-200 hover:bg-slate-600"
                  : "bg-slate-200 text-slate-800 hover:bg-slate-300"
              )}
              aria-expanded={showAI}
            >
              {showAI ? "Hide AI Rewrite" : "Show AI Rewrite"}
            </button>
          </div>

          {showAI && (
            <div
              className={cx(
                "border rounded-lg p-6",
                isDarkMode
                  ? "bg-slate-800 border-slate-600"
                  : "bg-slate-50 border-slate-200"
              )}
            >
              <h4
                className={cx(
                  "text-sm font-semibold uppercase tracking-wider mb-4",
                  isDarkMode ? "text-slate-300" : "text-slate-700"
                )}
              >
                AI Re-write
              </h4>
              <p
                className={cx(
                  "text-sm mb-4",
                  isDarkMode ? "text-slate-400" : "text-slate-600"
                )}
              >
                Test how alternative phrasing would score using our AI
                assessment tool.
              </p>
              <div className="space-y-4">
                <textarea
                  value={newSentence}
                  onChange={(e) => setNewSentence(e.target.value)}
                  placeholder="Enter an alternative way to communicate this information..."
                  className={cx(
                    "w-full p-4 rounded-lg border text-sm",
                    isDarkMode
                      ? "bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-400"
                      : "bg-white border-slate-300 text-slate-900 placeholder-slate-500"
                  )}
                  rows={6}
                />
                <button
                  onClick={handleRescoring}
                  disabled={!newSentence.trim() || rescoring}
                  className={cx(
                    "px-6 py-3 rounded-lg text-sm font-semibold transition-all duration-200",
                    !newSentence.trim() || rescoring
                      ? isDarkMode
                        ? "bg-slate-600 text-slate-400 cursor-not-allowed"
                        : "bg-slate-200 text-slate-500 cursor-not-allowed"
                      : isDarkMode
                      ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-500 hover:to-blue-500 shadow-lg"
                      : "bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:from-cyan-600 hover:to-blue-600 shadow-lg"
                  )}
                >
                  {rescoring
                    ? "Analyzing Communication Quality..."
                    : "Assess Communication Quality"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div
        className={cx(
          "max-w-7xl mx-auto p-8 min-h-screen",
          isDarkMode ? "bg-slate-900" : "bg-slate-50"
        )}
      >
        <div className="flex justify-center items-center h-64">
          <div
            className={cx(
              "text-lg font-medium",
              isDarkMode ? "text-slate-400" : "text-slate-600"
            )}
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
        className={cx(
          "max-w-7xl mx-auto p-8 min-h-screen",
          isDarkMode ? "bg-slate-900" : "bg-slate-50"
        )}
      >
        <div
          className={cx(
            "border rounded-xl p-8 shadow-lg",
            isDarkMode
              ? "bg-gradient-to-br from-red-900 to-red-800 border-red-700"
              : "bg-gradient-to-br from-red-50 to-red-100 border-red-200"
          )}
        >
          <h2
            className={cx(
              "text-xl font-semibold mb-3",
              isDarkMode ? "text-red-100" : "text-red-900"
            )}
          >
            Report System Error
          </h2>
          <p
            className={cx("mb-6", isDarkMode ? "text-red-200" : "text-red-700")}
          >
            {error}
          </p>
          <button
            onClick={loadExcelData}
            className={cx(
              "px-6 py-3 rounded-lg text-sm font-semibold",
              isDarkMode
                ? "bg-red-700 text-red-100 hover:bg-red-600"
                : "bg-red-600 text-white hover:bg-red-700"
            )}
          >
            Retry Data Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cx(
        "max-w-7xl mx-auto p-8 min-h-screen",
        isDarkMode ? "bg-slate-900" : "bg-slate-50"
      )}
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
