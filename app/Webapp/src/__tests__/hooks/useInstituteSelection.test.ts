import { renderHook, act } from "@testing-library/react";
import { useInstituteSelection } from "../../hooks/useInstituteSelection";

describe("useInstituteSelection", () => {
  // ── Initial state ──────────────────────────────────────────────

  it("starts with an empty selectedInstitutes Set", () => {
    const { result } = renderHook(() => useInstituteSelection());
    expect(result.current.selectedInstitutes).toBeInstanceOf(Set);
    expect(result.current.selectedInstitutes.size).toBe(0);
  });

  it("starts with lastSelectedInstitute as null", () => {
    const { result } = renderHook(() => useInstituteSelection());
    expect(result.current.lastSelectedInstitute).toBeNull();
  });

  it("starts with isSettingsOpen as true", () => {
    const { result } = renderHook(() => useInstituteSelection());
    expect(result.current.isSettingsOpen).toBe(true);
  });

  // ── toggleInstitute ────────────────────────────────────────────

  it("selects an institute", () => {
    const { result } = renderHook(() => useInstituteSelection());

    act(() => {
      result.current.toggleInstitute("inst-A");
    });

    expect(result.current.selectedInstitutes.has("inst-A")).toBe(true);
  });

  it("radio behavior: replaces previous selection with the new one", () => {
    const { result } = renderHook(() => useInstituteSelection());

    act(() => {
      result.current.toggleInstitute("inst-A");
    });
    act(() => {
      result.current.toggleInstitute("inst-B");
    });

    expect(result.current.selectedInstitutes.has("inst-A")).toBe(false);
    expect(result.current.selectedInstitutes.has("inst-B")).toBe(true);
  });

  it("updates lastSelectedInstitute on each toggle", () => {
    const { result } = renderHook(() => useInstituteSelection());

    act(() => {
      result.current.toggleInstitute("inst-A");
    });
    expect(result.current.lastSelectedInstitute).toBe("inst-A");

    act(() => {
      result.current.toggleInstitute("inst-B");
    });
    expect(result.current.lastSelectedInstitute).toBe("inst-B");
  });

  // ── setIsSettingsOpen ──────────────────────────────────────────

  it("can toggle isSettingsOpen", () => {
    const { result } = renderHook(() => useInstituteSelection());

    act(() => {
      result.current.setIsSettingsOpen(false);
    });
    expect(result.current.isSettingsOpen).toBe(false);

    act(() => {
      result.current.setIsSettingsOpen(true);
    });
    expect(result.current.isSettingsOpen).toBe(true);
  });

  // ── Set size invariant ─────────────────────────────────────────

  it("always has exactly one item in the Set after a selection", () => {
    const { result } = renderHook(() => useInstituteSelection());

    act(() => {
      result.current.toggleInstitute("inst-A");
    });
    expect(result.current.selectedInstitutes.size).toBe(1);

    act(() => {
      result.current.toggleInstitute("inst-B");
    });
    expect(result.current.selectedInstitutes.size).toBe(1);

    act(() => {
      result.current.toggleInstitute("inst-C");
    });
    expect(result.current.selectedInstitutes.size).toBe(1);
  });
});
