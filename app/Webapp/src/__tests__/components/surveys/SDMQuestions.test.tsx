// src/__tests__/components/surveys/SDMQuestions.test.tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  SDMSurvey,
  SDM_QUESTIONS,
  INITIAL_SDM_ANSWERS,
  type SDMAnswers,
} from "@/components/surveys/SDMQuestions";

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
describe("SDMSurvey", () => {
  // ── 1. Renders the component title ──────────────────────────────────────
  test("renders the component title", () => {
    render(
      <SDMSurvey
        answers={INITIAL_SDM_ANSWERS}
        onChange={jest.fn()}
      />
    );

    expect(
      screen.getByText("Shared Decision Making Survey")
    ).toBeInTheDocument();
  });

  // ── 2. Renders all 4 questions ──────────────────────────────────────────
  test("renders all 4 questions", () => {
    render(
      <SDMSurvey
        answers={INITIAL_SDM_ANSWERS}
        onChange={jest.fn()}
      />
    );

    // SDM questions contain "[intervention]" which is replaced with the default
    // interventionName prop ("[intervention]"), so the raw text should appear.
    for (const question of SDM_QUESTIONS) {
      // The text is rendered with [intervention] replaced, default is "[intervention]"
      expect(screen.getByText(question.text)).toBeInTheDocument();
    }
  });

  // ── 3. Calls onChange for YesNo question click ──────────────────────────
  test("calls onChange for YesNo question click (Yes button)", async () => {
    const user = userEvent.setup();
    const mockOnChange = jest.fn();

    render(
      <SDMSurvey
        answers={INITIAL_SDM_ANSWERS}
        onChange={mockOnChange}
        onTrackEvent={jest.fn()}
      />
    );

    // q1 and q4 are "yesno" type — the onClick is on the inner div (radio circle),
    // not the text span. Find the label containing "Yes" and click the circle div.
    const yesButtons = screen.getAllByText("Yes");
    expect(yesButtons.length).toBeGreaterThanOrEqual(1);

    const yesLabel = yesButtons[0].closest("label")!;
    const radioCircle = yesLabel.querySelector("div")!;
    await user.click(radioCircle);
    expect(mockOnChange).toHaveBeenCalledWith("q1", "yes");
  });

  // ── 4. Calls onChange for Scale question click ──────────────────────────
  test("calls onChange for Scale question click", async () => {
    const user = userEvent.setup();
    const mockOnChange = jest.fn();

    render(
      <SDMSurvey
        answers={INITIAL_SDM_ANSWERS}
        onChange={mockOnChange}
        onTrackEvent={jest.fn()}
      />
    );

    // q2 and q3 are "scale" type — the onClick is on the inner div (radio circle).
    const aLotButtons = screen.getAllByText("A lot");
    expect(aLotButtons.length).toBeGreaterThanOrEqual(1);

    const aLotLabel = aLotButtons[0].closest("label")!;
    const radioCircle = aLotLabel.querySelector("div")!;
    await user.click(radioCircle);
    expect(mockOnChange).toHaveBeenCalledWith("q2", "a_lot");
  });

  // ── 5. Shows progress indicator ────────────────────────────────────────
  test("shows progress indicator", () => {
    render(
      <SDMSurvey
        answers={INITIAL_SDM_ANSWERS}
        onChange={jest.fn()}
      />
    );

    expect(screen.getByText("Progress")).toBeInTheDocument();
    expect(screen.getByText("0 / 4")).toBeInTheDocument();
  });

  // ── 6. Submit disabled when not all answered ────────────────────────────
  test("submit disabled when not all answered", () => {
    render(
      <SDMSurvey
        answers={INITIAL_SDM_ANSWERS}
        onChange={jest.fn()}
        onSubmit={jest.fn()}
      />
    );

    const submitButton = screen.getByText("Answer all 4 questions");
    expect(submitButton).toBeDisabled();
  });

  // ── 7. Calls onSubmit when all answered and submit clicked ──────────────
  test("calls onSubmit when all answered and submit clicked", async () => {
    const user = userEvent.setup();
    const mockOnSubmit = jest.fn();

    const completedAnswers: SDMAnswers = {
      q1: "yes",
      q2: "a_lot",
      q3: "some",
      q4: "no",
    };

    render(
      <SDMSurvey
        answers={completedAnswers}
        onChange={jest.fn()}
        onSubmit={mockOnSubmit}
      />
    );

    const submitButton = screen.getByText("Submit Responses");
    expect(submitButton).toBeEnabled();

    await user.click(submitButton);
    expect(mockOnSubmit).toHaveBeenCalledTimes(1);
  });

  // ── 8. Renders custom interventionName in question text ─────────────────
  test("renders custom interventionName in question text", () => {
    render(
      <SDMSurvey
        answers={INITIAL_SDM_ANSWERS}
        onChange={jest.fn()}
        interventionName="active surveillance"
      />
    );

    // q2 text contains "[intervention]" which should be replaced with "active surveillance"
    expect(
      screen.getByText(
        /How much did you and the health care provider talk about the reasons you might want to have active surveillance\?/
      )
    ).toBeInTheDocument();
  });
});
