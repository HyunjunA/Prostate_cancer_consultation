import { useDoctorId } from "@/stores/useDoctorId";
import { act } from "@testing-library/react";

// The doctor id is session-scoped (URL-only) and must NOT touch localStorage.
beforeEach(() => {
  act(() => {
    useDoctorId.setState({ doctorId: null });
  });
  localStorage.clear();
});

describe("useDoctorId", () => {
  it("initializes with null doctorId", () => {
    expect(useDoctorId.getState().doctorId).toBeNull();
  });

  it("setDoctorId updates state without writing to localStorage", () => {
    act(() => {
      useDoctorId.getState().setDoctorId("D001");
    });
    expect(useDoctorId.getState().doctorId).toBe("D001");
    expect(localStorage.getItem("doctorId")).toBeNull();
  });

  it("setDoctorId overwrites previous value", () => {
    act(() => {
      useDoctorId.getState().setDoctorId("D001");
    });
    act(() => {
      useDoctorId.getState().setDoctorId("D002");
    });
    expect(useDoctorId.getState().doctorId).toBe("D002");
  });

  it("setDoctorId handles empty string", () => {
    act(() => {
      useDoctorId.getState().setDoctorId("");
    });
    expect(useDoctorId.getState().doctorId).toBe("");
  });

  it("clearDoctorId resets state to null", () => {
    act(() => {
      useDoctorId.getState().setDoctorId("D001");
    });
    act(() => {
      useDoctorId.getState().clearDoctorId();
    });
    expect(useDoctorId.getState().doctorId).toBeNull();
  });

  it("initFromStorage is a no-op — never loads a stale id from localStorage", () => {
    localStorage.setItem("doctorId", "D-STORED");
    act(() => {
      useDoctorId.getState().initFromStorage();
    });
    expect(useDoctorId.getState().doctorId).toBeNull();
  });

  it("initFromStorage leaves existing state untouched", () => {
    act(() => {
      useDoctorId.setState({ doctorId: "EXISTING" });
    });
    act(() => {
      useDoctorId.getState().initFromStorage();
    });
    expect(useDoctorId.getState().doctorId).toBe("EXISTING");
  });
});
