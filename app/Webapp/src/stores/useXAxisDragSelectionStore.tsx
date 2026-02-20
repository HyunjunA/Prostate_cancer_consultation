// import { create } from "zustand";

// interface DataPoint {
//   week_ending: string;
// }

// interface XAxisDragSelectionStore {
//   startDate: string | null;
//   endDate: string | null;
//   isDragging: boolean;
//   isDoubleClicked: boolean;
//   setDateRange: (start: string | null, end: string | null) => void;
//   setIsDragging: (dragging: boolean) => void;
//   setIsDoubleClicked: (doubleClicked: boolean) => void;
// }

// export const useXAxisDragSelectionStore = create<XAxisDragSelectionStore>(
//   (set) => ({
//     startDate: null,
//     endDate: null,
//     isDragging: false,
//     isDoubleClicked: false,
//     setDateRange: (start, end) => set({ startDate: start, endDate: end }),
//     setIsDragging: (dragging) => set({ isDragging: dragging }),
//     setIsDoubleClicked: (doubleClicked) =>
//       set({ isDoubleClicked: doubleClicked }),
//   })
// );

import { create } from "zustand";

interface DataPoint {
  week_ending: string;
  id: string; // Added ID field to DataPoint
}

interface XAxisDragSelectionStore {
  id: string | null; // Added ID field
  startDate: string | null;
  endDate: string | null;
  isDragging: boolean;
  isDoubleClicked: boolean;
  setDateRange: (start: string | null, end: string | null) => void;
  setIsDragging: (dragging: boolean) => void;
  setIsDoubleClicked: (doubleClicked: boolean) => void;
  setId: (id: string | null) => void; // Added setter for ID
}

export const useXAxisDragSelectionStore = create<XAxisDragSelectionStore>(
  (set) => ({
    id: null, // Initial ID value
    startDate: null,
    endDate: null,
    isDragging: false,
    isDoubleClicked: false,
    setDateRange: (start, end) => set({ startDate: start, endDate: end }),
    setIsDragging: (dragging) => set({ isDragging: dragging }),
    setIsDoubleClicked: (doubleClicked) =>
      set({ isDoubleClicked: doubleClicked }),
    setId: (id) => set({ id }), // Added ID setter
  })
);
