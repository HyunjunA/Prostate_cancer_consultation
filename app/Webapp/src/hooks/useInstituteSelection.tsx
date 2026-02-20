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

  // ⬇️ 이 부분만 수정됨
  const toggleInstitute = (instituteId: string) => {
    // Radio 버튼 방식: 항상 하나만 선택되도록 수정
    const newSelected = new Set<string>([instituteId]);
    setSelectedInstitutes(newSelected);
    setLastSelectedInstitute(instituteId);
  };
  // ⬆️ 여기까지만 수정

  return {
    selectedInstitutes,
    lastSelectedInstitute,
    isSettingsOpen,
    setIsSettingsOpen,
    toggleInstitute,
  };
};
