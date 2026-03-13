import useFilterStore from "@/stores/useFilterStore";
import { act } from "@testing-library/react";

// Capture the initial state to restore between tests
const initialState = useFilterStore.getState();

beforeEach(() => {
  act(() => {
    useFilterStore.setState(initialState);
  });
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("useFilterStore", () => {
  describe("initial state", () => {
    it("has regionState with California checked by default", () => {
      const { regionState } = useFilterStore.getState();
      expect(regionState).toBeDefined();
      expect(Array.isArray(regionState)).toBe(true);
      const california = regionState.find(
        (item: { id: string }) => item.id === "CA"
      );
      expect(california?.checked).toBe(true);
    });

    it("has regionState with all other states unchecked", () => {
      const { regionState } = useFilterStore.getState();
      const checkedItems = regionState.filter(
        (item: { id: string; checked: boolean }) =>
          item.checked && item.id !== "CA"
      );
      expect(checkedItems).toHaveLength(0);
    });

    it("has ageState with 0-17 checked by default", () => {
      const { ageState } = useFilterStore.getState();
      const ageGroup = ageState.find(
        (item: { id: string }) => item.id === "0-17"
      );
      expect(ageGroup?.checked).toBe(true);
    });

    it("has genderState with male checked by default", () => {
      const { genderState } = useFilterStore.getState();
      const male = genderState.find(
        (item: { id: string }) => item.id === "male"
      );
      expect(male?.checked).toBe(true);
    });

    it("has displayByState with weeklyrate checked by default", () => {
      const { displayByState } = useFilterStore.getState();
      const weekly = displayByState.find(
        (item: { id: string }) => item.id === "weeklyrate"
      );
      expect(weekly?.checked).toBe(true);
    });
  });

  describe("updateFilter — regular sections (region, age, gender)", () => {
    it("checks a specific item in regionState", () => {
      act(() => {
        useFilterStore.getState().updateFilter("region", "NY", true);
      });
      const { regionState } = useFilterStore.getState();
      const ny = regionState.find(
        (item: { id: string }) => item.id === "NY"
      );
      expect(ny?.checked).toBe(true);
    });

    it("unchecks a specific item in regionState", () => {
      act(() => {
        useFilterStore.getState().updateFilter("region", "CA", false);
      });
      const { regionState } = useFilterStore.getState();
      const ca = regionState.find(
        (item: { id: string }) => item.id === "CA"
      );
      expect(ca?.checked).toBe(false);
    });

    it("checking 'all' checks all other items in the section", () => {
      // Check "all" — this should check every item
      act(() => {
        useFilterStore.getState().updateFilter("region", "all", true);
      });
      const { regionState } = useFilterStore.getState();
      const allItem = regionState.find(
        (item: { id: string }) => item.id === "all"
      );
      expect(allItem?.checked).toBe(true);
      // All other items should also be checked
      const ny = regionState.find(
        (item: { id: string }) => item.id === "NY"
      );
      expect(ny?.checked).toBe(true);
      const ca = regionState.find(
        (item: { id: string }) => item.id === "CA"
      );
      expect(ca?.checked).toBe(true);
    });

    it("unchecking 'all' unchecks all other items in the section", () => {
      // First check all
      act(() => {
        useFilterStore.getState().updateFilter("region", "all", true);
      });
      // Now uncheck "all"
      act(() => {
        useFilterStore.getState().updateFilter("region", "all", false);
      });
      const { regionState } = useFilterStore.getState();
      const anyChecked = regionState.some(
        (item: { checked: boolean }) => item.checked
      );
      expect(anyChecked).toBe(false);
    });

    it("checking a specific item unchecks the 'all' item", () => {
      // First set "all" to checked
      act(() => {
        useFilterStore.getState().updateFilter("region", "all", true);
      });
      // Now check a specific item
      act(() => {
        useFilterStore.getState().updateFilter("region", "TX", true);
      });
      const { regionState } = useFilterStore.getState();
      const allItem = regionState.find(
        (item: { id: string }) => item.id === "all"
      );
      expect(allItem?.checked).toBe(false);
      const tx = regionState.find(
        (item: { id: string }) => item.id === "TX"
      );
      expect(tx?.checked).toBe(true);
    });

    it("updates ageState correctly", () => {
      act(() => {
        useFilterStore.getState().updateFilter("age", "25-34", true);
      });
      const { ageState } = useFilterStore.getState();
      const ageGroup = ageState.find(
        (item: { id: string }) => item.id === "25-34"
      );
      expect(ageGroup?.checked).toBe(true);
    });

    it("updates genderState correctly", () => {
      act(() => {
        useFilterStore.getState().updateFilter("gender", "female", true);
      });
      const { genderState } = useFilterStore.getState();
      const female = genderState.find(
        (item: { id: string }) => item.id === "female"
      );
      expect(female?.checked).toBe(true);
    });
  });

  describe("updateFilter — displayBy section (radio behavior)", () => {
    it("selecting cumulativerate deselects weeklyrate", () => {
      act(() => {
        useFilterStore
          .getState()
          .updateFilter("displayBy", "cumulativerate", true);
      });
      const { displayByState } = useFilterStore.getState();
      const cumulative = displayByState.find(
        (item: { id: string }) => item.id === "cumulativerate"
      );
      const weekly = displayByState.find(
        (item: { id: string }) => item.id === "weeklyrate"
      );
      expect(cumulative?.checked).toBe(true);
      expect(weekly?.checked).toBe(false);
    });

    it("selecting weeklyrate deselects cumulativerate", () => {
      // First set cumulativerate
      act(() => {
        useFilterStore
          .getState()
          .updateFilter("displayBy", "cumulativerate", true);
      });
      // Then switch to weeklyrate
      act(() => {
        useFilterStore
          .getState()
          .updateFilter("displayBy", "weeklyrate", true);
      });
      const { displayByState } = useFilterStore.getState();
      const cumulative = displayByState.find(
        (item: { id: string }) => item.id === "cumulativerate"
      );
      const weekly = displayByState.find(
        (item: { id: string }) => item.id === "weeklyrate"
      );
      expect(cumulative?.checked).toBe(false);
      expect(weekly?.checked).toBe(true);
    });

    it("only one displayBy option is checked at a time", () => {
      act(() => {
        useFilterStore
          .getState()
          .updateFilter("displayBy", "cumulativerate", true);
      });
      const { displayByState } = useFilterStore.getState();
      const checkedItems = displayByState.filter(
        (item: { checked: boolean }) => item.checked
      );
      expect(checkedItems).toHaveLength(1);
    });
  });

  describe("clearSection", () => {
    it("clears all items in regionState", () => {
      act(() => {
        useFilterStore.getState().clearSection("region");
      });
      const { regionState } = useFilterStore.getState();
      const anyChecked = regionState.some(
        (item: { checked: boolean }) => item.checked
      );
      expect(anyChecked).toBe(false);
    });

    it("clears all items in ageState", () => {
      act(() => {
        useFilterStore.getState().clearSection("age");
      });
      const { ageState } = useFilterStore.getState();
      const anyChecked = ageState.some(
        (item: { checked: boolean }) => item.checked
      );
      expect(anyChecked).toBe(false);
    });

    it("clears all items in genderState", () => {
      act(() => {
        useFilterStore.getState().clearSection("gender");
      });
      const { genderState } = useFilterStore.getState();
      const anyChecked = genderState.some(
        (item: { checked: boolean }) => item.checked
      );
      expect(anyChecked).toBe(false);
    });

    it("clears all items in displayByState", () => {
      act(() => {
        useFilterStore.getState().clearSection("displayBy");
      });
      const { displayByState } = useFilterStore.getState();
      const anyChecked = displayByState.some(
        (item: { checked: boolean }) => item.checked
      );
      expect(anyChecked).toBe(false);
    });

    it("clearing does not affect other sections", () => {
      act(() => {
        useFilterStore.getState().clearSection("region");
      });
      const { genderState } = useFilterStore.getState();
      const male = genderState.find(
        (item: { id: string }) => item.id === "male"
      );
      expect(male?.checked).toBe(true);
    });
  });
});
