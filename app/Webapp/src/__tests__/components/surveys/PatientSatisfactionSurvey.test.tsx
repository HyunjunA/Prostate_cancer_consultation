// src/__tests__/components/surveys/PatientSatisfactionSurvey.test.tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  PatientSatisfactionSurvey,
  INITIAL_SATISFACTION_ANSWERS,
  SATISFACTION_QUESTION_TEXT,
  type PatientSatisfactionAnswers,
} from "@/components/surveys/PatientSatisfactionSurvey";

// ──────────────────────────────────────────────────────────────────────────────
// Suppress console noise
// ──────────────────────────────────────────────────────────────────────────────
beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────
describe("PatientSatisfactionSurvey", () => {
  // ── 1. Renders the component ────────────────────────────────────────────
  test("renders the component title", () => {
    render(
      <PatientSatisfactionSurvey
        answers={INITIAL_SATISFACTION_ANSWERS}
        onChange={jest.fn()}
      />
    );

    expect(
      screen.getByText("Patient Satisfaction Survey")
    ).toBeInTheDocument();
  });

  // ── 2. Renders text input area ──────────────────────────────────────────
  test("renders textarea for feedback input", () => {
    render(
      <PatientSatisfactionSurvey
        answers={INITIAL_SATISFACTION_ANSWERS}
        onChange={jest.fn()}
      />
    );

    // The FeedbackTextInput renders a textarea with a placeholder
    const textarea = screen.getByPlaceholderText(
      /Please share any feedback about your experience/
    );
    expect(textarea).toBeInTheDocument();
    expect(textarea.tagName).toBe("TEXTAREA");
  });

  // ── 3. Calls onChange when typing feedback ──────────────────────────────
  test("calls onChange when typing feedback", async () => {
    const user = userEvent.setup();
    const mockOnChange = jest.fn();

    render(
      <PatientSatisfactionSurvey
        answers={INITIAL_SATISFACTION_ANSWERS}
        onChange={mockOnChange}
      />
    );

    const textarea = screen.getByPlaceholderText(
      /Please share any feedback/
    );
    await user.type(textarea, "G");

    // onChange is called with "feedbackText" field and the typed value
    expect(mockOnChange).toHaveBeenCalledWith("feedbackText", "G");
  });

  // ── 4. Submit button enabled when feedback has content ──────────────────
  test("submit button enabled when feedback has content", () => {
    const answersWithFeedback: PatientSatisfactionAnswers = {
      feedbackText: "The report was very helpful.",
    };

    render(
      <PatientSatisfactionSurvey
        answers={answersWithFeedback}
        onChange={jest.fn()}
        onSubmit={jest.fn()}
      />
    );

    const submitButton = screen.getByText("Submit Feedback");
    expect(submitButton).toBeEnabled();
  });

  // ── 5. Calls onSubmit when submit clicked ───────────────────────────────
  test("calls onSubmit when submit clicked", async () => {
    const user = userEvent.setup();
    const mockOnSubmit = jest.fn();
    const answersWithFeedback: PatientSatisfactionAnswers = {
      feedbackText: "Great experience overall.",
    };

    render(
      <PatientSatisfactionSurvey
        answers={answersWithFeedback}
        onChange={jest.fn()}
        onSubmit={mockOnSubmit}
      />
    );

    const submitButton = screen.getByText("Submit Feedback");
    await user.click(submitButton);
    expect(mockOnSubmit).toHaveBeenCalledTimes(1);
  });
});
