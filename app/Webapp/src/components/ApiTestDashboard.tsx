// src/pages/test.tsx
"use client";

import { useState } from "react";
import {
  usePatientData,
  PatientScoringUpdate,
  PatientResponsesUpdate,
} from "@/hooks/usePatientData";
import { useDoctorData, DoctorRewriteData } from "@/hooks/useDoctorData";

export default function APITestDashboard() {
  // Patient Data Hook
  const {
    files: patientFiles,
    loading: patientLoading,
    error: patientError,
    fetchFiles: fetchPatientFiles,
    fetchSummariesAll,
    fetchSummariesFiltered,
    fetchSummaryDetail,
    fetchScoringAll,
    fetchScoringFiltered,
    fetchResponsesAll,
    fetchResponsesFiltered,
    // PUT APIs
    updateScoring,
    updateResponses,
    updateSingleClassScore,
    updateAllClassScores,
    updateSingleAnswer,
  } = usePatientData();

  // Doctor Data Hook
  const {
    files: doctorFiles,
    sentences: doctorSentences,
    rewritesFiltered: doctorRewrites,
    loading: doctorLoading,
    error: doctorError,
    fetchFiles: fetchDoctorFiles,
    fetchSentences,
    fetchRewritesAll,
    fetchRewritesFiltered,
    fetchRewritesPaginated,
    // ✅ PUT APIs
    saveRewrite,
    saveRewriteWithTimestamp,
  } = useDoctorData();

  // Local state for parameters
  const [selectedFile, setSelectedFile] = useState(
    "quality-coded-nlp-pilot-sid-1.xlsx"
  );
  const [selectedSpeaker, setSelectedSpeaker] = useState(
    "Patient_quality-coded-nlp-pilot-sid-1"
  );
  const [doctorSpeaker, setDoctorSpeaker] = useState("Interviewer:");
  const [results, setResults] = useState<{ [key: string]: any }>({});

  // State for PUT API inputs
  const [scoringInputs, setScoringInputs] = useState({
    class_1: "",
    class_2: "",
    class_3: "",
    class_4: "",
    class_5: "",
  });

  const [responseInputs, setResponseInputs] = useState({
    answer_1: "",
    answer_2: "",
    answer_3: "",
    answer_4: "",
    answer_5: "",
  });

  const [singleScoreInput, setSingleScoreInput] = useState({
    classNumber: "1" as string,
    score: "",
  });

  const [singleAnswerInput, setSingleAnswerInput] = useState({
    answerNumber: "1" as string,
    answer: "",
  });

  // ═══════════════════════════════════════════════════════════
  // ✅ Doctor Rewrite PUT API State
  // ═══════════════════════════════════════════════════════════
  const [rewriteInputs, setRewriteInputs] = useState({
    i: "0",
    i2: "1",
    original_sentence: "",
    revised_sentence: "",
    score: "3",
    class_: "1",
    selected: true,
  });

  // ✅ Selected sentence index
  const [selectedSentenceIndex, setSelectedSentenceIndex] = useState<
    number | null
  >(null);

  // ✅ Class → Topic Name mapping
  const CLASS_TO_TOPIC: Record<string, string> = {
    "1": "Cancer Prognosis",
    "2": "Life Expectancy",
    "3": "Erectile Dysfunction",
    "4": "Urinary Incontinence",
    "5": "Irritative Symptoms",
  };

  // Helper function to log results
  const logResult = (key: string, data: any, error?: any) => {
    setResults((prev) => ({
      ...prev,
      [key]: {
        data,
        error,
        timestamp: new Date().toLocaleTimeString(),
      },
    }));
    console.log(`[${key}]`, { data, error });
  };

  // ============================================================================
  // GET Test functions (Modified: receive and display results)
  // ============================================================================
  const testPatientFiles = async () => {
    const result = await fetchPatientFiles();
    logResult("Patient Files", result, result ? null : patientError);
  };

  const testDoctorFiles = async () => {
    const result = await fetchDoctorFiles();
    logResult("Doctor Files", result, result ? null : doctorError);
  };

  const testDoctorSentences = async () => {
    const result = await fetchSentences(selectedFile, doctorSpeaker);
    logResult("Doctor Sentences", result, result ? null : doctorError);
  };

  const testDoctorRewrites = async () => {
    const result = await fetchRewritesAll();
    logResult("Doctor Rewrites (All)", result, result ? null : doctorError);
  };

  const testDoctorRewritesFiltered = async () => {
    const result = await fetchRewritesFiltered(selectedFile, doctorSpeaker);
    logResult(
      "Doctor Rewrites (Filtered)",
      result,
      result ? null : doctorError
    );
  };

  // ✅ Pagination test
  const testDoctorRewritesPaginated = async () => {
    const result = await fetchRewritesPaginated(0, 10);
    logResult(
      "Doctor Rewrites (Paginated)",
      result,
      result ? null : doctorError
    );
  };

  const testPatientSummariesAll = async () => {
    const result = await fetchSummariesAll();
    logResult("Patient Summaries (All)", result, result ? null : patientError);
  };

  const testPatientSummariesFiltered = async () => {
    const result = await fetchSummariesFiltered(selectedFile, selectedSpeaker);
    logResult(
      "Patient Summaries (Filtered)",
      result,
      result ? null : patientError
    );
  };

  const testPatientSummaryDetail = async () => {
    const result = await fetchSummaryDetail(selectedFile, selectedSpeaker);
    logResult("Patient Summary Detail", result, result ? null : patientError);
  };

  const testPatientScoringAll = async () => {
    const result = await fetchScoringAll();
    logResult("Patient Scoring (All)", result, result ? null : patientError);
  };

  const testPatientScoringFiltered = async () => {
    const result = await fetchScoringFiltered(selectedFile, selectedSpeaker);
    logResult(
      "Patient Scoring (Filtered)",
      result,
      result ? null : patientError
    );
  };

  const testPatientResponsesAll = async () => {
    const result = await fetchResponsesAll();
    logResult("Patient Responses (All)", result, result ? null : patientError);
  };

  const testPatientResponsesFiltered = async () => {
    const result = await fetchResponsesFiltered(selectedFile, selectedSpeaker);
    logResult(
      "Patient Responses (Filtered)",
      result,
      result ? null : patientError
    );
  };

  // ============================================================================
  // PUT Test functions
  // ============================================================================

  // Test: Update All Scores
  const testUpdateAllScores = async () => {
    const data: PatientScoringUpdate = {
      file: selectedFile,
      speaker: selectedSpeaker,
      class_1_patient_scoring: scoringInputs.class_1
        ? parseInt(scoringInputs.class_1)
        : undefined,
      class_2_patient_scoring: scoringInputs.class_2
        ? parseInt(scoringInputs.class_2)
        : undefined,
      class_3_patient_scoring: scoringInputs.class_3
        ? parseInt(scoringInputs.class_3)
        : undefined,
      class_4_patient_scoring: scoringInputs.class_4
        ? parseInt(scoringInputs.class_4)
        : undefined,
      class_5_patient_scoring: scoringInputs.class_5
        ? parseInt(scoringInputs.class_5)
        : undefined,
    };

    const result = await updateScoring(data);
    logResult(
      "PUT Scoring (All Classes)",
      {
        request: data,
        response: result,
      },
      result ? null : patientError
    );
  };

  // Test: Update Single Score
  const testUpdateSingleScore = async () => {
    const classNum = parseInt(singleScoreInput.classNumber) as
      | 1
      | 2
      | 3
      | 4
      | 5;
    const score = parseInt(singleScoreInput.score);

    if (isNaN(score)) {
      logResult("PUT Scoring (Single)", null, "Score must be a number");
      return;
    }

    const result = await updateSingleClassScore(
      selectedFile,
      selectedSpeaker,
      classNum,
      score
    );
    logResult(
      "PUT Scoring (Single Class)",
      {
        request: {
          file: selectedFile,
          speaker: selectedSpeaker,
          class: classNum,
          score,
        },
        response: result,
      },
      result ? null : patientError
    );
  };

  // Test: Update All Responses
  const testUpdateAllResponses = async () => {
    const data: PatientResponsesUpdate = {
      file: selectedFile,
      speaker: selectedSpeaker,
      answer_1: responseInputs.answer_1 || undefined,
      answer_2: responseInputs.answer_2 || undefined,
      answer_3: responseInputs.answer_3 || undefined,
      answer_4: responseInputs.answer_4 || undefined,
      answer_5: responseInputs.answer_5 || undefined,
    };

    const result = await updateResponses(data);
    logResult(
      "PUT Responses (All)",
      {
        request: data,
        response: result,
      },
      result ? null : patientError
    );
  };

  // Test: Update Single Answer
  const testUpdateSingleAnswer = async () => {
    const answerNum = parseInt(singleAnswerInput.answerNumber) as
      | 1
      | 2
      | 3
      | 4
      | 5;
    const answer = singleAnswerInput.answer;

    if (!answer) {
      logResult("PUT Response (Single)", null, "Answer cannot be empty");
      return;
    }

    const result = await updateSingleAnswer(
      selectedFile,
      selectedSpeaker,
      answerNum,
      answer
    );
    logResult(
      "PUT Response (Single Answer)",
      {
        request: {
          file: selectedFile,
          speaker: selectedSpeaker,
          answerNumber: answerNum,
          answer,
        },
        response: result,
      },
      result ? null : patientError
    );
  };

  // ============================================================================
  // ✅ Doctor Rewrite PUT Test functions
  // ============================================================================

  // Test: Save Rewrite (Full Data)
  const testSaveRewrite = async () => {
    const data: DoctorRewriteData = {
      file: selectedFile,
      i: parseInt(rewriteInputs.i),
      i2: parseInt(rewriteInputs.i2),
      speaker: doctorSpeaker,
      time: new Date().toISOString(),
      original_sentence: rewriteInputs.original_sentence,
      revised_sentence: rewriteInputs.revised_sentence,
      score: parseFloat(rewriteInputs.score),
      class_: rewriteInputs.class_,
      selected: rewriteInputs.selected,
    };

    const result = await saveRewrite(data);
    logResult(
      "PUT Doctor Rewrite",
      {
        request: data,
        response: result,
      },
      result ? null : doctorError
    );

    // Refresh list after saving
    if (result) {
      await fetchRewritesFiltered(selectedFile, doctorSpeaker);
    }
  };

  // Test: Save Rewrite with Auto Timestamp
  const testSaveRewriteWithTimestamp = async () => {
    const result = await saveRewriteWithTimestamp(
      selectedFile,
      doctorSpeaker,
      parseInt(rewriteInputs.i),
      parseInt(rewriteInputs.i2),
      rewriteInputs.original_sentence,
      rewriteInputs.revised_sentence,
      parseFloat(rewriteInputs.score),
      rewriteInputs.class_,
      rewriteInputs.selected
    );

    logResult(
      "PUT Doctor Rewrite (Auto Timestamp)",
      {
        request: {
          file: selectedFile,
          speaker: doctorSpeaker,
          i: rewriteInputs.i,
          i2: rewriteInputs.i2,
          original_sentence: rewriteInputs.original_sentence,
          revised_sentence: rewriteInputs.revised_sentence,
          score: rewriteInputs.score,
          class_: rewriteInputs.class_,
        },
        response: result,
      },
      result ? null : doctorError
    );

    // Refresh list after saving
    if (result) {
      await fetchRewritesFiltered(selectedFile, doctorSpeaker);
    }
  };

  // ✅ Auto-fill rewrite input fields when selecting a sentence
  const handleSelectSentence = (sentence: any, index: number) => {
    setSelectedSentenceIndex(index);
    setRewriteInputs((prev) => ({
      ...prev,
      i: String(sentence.i || 0),
      i2: String(sentence.i2 || 0),
      original_sentence: sentence.sentence || "",
      revised_sentence: sentence.sentence || "", // Copy original as default
      class_: sentence.class || "1",
    }));
  };

  // ============================================================================
  // Render
  // ============================================================================
  return (
    <div style={{ padding: "30px", fontFamily: "Arial, sans-serif" }}>
      <h1>API Test Dashboard</h1>

      {/* Loading Indicator */}
      {(patientLoading || doctorLoading) && (
        <div
          style={{
            padding: "10px",
            backgroundColor: "#fff3e0",
            borderRadius: "4px",
            marginBottom: "20px",
            textAlign: "center",
          }}
        >
          ⏳ Loading...
        </div>
      )}

      {/* Parameters Section */}
      <div
        style={{
          marginBottom: "30px",
          padding: "20px",
          backgroundColor: "#f5f5f5",
          borderRadius: "8px",
        }}
      >
        <h2>Test Parameters</h2>
        <div style={{ marginBottom: "10px" }}>
          <label>
            Patient File:
            <input
              type="text"
              value={selectedFile}
              onChange={(e) => setSelectedFile(e.target.value)}
              style={{ marginLeft: "10px", padding: "5px", width: "300px" }}
            />
          </label>
        </div>
        <div style={{ marginBottom: "10px" }}>
          <label>
            Patient Speaker:
            <input
              type="text"
              value={selectedSpeaker}
              onChange={(e) => setSelectedSpeaker(e.target.value)}
              style={{ marginLeft: "10px", padding: "5px", width: "300px" }}
            />
          </label>
        </div>
        <div style={{ marginBottom: "10px" }}>
          <label>
            Doctor Speaker:
            <input
              type="text"
              value={doctorSpeaker}
              onChange={(e) => setDoctorSpeaker(e.target.value)}
              style={{ marginLeft: "10px", padding: "5px", width: "300px" }}
            />
          </label>
        </div>
      </div>

      {/* Doctor Interface Tests */}
      <div
        style={{
          marginBottom: "30px",
          padding: "20px",
          backgroundColor: "#e3f2fd",
          borderRadius: "8px",
        }}
      >
        <h2>🩺 Doctor Interface Tests (GET)</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "10px",
          }}
        >
          <button
            onClick={testDoctorFiles}
            disabled={doctorLoading}
            style={{
              padding: "10px",
              backgroundColor: "#1976d2",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Get Doctor Files
          </button>
          <button
            onClick={testDoctorSentences}
            disabled={doctorLoading}
            style={{
              padding: "10px",
              backgroundColor: "#1976d2",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Get Doctor Sentences
          </button>
          <button
            onClick={testDoctorRewrites}
            disabled={doctorLoading}
            style={{
              padding: "10px",
              backgroundColor: "#1976d2",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Get Doctor Rewrites (All)
          </button>
          <button
            onClick={testDoctorRewritesFiltered}
            disabled={doctorLoading}
            style={{
              padding: "10px",
              backgroundColor: "#1976d2",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Get Doctor Rewrites (Filtered)
          </button>
          <button
            onClick={testDoctorRewritesPaginated}
            disabled={doctorLoading}
            style={{
              padding: "10px",
              backgroundColor: "#1976d2",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Get Doctor Rewrites (Paginated)
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          ✅ NEW: Doctor Rewrite PUT Tests Section
      ═══════════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          marginBottom: "30px",
          padding: "20px",
          backgroundColor: "#e1f5fe",
          borderRadius: "8px",
        }}
      >
        <h2>✏️ Doctor Rewrite Update (PUT)</h2>

        {/* Step 1: Load Sentences */}
        <div
          style={{
            marginBottom: "20px",
            padding: "15px",
            backgroundColor: "#b3e5fc",
            borderRadius: "4px",
          }}
        >
          <h3 style={{ fontSize: "16px", marginBottom: "10px" }}>
            Step 1: Load Sentences
          </h3>
          <button
            onClick={testDoctorSentences}
            disabled={doctorLoading}
            style={{
              padding: "10px 20px",
              backgroundColor: "#0288d1",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            📄 Load Sentences for {selectedFile}
          </button>
          <span style={{ marginLeft: "10px", color: "#666" }}>
            {doctorSentences?.data?.length
              ? `✅ ${doctorSentences.data.length} sentences loaded`
              : "No sentences loaded yet"}
          </span>
        </div>

        {/* Step 2: Select a Sentence */}
        {doctorSentences?.data && doctorSentences.data.length > 0 && (
          <div
            style={{
              marginBottom: "20px",
              padding: "15px",
              backgroundColor: "#81d4fa",
              borderRadius: "4px",
            }}
          >
            <h3 style={{ fontSize: "16px", marginBottom: "10px" }}>
              Step 2: Select a Sentence
            </h3>
            <div
              style={{
                maxHeight: "300px",
                overflowY: "auto",
                backgroundColor: "white",
                borderRadius: "4px",
                padding: "10px",
              }}
            >
              {doctorSentences.data.map((sentence: any, index: number) => (
                <div
                  key={`${sentence.i}-${sentence.i2}`}
                  onClick={() => handleSelectSentence(sentence, index)}
                  style={{
                    padding: "10px",
                    marginBottom: "8px",
                    backgroundColor:
                      selectedSentenceIndex === index ? "#e3f2fd" : "#fafafa",
                    border:
                      selectedSentenceIndex === index
                        ? "2px solid #1976d2"
                        : "1px solid #ddd",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "5px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "12px",
                        color: "#666",
                        fontWeight: "bold",
                      }}
                    >
                      i={sentence.i}, i2={sentence.i2} | Class {sentence.class}{" "}
                      ({CLASS_TO_TOPIC[sentence.class] || "Unknown"})
                    </span>
                    <span
                      style={{
                        fontSize: "11px",
                        color: "#999",
                      }}
                    >
                      {sentence.time
                        ? new Date(sentence.time).toLocaleString()
                        : ""}
                    </span>
                  </div>
                  <div style={{ fontSize: "13px", color: "#333" }}>
                    "{sentence.sentence?.substring(0, 150)}
                    {sentence.sentence?.length > 150 ? "..." : ""}"
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Edit and Save Rewrite */}
        <div
          style={{
            marginBottom: "20px",
            padding: "15px",
            backgroundColor: "#4fc3f7",
            borderRadius: "4px",
          }}
        >
          <h3 style={{ fontSize: "16px", marginBottom: "10px" }}>
            Step 3: Edit & Save Rewrite
          </h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr",
              gap: "10px",
              marginBottom: "15px",
            }}
          >
            <div>
              <label style={{ fontSize: "12px", fontWeight: "bold" }}>
                i (Row Index):
              </label>
              <input
                type="number"
                value={rewriteInputs.i}
                onChange={(e) =>
                  setRewriteInputs((prev) => ({ ...prev, i: e.target.value }))
                }
                style={{ width: "100%", padding: "8px", marginTop: "5px" }}
              />
            </div>
            <div>
              <label style={{ fontSize: "12px", fontWeight: "bold" }}>
                i2 (Sub Index):
              </label>
              <input
                type="number"
                value={rewriteInputs.i2}
                onChange={(e) =>
                  setRewriteInputs((prev) => ({ ...prev, i2: e.target.value }))
                }
                style={{ width: "100%", padding: "8px", marginTop: "5px" }}
              />
            </div>
            <div>
              <label style={{ fontSize: "12px", fontWeight: "bold" }}>
                Class (Topic):
              </label>
              <select
                value={rewriteInputs.class_}
                onChange={(e) =>
                  setRewriteInputs((prev) => ({
                    ...prev,
                    class_: e.target.value,
                  }))
                }
                style={{ width: "100%", padding: "8px", marginTop: "5px" }}
              >
                <option value="1">1 - Cancer Prognosis</option>
                <option value="2">2 - Life Expectancy</option>
                <option value="3">3 - Erectile Dysfunction</option>
                <option value="4">4 - Urinary Incontinence</option>
                <option value="5">5 - Irritative Symptoms</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: "12px", fontWeight: "bold" }}>
                Score (1-5):
              </label>
              <input
                type="number"
                min="1"
                max="5"
                step="0.5"
                value={rewriteInputs.score}
                onChange={(e) =>
                  setRewriteInputs((prev) => ({
                    ...prev,
                    score: e.target.value,
                  }))
                }
                style={{ width: "100%", padding: "8px", marginTop: "5px" }}
              />
            </div>
          </div>

          <div style={{ marginBottom: "15px" }}>
            <label style={{ fontSize: "12px", fontWeight: "bold" }}>
              Original Sentence:
            </label>
            <textarea
              value={rewriteInputs.original_sentence}
              onChange={(e) =>
                setRewriteInputs((prev) => ({
                  ...prev,
                  original_sentence: e.target.value,
                }))
              }
              placeholder="Select a sentence above or enter manually..."
              style={{
                width: "100%",
                padding: "10px",
                marginTop: "5px",
                minHeight: "80px",
                resize: "vertical",
              }}
            />
          </div>

          <div style={{ marginBottom: "15px" }}>
            <label style={{ fontSize: "12px", fontWeight: "bold" }}>
              Revised Sentence:
            </label>
            <textarea
              value={rewriteInputs.revised_sentence}
              onChange={(e) =>
                setRewriteInputs((prev) => ({
                  ...prev,
                  revised_sentence: e.target.value,
                }))
              }
              placeholder="Enter your improved version of the sentence..."
              style={{
                width: "100%",
                padding: "10px",
                marginTop: "5px",
                minHeight: "80px",
                resize: "vertical",
                backgroundColor: "#e8f5e9",
              }}
            />
          </div>

          <div style={{ marginBottom: "15px" }}>
            <label style={{ fontSize: "12px", fontWeight: "bold" }}>
              <input
                type="checkbox"
                checked={rewriteInputs.selected}
                onChange={(e) =>
                  setRewriteInputs((prev) => ({
                    ...prev,
                    selected: e.target.checked,
                  }))
                }
                style={{ marginRight: "8px" }}
              />
              Selected (Active)
            </label>
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={testSaveRewrite}
              disabled={
                doctorLoading ||
                !rewriteInputs.original_sentence ||
                !rewriteInputs.revised_sentence
              }
              style={{
                padding: "12px 24px",
                backgroundColor:
                  !rewriteInputs.original_sentence ||
                  !rewriteInputs.revised_sentence
                    ? "#ccc"
                    : "#0277bd",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor:
                  !rewriteInputs.original_sentence ||
                  !rewriteInputs.revised_sentence
                    ? "not-allowed"
                    : "pointer",
                fontWeight: "bold",
              }}
            >
              💾 Save Rewrite to DB
            </button>
            <button
              onClick={testSaveRewriteWithTimestamp}
              disabled={
                doctorLoading ||
                !rewriteInputs.original_sentence ||
                !rewriteInputs.revised_sentence
              }
              style={{
                padding: "12px 24px",
                backgroundColor:
                  !rewriteInputs.original_sentence ||
                  !rewriteInputs.revised_sentence
                    ? "#ccc"
                    : "#01579b",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor:
                  !rewriteInputs.original_sentence ||
                  !rewriteInputs.revised_sentence
                    ? "not-allowed"
                    : "pointer",
                fontWeight: "bold",
              }}
            >
              💾 Save with Auto Timestamp
            </button>
          </div>
        </div>

        {/* Step 4: View Rewrite History */}
        <div
          style={{
            padding: "15px",
            backgroundColor: "#29b6f6",
            borderRadius: "4px",
          }}
        >
          <h3
            style={{ fontSize: "16px", marginBottom: "10px", color: "white" }}
          >
            Step 4: Rewrite History - Sorted by Time
          </h3>
          <button
            onClick={testDoctorRewritesFiltered}
            disabled={doctorLoading}
            style={{
              padding: "10px 20px",
              backgroundColor: "#0277bd",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              marginBottom: "15px",
            }}
          >
            🔄 Refresh Rewrite History
          </button>

          {doctorRewrites?.data && doctorRewrites.data.length > 0 ? (
            <div
              style={{
                maxHeight: "400px",
                overflowY: "auto",
                backgroundColor: "white",
                borderRadius: "4px",
                padding: "10px",
              }}
            >
              <div style={{ marginBottom: "10px", color: "#666" }}>
                Total: {doctorRewrites.total} records (sorted by time, newest
                first)
              </div>
              {[...doctorRewrites.data]
                .sort(
                  (a: any, b: any) =>
                    new Date(b.time).getTime() - new Date(a.time).getTime()
                )
                .map((rewrite: any, index: number) => (
                  <div
                    key={`${rewrite.i}-${rewrite.i2}-${index}`}
                    style={{
                      padding: "15px",
                      marginBottom: "10px",
                      backgroundColor: "#f5f5f5",
                      border: "1px solid #ddd",
                      borderRadius: "4px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "10px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: "bold",
                          color: "#1976d2",
                        }}
                      >
                        i={rewrite.i}, i2={rewrite.i2} | Class {rewrite.class} (
                        {CLASS_TO_TOPIC[rewrite.class] || "Unknown"}) | Score:{" "}
                        {rewrite.score}
                      </span>
                      <span
                        style={{
                          fontSize: "11px",
                          color: "#666",
                          backgroundColor: "#e3f2fd",
                          padding: "2px 8px",
                          borderRadius: "4px",
                        }}
                      >
                        🕐 {new Date(rewrite.time).toLocaleString()}
                      </span>
                    </div>
                    <div style={{ marginBottom: "8px" }}>
                      <div
                        style={{
                          fontSize: "11px",
                          color: "#d32f2f",
                          fontWeight: "bold",
                        }}
                      >
                        Original:
                      </div>
                      <div
                        style={{
                          fontSize: "13px",
                          color: "#666",
                          backgroundColor: "#ffebee",
                          padding: "8px",
                          borderRadius: "4px",
                        }}
                      >
                        "{rewrite.original_sentence}"
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: "11px",
                          color: "#388e3c",
                          fontWeight: "bold",
                        }}
                      >
                        Revised:
                      </div>
                      <div
                        style={{
                          fontSize: "13px",
                          color: "#333",
                          backgroundColor: "#e8f5e9",
                          padding: "8px",
                          borderRadius: "4px",
                        }}
                      >
                        "{rewrite.revised_sentence}"
                      </div>
                    </div>
                    <div
                      style={{
                        marginTop: "8px",
                        fontSize: "11px",
                        color: "#999",
                      }}
                    >
                      Selected: {rewrite.selected ? "✅ Yes" : "❌ No"}
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div
              style={{
                backgroundColor: "white",
                padding: "20px",
                borderRadius: "4px",
                textAlign: "center",
                color: "#666",
              }}
            >
              No rewrite history yet. Click "Refresh Rewrite History" to load.
            </div>
          )}
        </div>
      </div>

      {/* Patient Interface GET Tests */}
      <div
        style={{
          marginBottom: "30px",
          padding: "20px",
          backgroundColor: "#f3e5f5",
          borderRadius: "8px",
        }}
      >
        <h2>🧍 Patient Interface Tests (GET)</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px",
          }}
        >
          <button
            onClick={testPatientFiles}
            disabled={patientLoading}
            style={{
              padding: "10px",
              backgroundColor: "#7b1fa2",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Get Patient Files
          </button>
          <button
            onClick={testPatientSummariesAll}
            disabled={patientLoading}
            style={{
              padding: "10px",
              backgroundColor: "#7b1fa2",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Get Summaries (All)
          </button>
          <button
            onClick={testPatientSummariesFiltered}
            disabled={patientLoading}
            style={{
              padding: "10px",
              backgroundColor: "#7b1fa2",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Get Summaries (Filtered)
          </button>
          <button
            onClick={testPatientSummaryDetail}
            disabled={patientLoading}
            style={{
              padding: "10px",
              backgroundColor: "#7b1fa2",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Get Summary Detail
          </button>
          <button
            onClick={testPatientScoringAll}
            disabled={patientLoading}
            style={{
              padding: "10px",
              backgroundColor: "#7b1fa2",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Get Scoring (All)
          </button>
          <button
            onClick={testPatientScoringFiltered}
            disabled={patientLoading}
            style={{
              padding: "10px",
              backgroundColor: "#7b1fa2",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Get Scoring (Filtered)
          </button>
          <button
            onClick={testPatientResponsesAll}
            disabled={patientLoading}
            style={{
              padding: "10px",
              backgroundColor: "#7b1fa2",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Get Responses (All)
          </button>
          <button
            onClick={testPatientResponsesFiltered}
            disabled={patientLoading}
            style={{
              padding: "10px",
              backgroundColor: "#7b1fa2",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Get Responses (Filtered)
          </button>
        </div>
      </div>

      {/* Patient Interface PUT Tests - Scoring */}
      <div
        style={{
          marginBottom: "30px",
          padding: "20px",
          backgroundColor: "#e8f5e9",
          borderRadius: "8px",
        }}
      >
        <h2>✏️ Patient Scoring Update (PUT)</h2>

        {/* Update All Scores */}
        <div style={{ marginBottom: "20px" }}>
          <h3 style={{ fontSize: "16px", marginBottom: "10px" }}>
            Update All Class Scores
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: "10px",
              marginBottom: "10px",
            }}
          >
            {[1, 2, 3, 4, 5].map((num) => (
              <div key={num}>
                <label style={{ fontSize: "12px" }}>Class {num}:</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  placeholder="0-10"
                  value={
                    scoringInputs[`class_${num}` as keyof typeof scoringInputs]
                  }
                  onChange={(e) =>
                    setScoringInputs((prev) => ({
                      ...prev,
                      [`class_${num}`]: e.target.value,
                    }))
                  }
                  style={{ width: "100%", padding: "5px", marginTop: "5px" }}
                />
              </div>
            ))}
          </div>
          <button
            onClick={testUpdateAllScores}
            disabled={patientLoading}
            style={{
              padding: "10px 20px",
              backgroundColor: "#388e3c",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Update All Scores
          </button>
        </div>

        {/* Update Single Score */}
        <div style={{ borderTop: "1px solid #c8e6c9", paddingTop: "20px" }}>
          <h3 style={{ fontSize: "16px", marginBottom: "10px" }}>
            Update Single Class Score
          </h3>
          <div
            style={{
              display: "flex",
              gap: "10px",
              alignItems: "flex-end",
              marginBottom: "10px",
            }}
          >
            <div>
              <label style={{ fontSize: "12px" }}>Class:</label>
              <select
                value={singleScoreInput.classNumber}
                onChange={(e) =>
                  setSingleScoreInput((prev) => ({
                    ...prev,
                    classNumber: e.target.value,
                  }))
                }
                style={{ display: "block", padding: "5px", marginTop: "5px" }}
              >
                {[1, 2, 3, 4, 5].map((num) => (
                  <option key={num} value={num}>
                    Class {num}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: "12px" }}>Score (0-10):</label>
              <input
                type="number"
                min="0"
                max="10"
                placeholder="Score"
                value={singleScoreInput.score}
                onChange={(e) =>
                  setSingleScoreInput((prev) => ({
                    ...prev,
                    score: e.target.value,
                  }))
                }
                style={{
                  display: "block",
                  padding: "5px",
                  marginTop: "5px",
                  width: "80px",
                }}
              />
            </div>
            <button
              onClick={testUpdateSingleScore}
              disabled={patientLoading}
              style={{
                padding: "10px 20px",
                backgroundColor: "#43a047",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Update Single Score
            </button>
          </div>
        </div>
      </div>

      {/* Patient Interface PUT Tests - Responses */}
      <div
        style={{
          marginBottom: "30px",
          padding: "20px",
          backgroundColor: "#fff3e0",
          borderRadius: "8px",
        }}
      >
        <h2>💬 Patient Responses Update (PUT)</h2>

        {/* Update All Responses */}
        <div style={{ marginBottom: "20px" }}>
          <h3 style={{ fontSize: "16px", marginBottom: "10px" }}>
            Update All Answers
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: "10px",
              marginBottom: "10px",
            }}
          >
            {[1, 2, 3, 4, 5].map((num) => (
              <div key={num}>
                <label style={{ fontSize: "12px" }}>Answer {num}:</label>
                <input
                  type="text"
                  placeholder={`Enter answer ${num}...`}
                  value={
                    responseInputs[
                      `answer_${num}` as keyof typeof responseInputs
                    ]
                  }
                  onChange={(e) =>
                    setResponseInputs((prev) => ({
                      ...prev,
                      [`answer_${num}`]: e.target.value,
                    }))
                  }
                  style={{ width: "100%", padding: "8px", marginTop: "5px" }}
                />
              </div>
            ))}
          </div>
          <button
            onClick={testUpdateAllResponses}
            disabled={patientLoading}
            style={{
              padding: "10px 20px",
              backgroundColor: "#f57c00",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Update All Responses
          </button>
        </div>

        {/* Update Single Answer */}
        <div style={{ borderTop: "1px solid #ffe0b2", paddingTop: "20px" }}>
          <h3 style={{ fontSize: "16px", marginBottom: "10px" }}>
            Update Single Answer
          </h3>
          <div
            style={{
              display: "flex",
              gap: "10px",
              alignItems: "flex-end",
              marginBottom: "10px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <label style={{ fontSize: "12px" }}>Answer #:</label>
              <select
                value={singleAnswerInput.answerNumber}
                onChange={(e) =>
                  setSingleAnswerInput((prev) => ({
                    ...prev,
                    answerNumber: e.target.value,
                  }))
                }
                style={{ display: "block", padding: "5px", marginTop: "5px" }}
              >
                {[1, 2, 3, 4, 5].map((num) => (
                  <option key={num} value={num}>
                    Answer {num}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: "200px" }}>
              <label style={{ fontSize: "12px" }}>Answer Text:</label>
              <input
                type="text"
                placeholder="Enter answer text..."
                value={singleAnswerInput.answer}
                onChange={(e) =>
                  setSingleAnswerInput((prev) => ({
                    ...prev,
                    answer: e.target.value,
                  }))
                }
                style={{
                  display: "block",
                  padding: "5px",
                  marginTop: "5px",
                  width: "100%",
                }}
              />
            </div>
            <button
              onClick={testUpdateSingleAnswer}
              disabled={patientLoading}
              style={{
                padding: "10px 20px",
                backgroundColor: "#fb8c00",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Update Single Answer
            </button>
          </div>
        </div>
      </div>

      {/* Results Section */}
      <div
        style={{
          padding: "20px",
          backgroundColor: "#fafafa",
          borderRadius: "8px",
        }}
      >
        <h2>📊 Test Results</h2>
        <button
          onClick={() => setResults({})}
          style={{
            marginBottom: "15px",
            padding: "8px 16px",
            backgroundColor: "#9e9e9e",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Clear Results
        </button>

        {Object.entries(results).length === 0 ? (
          <p style={{ color: "#999" }}>
            Click buttons above to test endpoints...
          </p>
        ) : (
          <div>
            {Object.entries(results)
              .reverse()
              .map(([key, value]: [string, any]) => (
                <div
                  key={key}
                  style={{
                    marginBottom: "20px",
                    padding: "15px",
                    backgroundColor: "white",
                    borderLeft: `4px solid ${
                      value.error ? "#d32f2f" : "#388e3c"
                    }`,
                    borderRadius: "4px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "10px",
                    }}
                  >
                    <h3 style={{ margin: 0 }}>{key}</h3>
                    <span
                      style={{
                        fontSize: "12px",
                        color: "#999",
                      }}
                    >
                      {value.timestamp}
                    </span>
                  </div>
                  {value.error && (
                    <div style={{ color: "#d32f2f", marginBottom: "10px" }}>
                      <strong>Error:</strong> {value.error}
                    </div>
                  )}
                  <details>
                    <summary style={{ cursor: "pointer", color: "#1976d2" }}>
                      View Response
                    </summary>
                    <pre
                      style={{
                        backgroundColor: "#f5f5f5",
                        padding: "10px",
                        borderRadius: "4px",
                        overflow: "auto",
                        maxHeight: "300px",
                      }}
                    >
                      {JSON.stringify(value.data, null, 2)}
                    </pre>
                  </details>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
