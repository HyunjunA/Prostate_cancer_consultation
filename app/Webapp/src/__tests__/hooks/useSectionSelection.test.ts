import { renderHook, act } from "@testing-library/react";
import { useSectionSelection } from "../../hooks/useSectionSelection";

describe("useSectionSelection", () => {
  // ── Initial state ──────────────────────────────────────────────

  it("starts with an empty selectedSections array", () => {
    const { result } = renderHook(() => useSectionSelection());
    expect(result.current.selectedSections).toEqual([]);
  });

  it("starts with isSettingsOpen as true", () => {
    const { result } = renderHook(() => useSectionSelection());
    expect(result.current.isSettingsOpen).toBe(true);
  });

  // ── individualSections ─────────────────────────────────────────

  it("exposes 4 individual sections", () => {
    const { result } = renderHook(() => useSectionSelection());
    expect(result.current.individualSections).toEqual([
      "publication",
      "sequence",
      "clinical",
      "demographic",
    ]);
    expect(result.current.individualSections).toHaveLength(4);
  });

  // ── toggleSection (individual) ─────────────────────────────────

  it("adds a section when toggled", () => {
    const { result } = renderHook(() => useSectionSelection());

    act(() => {
      result.current.toggleSection("publication");
    });

    expect(result.current.selectedSections).toContain("publication");
  });

  it("removes a section when toggled again (toggle off)", () => {
    const { result } = renderHook(() => useSectionSelection());

    act(() => {
      result.current.toggleSection("publication");
    });
    act(() => {
      result.current.toggleSection("publication");
    });

    expect(result.current.selectedSections).not.toContain("publication");
  });

  // ── toggleSection("all") ──────────────────────────────────────

  it('selects all individual sections when "all" is toggled', () => {
    const { result } = renderHook(() => useSectionSelection());

    act(() => {
      result.current.toggleSection("all");
    });

    expect(result.current.selectedSections).toContain("publication");
    expect(result.current.selectedSections).toContain("sequence");
    expect(result.current.selectedSections).toContain("clinical");
    expect(result.current.selectedSections).toContain("demographic");
  });

  it('deselects everything when "all" is toggled again', () => {
    const { result } = renderHook(() => useSectionSelection());

    act(() => {
      result.current.toggleSection("all");
    });
    act(() => {
      result.current.toggleSection("all");
    });

    expect(result.current.selectedSections).toEqual([]);
  });

  // ── Auto-all behavior ─────────────────────────────────────────

  it('automatically adds "all" when all 4 sections are selected individually', () => {
    const { result } = renderHook(() => useSectionSelection());

    act(() => {
      result.current.toggleSection("publication");
    });
    act(() => {
      result.current.toggleSection("sequence");
    });
    act(() => {
      result.current.toggleSection("clinical");
    });
    act(() => {
      result.current.toggleSection("demographic");
    });

    expect(result.current.selectedSections).toContain("all");
  });

  // ── isAllSelected ──────────────────────────────────────────────

  it("isAllSelected returns false initially", () => {
    const { result } = renderHook(() => useSectionSelection());
    expect(result.current.isAllSelected()).toBe(false);
  });

  it("isAllSelected returns true when all sections are selected", () => {
    const { result } = renderHook(() => useSectionSelection());

    act(() => {
      result.current.toggleSection("all");
    });

    expect(result.current.isAllSelected()).toBe(true);
  });

  // ── isSectionSelected ──────────────────────────────────────────

  it("isSectionSelected returns false for an unselected section", () => {
    const { result } = renderHook(() => useSectionSelection());
    expect(result.current.isSectionSelected("clinical")).toBe(false);
  });

  it("isSectionSelected returns true for a selected section", () => {
    const { result } = renderHook(() => useSectionSelection());

    act(() => {
      result.current.toggleSection("clinical");
    });

    expect(result.current.isSectionSelected("clinical")).toBe(true);
  });

  it('isSectionSelected("all") delegates to isAllSelected', () => {
    const { result } = renderHook(() => useSectionSelection());

    // Not all selected yet
    expect(result.current.isSectionSelected("all")).toBe(false);

    // Select all
    act(() => {
      result.current.toggleSection("all");
    });

    expect(result.current.isSectionSelected("all")).toBe(true);
  });

  // ── Deselect one after all selected ────────────────────────────

  it('removes "all" flag when one section is deselected after all were selected', () => {
    const { result } = renderHook(() => useSectionSelection());

    // Select all — toggleSection("all") sets the 4 individual sections (not "all" literal)
    act(() => {
      result.current.toggleSection("all");
    });
    expect(result.current.isAllSelected()).toBe(true);

    // Deselect one
    act(() => {
      result.current.toggleSection("clinical");
    });

    expect(result.current.selectedSections).not.toContain("all");
    expect(result.current.selectedSections).not.toContain("clinical");
    // Other three should remain
    expect(result.current.selectedSections).toContain("publication");
    expect(result.current.selectedSections).toContain("sequence");
    expect(result.current.selectedSections).toContain("demographic");
  });
});
