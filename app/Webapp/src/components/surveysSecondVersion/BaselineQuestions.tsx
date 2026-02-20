"use client";

/**
 * BaselineQuestions.tsx
 *
 * Baseline Information demographic survey components
 * - BaselineRadioGroup: Single-select radio buttons
 * - BaselineCheckboxGroup: Multi-select checkboxes
 * - BaselineTextInput: Text input for "Other" specification
 */

import React from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SexAtBirthAnswer = "male" | "female" | "prefer_not_to_say" | null;

export type EducationAnswer =
  | "eighth_grade_or_less"
  | "some_high_school"
  | "high_school_graduate"
  | "some_college"
  | "associates_degree"
  | "bachelors_degree"
  | "masters_or_above"
  | null;

export type MaritalStatusAnswer =
  | "single"
  | "married"
  | "widowed"
  | "divorced"
  | null;

export interface BaselineAnswers {
  sexAtBirth: SexAtBirthAnswer;
  race: string[];
  education: EducationAnswer;
  maritalStatus: MaritalStatusAnswer;
  employment: string[];
  employmentOther: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const BASELINE_OPTIONS = {
  sexAtBirth: [
    { value: "male", label: "Male" },
    { value: "female", label: "Female" },
    { value: "prefer_not_to_say", label: "Prefer not to say" },
  ],
  race: [
    { value: "american_indian", label: "American Indian or Alaska Native" },
    { value: "asian", label: "Asian" },
    { value: "black", label: "Black or African American" },
    {
      value: "pacific_islander",
      label: "Native Hawaiian or Other Pacific Islander",
    },
    { value: "white", label: "White" },
    { value: "unknown", label: "Unknown or Not Reported" },
    { value: "prefer_not_to_answer", label: "Prefer not to answer" },
  ],
  education: [
    { value: "eighth_grade_or_less", label: "Eighth grade or less" },
    { value: "some_high_school", label: "Completed some high school" },
    {
      value: "high_school_graduate",
      label: "High school graduate (includes equivalency)",
    },
    { value: "some_college", label: "Some college, no degree" },
    { value: "associates_degree", label: "Associate's degree" },
    { value: "bachelors_degree", label: "Bachelor's degree" },
    {
      value: "masters_or_above",
      label: "Master's degree or other advanced degree",
    },
  ],
  maritalStatus: [
    { value: "single", label: "Single, never married" },
    {
      value: "married",
      label: "Married, domestic partnership, or long-term relationship",
    },
    { value: "widowed", label: "Widowed" },
    { value: "divorced", label: "Divorced or separated" },
  ],
  employment: [
    { value: "unemployed", label: "Unemployed" },
    { value: "homemaker", label: "Homemaker" },
    {
      value: "full_time",
      label: "Full-time employment or full-time student (40+ hrs/week)",
    },
    {
      value: "part_time",
      label: "Part-time employment or part-time student (<40 hrs/week)",
    },
    { value: "retired", label: "Retired" },
    { value: "unable_to_work", label: "Unable to work or on disability" },
    { value: "leave_of_absence", label: "On leave of absence from work" },
    { value: "military", label: "Military" },
    { value: "other", label: "Other" },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");

// ─────────────────────────────────────────────────────────────────────────────
// BaselineRadioGroup Component
// ─────────────────────────────────────────────────────────────────────────────

interface BaselineRadioGroupProps {
  questionText: string;
  options: { value: string; label: string }[];
  value: string | null;
  onChange: (value: string) => void;
  isDark?: boolean;
  trackingName: string;
  onTrackEvent?: (eventData: {
    eventType: string;
    elementId: string;
    metadata?: Record<string, any>;
  }) => void;
}

export const BaselineRadioGroup: React.FC<BaselineRadioGroupProps> = ({
  questionText,
  options,
  value,
  onChange,
  isDark,
  trackingName,
  onTrackEvent,
}) => {
  const handleChange = (answer: string) => {
    onChange(answer);
    onTrackEvent?.({
      eventType: "baseline_answer",
      elementId: trackingName,
      metadata: { answer, questionType: "radio" },
    });
  };

  return (
    <div
      data-track-proximity={trackingName}
      className={cx(
        "p-6 rounded-xl border transition-all",
        isDark
          ? "bg-slate-800 border-slate-700 hover:border-amber-600"
          : "bg-white border-gray-200 hover:border-amber-400",
      )}
    >
      <p
        className={cx(
          "text-base font-medium mb-4",
          isDark ? "text-slate-200" : "text-gray-800",
        )}
      >
        {questionText}
      </p>
      <div className="flex flex-wrap gap-4">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex items-center gap-2 cursor-pointer group"
          >
            <div
              className={cx(
                "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                value === option.value
                  ? isDark
                    ? "border-amber-500 bg-amber-600"
                    : "border-amber-600 bg-amber-600"
                  : isDark
                    ? "border-slate-500 group-hover:border-amber-400"
                    : "border-gray-400 group-hover:border-amber-500",
              )}
              onClick={() => handleChange(option.value)}
            >
              {value === option.value && (
                <div className="w-2 h-2 rounded-full bg-white" />
              )}
            </div>
            <span
              className={cx(
                "text-sm",
                isDark ? "text-slate-300" : "text-gray-700",
              )}
            >
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// BaselineCheckboxGroup Component
// ─────────────────────────────────────────────────────────────────────────────

interface BaselineCheckboxGroupProps {
  questionText: string;
  options: { value: string; label: string }[];
  values: string[];
  onChange: (values: string[]) => void;
  isDark?: boolean;
  trackingName: string;
  onTrackEvent?: (eventData: {
    eventType: string;
    elementId: string;
    metadata?: Record<string, any>;
  }) => void;
}

export const BaselineCheckboxGroup: React.FC<BaselineCheckboxGroupProps> = ({
  questionText,
  options,
  values,
  onChange,
  isDark,
  trackingName,
  onTrackEvent,
}) => {
  const handleToggle = (optionValue: string) => {
    const newValues = values.includes(optionValue)
      ? values.filter((v) => v !== optionValue)
      : [...values, optionValue];
    onChange(newValues);
    onTrackEvent?.({
      eventType: "baseline_answer",
      elementId: trackingName,
      metadata: { selectedValues: newValues, questionType: "checkbox" },
    });
  };

  return (
    <div
      data-track-proximity={trackingName}
      className={cx(
        "p-6 rounded-xl border transition-all",
        isDark
          ? "bg-slate-800 border-slate-700 hover:border-amber-600"
          : "bg-white border-gray-200 hover:border-amber-400",
      )}
    >
      <p
        className={cx(
          "text-base font-medium mb-4",
          isDark ? "text-slate-200" : "text-gray-800",
        )}
      >
        {questionText}
      </p>
      <div className="flex flex-wrap gap-3">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex items-center gap-2 cursor-pointer group"
          >
            <div
              className={cx(
                "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                values.includes(option.value)
                  ? isDark
                    ? "border-amber-500 bg-amber-600"
                    : "border-amber-600 bg-amber-600"
                  : isDark
                    ? "border-slate-500 group-hover:border-amber-400"
                    : "border-gray-400 group-hover:border-amber-500",
              )}
              onClick={() => handleToggle(option.value)}
            >
              {values.includes(option.value) && (
                <svg
                  className="w-3 h-3 text-white"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </div>
            <span
              className={cx(
                "text-sm",
                isDark ? "text-slate-300" : "text-gray-700",
              )}
            >
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// BaselineTextInput Component
// ─────────────────────────────────────────────────────────────────────────────

interface BaselineTextInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  isDark?: boolean;
}

export const BaselineTextInput: React.FC<BaselineTextInputProps> = ({
  label,
  value,
  onChange,
  placeholder = "Please specify...",
  isDark,
}) => {
  return (
    <div
      className={cx(
        "p-6 rounded-xl border transition-all",
        isDark ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200",
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
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cx(
          "w-full px-4 py-3 rounded-lg border transition-colors",
          isDark
            ? "bg-slate-900 border-slate-600 text-slate-200 placeholder-slate-500 focus:border-amber-500"
            : "bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400 focus:border-amber-500",
        )}
      />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Default Export
// ─────────────────────────────────────────────────────────────────────────────

export default {
  BaselineRadioGroup,
  BaselineCheckboxGroup,
  BaselineTextInput,
  BASELINE_OPTIONS,
};
