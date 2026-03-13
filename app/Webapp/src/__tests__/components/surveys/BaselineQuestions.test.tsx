// src/__tests__/components/surveys/BaselineQuestions.test.tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  BaselineRadioGroup,
  BaselineCheckboxGroup,
  BaselineTextInput,
  BASELINE_OPTIONS,
} from "@/components/surveys/BaselineQuestions";

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
describe("BaselineRadioGroup", () => {
  // ── 1. Renders question text and options ────────────────────────────────
  test("renders question text and all options", () => {
    render(
      <BaselineRadioGroup
        questionText="What is your sex at birth?"
        options={BASELINE_OPTIONS.sexAtBirth}
        value={null}
        onChange={jest.fn()}
        trackingName="baseline_sex"
      />
    );

    expect(screen.getByText("What is your sex at birth?")).toBeInTheDocument();
    expect(screen.getByText("Male")).toBeInTheDocument();
    expect(screen.getByText("Female")).toBeInTheDocument();
    expect(screen.getByText("Prefer not to say")).toBeInTheDocument();
  });

  // ── 2. Calls onChange when option clicked ───────────────────────────────
  test("calls onChange when option clicked", async () => {
    const user = userEvent.setup();
    const mockOnChange = jest.fn();

    render(
      <BaselineRadioGroup
        questionText="What is your sex at birth?"
        options={BASELINE_OPTIONS.sexAtBirth}
        value={null}
        onChange={mockOnChange}
        trackingName="baseline_sex"
        onTrackEvent={jest.fn()}
      />
    );

    // The onClick handler is on the inner div (radio circle), not the text span.
    // Find the label containing "Male" and click the radio circle div inside it.
    const maleLabel = screen.getByText("Male").closest("label")!;
    const radioCircle = maleLabel.querySelector("div")!;
    await user.click(radioCircle);
    expect(mockOnChange).toHaveBeenCalledWith("male");
  });
});

describe("BaselineCheckboxGroup", () => {
  // ── 3. Renders all options ──────────────────────────────────────────────
  test("renders all options", () => {
    render(
      <BaselineCheckboxGroup
        questionText="What is your race?"
        options={BASELINE_OPTIONS.race}
        values={[]}
        onChange={jest.fn()}
        trackingName="baseline_race"
      />
    );

    expect(screen.getByText("What is your race?")).toBeInTheDocument();
    for (const option of BASELINE_OPTIONS.race) {
      expect(screen.getByText(option.label)).toBeInTheDocument();
    }
  });

  // ── 4. Calls onChange with updated values array ─────────────────────────
  test("calls onChange with updated values array when option clicked", async () => {
    const user = userEvent.setup();
    const mockOnChange = jest.fn();

    render(
      <BaselineCheckboxGroup
        questionText="What is your race?"
        options={BASELINE_OPTIONS.race}
        values={["white"]}
        onChange={mockOnChange}
        trackingName="baseline_race"
        onTrackEvent={jest.fn()}
      />
    );

    // The onClick handler is on the inner div (checkbox square), not the text span.
    const asianLabel = screen.getByText("Asian").closest("label")!;
    const checkboxDiv = asianLabel.querySelector("div")!;
    await user.click(checkboxDiv);
    expect(mockOnChange).toHaveBeenCalledWith(["white", "asian"]);
  });
});

describe("BaselineTextInput", () => {
  // ── 5. Renders label and input ──────────────────────────────────────────
  test("renders label and input", () => {
    render(
      <BaselineTextInput
        label="Please specify"
        value=""
        onChange={jest.fn()}
        placeholder="Enter details"
      />
    );

    expect(screen.getByText("Please specify")).toBeInTheDocument();
    const input = screen.getByPlaceholderText("Enter details");
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe("INPUT");
  });
});

describe("BASELINE_OPTIONS", () => {
  // ── 6. Has correct number of options for each category ──────────────────
  test("has correct number of options for each category", () => {
    expect(BASELINE_OPTIONS.sexAtBirth).toHaveLength(3);
    expect(BASELINE_OPTIONS.race).toHaveLength(7);
    expect(BASELINE_OPTIONS.education).toHaveLength(7);
    expect(BASELINE_OPTIONS.maritalStatus).toHaveLength(4);
    expect(BASELINE_OPTIONS.employment).toHaveLength(9);
  });
});
