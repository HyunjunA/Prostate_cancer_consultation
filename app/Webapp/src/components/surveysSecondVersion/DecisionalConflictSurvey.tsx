/**
 * DecisionalConflictSurvey.tsx
 *
 * 16-item Decisional Conflict Scale (DCS) survey component.
 * Measures personal perceptions of uncertainty in choosing options,
 * modifiable factors contributing to uncertainty, and effective decision making.
 *
 * Color theme: Teal
 */

import React from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type LikertAnswer = 0 | 1 | 2 | 3 | 4 | null;
// 0 = Strongly Agree, 1 = Agree, 2 = Neither, 3 = Disagree, 4 = Strongly Disagree

export interface DecisionalConflictAnswers {
  q1: LikertAnswer;
  q2: LikertAnswer;
  q3: LikertAnswer;
  q4: LikertAnswer;
  q5: LikertAnswer;
  q6: LikertAnswer;
  q7: LikertAnswer;
  q8: LikertAnswer;
  q9: LikertAnswer;
  q10: LikertAnswer;
  q11: LikertAnswer;
  q12: LikertAnswer;
  q13: LikertAnswer;
  q14: LikertAnswer;
  q15: LikertAnswer;
  q16: LikertAnswer;
}

export const INITIAL_DCS_ANSWERS: DecisionalConflictAnswers = {
  q1: null,
  q2: null,
  q3: null,
  q4: null,
  q5: null,
  q6: null,
  q7: null,
  q8: null,
  q9: null,
  q10: null,
  q11: null,
  q12: null,
  q13: null,
  q14: null,
  q15: null,
  q16: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const DCS_QUESTIONS = [
  { id: "q1", text: "I know which options are available to me." },
  { id: "q2", text: "I know the benefits of each option." },
  { id: "q3", text: "I know the risks and side effects of each option." },
  { id: "q4", text: "I am clear about which benefits matter most to me." },
  {
    id: "q5",
    text: "I am clear about which risks and side effects matter most to me.",
  },
  {
    id: "q6",
    text: "I am clear about which is more important to me (the benefits or the risks and the side effects).",
  },
  { id: "q7", text: "I have enough support from others to make a choice." },
  { id: "q8", text: "I am choosing without pressure from others." },
  { id: "q9", text: "I have enough advice to make a choice." },
  { id: "q10", text: "I am clear about the best choice for me." },
  { id: "q11", text: "I feel sure about what to choose." },
  { id: "q12", text: "This decision is easy for me to make." },
  { id: "q13", text: "I feel I have made an informed choice." },
  { id: "q14", text: "My decision shows what is important to me." },
  { id: "q15", text: "I expect to stick with my decision." },
  { id: "q16", text: "I am satisfied with my decision." },
];

export const LIKERT_OPTIONS = [
  { value: 0, label: "Strongly Agree" },
  { value: 1, label: "Agree" },
  { value: 2, label: "Neither Agree nor Disagree" },
  { value: 3, label: "Disagree" },
  { value: 4, label: "Strongly Disagree" },
];

// Subscale definitions for scoring
export const DCS_SUBSCALES = {
  informed: ["q1", "q2", "q3"], // Informed subscale
  valuesClarity: ["q4", "q5", "q6"], // Values clarity subscale
  support: ["q7", "q8", "q9"], // Support subscale
  uncertainty: ["q10", "q11", "q12"], // Uncertainty subscale
  effectiveDecision: ["q13", "q14", "q15", "q16"], // Effective decision subscale
};

// Section grouping (matching REDCap PDF format)
export const DCS_SECTIONS = [
  { questions: [0, 1, 2, 3, 4], startNumber: 1 }, // Q1-5
  { questions: [5, 6, 7, 8, 9, 10], startNumber: 6 }, // Q6-11
  { questions: [11, 12, 13, 14, 15], startNumber: 12 }, // Q12-16
];

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");

/**
 * Calculate DCS score (0-100 scale)
 * Lower scores = lower decisional conflict
 */
export const calculateDCSScore = (
  answers: DecisionalConflictAnswers,
): number | null => {
  const values = Object.values(answers);
  const validValues = values.filter((v): v is number => v !== null);

  if (validValues.length === 0) return null;

  const sum = validValues.reduce((acc, val) => acc + val, 0);
  const average = sum / validValues.length;

  // Convert to 0-100 scale: (average / 4) * 100
  return (average / 4) * 100;
};

// ─────────────────────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────────────────────

interface LikertQuestionProps {
  questionNumber: number;
  questionText: string;
  value: LikertAnswer;
  onChange: (value: LikertAnswer) => void;
  isDark?: boolean;
  trackingName?: string;
  onTrackEvent?: (eventData: {
    eventType: string;
    elementId: string;
    metadata?: Record<string, any>;
  }) => void;
}

export const LikertQuestion: React.FC<LikertQuestionProps> = ({
  questionNumber,
  questionText,
  value,
  onChange,
  isDark = false,
  trackingName,
  onTrackEvent,
}) => {
  const handleChange = (newValue: LikertAnswer) => {
    onChange(newValue);
    if (onTrackEvent && trackingName) {
      onTrackEvent({
        eventType: "dcs_answer",
        elementId: trackingName,
        metadata: {
          questionNumber,
          answer: newValue,
          answerLabel: LIKERT_OPTIONS.find((o) => o.value === newValue)?.label,
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
          ? "bg-slate-800 border-slate-700 hover:border-teal-600"
          : "bg-white border-gray-200 hover:border-teal-400",
      )}
    >
      {/* Question Text */}
      <div className="mb-4">
        <span
          className={cx(
            "inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold mr-2",
            isDark
              ? "bg-teal-900 text-teal-300 border border-teal-700"
              : "bg-teal-100 text-teal-700 border border-teal-200",
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

      {/* Likert Options */}
      <div className="grid grid-cols-5 gap-2">
        {LIKERT_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => handleChange(option.value as LikertAnswer)}
            className={cx(
              "p-3 rounded-lg text-xs font-medium transition-all text-center border",
              value === option.value
                ? isDark
                  ? "bg-teal-700 text-teal-100 border-teal-600"
                  : "bg-teal-600 text-white border-teal-600"
                : isDark
                  ? "bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600"
                  : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Section Group Component
// ─────────────────────────────────────────────────────────────────────────────

interface QuestionSectionProps {
  children: React.ReactNode;
  isDark?: boolean;
}

export const QuestionSection: React.FC<QuestionSectionProps> = ({
  children,
  isDark = false,
}) => {
  return (
    <div className="mb-8">
      {/* Section Instruction */}
      <div
        className={cx(
          "mb-4 p-4 rounded-lg border",
          isDark
            ? "bg-slate-700/50 border-slate-600"
            : "bg-gray-50 border-gray-200",
        )}
      >
        <p
          className={cx(
            "text-sm font-medium",
            isDark ? "text-slate-300" : "text-gray-700",
          )}
        >
          Consider what was discussed in your consultation and please rate how
          strongly you <strong>AGREE</strong> or <strong>DISAGREE</strong> with
          each of the following statements.
        </p>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Survey Component
// ─────────────────────────────────────────────────────────────────────────────

interface DecisionalConflictSurveyProps {
  answers: DecisionalConflictAnswers;
  onChange: (
    questionId: keyof DecisionalConflictAnswers,
    value: LikertAnswer,
  ) => void;
  onSubmit?: () => void;
  isDark?: boolean;
  physicianName?: string;
  onTrackEvent?: (eventData: {
    eventType: string;
    elementId: string;
    metadata?: Record<string, any>;
  }) => void;
}

export const DecisionalConflictSurvey: React.FC<
  DecisionalConflictSurveyProps
> = ({
  answers,
  onChange,
  onSubmit,
  isDark = false,
  // physicianName removed — survey text now uses generic "your doctor" phrasing
  onTrackEvent,
}) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = React.useState(0);

  const totalQuestions = DCS_QUESTIONS.length;
  const currentQuestion = DCS_QUESTIONS[currentQuestionIndex];
  const currentAnswer =
    answers[currentQuestion.id as keyof DecisionalConflictAnswers];
  const isCurrentAnswered = currentAnswer !== null;
  const isLastQuestion = currentQuestionIndex === totalQuestions - 1;

  const handleNext = () => {
    if (currentQuestionIndex < totalQuestions - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  return (
    <div data-track-proximity="DCS_Survey">
      {/* Header */}
      <div className="mb-6">
        <h3
          className={cx(
            "text-lg font-semibold mb-3",
            isDark ? "text-teal-300" : "text-teal-700",
          )}
        >
          Decisional Conflict Survey
        </h3>
        <p
          className={cx(
            "text-sm mb-2",
            isDark ? "text-slate-300" : "text-gray-700",
          )}
        >
          Below are some questions regarding your recent consultation with your doctor.
        </p>
        <p
          className={cx("text-sm", isDark ? "text-slate-400" : "text-gray-600")}
        >
          Please select a response that best describes how you felt during the
          appointment with your doctor.
        </p>
      </div>

      {/* Current Question */}
      <div className="mb-6">
        <LikertQuestion
          questionNumber={currentQuestionIndex + 1}
          questionText={currentQuestion.text}
          value={answers[currentQuestion.id as keyof DecisionalConflictAnswers]}
          onChange={(v) =>
            onChange(currentQuestion.id as keyof DecisionalConflictAnswers, v)
          }
          isDark={isDark}
          trackingName={`DCS_${currentQuestion.id}`}
          onTrackEvent={onTrackEvent}
        />
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
              isDark ? "text-teal-400" : "text-teal-600",
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
            className="h-2 rounded-full bg-teal-500 transition-all duration-300"
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
                  ? "bg-teal-700 text-teal-100 hover:bg-teal-600"
                  : "bg-teal-600 text-white hover:bg-teal-700"
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
              data-track-proximity="DCS_Submit_Button"
              className={cx(
                "px-8 py-3 rounded-lg text-sm font-semibold transition-all shadow-lg",
                isCurrentAnswered
                  ? isDark
                    ? "bg-teal-700 text-teal-100 hover:bg-teal-600 hover:shadow-xl"
                    : "bg-teal-600 text-white hover:bg-teal-700 hover:shadow-xl"
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

export default DecisionalConflictSurvey;
