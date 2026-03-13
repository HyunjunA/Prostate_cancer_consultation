import { renderHook, act } from "@testing-library/react";
import { useChartSelection } from "../../hooks/useChartSelection";

describe("useChartSelection", () => {
  // ── Initial state ──────────────────────────────────────────────

  it("starts with an empty selectedCharts Set", () => {
    const { result } = renderHook(() => useChartSelection());
    expect(result.current.selectedCharts).toBeInstanceOf(Set);
    expect(result.current.selectedCharts.size).toBe(0);
  });

  it("starts with isSettingsOpen as true", () => {
    const { result } = renderHook(() => useChartSelection());
    expect(result.current.isSettingsOpen).toBe(true);
  });

  // ── toggleChart ────────────────────────────────────────────────

  it("adds a chart to the selection", () => {
    const { result } = renderHook(() => useChartSelection());

    act(() => {
      result.current.toggleChart("chart-1");
    });

    expect(result.current.selectedCharts.has("chart-1")).toBe(true);
    expect(result.current.selectedCharts.size).toBe(1);
  });

  it("removes a chart that is already selected (toggle off)", () => {
    const { result } = renderHook(() => useChartSelection());

    act(() => {
      result.current.toggleChart("chart-1");
    });
    act(() => {
      result.current.toggleChart("chart-1");
    });

    expect(result.current.selectedCharts.has("chart-1")).toBe(false);
    expect(result.current.selectedCharts.size).toBe(0);
  });

  it("handles multiple charts", () => {
    const { result } = renderHook(() => useChartSelection());

    act(() => {
      result.current.toggleChart("chart-1");
    });
    act(() => {
      result.current.toggleChart("chart-2");
    });
    act(() => {
      result.current.toggleChart("chart-3");
    });

    expect(result.current.selectedCharts.size).toBe(3);
    expect(result.current.selectedCharts.has("chart-1")).toBe(true);
    expect(result.current.selectedCharts.has("chart-2")).toBe(true);
    expect(result.current.selectedCharts.has("chart-3")).toBe(true);
  });

  it("maintains other selections when toggling one off", () => {
    const { result } = renderHook(() => useChartSelection());

    act(() => {
      result.current.toggleChart("chart-1");
    });
    act(() => {
      result.current.toggleChart("chart-2");
    });
    act(() => {
      result.current.toggleChart("chart-3");
    });

    // Remove chart-2
    act(() => {
      result.current.toggleChart("chart-2");
    });

    expect(result.current.selectedCharts.size).toBe(2);
    expect(result.current.selectedCharts.has("chart-1")).toBe(true);
    expect(result.current.selectedCharts.has("chart-2")).toBe(false);
    expect(result.current.selectedCharts.has("chart-3")).toBe(true);
  });

  // ── setIsSettingsOpen ──────────────────────────────────────────

  it("can set isSettingsOpen to false", () => {
    const { result } = renderHook(() => useChartSelection());

    act(() => {
      result.current.setIsSettingsOpen(false);
    });

    expect(result.current.isSettingsOpen).toBe(false);
  });

  it("can set isSettingsOpen back to true", () => {
    const { result } = renderHook(() => useChartSelection());

    act(() => {
      result.current.setIsSettingsOpen(false);
    });
    act(() => {
      result.current.setIsSettingsOpen(true);
    });

    expect(result.current.isSettingsOpen).toBe(true);
  });
});
