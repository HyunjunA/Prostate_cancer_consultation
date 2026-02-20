// src/hooks/useChartSelection.ts
import { useState } from "react";

export const useChartSelection = () => {
  const [selectedCharts, setSelectedCharts] = useState(new Set());
  const [isSettingsOpen, setIsSettingsOpen] = useState(true);

  const toggleChart = (chartId: string) => {
    const newSelected = new Set(selectedCharts);
    if (newSelected.has(chartId)) {
      newSelected.delete(chartId);
    } else {
      newSelected.add(chartId);
    }
    setSelectedCharts(newSelected);
  };

  return {
    selectedCharts,
    isSettingsOpen,
    setIsSettingsOpen,
    toggleChart,
  };
};
