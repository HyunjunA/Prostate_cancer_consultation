// src/__tests__/components/surveys/DecisionalConflictSurvey.test.tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DecisionalConflictSurvey,
  DCS_QUESTIONS,
  LIKERT_OPTIONS,
  INITIAL_DCS_ANSWERS,
  calculateDCSScore,
  type DecisionalConflictAnswers,
  type LikertAnswer,
} from "@/components/surveys/DecisionalConflictSurvey";

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
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Build a fully-answered answers object where every question has the same value. */
function allAnswered(value: LikertAnswer): DecisionalConflictAnswers {
  const answers = { ...INITIAL_DCS_ANSWERS };
  for (const key of Object.keys(answers) as (keyof DecisionalConflictAnswers)[]) {
    answers[key] = value;
  }
  return answers;
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────
describe("DecisionalConflictSurvey", () => {
  // ── 1. Renders the component title ──────────────────────────────────────
  test("renders the component title", () => {
    render(
      <DecisionalConflictSurvey
        answers={INITIAL_DCS_ANSWERS}
        onChange={jest.fn()}
      />
    );

    expect(screen.getByText("Decisional Conflict Survey")).toBeInTheDocument();
  });

  // ── 2. Renders all 16 questions ─────────────────────────────────────────
  test("renders all 16 questions", () => {
    render(
      <DecisionalConflictSurvey
        answers={INITIAL_DCS_ANSWERS}
        onChange={jest.fn()}
      />
    );

    for (const question of DCS_QUESTIONS) {
      expect(screen.getByText(question.text)).toBeInTheDocument();
    }
  });

  // ── 3. Calls onChange when a Likert option is clicked ────────────────────
  test("calls onChange when a Likert option is clicked", async () => {
    const user = userEvent.setup();
    const mockOnChange = jest.fn();

    render(
      <DecisionalConflictSurvey
        answers={INITIAL_DCS_ANSWERS}
        onChange={mockOnChange}
        onSubmit={jest.fn()}
      />
    );

    // Click the first "Strongly Agree" button (there are 16 of them, one per question)
    const stronglyAgreeButtons = screen.getAllByText("Strongly Agree");
    expect(stronglyAgreeButtons.length).toBe(16);

    await user.click(stronglyAgreeButtons[0]);
    expect(mockOnChange).toHaveBeenCalledWith("q1", 0);
  });

  // ── 4. Shows progress (0/16 initially) ─────────────────────────────────
  test("shows progress 0/16 initially", () => {
    render(
      <DecisionalConflictSurvey
        answers={INITIAL_DCS_ANSWERS}
        onChange={jest.fn()}
      />
    );

    expect(screen.getByText("0 / 16")).toBeInTheDocument();
    expect(screen.getByText("Progress")).toBeInTheDocument();
  });

  // ── 5. Submit button is disabled when not all answered ──────────────────
  test("submit button is disabled when not all answered", () => {
    render(
      <DecisionalConflictSurvey
        answers={INITIAL_DCS_ANSWERS}
        onChange={jest.fn()}
        onSubmit={jest.fn()}
      />
    );

    const submitButton = screen.getByText("Complete all 16 questions");
    expect(submitButton).toBeDisabled();
  });

  // ── 6. Submit button is enabled when all answered ───────────────────────
  test("submit button is enabled when all answered", () => {
    const answers = allAnswered(2); // All "Neither Agree nor Disagree"

    render(
      <DecisionalConflictSurvey
        answers={answers}
        onChange={jest.fn()}
        onSubmit={jest.fn()}
      />
    );

    const submitButton = screen.getByText("Submit Responses");
    expect(submitButton).toBeEnabled();
  });

  // ── 7. Calls onSubmit when submit clicked ───────────────────────────────
  test("calls onSubmit when submit clicked", async () => {
    const user = userEvent.setup();
    const mockOnSubmit = jest.fn();
    const answers = allAnswered(0);

    render(
      <DecisionalConflictSurvey
        answers={answers}
        onChange={jest.fn()}
        onSubmit={mockOnSubmit}
      />
    );

    const submitButton = screen.getByText("Submit Responses");
    await user.click(submitButton);
    expect(mockOnSubmit).toHaveBeenCalledTimes(1);
  });

  // ── 8. calculateDCSScore returns correct score ──────────────────────────
  test("calculateDCSScore returns correct score (all 0s = 0, all 4s = 100)", () => {
    const allZeros = allAnswered(0);
    expect(calculateDCSScore(allZeros)).toBe(0);

    const allFours = allAnswered(4);
    expect(calculateDCSScore(allFours)).toBe(100);
  });

  // ── 9. calculateDCSScore with mixed answers ─────────────────────────────
  test("calculateDCSScore with mixed answers", () => {
    // All 2s: average = 2, score = (2/4)*100 = 50
    const allTwos = allAnswered(2);
    expect(calculateDCSScore(allTwos)).toBe(50);

    // Return null when all answers are null
    expect(calculateDCSScore(INITIAL_DCS_ANSWERS)).toBeNull();
  });

  // ── 10. Renders in dark mode without errors ─────────────────────────────
  test("renders in dark mode without errors", () => {
    render(
      <DecisionalConflictSurvey
        answers={INITIAL_DCS_ANSWERS}
        onChange={jest.fn()}
        onSubmit={jest.fn()}
        isDark={true}
        physicianName="Smith"
      />
    );

    expect(screen.getByText("Decisional Conflict Survey")).toBeInTheDocument();
    // "Dr. Smith" appears in two paragraphs, so use getAllByText
    const drSmithElements = screen.getAllByText(/Dr\.\s*Smith/);
    expect(drSmithElements.length).toBeGreaterThanOrEqual(1);
  });
});
