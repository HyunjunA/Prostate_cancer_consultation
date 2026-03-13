import { useDoctorId } from "@/stores/useDoctorId";
import { act } from "@testing-library/react";

beforeEach(() => {
  act(() => {
    useDoctorId.setState({ doctorId: null });
  });
  localStorage.clear();
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("useDoctorId", () => {
  it("initializes with null doctorId", () => {
    expect(useDoctorId.getState().doctorId).toBeNull();
  });

  it("setDoctorId updates state and saves to localStorage", () => {
    act(() => {
      useDoctorId.getState().setDoctorId("D001");
    });
    expect(useDoctorId.getState().doctorId).toBe("D001");
    expect(localStorage.getItem("doctorId")).toBe("D001");
  });

  it("setDoctorId logs the doctor ID", () => {
    act(() => {
      useDoctorId.getState().setDoctorId("D001");
    });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Doctor ID set:"),
      "D001"
    );
  });

  it("setDoctorId overwrites previous value", () => {
    act(() => {
      useDoctorId.getState().setDoctorId("D001");
    });
    act(() => {
      useDoctorId.getState().setDoctorId("D002");
    });
    expect(useDoctorId.getState().doctorId).toBe("D002");
    expect(localStorage.getItem("doctorId")).toBe("D002");
  });

  it("setDoctorId handles empty string", () => {
    act(() => {
      useDoctorId.getState().setDoctorId("");
    });
    expect(useDoctorId.getState().doctorId).toBe("");
    expect(localStorage.getItem("doctorId")).toBe("");
  });

  it("clearDoctorId resets state to null and removes from localStorage", () => {
    act(() => {
      useDoctorId.getState().setDoctorId("D001");
    });
    act(() => {
      useDoctorId.getState().clearDoctorId();
    });
    expect(useDoctorId.getState().doctorId).toBeNull();
    expect(localStorage.getItem("doctorId")).toBeNull();
  });

  it("clearDoctorId logs the clear action", () => {
    act(() => {
      useDoctorId.getState().clearDoctorId();
    });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Doctor ID cleared")
    );
  });

  it("initFromStorage loads doctorId from localStorage", () => {
    localStorage.setItem("doctorId", "D-STORED");
    act(() => {
      useDoctorId.getState().initFromStorage();
    });
    expect(useDoctorId.getState().doctorId).toBe("D-STORED");
  });

  it("initFromStorage logs the loaded doctor ID", () => {
    localStorage.setItem("doctorId", "D-STORED");
    act(() => {
      useDoctorId.getState().initFromStorage();
    });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Doctor ID loaded from storage:"),
      "D-STORED"
    );
  });

  it("initFromStorage does nothing when localStorage is empty", () => {
    act(() => {
      useDoctorId.getState().initFromStorage();
    });
    expect(useDoctorId.getState().doctorId).toBeNull();
  });

  it("initFromStorage preserves existing state when key missing from localStorage", () => {
    act(() => {
      useDoctorId.setState({ doctorId: "EXISTING" });
    });
    act(() => {
      useDoctorId.getState().initFromStorage();
    });
    expect(useDoctorId.getState().doctorId).toBe("EXISTING");
  });
});
