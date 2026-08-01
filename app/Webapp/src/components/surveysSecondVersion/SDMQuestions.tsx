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
import { ChevronLeft } from "lucide-react";

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
      eventType: "survey_answer",
      elementId: trackingName,
      metadata: { survey: "sdm", questionId: `q${questionNumber}`, questionNumber, answer, questionType: "yes_no" },
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
      eventType: "survey_answer",
      elementId: trackingName,
      metadata: { survey: "sdm", questionId: `q${questionNumber}`, questionNumber, answer, questionType: "scale" },
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
  onProgressSave?: () => void;
  isDark?: boolean;
  interventionName?: string;
  onTrackEvent?: (eventData: {
    eventType: string;
    elementId: string;
    metadata?: Record<string, any>;
  }) => void;
  // Pattern A behavior tracking — fires whenever the visible question changes
  // (initial mount + every Next/Prev navigation). The parent uses this to log
  // a survey_step_view event with survey_type="sdm".
  onQuestionView?: (questionId: string, index: number) => void;
  // One-way (forward-only) mode for the combined Total Survey. When true, the
  // internal Previous button is hidden and the final Submit button is relabelled
  // to make clear it also advances to the next survey section. Defaults to false
  // so existing callers (e.g. V31Re) keep the current two-way behavior.
  oneWay?: boolean;
  /** True once finally submitted; locks answers read-only (no edits/re-submit). */
  locked?: boolean;
}

export const SDMSurvey: React.FC<SDMSurveyProps> = ({
  answers,
  onChange,
  onSubmit,
  onProgressSave,
  isDark = false,
  interventionName = "[intervention]",
  onTrackEvent,
  onQuestionView,
  oneWay = false,
  locked = false,
}) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = React.useState(0);

  const totalQuestions = SDM_QUESTIONS.length;
  const currentQuestion = SDM_QUESTIONS[currentQuestionIndex];

  React.useEffect(() => {
    onQuestionView?.(currentQuestion.id, currentQuestionIndex);
    // Fire only when the question actually changes — NOT on every re-render.
    // onQuestionView is an inline callback from the parent (new reference each
    // render), so keeping it in the deps re-fired this on every answer/re-render
    // and produced duplicate survey_step_view rows. Intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestionIndex, currentQuestion.id]);
  const currentAnswer = answers[currentQuestion.id as keyof SDMAnswers];
  // Treat both null (initial) and undefined (missing/partial-restore) as
  // unanswered, so the Next/Submit gate only opens once an answer is chosen.
  const isCurrentAnswered =
    currentAnswer !== null && currentAnswer !== undefined;
  const isLastQuestion = currentQuestionIndex === totalQuestions - 1;

  // Per-question Next/Submit gate: button stays clickable so handleNext
  // can show this popup when the patient hasn't answered yet. The grey
  // visual styling below is kept as a cue — the popup is the explanation.
  const [incompleteDialog, setIncompleteDialog] = React.useState(false);

  const formatQuestion = (text: string) =>
    text.replace(/\[intervention\]/g, interventionName);

  const handleNext = () => {
    if (!isCurrentAnswered) {
      setIncompleteDialog(true);
      return;
    }
    if (currentQuestionIndex < totalQuestions - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      onProgressSave?.();
    }
  };

  const handleSubmitClick = () => {
    if (locked) return; // finalized: no re-submit
    if (!isCurrentAnswered) {
      setIncompleteDialog(true);
      return;
    }
    onSubmit?.();
  };

  const handlePrev = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  return (
    <div data-track-proximity="SDM_Survey">
      {locked && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          You have already submitted this survey — your answers are locked.
        </div>
      )}
      {/* Current Question */}
      <div className={cx("mb-6", locked && "pointer-events-none opacity-70")}>
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
      <div className="flex justify-between">
        {currentQuestionIndex > 0 ? (
          <button
            onClick={handlePrev}
            className={cx(
              "flex items-center gap-1 px-6 py-3 rounded-lg text-sm font-semibold transition-all border",
              isDark
                ? "border-purple-700 text-purple-300 hover:bg-purple-900/30"
                : "border-purple-300 text-purple-600 hover:bg-purple-50",
            )}
          >
            <ChevronLeft size={16} />
            Previous
          </button>
        ) : (
          <div />
        )}
        {!isLastQuestion ? (
          <button
            onClick={handleNext}
            className={cx(
              "px-6 py-3 rounded-lg text-sm font-semibold transition-all",
              isCurrentAnswered
                ? isDark
                  ? "bg-purple-700 text-purple-100 hover:bg-purple-600"
                  : "bg-purple-600 text-white hover:bg-purple-700"
                : isDark
                  ? "bg-slate-700 text-slate-500"
                  : "bg-gray-300 text-gray-500",
            )}
          >
            Next
          </button>
        ) : (
          onSubmit && (
            <button
              onClick={handleSubmitClick}
              disabled={!isCurrentAnswered || locked}
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
              {locked
                ? "Submitted"
                : oneWay
                  ? "Submit & continue to next section"
                  : "Submit Responses"}
            </button>
          )
        )}
      </div>

      {incompleteDialog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sdm-incomplete-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setIncompleteDialog(false)}
        >
          <div
            className={cx(
              "w-full max-w-md rounded-2xl shadow-2xl p-6",
              isDark
                ? "bg-slate-900 border border-slate-700 text-slate-100"
                : "bg-white border border-gray-200 text-gray-900",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="sdm-incomplete-title"
              className="text-lg font-semibold mb-3"
            >
              Please answer this question
            </h3>
            <p
              className={cx(
                "text-sm mb-5",
                isDark ? "text-slate-300" : "text-gray-600",
              )}
            >
              Please select an answer before continuing to the next question.
            </p>
            <button
              type="button"
              autoFocus
              className="w-full rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium px-4 py-2 transition-colors"
              onClick={() => setIncompleteDialog(false)}
            >
              OK
            </button>
          </div>
        </div>
      )}
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
