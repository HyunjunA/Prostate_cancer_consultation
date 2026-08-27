// src/hooks/useInstituteSelection.tsx
import React, { useState } from "react";

export const useInstituteSelection = () => {
  const [selectedInstitutes, setSelectedInstitutes] = useState(
    new Set<string>()
  );
  const [lastSelectedInstitute, setLastSelectedInstitute] = useState<
    string | null
  >(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(true);

  // ⬇️ only this block was changed
  const toggleInstitute = (instituteId: string) => {
    // Radio-button behaviour: exactly one option stays selected
    const newSelected = new Set<string>([instituteId]);
    setSelectedInstitutes(newSelected);
    setLastSelectedInstitute(instituteId);
  };
  // ⬆️ end of the changed block

  return {
    selectedInstitutes,
    lastSelectedInstitute,
    isSettingsOpen,
    setIsSettingsOpen,
    toggleInstitute,
  };
};
