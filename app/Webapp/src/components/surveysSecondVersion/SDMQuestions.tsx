// "use client";

// /**
//  * SDMQuestions.tsx
//  *
//  * Shared Decision Making (SDM) questionnaire components
//  * - YesNoQuestion: Binary choice question
//  * - ScaleQuestion: 4-point scale question (A lot / Some / A little / Not at all)
//  */

// import React from "react";

// // ─────────────────────────────────────────────────────────────────────────────
// // Types
// // ─────────────────────────────────────────────────────────────────────────────

// export type YesNoAnswer = "yes" | "no" | null;
// export type ScaleAnswer = "a_lot" | "some" | "a_little" | "not_at_all" | null;

// export interface SDMAnswers {
//   q1: YesNoAnswer;
//   q2: ScaleAnswer;
//   q3: ScaleAnswer;
//   q4: YesNoAnswer;
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // Constants
// // ─────────────────────────────────────────────────────────────────────────────

// export const SDM_QUESTIONS = [
//   {
//     id: "q1",
//     type: "yesno" as const,
//     text: "Did the health care provider explain there were choices in what you could do to treat your condition? OR Did the health care provider talk about [intervention] as an option for you?",
//   },
//   {
//     id: "q2",
//     type: "scale" as const,
//     text: "How much did you and the health care provider talk about the reasons you might want to have [intervention]?",
//   },
//   {
//     id: "q3",
//     type: "scale" as const,
//     text: "How much did you and the health care provider talk about the reasons you might not want to have [intervention]?",
//   },
//   {
//     id: "q4",
//     type: "yesno" as const,
//     text: "Did the health care provider ask you whether or not you wanted to have [intervention]?",
//   },
// ];

// // ─────────────────────────────────────────────────────────────────────────────
// // Utility
// // ─────────────────────────────────────────────────────────────────────────────

// const cx = (...classes: (string | false | null | undefined)[]) =>
//   classes.filter(Boolean).join(" ");

// // ─────────────────────────────────────────────────────────────────────────────
// // YesNoQuestion Component
// // ─────────────────────────────────────────────────────────────────────────────

// interface YesNoQuestionProps {
//   questionNumber: number;
//   questionText: string;
//   value: YesNoAnswer;
//   onChange: (value: YesNoAnswer) => void;
//   isDark?: boolean;
//   trackingName: string;
//   onTrackEvent?: (eventData: {
//     eventType: string;
//     elementId: string;
//     metadata?: Record<string, any>;
//   }) => void;
// }

// export const YesNoQuestion: React.FC<YesNoQuestionProps> = ({
//   questionNumber,
//   questionText,
//   value,
//   onChange,
//   isDark,
//   trackingName,
//   onTrackEvent,
// }) => {
//   const handleChange = (answer: YesNoAnswer) => {
//     onChange(answer);
//     onTrackEvent?.({
//       eventType: "sdm_answer",
//       elementId: trackingName,
//       metadata: { questionNumber, answer, questionType: "yes_no" },
//     });
//   };

//   return (
//     <div
//       data-track-proximity={trackingName}
//       className={cx(
//         "p-6 rounded-xl border transition-all",
//         isDark
//           ? "bg-slate-800 border-slate-700 hover:border-purple-600"
//           : "bg-white border-gray-200 hover:border-purple-400"
//       )}
//     >
//       <div className="flex items-start gap-4">
//         <span
//           className={cx(
//             "inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold flex-shrink-0",
//             isDark
//               ? "bg-purple-900 text-purple-300 border border-purple-700"
//               : "bg-purple-100 text-purple-700 border border-purple-200"
//           )}
//         >
//           {questionNumber}
//         </span>
//         <div className="flex-1">
//           <p
//             className={cx(
//               "text-base font-medium mb-4",
//               isDark ? "text-slate-200" : "text-gray-800"
//             )}
//           >
//             {questionText}
//           </p>
//           <div className="flex gap-6">
//             {[
//               { value: "yes" as const, label: "Yes" },
//               { value: "no" as const, label: "No" },
//             ].map((option) => (
//               <label
//                 key={option.value}
//                 className="flex items-center gap-2 cursor-pointer group"
//               >
//                 <div
//                   className={cx(
//                     "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
//                     value === option.value
//                       ? isDark
//                         ? "border-purple-500 bg-purple-600"
//                         : "border-purple-600 bg-purple-600"
//                       : isDark
//                       ? "border-slate-500 group-hover:border-purple-400"
//                       : "border-gray-400 group-hover:border-purple-500"
//                   )}
//                   onClick={() => handleChange(option.value)}
//                 >
//                   {value === option.value && (
//                     <div className="w-2 h-2 rounded-full bg-white" />
//                   )}
//                 </div>
//                 <span
//                   className={cx(
//                     "text-sm font-medium",
//                     isDark ? "text-slate-300" : "text-gray-700"
//                   )}
//                 >
//                   {option.label}
//                 </span>
//               </label>
//             ))}
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// };

// // ─────────────────────────────────────────────────────────────────────────────
// // ScaleQuestion Component
// // ─────────────────────────────────────────────────────────────────────────────

// interface ScaleQuestionProps {
//   questionNumber: number;
//   questionText: string;
//   value: ScaleAnswer;
//   onChange: (value: ScaleAnswer) => void;
//   isDark?: boolean;
//   trackingName: string;
//   onTrackEvent?: (eventData: {
//     eventType: string;
//     elementId: string;
//     metadata?: Record<string, any>;
//   }) => void;
// }

// const SCALE_OPTIONS: { value: ScaleAnswer; label: string }[] = [
//   { value: "a_lot", label: "A lot" },
//   { value: "some", label: "Some" },
//   { value: "a_little", label: "A little" },
//   { value: "not_at_all", label: "Not at all" },
// ];

// export const ScaleQuestion: React.FC<ScaleQuestionProps> = ({
//   questionNumber,
//   questionText,
//   value,
//   onChange,
//   isDark,
//   trackingName,
//   onTrackEvent,
// }) => {
//   const handleChange = (answer: ScaleAnswer) => {
//     onChange(answer);
//     onTrackEvent?.({
//       eventType: "sdm_answer",
//       elementId: trackingName,
//       metadata: { questionNumber, answer, questionType: "scale" },
//     });
//   };

//   return (
//     <div
//       data-track-proximity={trackingName}
//       className={cx(
//         "p-6 rounded-xl border transition-all",
//         isDark
//           ? "bg-slate-800 border-slate-700 hover:border-purple-600"
//           : "bg-white border-gray-200 hover:border-purple-400"
//       )}
//     >
//       <div className="flex items-start gap-4">
//         <span
//           className={cx(
//             "inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold flex-shrink-0",
//             isDark
//               ? "bg-purple-900 text-purple-300 border border-purple-700"
//               : "bg-purple-100 text-purple-700 border border-purple-200"
//           )}
//         >
//           {questionNumber}
//         </span>
//         <div className="flex-1">
//           <p
//             className={cx(
//               "text-base font-medium mb-4",
//               isDark ? "text-slate-200" : "text-gray-800"
//             )}
//           >
//             {questionText}
//           </p>
//           <div className="flex flex-wrap gap-4">
//             {SCALE_OPTIONS.map((option) => (
//               <label
//                 key={option.value}
//                 className="flex items-center gap-2 cursor-pointer group"
//               >
//                 <div
//                   className={cx(
//                     "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
//                     value === option.value
//                       ? isDark
//                         ? "border-purple-500 bg-purple-600"
//                         : "border-purple-600 bg-purple-600"
//                       : isDark
//                       ? "border-slate-500 group-hover:border-purple-400"
//                       : "border-gray-400 group-hover:border-purple-500"
//                   )}
//                   onClick={() => handleChange(option.value)}
//                 >
//                   {value === option.value && (
//                     <div className="w-2 h-2 rounded-full bg-white" />
//                   )}
//                 </div>
//                 <span
//                   className={cx(
//                     "text-sm font-medium",
//                     isDark ? "text-slate-300" : "text-gray-700"
//                   )}
//                 >
//                   {option.label}
//                 </span>
//               </label>
//             ))}
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// };

// // ─────────────────────────────────────────────────────────────────────────────
// // Default Export
// // ─────────────────────────────────────────────────────────────────────────────

// export default {
//   YesNoQuestion,
//   ScaleQuestion,
//   SDM_QUESTIONS,
// };

"use client";

/**
 * SDMQuestions.tsx
 *
 * Shared Decision Making (SDM) questionnaire components
 * - YesNoQuestion: Binary choice question
 * - ScaleQuestion: 4-point scale question (A lot / Some / A little / Not at all)
 * - SDMSurvey: Main survey component with progress and submit button
 */

import React from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type YesNoAnswer = "yes" | "no" | null;
export type ScaleAnswer = "a_lot" | "some" | "a_little" | "not_at_all" | null;

export interface SDMAnswers {
  q1: YesNoAnswer;
  q2: ScaleAnswer;
  q3: ScaleAnswer;
  q4: YesNoAnswer;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const SDM_QUESTIONS = [
  {
    id: "q1",
    type: "yesno" as const,
    text: "Did the health care provider explain there were choices in what you could do to treat your condition? OR Did the health care provider talk about [intervention] as an option for you?",
  },
  {
    id: "q2",
    type: "scale" as const,
    text: "How much did you and the health care provider talk about the reasons you might want to have [intervention]?",
  },
  {
    id: "q3",
    type: "scale" as const,
    text: "How much did you and the health care provider talk about the reasons you might not want to have [intervention]?",
  },
  {
    id: "q4",
    type: "yesno" as const,
    text: "Did the health care provider ask you whether or not you wanted to have [intervention]?",
  },
];

export const INITIAL_SDM_ANSWERS: SDMAnswers = {
  q1: null,
  q2: null,
  q3: null,
  q4: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");

// ─────────────────────────────────────────────────────────────────────────────
// YesNoQuestion Component
// ─────────────────────────────────────────────────────────────────────────────

interface YesNoQuestionProps {
  questionNumber: number;
  questionText: string;
  value: YesNoAnswer;
  onChange: (value: YesNoAnswer) => void;
  isDark?: boolean;
  trackingName: string;
  onTrackEvent?: (eventData: {
    eventType: string;
    elementId: string;
    metadata?: Record<string, any>;
  }) => void;
}

export const YesNoQuestion: React.FC<YesNoQuestionProps> = ({
  questionNumber,
  questionText,
  value,
  onChange,
  isDark,
  trackingName,
  onTrackEvent,
}) => {
  const handleChange = (answer: YesNoAnswer) => {
    onChange(answer);
    onTrackEvent?.({
      eventType: "sdm_answer",
      elementId: trackingName,
      metadata: { questionNumber, answer, questionType: "yes_no" },
    });
  };

  return (
    <div
      data-track-proximity={trackingName}
      className={cx(
        "p-6 rounded-xl border transition-all",
        isDark
          ? "bg-slate-800 border-slate-700 hover:border-purple-600"
          : "bg-white border-gray-200 hover:border-purple-400",
      )}
    >
      <div className="flex items-start gap-4">
        <span
          className={cx(
            "inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold flex-shrink-0",
            isDark
              ? "bg-purple-900 text-purple-300 border border-purple-700"
              : "bg-purple-100 text-purple-700 border border-purple-200",
          )}
        >
          {questionNumber}
        </span>
        <div className="flex-1">
          <p
            className={cx(
              "text-base font-medium mb-4",
              isDark ? "text-slate-200" : "text-gray-800",
            )}
          >
            {questionText}
          </p>
          <div className="flex gap-6">
            {[
              { value: "yes" as const, label: "Yes" },
              { value: "no" as const, label: "No" },
            ].map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-2 cursor-pointer group"
              >
                <div
                  className={cx(
                    "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                    value === option.value
                      ? isDark
                        ? "border-purple-500 bg-purple-600"
                        : "border-purple-600 bg-purple-600"
                      : isDark
                        ? "border-slate-500 group-hover:border-purple-400"
                        : "border-gray-400 group-hover:border-purple-500",
                  )}
                  onClick={() => handleChange(option.value)}
                >
                  {value === option.value && (
                    <div className="w-2 h-2 rounded-full bg-white" />
                  )}
                </div>
                <span
                  className={cx(
                    "text-sm font-medium",
                    isDark ? "text-slate-300" : "text-gray-700",
                  )}
                >
                  {option.label}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ScaleQuestion Component
// ─────────────────────────────────────────────────────────────────────────────

interface ScaleQuestionProps {
  questionNumber: number;
  questionText: string;
  value: ScaleAnswer;
  onChange: (value: ScaleAnswer) => void;
  isDark?: boolean;
  trackingName: string;
  onTrackEvent?: (eventData: {
    eventType: string;
    elementId: string;
    metadata?: Record<string, any>;
  }) => void;
}

const SCALE_OPTIONS: { value: ScaleAnswer; label: string }[] = [
  { value: "a_lot", label: "A lot" },
  { value: "some", label: "Some" },
  { value: "a_little", label: "A little" },
  { value: "not_at_all", label: "Not at all" },
];

export const ScaleQuestion: React.FC<ScaleQuestionProps> = ({
  questionNumber,
  questionText,
  value,
  onChange,
  isDark,
  trackingName,
  onTrackEvent,
}) => {
  const handleChange = (answer: ScaleAnswer) => {
    onChange(answer);
    onTrackEvent?.({
      eventType: "sdm_answer",
      elementId: trackingName,
      metadata: { questionNumber, answer, questionType: "scale" },
    });
  };

  return (
    <div
      data-track-proximity={trackingName}
      className={cx(
        "p-6 rounded-xl border transition-all",
        isDark
          ? "bg-slate-800 border-slate-700 hover:border-purple-600"
          : "bg-white border-gray-200 hover:border-purple-400",
      )}
    >
      <div className="flex items-start gap-4">
        <span
          className={cx(
            "inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold flex-shrink-0",
            isDark
              ? "bg-purple-900 text-purple-300 border border-purple-700"
              : "bg-purple-100 text-purple-700 border border-purple-200",
          )}
        >
          {questionNumber}
        </span>
        <div className="flex-1">
          <p
            className={cx(
              "text-base font-medium mb-4",
              isDark ? "text-slate-200" : "text-gray-800",
            )}
          >
            {questionText}
          </p>
          <div className="flex flex-wrap gap-4">
            {SCALE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-2 cursor-pointer group"
              >
                <div
                  className={cx(
                    "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                    value === option.value
                      ? isDark
                        ? "border-purple-500 bg-purple-600"
                        : "border-purple-600 bg-purple-600"
                      : isDark
                        ? "border-slate-500 group-hover:border-purple-400"
                        : "border-gray-400 group-hover:border-purple-500",
                  )}
                  onClick={() => handleChange(option.value)}
                >
                  {value === option.value && (
                    <div className="w-2 h-2 rounded-full bg-white" />
                  )}
                </div>
                <span
                  className={cx(
                    "text-sm font-medium",
                    isDark ? "text-slate-300" : "text-gray-700",
                  )}
                >
                  {option.label}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Survey Component
// ─────────────────────────────────────────────────────────────────────────────

interface SDMSurveyProps {
  answers: SDMAnswers;
  onChange: (
    questionId: keyof SDMAnswers,
    value: YesNoAnswer | ScaleAnswer,
  ) => void;
  onSubmit?: () => void;
  isDark?: boolean;
  interventionName?: string;
  onTrackEvent?: (eventData: {
    eventType: string;
    elementId: string;
    metadata?: Record<string, any>;
  }) => void;
}

export const SDMSurvey: React.FC<SDMSurveyProps> = ({
  answers,
  onChange,
  onSubmit,
  isDark = false,
  interventionName = "[intervention]",
  onTrackEvent,
}) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = React.useState(0);

  const totalQuestions = SDM_QUESTIONS.length;
  const currentQuestion = SDM_QUESTIONS[currentQuestionIndex];
  const currentAnswer = answers[currentQuestion.id as keyof SDMAnswers];
  const isCurrentAnswered = currentAnswer !== null;
  const isLastQuestion = currentQuestionIndex === totalQuestions - 1;

  const formatQuestion = (text: string) =>
    text.replace(/\[intervention\]/g, interventionName);

  const handleNext = () => {
    if (currentQuestionIndex < totalQuestions - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  return (
    <div data-track-proximity="SDM_Survey">
      {/* Header */}
      <div className="mb-6">
        <h3
          className={cx(
            "text-lg font-semibold mb-2",
            isDark ? "text-purple-300" : "text-purple-700",
          )}
        >
          Shared Decision Making Survey
        </h3>
        <p
          className={cx("text-sm", isDark ? "text-slate-400" : "text-gray-600")}
        >
          Please answer the following questions about your consultation
          experience.
        </p>
      </div>

      {/* Current Question */}
      <div className="mb-6">
        {currentQuestion.type === "yesno" ? (
          <YesNoQuestion
            questionNumber={currentQuestionIndex + 1}
            questionText={formatQuestion(currentQuestion.text)}
            value={
              answers[currentQuestion.id as keyof SDMAnswers] as YesNoAnswer
            }
            onChange={(v) =>
              onChange(currentQuestion.id as keyof SDMAnswers, v)
            }
            isDark={isDark}
            trackingName={`SDM_${currentQuestion.id}`}
            onTrackEvent={onTrackEvent}
          />
        ) : (
          <ScaleQuestion
            questionNumber={currentQuestionIndex + 1}
            questionText={formatQuestion(currentQuestion.text)}
            value={
              answers[currentQuestion.id as keyof SDMAnswers] as ScaleAnswer
            }
            onChange={(v) =>
              onChange(currentQuestion.id as keyof SDMAnswers, v)
            }
            isDark={isDark}
            trackingName={`SDM_${currentQuestion.id}`}
            onTrackEvent={onTrackEvent}
          />
        )}
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
              isDark ? "text-purple-400" : "text-purple-600",
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
            className="h-2 rounded-full bg-purple-500 transition-all duration-300"
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
                  ? "bg-purple-700 text-purple-100 hover:bg-purple-600"
                  : "bg-purple-600 text-white hover:bg-purple-700"
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
              data-track-proximity="SDM_Submit_Button"
              className={cx(
                "px-8 py-3 rounded-lg text-sm font-semibold transition-all shadow-lg",
                isCurrentAnswered
                  ? isDark
                    ? "bg-purple-700 text-purple-100 hover:bg-purple-600 hover:shadow-xl"
                    : "bg-purple-600 text-white hover:bg-purple-700 hover:shadow-xl"
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

// ─────────────────────────────────────────────────────────────────────────────
// Default Export
// ─────────────────────────────────────────────────────────────────────────────

export default {
  YesNoQuestion,
  ScaleQuestion,
  SDMSurvey,
  SDM_QUESTIONS,
  INITIAL_SDM_ANSWERS,
};
