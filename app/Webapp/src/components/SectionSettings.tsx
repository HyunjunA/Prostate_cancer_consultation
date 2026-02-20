import React, { useMemo } from "react";
import {
  Users,
  FileText,
  Database,
  Activity,
  User,
  CheckSquare,
} from "lucide-react";

interface SectionOption {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  itemCount?: number;
}

interface SectionSettingsProps {
  ageData: any[];
  isSettingsOpen: boolean;
  selectedSections: string[];
  toggleSection: (sectionId: string) => void;
}

interface SectionOptionProps {
  ageData: any[];
  section: SectionOption;
  selectedSections: string[];
  toggleSection: (sectionId: string) => void;
  disabled?: boolean;
}

const SectionOptionItem: React.FC<SectionOptionProps> = ({
  ageData,
  section,
  selectedSections,
  toggleSection,
  disabled = false,
}) => {
  const isSelected = selectedSections.includes(section.id);

  return (
    <label
      key={section.id}
      className={`flex items-center space-x-3 p-4 rounded-lg border transition-all duration-200 group ${
        disabled
          ? "opacity-50 cursor-not-allowed bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
          : isSelected
          ? "cursor-pointer bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-600"
          : "cursor-pointer bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-blue-25 dark:hover:bg-blue-900/20 hover:border-blue-200 dark:hover:border-blue-700"
      }`}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => !disabled && toggleSection(section.id)}
        disabled={disabled}
        className={`w-4 h-4 border-gray-300 text-blue-600 focus:ring-blue-500 rounded ${
          disabled ? "cursor-not-allowed" : ""
        }`}
      />
      <div className="flex items-center space-x-3 flex-1">
        <div
          className={`flex-shrink-0 ${
            disabled
              ? "text-gray-400 dark:text-gray-500"
              : isSelected
              ? "text-blue-600 dark:text-blue-400"
              : "text-gray-500 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400"
          }`}
        >
          {section.icon}
        </div>
        <div className="flex-1">
          <div
            className={`font-medium text-sm transition-colors duration-200 ${
              disabled
                ? "text-gray-400 dark:text-gray-500"
                : isSelected
                ? "text-blue-700 dark:text-blue-300"
                : "text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400"
            }`}
          >
            {section.label}
            {disabled && (
              <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                (Coming Soon)
              </span>
            )}
          </div>
          <div
            className={`text-xs mt-1 ${
              disabled
                ? "text-gray-400 dark:text-gray-500"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            {section.description}
          </div>
          {section.itemCount && (
            <div
              className={`text-xs mt-1 ${
                disabled
                  ? "text-gray-400 dark:text-gray-500"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              {section.itemCount} datasets available
            </div>
          )}
        </div>
      </div>
    </label>
  );
};

export const SectionSettings: React.FC<SectionSettingsProps> = ({
  ageData,
  isSettingsOpen,
  selectedSections,
  toggleSection,
}) => {
  // Calculate total count using useMemo to optimize performance
  const totalCount = useMemo(() => ageData?.length || 0, [ageData]);
  console.log("SectionSettings-selectedSections", selectedSections);

  // Define the sections including "All"
  const sections: SectionOption[] = [
    {
      id: "all",
      label: "All Sections",
      description: "Show all available data categories",
      icon: <CheckSquare className="w-5 h-5" />,
      itemCount: 15,
    },
    {
      id: "publication",
      label: "Publication Data",
      description:
        "Geographic distribution of studies and publication trends over time",
      icon: <FileText className="w-5 h-5" />,
      itemCount: 2,
    },
    {
      id: "sequence",
      label: "Sequence Data",
      description:
        "Sequence data reporting rates and repository distribution patterns",
      icon: <Database className="w-5 h-5" />,
      itemCount: 3,
    },
    {
      id: "clinical",
      label: "Clinical Data",
      description:
        "Reporting rates for clinical information across research papers",
      icon: <Activity className="w-5 h-5" />,
      itemCount: 7,
    },
    {
      id: "demographic",
      label: "Demographic Data",
      description:
        "Reporting rates for demographic information in research studies",
      icon: <User className="w-5 h-5" />,
      itemCount: 3,
    },
  ];

  // Check if all individual sections are selected
  const individualSections = sections.filter((s) => s.id !== "all");
  const allIndividualSelected = individualSections.every((section) =>
    selectedSections.includes(section.id)
  );

  return (
    <div
      className={`transition-all duration-300 ease-in-out overflow-hidden ${
        isSettingsOpen ? "max-h-[600px] opacity-100 mb-8" : "max-h-0 opacity-0"
      }`}
    >
      <div className="bg-white/50 dark:bg-gray-800/50 backdrop-blur-lg rounded-xl p-6 shadow-lg">
        {/* Data Count Section */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Data Sections
          </h2>
          {/* <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded-lg">
            <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
              {totalCount.toLocaleString()} records
            </span>
          </div> */}
        </div>

        {/* Sections */}
        <div>
          <h3 className="text-md font-medium mb-4 text-gray-700 dark:text-gray-300">
            Data Categories
            <span className="text-xs font-normal text-gray-500 dark:text-gray-400 ml-2">
              (Select multiple sections)
            </span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sections.map((section: SectionOption) => {
              console.log("Section:", section);

              // Special handling for "all" option
              let actualSelectedSections = selectedSections;
              if (section.id === "all") {
                actualSelectedSections = allIndividualSelected ? ["all"] : [];
              }

              return (
                <SectionOptionItem
                  key={section.id}
                  ageData={ageData}
                  section={section}
                  selectedSections={actualSelectedSections}
                  toggleSection={toggleSection}
                  disabled={false}
                />
              );
            })}
          </div>

          {/* Selection Summary */}
          {selectedSections.length > 0 && (
            <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <p className="text-sm text-green-700 dark:text-green-300">
                <strong>{selectedSections.length}</strong> section
                {selectedSections.length > 1 ? "s" : ""} selected
                {selectedSections.includes("all") ? " (All sections)" : ""}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
