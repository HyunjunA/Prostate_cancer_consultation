import { useThemeStore } from "@/stores/useThemeStore";
import { act } from "@testing-library/react";

beforeEach(() => {
  act(() => {
    useThemeStore.setState({ isDarkMode: false });
  });
});

describe("useThemeStore", () => {
  it("initializes with isDarkMode false", () => {
    expect(useThemeStore.getState().isDarkMode).toBe(false);
  });

  it("toggleTheme switches from false to true", () => {
    act(() => {
      useThemeStore.getState().toggleTheme();
    });
    expect(useThemeStore.getState().isDarkMode).toBe(true);
  });

  it("toggleTheme switches from true to false", () => {
    act(() => {
      useThemeStore.setState({ isDarkMode: true });
    });
    act(() => {
      useThemeStore.getState().toggleTheme();
    });
    expect(useThemeStore.getState().isDarkMode).toBe(false);
  });

  it("toggleTheme twice returns to original state", () => {
    act(() => {
      useThemeStore.getState().toggleTheme();
    });
    act(() => {
      useThemeStore.getState().toggleTheme();
    });
    expect(useThemeStore.getState().isDarkMode).toBe(false);
  });

  it("multiple rapid toggles produce correct final state", () => {
    act(() => {
      useThemeStore.getState().toggleTheme(); // true
      useThemeStore.getState().toggleTheme(); // false
      useThemeStore.getState().toggleTheme(); // true
    });
    expect(useThemeStore.getState().isDarkMode).toBe(true);
  });
});
