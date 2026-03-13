import { useCircleIndexStore } from "@/stores/useCircleIndexStore";
import { act } from "@testing-library/react";

beforeEach(() => {
  act(() => {
    useCircleIndexStore.setState({ index: -1 });
  });
  localStorage.clear();
});

describe("useCircleIndexStore", () => {
  describe("initial state", () => {
    it("initializes with index -1", () => {
      expect(useCircleIndexStore.getState().index).toBe(-1);
    });
  });

  describe("setIndex", () => {
    it("sets index to a specific value", () => {
      act(() => {
        useCircleIndexStore.getState().setIndex(5);
      });
      expect(useCircleIndexStore.getState().index).toBe(5);
    });

    it("sets index to 0", () => {
      act(() => {
        useCircleIndexStore.getState().setIndex(0);
      });
      expect(useCircleIndexStore.getState().index).toBe(0);
    });

    it("sets index to -1 (reset)", () => {
      act(() => {
        useCircleIndexStore.getState().setIndex(5);
      });
      act(() => {
        useCircleIndexStore.getState().setIndex(-1);
      });
      expect(useCircleIndexStore.getState().index).toBe(-1);
    });
  });

  describe("moveCircle — from initial index -1", () => {
    it("moving right from -1 goes to index 0", () => {
      act(() => {
        useCircleIndexStore.getState().moveCircle("right", 10);
      });
      expect(useCircleIndexStore.getState().index).toBe(0);
    });

    it("moving left from -1 goes to last index (dataLength - 1)", () => {
      act(() => {
        useCircleIndexStore.getState().moveCircle("left", 10);
      });
      expect(useCircleIndexStore.getState().index).toBe(9);
    });
  });

  describe("moveCircle — normal movement", () => {
    it("moving right increments index by 1", () => {
      act(() => {
        useCircleIndexStore.getState().setIndex(3);
      });
      act(() => {
        useCircleIndexStore.getState().moveCircle("right", 10);
      });
      expect(useCircleIndexStore.getState().index).toBe(4);
    });

    it("moving left decrements index by 1", () => {
      act(() => {
        useCircleIndexStore.getState().setIndex(3);
      });
      act(() => {
        useCircleIndexStore.getState().moveCircle("left", 10);
      });
      expect(useCircleIndexStore.getState().index).toBe(2);
    });
  });

  describe("moveCircle — boundary conditions", () => {
    it("moving right at the last index stays at the last index", () => {
      act(() => {
        useCircleIndexStore.getState().setIndex(9);
      });
      act(() => {
        useCircleIndexStore.getState().moveCircle("right", 10);
      });
      expect(useCircleIndexStore.getState().index).toBe(9);
    });

    it("moving left at index 0 stays at 0", () => {
      act(() => {
        useCircleIndexStore.getState().setIndex(0);
      });
      act(() => {
        useCircleIndexStore.getState().moveCircle("left", 10);
      });
      expect(useCircleIndexStore.getState().index).toBe(0);
    });

    it("handles dataLength of 1 — right from -1 goes to 0", () => {
      act(() => {
        useCircleIndexStore.getState().moveCircle("right", 1);
      });
      expect(useCircleIndexStore.getState().index).toBe(0);
    });

    it("handles dataLength of 1 — left from -1 goes to 0", () => {
      act(() => {
        useCircleIndexStore.getState().moveCircle("left", 1);
      });
      expect(useCircleIndexStore.getState().index).toBe(0);
    });

    it("handles dataLength of 1 — cannot move right from 0", () => {
      act(() => {
        useCircleIndexStore.getState().setIndex(0);
      });
      act(() => {
        useCircleIndexStore.getState().moveCircle("right", 1);
      });
      expect(useCircleIndexStore.getState().index).toBe(0);
    });

    it("handles dataLength of 1 — cannot move left from 0", () => {
      act(() => {
        useCircleIndexStore.getState().setIndex(0);
      });
      act(() => {
        useCircleIndexStore.getState().moveCircle("left", 1);
      });
      expect(useCircleIndexStore.getState().index).toBe(0);
    });
  });

  describe("persist middleware", () => {
    it("persists state to localStorage under 'circle-index-storage'", () => {
      act(() => {
        useCircleIndexStore.getState().setIndex(7);
      });
      const stored = localStorage.getItem("circle-index-storage");
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.state.index).toBe(7);
    });
  });
});
