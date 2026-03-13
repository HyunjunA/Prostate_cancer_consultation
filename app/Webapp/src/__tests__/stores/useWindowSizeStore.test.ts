import { useWindowSizeStore } from "@/stores/useWindowSizeStore";
import { act } from "@testing-library/react";

beforeEach(() => {
  act(() => {
    useWindowSizeStore.setState({ width: 1024, height: 768 });
  });
});

describe("useWindowSizeStore", () => {
  it("has numeric width and height values", () => {
    const state = useWindowSizeStore.getState();
    expect(typeof state.width).toBe("number");
    expect(typeof state.height).toBe("number");
  });

  it("setWindowSize updates both width and height", () => {
    act(() => {
      useWindowSizeStore.getState().setWindowSize(1920, 1080);
    });
    const state = useWindowSizeStore.getState();
    expect(state.width).toBe(1920);
    expect(state.height).toBe(1080);
  });

  it("setWindowSize handles small dimensions", () => {
    act(() => {
      useWindowSizeStore.getState().setWindowSize(320, 480);
    });
    const state = useWindowSizeStore.getState();
    expect(state.width).toBe(320);
    expect(state.height).toBe(480);
  });

  it("setWindowSize handles zero values", () => {
    act(() => {
      useWindowSizeStore.getState().setWindowSize(0, 0);
    });
    const state = useWindowSizeStore.getState();
    expect(state.width).toBe(0);
    expect(state.height).toBe(0);
  });

  it("setWindowSize handles very large dimensions", () => {
    act(() => {
      useWindowSizeStore.getState().setWindowSize(7680, 4320);
    });
    const state = useWindowSizeStore.getState();
    expect(state.width).toBe(7680);
    expect(state.height).toBe(4320);
  });

  it("multiple setWindowSize calls use the latest values", () => {
    act(() => {
      useWindowSizeStore.getState().setWindowSize(800, 600);
      useWindowSizeStore.getState().setWindowSize(1024, 768);
      useWindowSizeStore.getState().setWindowSize(1440, 900);
    });
    const state = useWindowSizeStore.getState();
    expect(state.width).toBe(1440);
    expect(state.height).toBe(900);
  });
});
