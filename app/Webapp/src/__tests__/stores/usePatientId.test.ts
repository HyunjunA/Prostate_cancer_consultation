import { usePatientId } from "@/stores/usePatientId";
import { act } from "@testing-library/react";

// The patient id is session-scoped (URL-only) and must NOT touch localStorage.
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

  it("setPatientId updates state without writing to localStorage", () => {
    act(() => {
      usePatientId.getState().setPatientId("P001");
    });
    expect(usePatientId.getState().patientId).toBe("P001");
    expect(localStorage.getItem("patientId")).toBeNull();
  });

  it("setPatientId overwrites previous value", () => {
    act(() => {
      usePatientId.getState().setPatientId("P001");
    });
    act(() => {
      usePatientId.getState().setPatientId("P002");
    });
    expect(usePatientId.getState().patientId).toBe("P002");
  });

  it("setPatientId handles empty string", () => {
    act(() => {
      usePatientId.getState().setPatientId("");
    });
    expect(usePatientId.getState().patientId).toBe("");
  });

  it("clearPatientId resets state to null", () => {
    act(() => {
      usePatientId.getState().setPatientId("P001");
    });
    act(() => {
      usePatientId.getState().clearPatientId();
    });
    expect(usePatientId.getState().patientId).toBeNull();
  });

  it("initFromStorage is a no-op — never loads a stale id from localStorage", () => {
    localStorage.setItem("patientId", "P-STORED");
    act(() => {
      usePatientId.getState().initFromStorage();
    });
    expect(usePatientId.getState().patientId).toBeNull();
  });

  it("initFromStorage leaves existing state untouched", () => {
    act(() => {
      usePatientId.setState({ patientId: "EXISTING" });
    });
    act(() => {
      usePatientId.getState().initFromStorage();
    });
    expect(usePatientId.getState().patientId).toBe("EXISTING");
  });
});
