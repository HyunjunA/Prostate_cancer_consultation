// src/hooks/useSectionSelection.tsx
import { useState } from "react";

export const useSectionSelection = () => {
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(true);

  // Define individual section IDs
  const individualSections = [
    "publication",
    "sequence",
    "clinical",
    "demographic",
  ];

  const toggleSection = (sectionId: string) => {
    if (sectionId === "all") {
      // When toggling "All"
      const isAllCurrentlySelected =
        selectedSections.includes("all") ||
        individualSections.every((id) => selectedSections.includes(id));

      if (isAllCurrentlySelected) {
        // Deselect all sections
        setSelectedSections([]);
      } else {
        // Select all individual sections (excluding "all")
        setSelectedSections([...individualSections]);
      }
    } else {
      // Toggle individual section
      setSelectedSections((prev) => {
        let newSections;
        if (prev.includes(sectionId)) {
          // Remove section
          newSections = prev.filter((id) => id !== sectionId && id !== "all");
        } else {
          // Add section
          newSections = [...prev.filter((id) => id !== "all"), sectionId];

          // Check if all individual sections are selected
          if (individualSections.every((id) => newSections.includes(id))) {
            // If all individual sections are selected, add "all" for display
            newSections = [...newSections, "all"];
          }
        }
        return newSections;
      });
    }
  };

  // Helper function to check if "All" is selected
  const isAllSelected = () => {
    return (
      selectedSections.includes("all") ||
      individualSections.every((id) => selectedSections.includes(id))
    );
  };

  // Helper function to check if a specific section is selected
  const isSectionSelected = (sectionId: string) => {
    if (sectionId === "all") {
      return isAllSelected();
    }
    return selectedSections.includes(sectionId);
  };

  return {
    selectedSections,
    isSettingsOpen,
    setIsSettingsOpen,
    toggleSection,
    isAllSelected,
    isSectionSelected,
    individualSections,
  };
};
