// src/__tests__/components/surveys/RiskPerceptionSurvey.test.tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  RiskPerceptionSurvey,
  RISK_QUESTIONS,
  INITIAL_RISK_ANSWERS,
  sliderToCategory,
  type RiskPerceptionAnswers,
} from "@/components/surveys/RiskPerceptionSurvey";

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
describe("RiskPerceptionSurvey", () => {
  // ── 1. Renders the component title ──────────────────────────────────────
  test("renders the component title (post variant by default)", () => {
    render(
      <RiskPerceptionSurvey
        answers={INITIAL_RISK_ANSWERS}
        onChange={jest.fn()}
      />
    );

    expect(
      screen.getByText("Post-Consultation Risk Perception")
    ).toBeInTheDocument();
  });

  // ── 2. Renders slider question for cancer risk ──────────────────────────
  test("renders slider question for untreated cancer risk", () => {
    render(
      <RiskPerceptionSurvey
        answers={INITIAL_RISK_ANSWERS}
        onChange={jest.fn()}
      />
    );

    expect(
      screen.getByText(
        /Which of the following is closest to the risk of your cancer if you don't treat it\?/
      )
    ).toBeInTheDocument();

    // The slider element should be present (type="range")
    const slider = screen.getByRole("slider");
    expect(slider).toBeInTheDocument();
  });

  // ── 3. Renders radio questions ──────────────────────────────────────────
  test("renders radio questions", () => {
    render(
      <RiskPerceptionSurvey
        answers={INITIAL_RISK_ANSWERS}
        onChange={jest.fn()}
      />
    );

    for (const question of RISK_QUESTIONS) {
      expect(screen.getByText(question.text)).toBeInTheDocument();
    }

    // Check that radio inputs are present (they use sr-only class but are in DOM)
    const radioInputs = screen.getAllByRole("radio");
    // 4 questions with 5 options each = 20 radio inputs
    expect(radioInputs.length).toBe(20);
  });

  // ── 4. sliderToCategory maps correctly ──────────────────────────────────
  test("sliderToCategory maps boundary values correctly", () => {
    // 0-7 -> "1"
    expect(sliderToCategory(0)).toBe("1");
    expect(sliderToCategory(7)).toBe("1");

    // 8-14 -> "2"
    expect(sliderToCategory(8)).toBe("2");
    expect(sliderToCategory(14)).toBe("2");

    // 15-24 -> "3"
    expect(sliderToCategory(15)).toBe("3");
    expect(sliderToCategory(24)).toBe("3");

    // 25-34 -> "4"
    expect(sliderToCategory(25)).toBe("4");
    expect(sliderToCategory(34)).toBe("4");

    // 35-100 -> "5"
    expect(sliderToCategory(35)).toBe("5");
    expect(sliderToCategory(50)).toBe("5");
    expect(sliderToCategory(100)).toBe("5");
  });

  // ── 5. Calls onChange for radio selection ────────────────────────────────
  test("calls onChange for radio selection", async () => {
    const user = userEvent.setup();
    const mockOnChange = jest.fn();

    render(
      <RiskPerceptionSurvey
        answers={INITIAL_RISK_ANSWERS}
        onChange={mockOnChange}
        onTrackEvent={jest.fn()}
      />
    );

    // Click a radio option for the first radio question (cancerRiskTreated)
    // Its first option label is "5 out of 100 men die of cancer at your life expectancy"
    const firstOption = screen.getByText(
      "5 out of 100 men die of cancer at your life expectancy"
    );
    await user.click(firstOption);

    expect(mockOnChange).toHaveBeenCalledWith("cancerRiskTreated", "1");
  });

  // ── 6. Submit disabled until all answered ───────────────────────────────
  test("submit disabled until all answered", () => {
    render(
      <RiskPerceptionSurvey
        answers={INITIAL_RISK_ANSWERS}
        onChange={jest.fn()}
        onSubmit={jest.fn()}
      />
    );

    // totalQuestions = RISK_QUESTIONS.length + 1 = 5
    const submitButton = screen.getByText("Answer all 5 questions");
    expect(submitButton).toBeDisabled();
  });

  // ── 7. Shows progress indicator ────────────────────────────────────────
  test("shows progress indicator", () => {
    render(
      <RiskPerceptionSurvey
        answers={INITIAL_RISK_ANSWERS}
        onChange={jest.fn()}
      />
    );

    expect(screen.getByText("Progress")).toBeInTheDocument();
    expect(screen.getByText("0 / 5")).toBeInTheDocument();
  });
});
