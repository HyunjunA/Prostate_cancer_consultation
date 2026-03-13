import { usePatientId } from "@/stores/usePatientId";
import { act } from "@testing-library/react";

// Reset store and localStorage between tests
beforeEach(() => {
  act(() => {
    usePatientId.setState({ patientId: null });
  });
  localStorage.clear();
});

describe("usePatientId", () => {
  it("initializes with null patientId", () => {
    expect(usePatientId.getState().patientId).toBeNull();
  });

  it("setPatientId updates state and saves to localStorage", () => {
    act(() => {
      usePatientId.getState().setPatientId("P001");
    });
    expect(usePatientId.getState().patientId).toBe("P001");
    expect(localStorage.getItem("patientId")).toBe("P001");
  });

  it("setPatientId overwrites previous value", () => {
    act(() => {
      usePatientId.getState().setPatientId("P001");
    });
    act(() => {
      usePatientId.getState().setPatientId("P002");
    });
    expect(usePatientId.getState().patientId).toBe("P002");
    expect(localStorage.getItem("patientId")).toBe("P002");
  });

  it("setPatientId handles empty string", () => {
    act(() => {
      usePatientId.getState().setPatientId("");
    });
    expect(usePatientId.getState().patientId).toBe("");
    expect(localStorage.getItem("patientId")).toBe("");
  });

  it("clearPatientId resets state to null and removes from localStorage", () => {
    act(() => {
      usePatientId.getState().setPatientId("P001");
    });
    act(() => {
      usePatientId.getState().clearPatientId();
    });
    expect(usePatientId.getState().patientId).toBeNull();
    expect(localStorage.getItem("patientId")).toBeNull();
  });

  it("initFromStorage loads patientId from localStorage", () => {
    localStorage.setItem("patientId", "P-STORED");
    act(() => {
      usePatientId.getState().initFromStorage();
    });
    expect(usePatientId.getState().patientId).toBe("P-STORED");
  });

  it("initFromStorage does nothing when localStorage is empty", () => {
    act(() => {
      usePatientId.getState().initFromStorage();
    });
    expect(usePatientId.getState().patientId).toBeNull();
  });

  it("initFromStorage does not overwrite state when localStorage key missing", () => {
    act(() => {
      usePatientId.setState({ patientId: "EXISTING" });
    });
    // localStorage has no patientId key
    act(() => {
      usePatientId.getState().initFromStorage();
    });
    // State should remain unchanged since localStorage.getItem returns null (falsy)
    expect(usePatientId.getState().patientId).toBe("EXISTING");
  });
});
