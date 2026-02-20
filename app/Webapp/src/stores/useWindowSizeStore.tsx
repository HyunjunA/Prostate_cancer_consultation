import { create } from "zustand";

interface WindowSizeState {
  width: number;
  height: number;
  setWindowSize: (width: number, height: number) => void;
}

export const useWindowSizeStore = create<WindowSizeState>((set) => ({
  width: typeof window !== "undefined" ? window.innerWidth : 0,
  height: typeof window !== "undefined" ? window.innerHeight : 0,
  setWindowSize: (width: number, height: number) =>
    set(() => ({
      width,
      height,
    })),
}));
