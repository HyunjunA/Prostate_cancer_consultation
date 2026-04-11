/**
 * RiskPerceptionSurvey.tsx
 *
 * 5-item Risk Perception survey component.
 * Measures patient understanding of cancer and treatment-related risks.
 *
 * Color theme: Rose
 *
 * UPDATED: Options now use REDCap category values (1-5) instead of percentage strings
 */

import React from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RiskPerceptionAnswers {
  cancerRiskUntreated: number | null; // Slider (0-100) → converted to category 1-5
  cancerRiskTreated: string | null; // Radio: "1" | "2" | "3" | "4" | "5"
  erectileDysfunctionRisk: string | null; // Radio: "1" | "2" | "3" | "4" | "5"
  urinaryIncontinenceRisk: string | null; // Radio: "1" | "2" | "3" | "4" | "5"
  irritativeUrinaryRisk: string | null; // Radio: "1" | "2" | "3" | "4" | "5"
}

export const INITIAL_RISK_ANSWERS: RiskPerceptionAnswers = {
  cancerRiskUntreated: null,
  cancerRiskTreated: null,
  erectileDysfunctionRisk: null,
  urinaryIncontinenceRisk: null,
  irritativeUrinaryRisk: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const RISK_SLIDER_QUESTION = {
  id: "cancerRiskUntreated",
  text: "Which of the following is closest to the risk of your cancer if you don't treat it?",
  min: 0,
  max: 100,
  step: 1,
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATED: Options use REDCap category values (1-5)
// ─────────────────────────────────────────────────────────────────────────────

export const RISK_QUESTIONS = [
  {
    id: "cancerRiskTreated",
    text: "Which of the following is closest to the risk of your cancer if you do treat it?",
    options: [
      {
        value: "1", // REDCap category
        label: "5 out of 100 men die of cancer at your life expectancy",
      },
      {
        value: "2",
        label: "10 out of 100 men die of cancer at your life expectancy",
      },
      {
        value: "3",
        label: "20 out of 100 men die of cancer at your life expectancy",
      },
      {
        value: "4",
        label: "30 out of 100 men die of cancer at your life expectancy",
      },
      {
        value: "5",
        label:
          "40 or more out of 100 men die of cancer at your life expectancy",
      },
    ],
  },
  {
    id: "erectileDysfunctionRisk",
    text: "Which of the following is closest to the risk of permanent erectile dysfunction at 2 years (requiring injection therapy or penile prosthesis)?",
    options: [
      { value: "1", label: "10 out of 100 men" },
      { value: "2", label: "25 out of 100 men" },
      { value: "3", label: "50 out of 100 men" },
      { value: "4", label: "75 out of 100 men" },
      { value: "5", label: "90 out of 100 men" },
    ],
  },
  {
    id: "urinaryIncontinenceRisk",
    text: "Which of the following is closest to the risk of urinary incontinence at 1 year (requiring pads)?",
    options: [
      { value: "1", label: "5 out of 100 men" },
      { value: "2", label: "10 out of 100 men" },
      { value: "3", label: "20 out of 100 men" },
      { value: "4", label: "30 out of 100 men" },
      { value: "5", label: "50 out of 100 men" },
    ],
  },
  {
    id: "irritativeUrinaryRisk",
    text: "Which of the following is closest to the risk of irritative urinary symptoms at 1 year (moderate or severe problem requiring medical or surgical intervention)?",
    options: [
      { value: "1", label: "5 out of 100 men" },
      { value: "2", label: "10 out of 100 men" },
      { value: "3", label: "15 out of 100 men" },
      { value: "4", label: "20 out of 100 men" },
      { value: "5", label: "30 out of 100 men" },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");

/**
 * Convert slider value (0-100) to REDCap category (1-5)
 * Based on REDCap risk_percep_1_1 options:
 *   1 = 5 out of 100 (0-7)
 *   2 = 10 out of 100 (8-14)
 *   3 = 20 out of 100 (15-24)
 *   4 = 30 out of 100 (25-34)
 *   5 = 40+ out of 100 (35-100)
 */
export const sliderToCategory = (sliderValue: number): string => {
  if (sliderValue <= 7) return "1";
  if (sliderValue <= 14) return "2";
  if (sliderValue <= 24) return "3";
  if (sliderValue <= 34) return "4";
  return "5";
};

// ─────────────────────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────────────────────

interface RiskQuestionProps {
  questionNumber: number;
  questionText: string;
  options: { value: string; label: string }[];
  value: string | null;
  onChange: (value: string) => void;
  isDark?: boolean;
  trackingName?: string;
  onTrackEvent?: (eventData: {
    eventType: string;
    elementId: string;
    metadata?: Record<string, any>;
  }) => void;
}

export const RiskQuestion: React.FC<RiskQuestionProps> = ({
  questionNumber,
  questionText,
  options,
  value,
  onChange,
  isDark = false,
  trackingName,
  onTrackEvent,
}) => {
  const handleChange = (newValue: string) => {
    onChange(newValue);
    if (onTrackEvent && trackingName) {
      onTrackEvent({
        eventType: "survey_answer",
        elementId: trackingName,
        metadata: {
          survey: "risk_perception",
          questionId: `q${questionNumber}`,
          questionNumber,
          answer: newValue,
          answerLabel: options.find((o) => o.value === newValue)?.label,
        },
      });
    }
  };

  return (
    <div
      data-track-proximity={trackingName}
      className={cx(
        "p-6 rounded-xl border transition-all",
        isDark
          ? "bg-slate-800 border-slate-700 hover:border-rose-600"
          : "bg-white border-gray-200 hover:border-rose-400",
      )}
    >
      {/* Question Text */}
      <div className="mb-4">
        <span
          className={cx(
            "inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold mr-2",
            isDark
              ? "bg-rose-900 text-rose-300 border border-rose-700"
              : "bg-rose-100 text-rose-700 border border-rose-200",
          )}
        >
          {questionNumber}
        </span>
        <span
          className={cx(
            "text-base font-medium",
            isDark ? "text-slate-200" : "text-gray-800",
          )}
        >
          {questionText}
        </span>
      </div>

      {/* Options */}
      <div className="space-y-2">
        {options.map((option) => (
          <label
            key={option.value}
            className={cx(
              "flex items-center p-3 rounded-lg cursor-pointer transition-all border",
              value === option.value
                ? isDark
                  ? "bg-rose-900/50 border-rose-600 text-rose-100"
                  : "bg-rose-50 border-rose-400 text-rose-900"
                : isDark
                  ? "bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600"
                  : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100",
            )}
          >
            <input
              type="radio"
              name={trackingName}
              value={option.value}
              checked={value === option.value}
              onChange={() => handleChange(option.value)}
              className="sr-only"
            />
            <div
              className={cx(
                "w-5 h-5 rounded-full border-2 mr-3 flex items-center justify-center flex-shrink-0",
                value === option.value
                  ? isDark
                    ? "border-rose-400 bg-rose-600"
                    : "border-rose-500 bg-rose-500"
                  : isDark
                    ? "border-slate-500"
                    : "border-gray-300",
              )}
            >
              {value === option.value && (
                <div className="w-2 h-2 rounded-full bg-white" />
              )}
            </div>
            <span className="text-sm">{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Slider Question Component
// ─────────────────────────────────────────────────────────────────────────────

interface RiskSliderQuestionProps {
  questionNumber: number;
  questionText: string;
  min: number;
  max: number;
  step: number;
  value: number | null;
  onChange: (value: number) => void;
  isDark?: boolean;
  trackingName?: string;
  onTrackEvent?: (eventData: {
    eventType: string;
    elementId: string;
    metadata?: Record<string, any>;
  }) => void;
}

export const RiskSliderQuestion: React.FC<RiskSliderQuestionProps> = ({
  questionNumber,
  questionText,
  min,
  max,
  step,
  value,
  onChange,
  isDark = false,
  trackingName,
  onTrackEvent,
}) => {
  const handleChange = (newValue: number) => {
    onChange(newValue);
    if (onTrackEvent && trackingName) {
      onTrackEvent({
        eventType: "survey_answer",
        elementId: trackingName,
        metadata: {
          survey: "risk_perception",
          questionId: `q${questionNumber}`,
          questionNumber,
          answer: newValue,
          category: sliderToCategory(newValue),
        },
      });
    }
  };

  return (
    <div
      data-track-proximity={trackingName}
      className={cx(
        "p-6 rounded-xl border transition-all",
        isDark
          ? "bg-slate-800 border-slate-700 hover:border-rose-600"
          : "bg-white border-gray-200 hover:border-rose-400",
      )}
    >
      {/* Question Text */}
      <div className="mb-4">
        <span
          className={cx(
            "inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold mr-2",
            isDark
              ? "bg-rose-900 text-rose-300 border border-rose-700"
              : "bg-rose-100 text-rose-700 border border-rose-200",
          )}
        >
          {questionNumber}
        </span>
        <span
          className={cx(
            "text-base font-medium",
            isDark ? "text-slate-200" : "text-gray-800",
          )}
        >
          {questionText}
        </span>
      </div>

      {/* Slider */}
      <div className="px-2">
        <div className="flex justify-between mb-2">
          <span
            className={cx(
              "text-sm font-medium",
              isDark ? "text-slate-400" : "text-gray-500",
            )}
          >
            {min}
          </span>
          <span
            className={cx(
              "text-sm font-medium",
              isDark ? "text-slate-400" : "text-gray-500",
            )}
          >
            50
          </span>
          <span
            className={cx(
              "text-sm font-medium",
              isDark ? "text-slate-400" : "text-gray-500",
            )}
          >
            {max}
          </span>
        </div>
        <div className="relative">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value ?? min}
            onChange={(e) => handleChange(Number(e.target.value))}
            className={cx(
              "w-full h-2 rounded-lg appearance-none cursor-pointer",
              isDark ? "bg-slate-600" : "bg-gray-200",
              "accent-rose-500",
            )}
          />
        </div>
        <div className="flex justify-end mt-3">
          <div
            className={cx(
              "flex items-center gap-2 px-4 py-2 rounded-lg border",
              isDark
                ? "bg-slate-700 border-slate-600"
                : "bg-gray-50 border-gray-200",
            )}
          >
            <span
              className={cx(
                "text-2xl font-bold",
                isDark ? "text-rose-400" : "text-rose-600",
              )}
            >
              {value !== null ? value : "--"}
            </span>
            <span
              className={cx(
                "text-sm",
                isDark ? "text-slate-400" : "text-gray-500",
              )}
            >
              out of 100
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Survey Component
// ─────────────────────────────────────────────────────────────────────────────

interface RiskPerceptionSurveyProps {
  answers: RiskPerceptionAnswers;
  onChange: (
    questionId: keyof RiskPerceptionAnswers,
    value: string | number,
  ) => void;
  onSubmit?: () => void;
  isDark?: boolean;
  variant?: "pre" | "post";
  onTrackEvent?: (eventData: {
    eventType: string;
    elementId: string;
    metadata?: Record<string, any>;
  }) => void;
}

export const RiskPerceptionSurvey: React.FC<RiskPerceptionSurveyProps> = ({
  answers,
  onChange,
  onSubmit,
  isDark = false,
  variant = "post",
  onTrackEvent,
}) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = React.useState(0);

  const totalQuestions = RISK_QUESTIONS.length + 1; // +1 for slider question
  const isLastQuestion = currentQuestionIndex === totalQuestions - 1;

  // Determine which question to show and if it's answered
  const isSliderQuestion = currentQuestionIndex === 0;
  const currentRadioQuestion = isSliderQuestion
    ? null
    : RISK_QUESTIONS[currentQuestionIndex - 1];

  const isCurrentAnswered = isSliderQuestion
    ? answers.cancerRiskUntreated !== null
    : currentRadioQuestion
      ? answers[currentRadioQuestion.id as keyof RiskPerceptionAnswers] !== null
      : false;

  const title =
    variant === "pre"
      ? "Pre-Consultation Risk Perception"
      : "Post-Consultation Risk Perception";

  const handleNext = () => {
    if (currentQuestionIndex < totalQuestions - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  return (
    <div data-track-proximity="RiskPerception_Survey">
      {/* Header */}
      <div className="mb-6">
        <h3
          className={cx(
            "text-lg font-semibold mb-2",
            isDark ? "text-rose-300" : "text-rose-700",
          )}
        >
          {title}
        </h3>
        <p
          className={cx("text-sm", isDark ? "text-slate-400" : "text-gray-600")}
        >
          Please select the answer that best represents your understanding of
          the risks.
        </p>
      </div>

      {/* Current Question */}
      <div className="mb-6">
        {isSliderQuestion ? (
          <RiskSliderQuestion
            questionNumber={1}
            questionText={RISK_SLIDER_QUESTION.text}
            min={RISK_SLIDER_QUESTION.min}
            max={RISK_SLIDER_QUESTION.max}
            step={RISK_SLIDER_QUESTION.step}
            value={answers.cancerRiskUntreated}
            onChange={(v) => onChange("cancerRiskUntreated", v)}
            isDark={isDark}
            trackingName="RiskPerception_cancerRiskUntreated"
            onTrackEvent={onTrackEvent}
          />
        ) : currentRadioQuestion ? (
          <RiskQuestion
            questionNumber={currentQuestionIndex + 1}
            questionText={currentRadioQuestion.text}
            options={currentRadioQuestion.options}
            value={
              answers[
                currentRadioQuestion.id as keyof RiskPerceptionAnswers
              ] as string | null
            }
            onChange={(v) =>
              onChange(
                currentRadioQuestion.id as keyof RiskPerceptionAnswers,
                v,
              )
            }
            isDark={isDark}
            trackingName={`RiskPerception_${currentRadioQuestion.id}`}
            onTrackEvent={onTrackEvent}
          />
        ) : null}
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <span
            className={cx(
              "text-sm font-medium",
              isDark ? "text-slate-300" : "text-gray-600",
            )}
          >
            Question {currentQuestionIndex + 1} of {totalQuestions}
          </span>
          <span
            className={cx(
              "text-sm font-medium",
              isDark ? "text-rose-400" : "text-rose-600",
            )}
          >
            {Math.round(((currentQuestionIndex + 1) / totalQuestions) * 100)}%
          </span>
        </div>
        <div
          className={cx(
            "w-full h-2 rounded-full",
            isDark ? "bg-slate-700" : "bg-gray-200",
          )}
        >
          <div
            className="h-2 rounded-full bg-rose-500 transition-all duration-300"
            style={{
              width: `${((currentQuestionIndex + 1) / totalQuestions) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-end">
        {!isLastQuestion ? (
          <button
            onClick={handleNext}
            disabled={!isCurrentAnswered}
            className={cx(
              "px-6 py-3 rounded-lg text-sm font-semibold transition-all",
              isCurrentAnswered
                ? isDark
                  ? "bg-rose-700 text-rose-100 hover:bg-rose-600"
                  : "bg-rose-600 text-white hover:bg-rose-700"
                : isDark
                  ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed",
            )}
          >
            Next
          </button>
        ) : (
          onSubmit && (
            <button
              onClick={onSubmit}
              disabled={!isCurrentAnswered}
              data-track-proximity="RiskPerception_Submit_Button"
              className={cx(
                "px-8 py-3 rounded-lg text-sm font-semibold transition-all shadow-lg",
                isCurrentAnswered
                  ? isDark
                    ? "bg-rose-700 text-rose-100 hover:bg-rose-600 hover:shadow-xl"
                    : "bg-rose-600 text-white hover:bg-rose-700 hover:shadow-xl"
                  : isDark
                    ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                    : "bg-gray-300 text-gray-500 cursor-not-allowed",
              )}
            >
              Submit Responses
            </button>
          )
        )}
      </div>
    </div>
  );
};

export default RiskPerceptionSurvey;
