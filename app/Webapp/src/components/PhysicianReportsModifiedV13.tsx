// PhysicianReportsModified.tsx
// Language: TypeScript/React (TailwindCSS)
// ✅ 기존 UI 형태 유지 (Dashboard → Grid → Detail)
// ✅ generateSampleData() 제거 - API 데이터로 대체
// ✅ Re-write 기능 API 연동 (문장 선택, DB 저장, rewrite 이력)
// ✅ 수정 후 즉시 UI 반영 (topicsData에서 항상 최신 데이터 참조)

import React, { useState, useEffect, useMemo } from "react";
import ConsultationScoring from "./ConsultationScoring";
import {
  useDoctorData,
  DoctorSentenceItem,
  DoctorRewriteItem,
} from "@/hooks/useDoctorData";

// ═══════════════════════════════════════════════════════════
// Store imports
// ═══════════════════════════════════════════════════════════
import { useFileId } from "@/stores/useFileId";
import { useDoctorId } from "@/stores/useDoctorId";

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════
type TopicName =
  | "Cancer Prognosis"
  | "Life Expectancy"
  | "Erectile Dysfunction"
  | "Urinary Incontinence"
  | "Irritative Symptoms";

interface SentenceDetail {
  i: number;
  i2: number;
  sentence: string;
  time: string;
  score?: number;
  // Rewrite 관련 필드
  hasRewrite?: boolean;
  revisedSentence?: string;
  revisedScore?: number;
  revisedTime?: string;
}

interface TopicData {
  score: number;
  sentences: string[];
  sentenceDetails: SentenceDetail[];
}

interface PatientRow {
  id: string;
  name: string;
  fileName: string;
  consultationDate: string;
  status?: string;
  overallScore: number;
  topics: Record<TopicName, TopicData>;
}

interface PhysicianReportsProps {
  isDarkMode?: boolean;
}

interface ImprovementSuggestion {
  targetScore: number;
  suggestion: string;
}

// ═══════════════════════════════════════════════════════════
// ✅ 수정: selectedTopic에서 data 제거 (항상 topicsData에서 최신 참조)
// ═══════════════════════════════════════════════════════════
interface SelectedTopicState {
  name: TopicName;
  patient: PatientRow;
}

// ═══════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════
const CLASS_TO_TOPIC: Record<string, TopicName> = {
  "1": "Cancer Prognosis",
  "2": "Life Expectancy",
  "3": "Erectile Dysfunction",
  "4": "Urinary Incontinence",
  "5": "Irritative Symptoms",
};

const TOPIC_TO_CLASS: Record<TopicName, string> = {
  "Cancer Prognosis": "1",
  "Life Expectancy": "2",
  "Erectile Dysfunction": "3",
  "Urinary Incontinence": "4",
  "Irritative Symptoms": "5",
};

const ALL_TOPICS: TopicName[] = [
  "Cancer Prognosis",
  "Life Expectancy",
  "Erectile Dysfunction",
  "Urinary Incontinence",
  "Irritative Symptoms",
];

// ═══════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════
const PhysicianReports: React.FC<PhysicianReportsProps> = ({
  isDarkMode = false,
}) => {
  // ═══════════════════════════════════════════════════════════
  // Store
  // ═══════════════════════════════════════════════════════════
  const { fileId } = useFileId();
  const { doctorId } = useDoctorId();

  // ═══════════════════════════════════════════════════════════
  // useDoctorData 훅
  // ═══════════════════════════════════════════════════════════
  const {
    files,
    sentences,
    rewritesFiltered,
    loading: apiLoading,
    error: apiError,
    fetchFiles,
    fetchSentences,
    fetchRewritesFiltered,
    saveRewriteWithTimestamp,
  } = useDoctorData();

  // ═══════════════════════════════════════════════════════════
  // UI 상태
  // ═══════════════════════════════════════════════════════════
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>("");

  // Patients (files → patients 변환)
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientRow | null>(
    null
  );

  // NAV
  const [currentView, setCurrentView] = useState<
    "dashboard" | "grid" | "detail"
  >("dashboard");

  // ✅ 수정: selectedTopic 타입 변경 (data 제거)
  const [selectedTopic, setSelectedTopic] = useState<SelectedTopicState | null>(
    null
  );

  // STATUS
  const [loading, setLoading] = useState(true);

  // REWRITE/RESCORE
  const [newSentence, setNewSentence] = useState("");
  const [rescoring, setRescoring] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] =
    useState<ImprovementSuggestion | null>(null);
  const [saveStatus, setSaveStatus] = useState<{
    status: "idle" | "saving" | "success" | "error";
    message: string;
  }>({ status: "idle", message: "" });

  // Search & Filter
  const [search, setSearch] = useState("");
  const [scoreBand, setScoreBand] = useState<"ALL" | "HIGH" | "STD" | "LOW">(
    "ALL"
  );

  // ═══════════════════════════════════════════════════════════
  // Store 값 동기화
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (fileId) setSelectedFile(fileId);
  }, [fileId]);

  useEffect(() => {
    if (doctorId) setSelectedSpeaker(doctorId);
  }, [doctorId]);

  // ═══════════════════════════════════════════════════════════
  // 초기 로드: 파일 목록
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    fetchFiles();
  }, []);

  // ═══════════════════════════════════════════════════════════
  // 기본 스피커 설정
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (!selectedSpeaker && !doctorId) {
      setSelectedSpeaker("Interviewer:");
    }
  }, [selectedSpeaker, doctorId]);

  // ═══════════════════════════════════════════════════════════
  // files → patients 변환 (Dashboard용)
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (files && files.length > 0) {
      const patientList: PatientRow[] = files.map((fileName, idx) => {
        // 파일명에서 ID 추출: "quality-coded-nlp-pilot-sid-1.xlsx" → "SID-1"
        const match = fileName.match(/sid-(\d+)/i);
        const id = match
          ? `SID-${match[1]}`
          : `P${String(idx + 1).padStart(3, "0")}`;

        return {
          id,
          name: `Patient ${id}`,
          fileName,
          consultationDate: new Date().toISOString().split("T")[0], // 기본값
          status: "completed",
          overallScore: 0, // 나중에 계산
          topics: {} as Record<TopicName, TopicData>,
        };
      });

      setPatients(patientList);
      setLoading(false);
      console.log("✅ Patients created from files:", patientList);
    }
  }, [files]);

  // ═══════════════════════════════════════════════════════════
  // Patient 선택 시 → sentences 로드
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (selectedPatient && selectedSpeaker) {
      console.log(`📄 Loading sentences for: ${selectedPatient.fileName}`);
      setSelectedFile(selectedPatient.fileName);
      fetchSentences(selectedPatient.fileName, selectedSpeaker);
      fetchRewritesFiltered(selectedPatient.fileName, selectedSpeaker);
    }
  }, [selectedPatient, selectedSpeaker]);

  // ═══════════════════════════════════════════════════════════
  // sentences → topics 변환 + rewrites 병합
  // ✅ 핵심: rewritesFiltered가 변경되면 자동으로 재계산됨
  // ═══════════════════════════════════════════════════════════
  const topicsData: Record<TopicName, TopicData> = useMemo(() => {
    // 빈 구조 초기화
    const result: Record<TopicName, TopicData> = {} as Record<
      TopicName,
      TopicData
    >;
    ALL_TOPICS.forEach((topic) => {
      result[topic] = {
        score: 0,
        sentences: [],
        sentenceDetails: [],
      };
    });

    if (!sentences?.data || sentences.data.length === 0) {
      return result;
    }

    // Rewrites Map 생성 (최신 rewrite만 유지)
    const rewriteMap = new Map<string, DoctorRewriteItem>();
    if (rewritesFiltered?.data) {
      rewritesFiltered.data.forEach((rw) => {
        const key = `${rw.i}-${rw.i2}`;
        const existing = rewriteMap.get(key);
        if (!existing || new Date(rw.time) > new Date(existing.time)) {
          rewriteMap.set(key, rw);
        }
      });
    }

    // sentences를 class별로 그룹핑
    sentences.data.forEach((item: DoctorSentenceItem) => {
      const topicName = CLASS_TO_TOPIC[item.class];
      if (!topicName) return;

      const key = `${item.i}-${item.i2}`;
      const rewrite = rewriteMap.get(key);

      const detail: SentenceDetail = {
        i: item.i,
        i2: item.i2,
        sentence: item.sentence,
        time: item.time,
        score: item.score,
        hasRewrite: !!rewrite,
        revisedSentence: rewrite?.revised_sentence,
        revisedScore: rewrite?.score,
        revisedTime: rewrite?.time,
      };

      result[topicName].sentenceDetails.push(detail);
      result[topicName].sentences.push(item.sentence);
    });

    // 각 Topic의 최고 점수 계산
    ALL_TOPICS.forEach((topic) => {
      const details = result[topic].sentenceDetails;
      if (details.length > 0) {
        const scores = details.map((d) =>
          d.hasRewrite && d.revisedScore ? d.revisedScore : d.score || 0
        );
        result[topic].score = Math.max(...scores, 0);
      }
    });

    console.log("✅ topicsData 재계산됨:", result);
    return result;
  }, [sentences, rewritesFiltered]);

  // ═══════════════════════════════════════════════════════════
  // 전체 평균 점수 계산
  // ═══════════════════════════════════════════════════════════
  const overallScore = useMemo(() => {
    const scores = ALL_TOPICS.map((t) => topicsData[t]?.score || 0);
    const validScores = scores.filter((s) => s > 0);
    if (validScores.length === 0) return 0;
    return validScores.reduce((a, b) => a + b, 0) / validScores.length;
  }, [topicsData]);

  // ═══════════════════════════════════════════════════════════
  // Filtered Patients (Dashboard용)
  // ═══════════════════════════════════════════════════════════
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
          p.fileName.toLowerCase().includes(q)
      );
    }
    return arr;
  }, [patients, search, scoreBand]);

  // ═══════════════════════════════════════════════════════════
  // UI Helpers
  // ═══════════════════════════════════════════════════════════
  const cx = (...classes: (string | false | null | undefined)[]) =>
    classes.filter(Boolean).join(" ");

  const getScoreColor = (score: number) => {
    if (isDarkMode) {
      const darkColors: Record<number, string> = {
        0: "bg-gradient-to-br from-slate-700 to-slate-600 text-slate-300 border border-slate-600 shadow-lg",
        1: "bg-gradient-to-br from-red-600 to-red-700 text-red-100 border border-red-500 shadow-lg",
        2: "bg-gradient-to-br from-pink-600 to-pink-700 text-pink-100 border border-pink-500 shadow-lg",
        3: "bg-gradient-to-br from-yellow-600 to-yellow-700 text-yellow-100 border border-yellow-500 shadow-lg",
        4: "bg-gradient-to-br from-green-600 to-green-700 text-green-100 border border-green-500 shadow-lg",
        5: "bg-gradient-to-br from-emerald-600 to-emerald-700 text-emerald-100 border-2 border-emerald-400 font-semibold shadow-lg",
      };
      return darkColors[score] || darkColors[0];
    }
    const lightColors: Record<number, string> = {
      0: "bg-gradient-to-br from-slate-400 to-slate-500 text-white border border-slate-300 shadow-lg",
      1: "bg-gradient-to-br from-red-500 to-red-600 text-white border border-red-400 shadow-lg",
      2: "bg-gradient-to-br from-pink-500 to-pink-600 text-white border border-pink-400 shadow-lg",
      3: "bg-gradient-to-br from-yellow-500 to-yellow-600 text-white border border-yellow-400 shadow-lg",
      4: "bg-gradient-to-br from-green-500 to-green-600 text-white border border-green-400 shadow-lg",
      5: "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-2 border-emerald-400 font-semibold shadow-lg",
    };
    return lightColors[score] || lightColors[0];
  };

  const getImprovementSuggestions = (
    domain: TopicName,
    currentScore: number
  ): ImprovementSuggestion[] => {
    const suggestions: Record<TopicName, Record<number, string>> = {
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
    const applicable: ImprovementSuggestion[] = [];
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

  const titleByScore = (score: number) => {
    const names: Record<number, string> = {
      0: "No mention",
      1: "Name Only",
      2: "Generalization",
      3: "Imprecise Quantification",
      4: "Specific Quantification",
      5: "Patient-centered Estimate",
    };
    return `Consultation Scoring: ${score} (${names[score] || "Unknown"})`;
  };

  const leftLabelByTopic = (topic: TopicName) => {
    const labels: Record<TopicName, string> = {
      "Cancer Prognosis": "Cancer\nPrognosis",
      "Life Expectancy": "Life\nExpectancy",
      "Erectile Dysfunction": "Erectile\nDysfunction",
      "Urinary Incontinence": "Urinary\nIncontinence",
      "Irritative Symptoms": "Irritative\nSymptoms",
    };
    return labels[topic] || topic;
  };

  const rescoreSentence = async (sentence: string): Promise<number> => {
    setRescoring(true);
    await new Promise((r) => setTimeout(r, 800));
    let score = 1;
    const s = sentence.toLowerCase();
    if (s.includes("%") || s.includes("percent")) score = Math.max(score, 3);
    if (s.includes("year") || s.includes("month")) score = Math.max(score, 4);
    if (s.includes("based on") || s.includes("specific") || s.includes("your"))
      score = Math.max(score, 5);
    setRescoring(false);
    return Math.min(score, 5);
  };

  // ═══════════════════════════════════════════════════════════
  // DashboardView
  // ═══════════════════════════════════════════════════════════
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
        <div className="mt-2 flex gap-4 text-sm">
          <span className={isDarkMode ? "text-cyan-400" : "text-cyan-600"}>
            👨‍⚕️ Speaker: {selectedSpeaker || "Not selected"}
          </span>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by patient / ID / file..."
          className={cx(
            "w-full md:max-w-sm px-4 py-2 rounded-lg border",
            isDarkMode
              ? "bg-slate-800 border-slate-600 text-slate-200 placeholder-slate-500"
              : "bg-white border-slate-300 text-slate-900 placeholder-slate-500"
          )}
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
                scoreBand === k
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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <button
          onClick={() => setScoreBand("ALL")}
          className={cx(
            "border p-8 rounded-xl shadow-lg text-left transition",
            isDarkMode
              ? "bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700 hover:ring-2 hover:ring-cyan-600/30"
              : "bg-gradient-to-br from-white to-slate-50 border-slate-200 hover:ring-2 hover:ring-cyan-400/30"
          )}
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

      {/* Patient Table */}
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
                  File
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
                      {patient.fileName}
                    </div>
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
                    >
                      View Report
                    </button>
                  </td>
                </tr>
              ))}
              {filteredPatients.length === 0 && (
                <tr>
                  <td className="px-8 py-10 text-center text-sm" colSpan={3}>
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

  // ═══════════════════════════════════════════════════════════
  // GridView (PhysicianReportView)
  // ═══════════════════════════════════════════════════════════
  const GridView = () => {
    const [showContext, setShowContext] = useState(false);

    // 모든 문장을 시간순으로 정렬
    const allSentences = useMemo(() => {
      const all: Array<SentenceDetail & { topic: TopicName }> = [];
      ALL_TOPICS.forEach((topic) => {
        topicsData[topic].sentenceDetails.forEach((detail) => {
          all.push({ ...detail, topic });
        });
      });
      return all.sort((a, b) => a.time.localeCompare(b.time));
    }, [topicsData]);

    // Bail out AFTER the useMemo above: an early return placed before it
    // makes the hook conditional, which breaks React's hook ordering.
    if (!selectedPatient) return null;

    // ✅ 수정: setSelectedTopic에서 data 제거
    const handleSuggestionClick = (
      topicName: TopicName,
      suggestion: ImprovementSuggestion
    ) => {
      setSelectedSuggestion(suggestion);
      setSelectedTopic({
        name: topicName,
        patient: selectedPatient,
      });
      setCurrentView("detail");
    };

    // Sentences 로딩 중 표시
    const isLoadingSentences =
      apiLoading && (!sentences?.data || sentences.data.length === 0);

    return (
      <div className="space-y-8">
        {/* Header */}
        <div
          className={cx(
            "border-b pb-6",
            isDarkMode ? "border-slate-600" : "border-slate-200"
          )}
        >
          <button
            onClick={() => {
              setCurrentView("dashboard");
              setSelectedPatient(null);
            }}
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
            Grid Summary — {selectedPatient.name}
          </h1>
          <div
            className={cx(
              "text-lg",
              isDarkMode ? "text-slate-400" : "text-slate-600"
            )}
          >
            <span>File: {selectedPatient.fileName}</span>
            <span className="mx-3">•</span>
            <span>Overall Score: {overallScore.toFixed(1)}</span>
          </div>
        </div>

        {/* Error Message (inline) */}
        {apiError && (
          <div
            className={cx(
              "border rounded-lg p-4",
              isDarkMode
                ? "bg-amber-900/30 border-amber-700 text-amber-200"
                : "bg-amber-50 border-amber-200 text-amber-800"
            )}
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">⚠️</span>
              <div>
                <div className="font-medium">Error loading sentences</div>
                <div className="text-sm opacity-80">{apiError}</div>
              </div>
              <button
                onClick={() => {
                  if (selectedPatient) {
                    fetchSentences(selectedPatient.fileName, selectedSpeaker);
                    fetchRewritesFiltered(
                      selectedPatient.fileName,
                      selectedSpeaker
                    );
                  }
                }}
                className={cx(
                  "ml-auto px-3 py-1.5 rounded text-sm font-medium",
                  isDarkMode
                    ? "bg-amber-700 text-amber-100 hover:bg-amber-600"
                    : "bg-amber-200 text-amber-900 hover:bg-amber-300"
                )}
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {isLoadingSentences && (
          <div
            className={cx(
              "border rounded-lg p-6 text-center",
              isDarkMode
                ? "bg-slate-800 border-slate-700"
                : "bg-slate-50 border-slate-200"
            )}
          >
            <div
              className={cx(
                "text-lg font-medium",
                isDarkMode ? "text-slate-300" : "text-slate-600"
              )}
            >
              Loading sentences...
            </div>
          </div>
        )}

        {/* Full Context Accordion */}
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
              "w-full text-left px-6 py-4 font-medium flex items-center justify-between",
              isDarkMode ? "text-slate-200" : "text-slate-800"
            )}
          >
            <span>
              {showContext ? "Hide Full Context" : "Show Full Context"}
            </span>
            <span
              className={cx(
                "text-sm",
                isDarkMode ? "text-slate-400" : "text-slate-500"
              )}
            >
              {allSentences.length} sentences
            </span>
          </button>

          {showContext && (
            <div className="px-6 pb-6 space-y-3 max-h-96 overflow-y-auto">
              {allSentences.map((item, idx) => (
                <div
                  key={`${item.i}-${item.i2}-${idx}`}
                  className={cx(
                    "pl-4 border-l-4 py-2",
                    item.hasRewrite
                      ? "border-emerald-500 bg-emerald-50/10"
                      : isDarkMode
                      ? "border-slate-600"
                      : "border-slate-300"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={cx(
                        "text-xs px-2 py-0.5 rounded font-medium shrink-0",
                        isDarkMode
                          ? "bg-slate-700 text-slate-300"
                          : "bg-slate-200 text-slate-600"
                      )}
                    >
                      {item.topic}
                    </span>
                    {item.hasRewrite && (
                      <span className="text-xs px-2 py-0.5 rounded bg-emerald-500 text-white font-medium">
                        Rewritten
                      </span>
                    )}
                  </div>
                  <div
                    className={cx(
                      "text-sm leading-relaxed mt-1",
                      isDarkMode ? "text-slate-300" : "text-slate-700"
                    )}
                  >
                    {item.hasRewrite ? (
                      <>
                        <div className="line-through text-slate-400 text-xs mb-1">
                          "{item.sentence}"
                        </div>
                        <div
                          className={
                            isDarkMode ? "text-emerald-400" : "text-emerald-600"
                          }
                        >
                          "{item.revisedSentence}"
                        </div>
                      </>
                    ) : (
                      `"${item.sentence}"`
                    )}
                  </div>
                </div>
              ))}
              {allSentences.length === 0 && (
                <div className="text-sm text-slate-500 py-4 text-center">
                  No sentences loaded.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Topics Table */}
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
                {ALL_TOPICS.map((topicName) => {
                  const data = topicsData[topicName];
                  const suggestions = getImprovementSuggestions(
                    topicName,
                    data.score
                  );
                  const firstSentence = data.sentenceDetails[0];
                  const displaySentence = firstSentence?.hasRewrite
                    ? firstSentence.revisedSentence
                    : firstSentence?.sentence;

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
                            setSelectedSuggestion(null);
                            // ✅ 수정: data 제거
                            setSelectedTopic({
                              name: topicName,
                              patient: selectedPatient,
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
                        <div
                          className={cx(
                            "text-xs mt-1",
                            isDarkMode ? "text-slate-400" : "text-slate-500"
                          )}
                        >
                          {data.sentenceDetails.length} sentences
                        </div>
                      </td>
                      <td className="px-6 py-6 text-center">
                        <span
                          className={cx(
                            "inline-flex items-center justify-center w-10 h-10 rounded-lg text-lg font-bold",
                            getScoreColor(data.score)
                          )}
                        >
                          {data.score}
                        </span>
                      </td>
                      <td className="px-6 py-6 max-w-xs">
                        <div
                          className={cx(
                            "text-sm leading-relaxed",
                            isDarkMode ? "text-slate-300" : "text-slate-600"
                          )}
                        >
                          {displaySentence
                            ? `"${displaySentence.substring(0, 120)}${
                                displaySentence.length > 120 ? "..." : ""
                              }"`
                            : "No sentence"}
                        </div>
                        {firstSentence?.hasRewrite && (
                          <span className="text-xs text-emerald-500 font-medium mt-1 inline-block">
                            ✓ Rewritten
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-6 max-w-xs">
                        {suggestions.length > 0 ? (
                          <div className="space-y-1">
                            {suggestions.slice(0, 2).map((s, idx) => (
                              <button
                                key={idx}
                                onClick={() =>
                                  // ✅ 수정: data 제거
                                  handleSuggestionClick(topicName, s)
                                }
                                className={cx(
                                  "text-xs text-left block w-full p-2 rounded transition-colors",
                                  isDarkMode
                                    ? "text-slate-400 hover:bg-slate-700 hover:text-cyan-400"
                                    : "text-slate-600 hover:bg-slate-100 hover:text-cyan-600"
                                )}
                              >
                                • To achieve score {s.targetScore}:{" "}
                                {s.suggestion.substring(0, 60)}...
                              </button>
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
                            setSelectedSuggestion(null);
                            // ✅ 수정: data 제거
                            setSelectedTopic({
                              name: topicName,
                              patient: selectedPatient,
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
                          Re-write →
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
  };

  // ═══════════════════════════════════════════════════════════
  // DetailView (with Re-write API Integration)
  // ✅ 핵심 수정: topicsData[topicName]에서 항상 최신 데이터 참조
  // ═══════════════════════════════════════════════════════════
  const DetailView = () => {
    const [showRewrite, setShowRewrite] = useState(false);
    const [selectedSentenceIdx, setSelectedSentenceIdx] = useState(0);

    useEffect(() => {
      if (selectedSuggestion) {
        setShowRewrite(true);
      }
    }, []);

    if (!selectedTopic) return null;

    // ✅ 핵심 수정: data를 selectedTopic에서 가져오지 않고, topicsData에서 직접 참조
    const { name: topicName, patient } = selectedTopic;
    const data = topicsData[topicName]; // ✅ 항상 최신 데이터!

    const currentSentence = data.sentenceDetails[selectedSentenceIdx];

    // ✅ Re-write 저장 핸들러
    const handleSaveRewrite = async () => {
      if (!newSentence.trim() || !currentSentence) return;

      setSaveStatus({ status: "saving", message: "Saving..." });

      try {
        const newScore = await rescoreSentence(newSentence);
        const classNumber = TOPIC_TO_CLASS[topicName];

        const result = await saveRewriteWithTimestamp(
          selectedFile,
          selectedSpeaker,
          currentSentence.i,
          currentSentence.i2,
          currentSentence.sentence,
          newSentence,
          newScore,
          classNumber,
          true
        );

        if (result) {
          setSaveStatus({
            status: "success",
            message: `✅ Saved! New score: ${newScore}`,
          });

          // ✅ 데이터 새로고침 - rewritesFiltered 업데이트 → topicsData 자동 재계산 → UI 갱신
          await fetchRewritesFiltered(selectedFile, selectedSpeaker);

          // 입력 초기화
          setNewSentence("");
          setSelectedSuggestion(null);

          setTimeout(() => {
            setSaveStatus({ status: "idle", message: "" });
          }, 3000);
        } else {
          setSaveStatus({
            status: "error",
            message: "❌ Failed to save. Please try again.",
          });
        }
      } catch (err) {
        console.error("Error saving rewrite:", err);
        setSaveStatus({
          status: "error",
          message: "❌ Error occurred. Please try again.",
        });
      }
    };

    return (
      <div className="space-y-8">
        {/* Back Button */}
        <button
          onClick={() => {
            setCurrentView("grid");
            setSelectedTopic(null);
            setSelectedSuggestion(null);
            setShowRewrite(false);
            setNewSentence("");
            setSaveStatus({ status: "idle", message: "" });
          }}
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
          {/* Header */}
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
              {patient.name} • File: {patient.fileName}
            </p>
          </div>

          {/* Full Context - Clickable Sentences */}
          <div className="mb-8">
            <h4
              className={cx(
                "text-sm font-semibold uppercase tracking-wider mb-4",
                isDarkMode ? "text-slate-300" : "text-slate-700"
              )}
            >
              Full Context ({data.sentenceDetails.length} sentences) - Click to
              select
            </h4>
            <div
              className={cx(
                "border rounded-lg p-6 max-h-64 overflow-y-auto",
                isDarkMode
                  ? "bg-slate-800 border-slate-600"
                  : "bg-slate-50 border-slate-200"
              )}
            >
              <div className="space-y-4">
                {data.sentenceDetails.map((detail, idx) => (
                  <div
                    key={`${detail.i}-${detail.i2}`}
                    onClick={() => setSelectedSentenceIdx(idx)}
                    className={cx(
                      "pl-4 border-l-4 py-2 cursor-pointer transition-all rounded-r",
                      selectedSentenceIdx === idx
                        ? "border-cyan-500 bg-cyan-50/10"
                        : detail.hasRewrite
                        ? "border-emerald-500"
                        : isDarkMode
                        ? "border-slate-600 hover:border-slate-500"
                        : "border-slate-300 hover:border-slate-400"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={cx(
                          "text-xs",
                          isDarkMode ? "text-slate-500" : "text-slate-400"
                        )}
                      >
                        [{detail.i}, {detail.i2}]
                      </span>
                      {detail.hasRewrite && (
                        <span className="text-xs px-2 py-0.5 rounded bg-emerald-500 text-white">
                          Rewritten
                        </span>
                      )}
                      {selectedSentenceIdx === idx && (
                        <span className="text-xs px-2 py-0.5 rounded bg-cyan-500 text-white">
                          Selected
                        </span>
                      )}
                    </div>
                    {detail.hasRewrite ? (
                      <>
                        <div className="line-through text-slate-400 text-xs mb-1">
                          "{detail.sentence}"
                        </div>
                        <div
                          className={cx(
                            "text-sm",
                            isDarkMode ? "text-emerald-400" : "text-emerald-600"
                          )}
                        >
                          "{detail.revisedSentence}"
                        </div>
                      </>
                    ) : (
                      <div
                        className={cx(
                          "text-sm",
                          isDarkMode ? "text-slate-300" : "text-slate-700"
                        )}
                      >
                        "{detail.sentence}"
                      </div>
                    )}
                  </div>
                ))}
                {data.sentenceDetails.length === 0 && (
                  <div className="text-sm text-slate-500">
                    No sentences available.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Consultation Scoring */}
          <div className="mb-8">
            <ConsultationScoring
              isDarkMode={isDarkMode}
              title={titleByScore(data.score)}
              subtitle="Quality of Risk Communication"
              highlightedQuote={
                currentSentence?.hasRewrite
                  ? currentSentence.revisedSentence || ""
                  : currentSentence?.sentence || "No sentence selected"
              }
              highlightPosition={data.score}
              leftLabel={leftLabelByTopic(topicName)}
            />
          </div>

          {/* Suggestions */}
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
                <button
                  key={i}
                  onClick={() => {
                    setSelectedSuggestion(s);
                    setShowRewrite(true);
                  }}
                  className={cx(
                    "p-4 rounded-lg border text-left transition-all",
                    selectedSuggestion?.targetScore === s.targetScore
                      ? isDarkMode
                        ? "bg-cyan-900/50 border-cyan-500 ring-2 ring-cyan-500/30"
                        : "bg-cyan-50 border-cyan-400 ring-2 ring-cyan-400/30"
                      : isDarkMode
                      ? "bg-slate-800 border-slate-600 hover:border-cyan-600"
                      : "bg-slate-50 border-slate-200 hover:border-cyan-400"
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
                </button>
              ))}
              {getImprovementSuggestions(topicName, data.score).length ===
                0 && (
                <div
                  className={cx(
                    "text-sm font-medium",
                    isDarkMode ? "text-emerald-400" : "text-emerald-600"
                  )}
                >
                  ✓ Excellent communication quality — no improvements needed.
                </div>
              )}
            </div>
          </div>

          {/* Re-write Toggle */}
          <div className="mb-3">
            <button
              onClick={() => setShowRewrite((s) => !s)}
              className={cx(
                "px-4 py-2 rounded-md text-sm font-semibold transition",
                isDarkMode
                  ? "bg-slate-700 text-slate-200 hover:bg-slate-600"
                  : "bg-slate-200 text-slate-800 hover:bg-slate-300"
              )}
            >
              {showRewrite ? "Hide Re-write" : "Show Re-write"}
            </button>
          </div>

          {/* Re-write Panel */}
          {showRewrite && currentSentence && (
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
                Re-write
              </h4>

              {/* Selected Suggestion */}
              {selectedSuggestion && (
                <div
                  className={cx(
                    "mb-4 p-4 rounded-lg border-l-4",
                    isDarkMode
                      ? "bg-cyan-900/30 border-cyan-500"
                      : "bg-cyan-50 border-cyan-500"
                  )}
                >
                  <div
                    className={cx(
                      "text-xs font-semibold uppercase mb-1",
                      isDarkMode ? "text-cyan-400" : "text-cyan-600"
                    )}
                  >
                    Target: Score {selectedSuggestion.targetScore}
                  </div>
                  <div
                    className={cx(
                      "text-sm",
                      isDarkMode ? "text-slate-300" : "text-slate-700"
                    )}
                  >
                    {selectedSuggestion.suggestion}
                  </div>
                </div>
              )}

              <p
                className={cx(
                  "text-sm mb-4",
                  isDarkMode ? "text-slate-400" : "text-slate-600"
                )}
              >
                Enter an improved version of the selected sentence.
              </p>

              {/* Original Sentence */}
              <div className="mb-4">
                <div
                  className={cx(
                    "text-xs font-semibold uppercase mb-2",
                    isDarkMode ? "text-slate-400" : "text-slate-600"
                  )}
                >
                  Original Sentence [{currentSentence.i}, {currentSentence.i2}]:
                </div>
                <div
                  className={cx(
                    "p-3 rounded-lg text-sm",
                    isDarkMode
                      ? "bg-slate-700 text-slate-300"
                      : "bg-slate-100 text-slate-700"
                  )}
                >
                  "{currentSentence.sentence}"
                </div>
              </div>

              {/* Existing Rewrite */}
              {currentSentence.hasRewrite && (
                <div className="mb-4">
                  <div
                    className={cx(
                      "text-xs font-semibold uppercase mb-2",
                      isDarkMode ? "text-emerald-400" : "text-emerald-600"
                    )}
                  >
                    Current Rewrite (Score: {currentSentence.revisedScore}):
                  </div>
                  <div
                    className={cx(
                      "p-3 rounded-lg text-sm",
                      isDarkMode
                        ? "bg-emerald-900/30 text-emerald-300"
                        : "bg-emerald-50 text-emerald-700"
                    )}
                  >
                    "{currentSentence.revisedSentence}"
                  </div>
                </div>
              )}

              {/* New Sentence Input */}
              <div className="space-y-4">
                <div>
                  <div
                    className={cx(
                      "text-xs font-semibold uppercase mb-2",
                      isDarkMode ? "text-slate-400" : "text-slate-600"
                    )}
                  >
                    Your Revised Sentence:
                  </div>
                  <textarea
                    value={newSentence}
                    onChange={(e) => setNewSentence(e.target.value)}
                    placeholder="Enter an improved way to communicate this information..."
                    className={cx(
                      "w-full p-4 rounded-lg border text-sm",
                      isDarkMode
                        ? "bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-400"
                        : "bg-white border-slate-300 text-slate-900 placeholder-slate-500"
                    )}
                    rows={4}
                  />
                </div>

                {/* Save Status */}
                {saveStatus.message && (
                  <div
                    className={cx(
                      "p-3 rounded-lg text-sm font-medium",
                      saveStatus.status === "success"
                        ? isDarkMode
                          ? "bg-emerald-900/50 text-emerald-300"
                          : "bg-emerald-100 text-emerald-700"
                        : saveStatus.status === "error"
                        ? isDarkMode
                          ? "bg-red-900/50 text-red-300"
                          : "bg-red-100 text-red-700"
                        : isDarkMode
                        ? "bg-slate-700 text-slate-300"
                        : "bg-slate-100 text-slate-600"
                    )}
                  >
                    {saveStatus.message}
                  </div>
                )}

                {/* Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={handleSaveRewrite}
                    disabled={
                      !newSentence.trim() ||
                      rescoring ||
                      saveStatus.status === "saving"
                    }
                    className={cx(
                      "px-6 py-3 rounded-lg text-sm font-semibold transition-all",
                      !newSentence.trim() ||
                        rescoring ||
                        saveStatus.status === "saving"
                        ? isDarkMode
                          ? "bg-slate-600 text-slate-400 cursor-not-allowed"
                          : "bg-slate-200 text-slate-500 cursor-not-allowed"
                        : isDarkMode
                        ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-500 hover:to-blue-500 shadow-lg"
                        : "bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:from-cyan-600 hover:to-blue-600 shadow-lg"
                    )}
                  >
                    {rescoring
                      ? "Analyzing..."
                      : saveStatus.status === "saving"
                      ? "Saving..."
                      : "Save & Score"}
                  </button>

                  {selectedSuggestion && (
                    <button
                      onClick={() => setSelectedSuggestion(null)}
                      className={cx(
                        "px-4 py-3 rounded-lg text-sm font-medium transition",
                        isDarkMode
                          ? "bg-slate-700 text-slate-300 hover:bg-slate-600"
                          : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                      )}
                    >
                      Clear Target
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════
  // Loading & Error States
  // ═══════════════════════════════════════════════════════════
  // Dashboard 로딩 중일 때만 전체 로딩 표시
  if (loading && currentView === "dashboard") {
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

  // files 로드 실패 시에만 전체 에러 표시 (Dashboard에서)
  if (
    apiError &&
    currentView === "dashboard" &&
    (!files || files.length === 0)
  ) {
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
              ? "bg-red-900/50 border-red-700"
              : "bg-red-50 border-red-200"
          )}
        >
          <h2
            className={cx(
              "text-xl font-semibold mb-3",
              isDarkMode ? "text-red-100" : "text-red-900"
            )}
          >
            Error Loading Data
          </h2>
          <p
            className={cx("mb-6", isDarkMode ? "text-red-200" : "text-red-700")}
          >
            {apiError}
          </p>
          <button
            onClick={() => fetchFiles()}
            className={cx(
              "px-6 py-3 rounded-lg text-sm font-semibold",
              isDarkMode
                ? "bg-red-700 text-red-100 hover:bg-red-600"
                : "bg-red-600 text-white hover:bg-red-700"
            )}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // Main Render
  // ═══════════════════════════════════════════════════════════
  return (
    <div
      className={cx(
        "max-w-7xl mx-auto p-8 min-h-screen",
        isDarkMode ? "bg-slate-900" : "bg-slate-50"
      )}
    >
      {currentView === "dashboard" && <DashboardView />}
      {currentView === "grid" && <GridView />}
      {currentView === "detail" && <DetailView />}
    </div>
  );
};

export default PhysicianReports;
