import { useXAxisDragSelectionStore } from "@/stores/useXAxisDragSelectionStore";
import { act } from "@testing-library/react";

beforeEach(() => {
  act(() => {
    useXAxisDragSelectionStore.setState({
      id: null,
      startDate: null,
      endDate: null,
      isDragging: false,
      isDoubleClicked: false,
    });
  });
});

describe("useXAxisDragSelectionStore", () => {
  describe("initial state", () => {
    it("initializes with null id", () => {
      expect(useXAxisDragSelectionStore.getState().id).toBeNull();
    });

    it("initializes with null startDate", () => {
      expect(useXAxisDragSelectionStore.getState().startDate).toBeNull();
    });

    it("initializes with null endDate", () => {
      expect(useXAxisDragSelectionStore.getState().endDate).toBeNull();
    });

    it("initializes with isDragging false", () => {
      expect(useXAxisDragSelectionStore.getState().isDragging).toBe(false);
    });

    it("initializes with isDoubleClicked false", () => {
      expect(useXAxisDragSelectionStore.getState().isDoubleClicked).toBe(false);
    });
  });

  describe("setId", () => {
    it("sets the id value", () => {
      act(() => {
        useXAxisDragSelectionStore.getState().setId("chart-1");
      });
      expect(useXAxisDragSelectionStore.getState().id).toBe("chart-1");
    });

    it("sets id to null", () => {
      act(() => {
        useXAxisDragSelectionStore.getState().setId("chart-1");
      });
      act(() => {
        useXAxisDragSelectionStore.getState().setId(null);
      });
      expect(useXAxisDragSelectionStore.getState().id).toBeNull();
    });
  });

  describe("setDateRange", () => {
    it("sets both startDate and endDate", () => {
      act(() => {
        useXAxisDragSelectionStore
          .getState()
          .setDateRange("2025-01-01", "2025-06-30");
      });
      const state = useXAxisDragSelectionStore.getState();
      expect(state.startDate).toBe("2025-01-01");
      expect(state.endDate).toBe("2025-06-30");
    });

    it("can set both dates to null", () => {
      act(() => {
        useXAxisDragSelectionStore
          .getState()
          .setDateRange("2025-01-01", "2025-06-30");
      });
      act(() => {
        useXAxisDragSelectionStore.getState().setDateRange(null, null);
      });
      const state = useXAxisDragSelectionStore.getState();
      expect(state.startDate).toBeNull();
      expect(state.endDate).toBeNull();
    });

    it("can set only startDate with null endDate", () => {
      act(() => {
        useXAxisDragSelectionStore
          .getState()
          .setDateRange("2025-01-01", null);
      });
      const state = useXAxisDragSelectionStore.getState();
      expect(state.startDate).toBe("2025-01-01");
      expect(state.endDate).toBeNull();
    });

    it("overwrites previous date range", () => {
      act(() => {
        useXAxisDragSelectionStore
          .getState()
          .setDateRange("2025-01-01", "2025-03-01");
      });
      act(() => {
        useXAxisDragSelectionStore
          .getState()
          .setDateRange("2025-06-01", "2025-12-31");
      });
      const state = useXAxisDragSelectionStore.getState();
      expect(state.startDate).toBe("2025-06-01");
      expect(state.endDate).toBe("2025-12-31");
    });
  });

  describe("setIsDragging", () => {
    it("sets isDragging to true", () => {
      act(() => {
        useXAxisDragSelectionStore.getState().setIsDragging(true);
      });
      expect(useXAxisDragSelectionStore.getState().isDragging).toBe(true);
    });

    it("sets isDragging to false", () => {
      act(() => {
        useXAxisDragSelectionStore.getState().setIsDragging(true);
      });
      act(() => {
        useXAxisDragSelectionStore.getState().setIsDragging(false);
      });
      expect(useXAxisDragSelectionStore.getState().isDragging).toBe(false);
    });
  });

  describe("setIsDoubleClicked", () => {
    it("sets isDoubleClicked to true", () => {
      act(() => {
        useXAxisDragSelectionStore.getState().setIsDoubleClicked(true);
      });
      expect(useXAxisDragSelectionStore.getState().isDoubleClicked).toBe(true);
    });

    it("sets isDoubleClicked to false", () => {
      act(() => {
        useXAxisDragSelectionStore.getState().setIsDoubleClicked(true);
      });
      act(() => {
        useXAxisDragSelectionStore.getState().setIsDoubleClicked(false);
      });
      expect(useXAxisDragSelectionStore.getState().isDoubleClicked).toBe(false);
    });
  });

  describe("combined operations", () => {
    it("can set id, date range, and dragging state together", () => {
      act(() => {
        useXAxisDragSelectionStore.getState().setId("chart-1");
        useXAxisDragSelectionStore
          .getState()
          .setDateRange("2025-01-01", "2025-12-31");
        useXAxisDragSelectionStore.getState().setIsDragging(true);
      });
      const state = useXAxisDragSelectionStore.getState();
      expect(state.id).toBe("chart-1");
      expect(state.startDate).toBe("2025-01-01");
      expect(state.endDate).toBe("2025-12-31");
      expect(state.isDragging).toBe(true);
    });
  });
});
