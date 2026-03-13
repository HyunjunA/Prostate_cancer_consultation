import { useFileId } from "@/stores/useFileId";
import { act } from "@testing-library/react";

beforeEach(() => {
  act(() => {
    useFileId.setState({ fileId: null });
  });
  localStorage.clear();
});

describe("useFileId", () => {
  it("initializes with null fileId", () => {
    expect(useFileId.getState().fileId).toBeNull();
  });

  it("setFileId updates state and saves to localStorage", () => {
    act(() => {
      useFileId.getState().setFileId("F001");
    });
    expect(useFileId.getState().fileId).toBe("F001");
    expect(localStorage.getItem("fileId")).toBe("F001");
  });

  it("setFileId overwrites previous value", () => {
    act(() => {
      useFileId.getState().setFileId("F001");
    });
    act(() => {
      useFileId.getState().setFileId("F002");
    });
    expect(useFileId.getState().fileId).toBe("F002");
    expect(localStorage.getItem("fileId")).toBe("F002");
  });

  it("setFileId handles empty string", () => {
    act(() => {
      useFileId.getState().setFileId("");
    });
    expect(useFileId.getState().fileId).toBe("");
    expect(localStorage.getItem("fileId")).toBe("");
  });

  it("clearFileId resets state to null and removes from localStorage", () => {
    act(() => {
      useFileId.getState().setFileId("F001");
    });
    act(() => {
      useFileId.getState().clearFileId();
    });
    expect(useFileId.getState().fileId).toBeNull();
    expect(localStorage.getItem("fileId")).toBeNull();
  });

  it("initFromStorage loads fileId from localStorage", () => {
    localStorage.setItem("fileId", "F-STORED");
    act(() => {
      useFileId.getState().initFromStorage();
    });
    expect(useFileId.getState().fileId).toBe("F-STORED");
  });

  it("initFromStorage does nothing when localStorage is empty", () => {
    act(() => {
      useFileId.getState().initFromStorage();
    });
    expect(useFileId.getState().fileId).toBeNull();
  });

  it("initFromStorage preserves existing state when key missing from localStorage", () => {
    act(() => {
      useFileId.setState({ fileId: "EXISTING" });
    });
    act(() => {
      useFileId.getState().initFromStorage();
    });
    expect(useFileId.getState().fileId).toBe("EXISTING");
  });
});
