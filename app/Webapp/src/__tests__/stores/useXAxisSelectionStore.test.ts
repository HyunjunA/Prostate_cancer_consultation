import { useXAxisSelectionStore } from "@/stores/useXAxisSelectionStore";
import { act } from "@testing-library/react";

beforeEach(() => {
  act(() => {
    useXAxisSelectionStore.setState({ selectedDateOnXaxis: null });
  });
});

describe("useXAxisSelectionStore", () => {
  it("initializes with null selectedDateOnXaxis", () => {
    expect(useXAxisSelectionStore.getState().selectedDateOnXaxis).toBeNull();
  });

  it("setSelectedDateOnXaxis sets a data point", () => {
    const dataPoint = { week_ending: "2025-01-15" };
    act(() => {
      useXAxisSelectionStore.getState().setSelectedDateOnXaxis(dataPoint);
    });
    expect(useXAxisSelectionStore.getState().selectedDateOnXaxis).toEqual(
      dataPoint
    );
  });

  it("setSelectedDateOnXaxis can overwrite with a new data point", () => {
    const first = { week_ending: "2025-01-15" };
    const second = { week_ending: "2025-02-20" };
    act(() => {
      useXAxisSelectionStore.getState().setSelectedDateOnXaxis(first);
    });
    act(() => {
      useXAxisSelectionStore.getState().setSelectedDateOnXaxis(second);
    });
    expect(useXAxisSelectionStore.getState().selectedDateOnXaxis).toEqual(
      second
    );
  });

  it("setSelectedDateOnXaxis can reset to null", () => {
    const dataPoint = { week_ending: "2025-01-15" };
    act(() => {
      useXAxisSelectionStore.getState().setSelectedDateOnXaxis(dataPoint);
    });
    act(() => {
      useXAxisSelectionStore.getState().setSelectedDateOnXaxis(null);
    });
    expect(useXAxisSelectionStore.getState().selectedDateOnXaxis).toBeNull();
  });

  it("setSelectedDateOnXaxis preserves the week_ending field", () => {
    const dataPoint = { week_ending: "2025-12-31" };
    act(() => {
      useXAxisSelectionStore.getState().setSelectedDateOnXaxis(dataPoint);
    });
    expect(
      useXAxisSelectionStore.getState().selectedDateOnXaxis?.week_ending
    ).toBe("2025-12-31");
  });
});
