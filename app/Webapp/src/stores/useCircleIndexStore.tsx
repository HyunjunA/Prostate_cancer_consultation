import { create } from "zustand";
import { persist } from "zustand/middleware";

interface CircleIndexState {
  index: number;
  setIndex: (index: number) => void;
  moveCircle: (direction: "left" | "right", dataLength: number) => void;
}

export const useCircleIndexStore = create<CircleIndexState>()(
  // persist middleware를 사용하여 페이지 새로고침시에도 상태 유지
  persist(
    (set, get) => ({
      index: -1,
      setIndex: (newIndex: number) => set({ index: newIndex }),
      moveCircle: (direction: "left" | "right", dataLength: number) => {
        const currentIndex = get().index;
        const newIndex =
          currentIndex === -1
            ? direction === "right"
              ? 0
              : dataLength - 1
            : direction === "right"
            ? Math.min(currentIndex + 1, dataLength - 1)
            : Math.max(0, currentIndex - 1);

        if (newIndex !== currentIndex) {
          set({ index: newIndex });
        }
      },
    }),
    {
      name: "circle-index-storage", // unique name for storage
    }
  )
);
