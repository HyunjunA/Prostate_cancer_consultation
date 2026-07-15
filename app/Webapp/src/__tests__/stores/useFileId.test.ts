import { useFileId } from "@/stores/useFileId";
import { act } from "@testing-library/react";

// The file id is session-scoped (URL-only) and must NOT touch localStorage.
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

  it("setFileId updates state without writing to localStorage", () => {
    act(() => {
      useFileId.getState().setFileId("F001");
    });
    expect(useFileId.getState().fileId).toBe("F001");
    expect(localStorage.getItem("fileId")).toBeNull();
  });

  it("setFileId overwrites previous value", () => {
    act(() => {
      useFileId.getState().setFileId("F001");
    });
    act(() => {
      useFileId.getState().setFileId("F002");
    });
    expect(useFileId.getState().fileId).toBe("F002");
  });

  it("setFileId handles empty string", () => {
    act(() => {
      useFileId.getState().setFileId("");
    });
    expect(useFileId.getState().fileId).toBe("");
  });

  it("clearFileId resets state to null", () => {
    act(() => {
      useFileId.getState().setFileId("F001");
    });
    act(() => {
      useFileId.getState().clearFileId();
    });
    expect(useFileId.getState().fileId).toBeNull();
  });

  it("initFromStorage is a no-op — never loads a stale id from localStorage", () => {
    localStorage.setItem("fileId", "F-STORED");
    act(() => {
      useFileId.getState().initFromStorage();
    });
    expect(useFileId.getState().fileId).toBeNull();
  });

  it("initFromStorage leaves existing state untouched", () => {
    act(() => {
      useFileId.setState({ fileId: "EXISTING" });
    });
    act(() => {
      useFileId.getState().initFromStorage();
    });
    expect(useFileId.getState().fileId).toBe("EXISTING");
  });
});
