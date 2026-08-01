// /**
//  * PatientSatisfactionSurvey.tsx
//  *
//  * Patient Satisfaction survey component.
//  * Collects satisfaction rating and optional free-form feedback.
//  *
//  * Color theme: Indigo
//  */

// import React, { useState } from "react";

// // ─────────────────────────────────────────────────────────────────────────────
// // Types
// // ─────────────────────────────────────────────────────────────────────────────

// export type SatisfactionRating = 1 | 2 | 3 | 4 | 5 | null;

// export interface PatientSatisfactionAnswers {
//   // overallSatisfaction: SatisfactionRating;
//   // reportUnderstandability: SatisfactionRating;
//   // reportHelpfulness: SatisfactionRating;
//   // wouldRecommend: SatisfactionRating;
//   feedbackText: string;
// }

// export const INITIAL_SATISFACTION_ANSWERS: PatientSatisfactionAnswers = {
//   // overallSatisfaction: null,
//   // reportUnderstandability: null,
//   // reportHelpfulness: null,
//   // wouldRecommend: null,
//   feedbackText: "",
// };

// // ─────────────────────────────────────────────────────────────────────────────
// // Constants
// // ─────────────────────────────────────────────────────────────────────────────

// // export const SATISFACTION_QUESTIONS = [
// //   {
// //     id: "overallSatisfaction",
// //     text: "Overall, how satisfied are you with your consultation experience?",
// //     labels: [
// //       "Very Dissatisfied",
// //       "Dissatisfied",
// //       "Neutral",
// //       "Satisfied",
// //       "Very Satisfied",
// //     ],
// //   },
// //   {
// //     id: "reportUnderstandability",
// //     text: "How easy was it to understand the information in the consultation report?",
// //     labels: ["Very Difficult", "Difficult", "Neutral", "Easy", "Very Easy"],
// //   },
// //   {
// //     id: "reportHelpfulness",
// //     text: "How helpful was the report in clarifying the key tradeoffs and risks?",
// //     labels: [
// //       "Not Helpful",
// //       "Slightly Helpful",
// //       "Neutral",
// //       "Helpful",
// //       "Very Helpful",
// //     ],
// //   },
// //   {
// //     id: "wouldRecommend",
// //     text: "Would you recommend this type of consultation report to other patients?",
// //     labels: [
// //       "Definitely Not",
// //       "Probably Not",
// //       "Neutral",
// //       "Probably Yes",
// //       "Definitely Yes",
// //     ],
// //   },
// // ];

// export const SATISFACTION_QUESTIONS = [
//   {
//     id: "feedbackText",
//     text: "We will assess patient satisfaction with the NLP reports using a quantitative Likert scale as well as free-form feedback. The free form feedback will directly query the understandability of reports, whether/how reports clarified the key tradeoffs to be considered, and whether/how it clarified risk of these tradeoffs. Data will be reported descriptively.",
//     type: "freeform",
//   },
// ];

// // ─────────────────────────────────────────────────────────────────────────────
// // Utility Functions
// // ─────────────────────────────────────────────────────────────────────────────

// const cx = (...classes: (string | false | null | undefined)[]) =>
//   classes.filter(Boolean).join(" ");

// // ─────────────────────────────────────────────────────────────────────────────
// // Components
// // ─────────────────────────────────────────────────────────────────────────────

// interface SatisfactionRatingInputProps {
//   questionNumber: number;
//   questionText: string;
//   labels: string[];
//   value: SatisfactionRating;
//   onChange: (value: SatisfactionRating) => void;
//   isDark?: boolean;
//   trackingName?: string;
//   onTrackEvent?: (eventData: {
//     eventType: string;
//     elementId: string;
//     metadata?: Record<string, any>;
//   }) => void;
// }

// export const SatisfactionRatingInput: React.FC<
//   SatisfactionRatingInputProps
// > = ({
//   questionNumber,
//   questionText,
//   labels,
//   value,
//   onChange,
//   isDark = false,
//   trackingName,
//   onTrackEvent,
// }) => {
//   const handleChange = (newValue: SatisfactionRating) => {
//     onChange(newValue);
//     if (onTrackEvent && trackingName) {
//       onTrackEvent({
//         eventType: "satisfaction_answer",
//         elementId: trackingName,
//         metadata: {
//           questionNumber,
//           rating: newValue,
//           ratingLabel: newValue ? labels[newValue - 1] : null,
//         },
//       });
//     }
//   };

//   return (
//     <div
//       data-track-proximity={trackingName}
//       className={cx(
//         "p-6 rounded-xl border transition-all",
//         isDark
//           ? "bg-slate-800 border-slate-700 hover:border-indigo-600"
//           : "bg-white border-gray-200 hover:border-indigo-400"
//       )}
//     >
//       {/* Question Text */}
//       <div className="mb-4">
//         <span
//           className={cx(
//             "inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold mr-2",
//             isDark
//               ? "bg-indigo-900 text-indigo-300 border border-indigo-700"
//               : "bg-indigo-100 text-indigo-700 border border-indigo-200"
//           )}
//         >
//           {questionNumber}
//         </span>
//         <span
//           className={cx(
//             "text-base font-medium",
//             isDark ? "text-slate-200" : "text-gray-800"
//           )}
//         >
//           {questionText}
//         </span>
//       </div>

//       {/* Rating Buttons */}
//       <div className="flex justify-between gap-2">
//         {[1, 2, 3, 4, 5].map((rating) => (
//           <button
//             key={rating}
//             type="button"
//             onClick={() => handleChange(rating as SatisfactionRating)}
//             className={cx(
//               "flex-1 p-3 rounded-lg transition-all border flex flex-col items-center gap-1",
//               value === rating
//                 ? isDark
//                   ? "bg-indigo-700 text-indigo-100 border-indigo-600"
//                   : "bg-indigo-600 text-white border-indigo-600"
//                 : isDark
//                 ? "bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600"
//                 : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
//             )}
//           >
//             <span className="text-2xl">
//               {rating === 1 && "😞"}
//               {rating === 2 && "🙁"}
//               {rating === 3 && "😐"}
//               {rating === 4 && "🙂"}
//               {rating === 5 && "😊"}
//             </span>
//             <span className="text-xs text-center leading-tight">
//               {labels[rating - 1]}
//             </span>
//           </button>
//         ))}
//       </div>
//     </div>
//   );
// };

// // ─────────────────────────────────────────────────────────────────────────────
// // Star Rating Alternative
// // ─────────────────────────────────────────────────────────────────────────────

// interface StarRatingInputProps {
//   questionNumber: number;
//   questionText: string;
//   value: SatisfactionRating;
//   onChange: (value: SatisfactionRating) => void;
//   isDark?: boolean;
//   trackingName?: string;
//   onTrackEvent?: (eventData: {
//     eventType: string;
//     elementId: string;
//     metadata?: Record<string, any>;
//   }) => void;
// }

// export const StarRatingInput: React.FC<StarRatingInputProps> = ({
//   questionNumber,
//   questionText,
//   value,
//   onChange,
//   isDark = false,
//   trackingName,
//   onTrackEvent,
// }) => {
//   const [hoverValue, setHoverValue] = useState<number | null>(null);

//   const handleChange = (newValue: SatisfactionRating) => {
//     onChange(newValue);
//     if (onTrackEvent && trackingName) {
//       onTrackEvent({
//         eventType: "satisfaction_star_rating",
//         elementId: trackingName,
//         metadata: {
//           questionNumber,
//           rating: newValue,
//         },
//       });
//     }
//   };

//   return (
//     <div
//       data-track-proximity={trackingName}
//       className={cx(
//         "p-6 rounded-xl border transition-all",
//         isDark
//           ? "bg-slate-800 border-slate-700 hover:border-indigo-600"
//           : "bg-white border-gray-200 hover:border-indigo-400"
//       )}
//     >
//       {/* Question Text */}
//       <div className="mb-4">
//         <span
//           className={cx(
//             "inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold mr-2",
//             isDark
//               ? "bg-indigo-900 text-indigo-300 border border-indigo-700"
//               : "bg-indigo-100 text-indigo-700 border border-indigo-200"
//           )}
//         >
//           {questionNumber}
//         </span>
//         <span
//           className={cx(
//             "text-base font-medium",
//             isDark ? "text-slate-200" : "text-gray-800"
//           )}
//         >
//           {questionText}
//         </span>
//       </div>

//       {/* Star Rating */}
//       <div className="flex justify-center gap-2">
//         {[1, 2, 3, 4, 5].map((rating) => {
//           const isFilled =
//             (hoverValue !== null ? hoverValue : value ?? 0) >= rating;
//           return (
//             <button
//               key={rating}
//               type="button"
//               onClick={() => handleChange(rating as SatisfactionRating)}
//               onMouseEnter={() => setHoverValue(rating)}
//               onMouseLeave={() => setHoverValue(null)}
//               className={cx(
//                 "w-12 h-12 text-3xl transition-all transform hover:scale-110",
//                 isFilled
//                   ? "text-yellow-400"
//                   : isDark
//                   ? "text-slate-600"
//                   : "text-gray-300"
//               )}
//             >
//               ★
//             </button>
//           );
//         })}
//       </div>
//       {value && (
//         <div
//           className={cx(
//             "text-center mt-2 text-sm",
//             isDark ? "text-indigo-400" : "text-indigo-600"
//           )}
//         >
//           {value} out of 5 stars
//         </div>
//       )}
//     </div>
//   );
// };

// // ─────────────────────────────────────────────────────────────────────────────
// // Feedback Text Input
// // ─────────────────────────────────────────────────────────────────────────────

// interface FeedbackTextInputProps {
//   label: string;
//   placeholder?: string;
//   value: string;
//   onChange: (value: string) => void;
//   isDark?: boolean;
//   trackingName?: string;
//   onTrackEvent?: (eventData: {
//     eventType: string;
//     elementId: string;
//     metadata?: Record<string, any>;
//   }) => void;
// }

// export const FeedbackTextInput: React.FC<FeedbackTextInputProps> = ({
//   label,
//   placeholder = "Please share your thoughts...",
//   value,
//   onChange,
//   isDark = false,
//   trackingName,
//   onTrackEvent,
// }) => {
//   const handleBlur = () => {
//     if (onTrackEvent && trackingName && value.length > 0) {
//       onTrackEvent({
//         eventType: "feedback_text_input",
//         elementId: trackingName,
//         metadata: {
//           textLength: value.length,
//         },
//       });
//     }
//   };

//   return (
//     <div
//       data-track-proximity={trackingName}
//       className={cx(
//         "p-6 rounded-xl border transition-all",
//         isDark
//           ? "bg-slate-800 border-slate-700 hover:border-indigo-600"
//           : "bg-white border-gray-200 hover:border-indigo-400"
//       )}
//     >
//       <label
//         className={cx(
//           "block text-base font-medium mb-3",
//           isDark ? "text-slate-200" : "text-gray-800"
//         )}
//       >
//         <span
//           className={cx(
//             "inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold mr-2",
//             isDark
//               ? "bg-indigo-900 text-indigo-300 border border-indigo-700"
//               : "bg-indigo-100 text-indigo-700 border border-indigo-200"
//           )}
//         >
//           💬
//         </span>
//         {label}
//       </label>
//       <textarea
//         value={value}
//         onChange={(e) => onChange(e.target.value)}
//         onBlur={handleBlur}
//         placeholder={placeholder}
//         rows={4}
//         className={cx(
//           "w-full px-4 py-3 rounded-lg border transition-colors resize-none",
//           isDark
//             ? "bg-slate-900 border-slate-600 text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
//             : "bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
//         )}
//       />
//       <div
//         className={cx(
//           "text-xs mt-2 text-right",
//           isDark ? "text-slate-500" : "text-gray-500"
//         )}
//       >
//         {value.length} characters
//       </div>
//     </div>
//   );
// };

// // ─────────────────────────────────────────────────────────────────────────────
// // Main Survey Component
// // ─────────────────────────────────────────────────────────────────────────────

// interface PatientSatisfactionSurveyProps {
//   answers: PatientSatisfactionAnswers;
//   onChange: (field: keyof PatientSatisfactionAnswers, value: any) => void;
//   onSubmit?: () => void;
//   isDark?: boolean;
//   onTrackEvent?: (eventData: {
//     eventType: string;
//     elementId: string;
//     metadata?: Record<string, any>;
//   }) => void;
// }

// export const PatientSatisfactionSurvey: React.FC<
//   PatientSatisfactionSurveyProps
// > = ({ answers, onChange, onSubmit, isDark = false, onTrackEvent }) => {
//   const ratingQuestions = [
//     "overallSatisfaction",
//     "reportUnderstandability",
//     "reportHelpfulness",
//     "wouldRecommend",
//   ];
//   const answeredCount = ratingQuestions.filter(
//     (q) => answers[q as keyof PatientSatisfactionAnswers] !== null
//   ).length;
//   const totalQuestions = ratingQuestions.length;
//   const isComplete = answeredCount === totalQuestions;

//   return (
//     <div data-track-proximity="PatientSatisfaction_Survey">
//       {/* Header */}
//       <div className="mb-6">
//         <h3
//           className={cx(
//             "text-lg font-semibold mb-2",
//             isDark ? "text-indigo-300" : "text-indigo-700"
//           )}
//         >
//           Patient Satisfaction Survey
//         </h3>
//         <p
//           className={cx("text-sm", isDark ? "text-slate-400" : "text-gray-600")}
//         >
//           Your feedback helps us improve the quality of our consultation
//           reports.
//         </p>
//       </div>

//       {/* Progress Indicator */}
//       <div className="mb-6">
//         <div className="flex justify-between items-center mb-2">
//           <span
//             className={cx(
//               "text-sm font-medium",
//               isDark ? "text-slate-300" : "text-gray-600"
//             )}
//           >
//             Progress
//           </span>
//           <span
//             className={cx(
//               "text-sm font-medium",
//               isDark ? "text-indigo-400" : "text-indigo-600"
//             )}
//           >
//             {answeredCount} / {totalQuestions}
//           </span>
//         </div>
//         <div
//           className={cx(
//             "w-full h-2 rounded-full",
//             isDark ? "bg-slate-700" : "bg-gray-200"
//           )}
//         >
//           <div
//             className="h-2 rounded-full bg-indigo-500 transition-all duration-300"
//             style={{ width: `${(answeredCount / totalQuestions) * 100}%` }}
//           />
//         </div>
//       </div>

//       {/* Rating Questions */}
//       <div className="space-y-6">
//         {SATISFACTION_QUESTIONS.map((q, idx) => (
//           <SatisfactionRatingInput
//             key={q.id}
//             questionNumber={idx + 1}
//             questionText={q.text}
//             labels={q.labels}
//             value={
//               answers[
//                 q.id as keyof PatientSatisfactionAnswers
//               ] as SatisfactionRating
//             }
//             onChange={(v) =>
//               onChange(q.id as keyof PatientSatisfactionAnswers, v)
//             }
//             isDark={isDark}
//             trackingName={`Satisfaction_${q.id}`}
//             onTrackEvent={onTrackEvent}
//           />
//         ))}

//         {/* Free-form Feedback */}
//         <FeedbackTextInput
//           label="Additional Comments (Optional)"
//           placeholder="Please share any additional feedback about your experience with the consultation report..."
//           value={answers.feedbackText}
//           onChange={(v) => onChange("feedbackText", v)}
//           isDark={isDark}
//           trackingName="Satisfaction_FeedbackText"
//           onTrackEvent={onTrackEvent}
//         />
//       </div>

//       {/* Submit Button */}
//       {onSubmit && (
//         <div className="mt-10 flex justify-center">
//           <button
//             onClick={onSubmit}
//             disabled={!isComplete}
//             data-track-proximity="Satisfaction_Submit_Button"
//             className={cx(
//               "px-8 py-4 rounded-lg text-lg font-semibold transition-all shadow-lg",
//               isComplete
//                 ? isDark
//                   ? "bg-indigo-700 text-indigo-100 hover:bg-indigo-600 hover:shadow-xl"
//                   : "bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-xl"
//                 : isDark
//                 ? "bg-slate-700 text-slate-500 cursor-not-allowed"
//                 : "bg-gray-300 text-gray-500 cursor-not-allowed"
//             )}
//           >
//             {isComplete
//               ? "Submit Feedback"
//               : `Complete all ${totalQuestions} ratings`}
//           </button>
//         </div>
//       )}
//     </div>
//   );
// };

// export default PatientSatisfactionSurvey;

/**
 * PatientSatisfactionSurvey.tsx
 *
 * Patient Satisfaction survey component.
 * Collects free-form feedback only.
 *
 * Color theme: Indigo
 */

import React from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PatientSatisfactionAnswers {
  feedbackText: string;
}

export const INITIAL_SATISFACTION_ANSWERS: PatientSatisfactionAnswers = {
  feedbackText: "",
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const SATISFACTION_QUESTION_TEXT =
  "We will assess patient satisfaction with the NLP reports using a quantitative Likert scale as well as free-form feedback. The free form feedback will directly query the understandability of reports, whether/how reports clarified the key tradeoffs to be considered, and whether/how it clarified risk of these tradeoffs. Data will be reported descriptively.";

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");

// ─────────────────────────────────────────────────────────────────────────────
// Feedback Text Input Component
// ─────────────────────────────────────────────────────────────────────────────

interface FeedbackTextInputProps {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  isDark?: boolean;
  trackingName?: string;
  onTrackEvent?: (eventData: {
    eventType: string;
    elementId: string;
    metadata?: Record<string, any>;
  }) => void;
}

export const FeedbackTextInput: React.FC<FeedbackTextInputProps> = ({
  label,
  placeholder = "Please share your thoughts...",
  value,
  onChange,
  isDark = false,
  trackingName,
  onTrackEvent,
}) => {
  const handleBlur = () => {
    if (onTrackEvent && trackingName && value.length > 0) {
      onTrackEvent({
        eventType: "feedback_text_input",
        elementId: trackingName,
        metadata: {
          textLength: value.length,
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
          ? "bg-slate-800 border-slate-700 hover:border-indigo-600"
          : "bg-white border-gray-200 hover:border-indigo-400",
      )}
    >
      <label
        className={cx(
          "block text-base font-medium mb-3",
          isDark ? "text-slate-200" : "text-gray-800",
        )}
      >
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={handleBlur}
        placeholder={placeholder}
        rows={4}
        className={cx(
          "w-full px-4 py-3 rounded-lg border transition-colors resize-none",
          isDark
            ? "bg-slate-900 border-slate-600 text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            : "bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20",
        )}
      />
      <div
        className={cx(
          "text-xs mt-2 text-right",
          isDark ? "text-slate-500" : "text-gray-500",
        )}
      >
        {value.length} characters
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Survey Component
// ─────────────────────────────────────────────────────────────────────────────

interface PatientSatisfactionSurveyProps {
  answers: PatientSatisfactionAnswers;
  onChange: (field: keyof PatientSatisfactionAnswers, value: string) => void;
  onSubmit?: () => void;
  isDark?: boolean;
  onTrackEvent?: (eventData: {
    eventType: string;
    elementId: string;
    metadata?: Record<string, any>;
  }) => void;
  // One-way (forward-only) mode for the combined Total Survey. This survey has
  // no internal Prev/Back button and keeps its final "Submit Feedback" label, so
  // the flag currently makes no visual change; it is accepted for API parity with
  // the other one-way survey sections. Defaults to false.
  oneWay?: boolean;
  /** True once finally submitted; locks answers read-only. */
  locked?: boolean;
}

export const PatientSatisfactionSurvey: React.FC<
  PatientSatisfactionSurveyProps
> = ({
  answers,
  onChange,
  onSubmit,
  isDark = false,
  onTrackEvent,
  locked = false,
}) => {
  // Survey is complete when feedback text has content. Guard against a missing
  // feedbackText (e.g. restored/legacy rows that never had the field) so the
  // component never crashes on `.trim()` of undefined.
  const isComplete = (answers.feedbackText ?? "").trim().length > 0;

  // Empty-feedback gate — keep button clickable so handleSubmitClick
  // can show this popup; the gray styling stays as a visual cue.
  const [incompleteDialog, setIncompleteDialog] = React.useState(false);

  const handleSubmitClick = () => {
    if (locked) return; // finalized: no re-submit
    if (!isComplete) {
      setIncompleteDialog(true);
      return;
    }
    onSubmit?.();
  };

  return (
    <div data-track-proximity="PatientSatisfaction_Survey">
      {locked && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          You have already submitted this survey — your answers are locked.
        </div>
      )}
      {/* Free-form Feedback */}
      <div className={cx("space-y-6", locked && "pointer-events-none opacity-70")}>
        <FeedbackTextInput
          label="Please share your feedback"
          placeholder="Please share any feedback about your experience with the consultation report..."
          value={answers.feedbackText ?? ""}
          onChange={(v) => onChange("feedbackText", v)}
          isDark={isDark}
          trackingName="Satisfaction_FeedbackText"
          onTrackEvent={onTrackEvent}
        />
      </div>

      {/* Submit Button */}
      {onSubmit && (
        <div className="mt-10 flex justify-center">
          <button
            onClick={handleSubmitClick}
            disabled={locked}
            data-track-proximity="Satisfaction_Submit_Button"
            className={cx(
              "px-8 py-4 rounded-lg text-lg font-semibold transition-all shadow-lg",
              isComplete
                ? isDark
                  ? "bg-indigo-700 text-indigo-100 hover:bg-indigo-600 hover:shadow-xl"
                  : "bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-xl"
                : isDark
                  ? "bg-slate-700 text-slate-500"
                  : "bg-gray-300 text-gray-500",
            )}
          >
            {locked
              ? "Submitted"
              : isComplete
                ? "Submit Feedback"
                : "Please enter feedback to submit"}
          </button>
        </div>
      )}

      {incompleteDialog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="satisfaction-incomplete-title"
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
              id="satisfaction-incomplete-title"
              className="text-lg font-semibold mb-3"
            >
              Please share your feedback
            </h3>
            <p
              className={cx(
                "text-sm mb-5",
                isDark ? "text-slate-300" : "text-gray-600",
              )}
            >
              Please enter your feedback in the text box above before
              submitting the survey.
            </p>
            <button
              type="button"
              autoFocus
              className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-4 py-2 transition-colors"
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

export default PatientSatisfactionSurvey;
