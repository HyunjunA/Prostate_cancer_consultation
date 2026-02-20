import { create } from "zustand";

interface DataPoint {
  week_ending: string;
}

interface XAxisSelectionStore {
  selectedDateOnXaxis: DataPoint | null;
  setSelectedDateOnXaxis: (data: DataPoint | null) => void;
}

export const useXAxisSelectionStore = create<XAxisSelectionStore>((set) => ({
  selectedDateOnXaxis: null,
  setSelectedDateOnXaxis: (data) => set({ selectedDateOnXaxis: data }),
}));
