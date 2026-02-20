import React, { useMemo } from "react";
import {
  chartGroups,
  ChartOption,
  INSTITUTIONS,
  institutionOptions,
  getInstitutionLabel,
  type Institution,
} from "../config/chartOptions";
import { Users } from "lucide-react";

interface InstituteSettingsProps {
  ageData: any[];
  isSettingsOpen: boolean;
  lastSelectedInstitute: string | null;
  toggleInstitute: (instituteId: string) => void;
}

interface InstituteOptionProps {
  ageData: any[];
  institute: ChartOption;
  lastSelectedInstitute: string | null;
  toggleInstitute: (instituteId: string) => void;
  disabled?: boolean;
}

const InstituteOptionItem: React.FC<InstituteOptionProps> = ({
  ageData,
  institute,
  lastSelectedInstitute,
  toggleInstitute,
  disabled = false,
}) => (
  <label
    key={institute.id}
    className={`flex items-center space-x-2 group ${
      disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
    }`}
  >
    <input
      type="radio"
      name="institute-selection"
      checked={lastSelectedInstitute === institute.id}
      onChange={() => !disabled && toggleInstitute(institute.id)}
      disabled={disabled}
      className={`w-4 h-4 border-gray-300 text-blue-600 focus:ring-blue-500 ${
        disabled ? "cursor-not-allowed" : ""
      }`}
    />
    <span
      className={`text-sm transition-colors duration-200 ${
        disabled
          ? "text-gray-400 dark:text-gray-500"
          : "text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400"
      }`}
    >
      {institute.label}
      {disabled && (
        <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">
          (Coming Soon)
        </span>
      )}
    </span>
  </label>
);

export const InstituteSettings: React.FC<InstituteSettingsProps> = ({
  ageData,
  isSettingsOpen,
  lastSelectedInstitute,
  toggleInstitute,
}) => {
  // Calculate total count using useMemo to optimize performance
  const totalCount = useMemo(() => ageData?.length || 0, [ageData]);
  console.log("InstituteSettings-lastSelectedInstitute", lastSelectedInstitute);

  return (
    <div
      className={`transition-all duration-300 ease-in-out overflow-hidden ${
        isSettingsOpen ? "max-h-[500px] opacity-100 mb-8" : "max-h-0 opacity-0"
      }`}
    >
      <div className="bg-white/50 dark:bg-gray-800/50 backdrop-blur-lg rounded-xl p-6 shadow-lg">
        {/* Data Count Section */}
        {/* <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Select Data Analysis Type
          </h2>
          <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded-lg">
            <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
              {totalCount.toLocaleString()} people
            </span>
          </div>
        </div> */}

        {/* Individual Characteristics */}
        {/* <div className="mb-6">
          <h3 className="text-md font-medium mb-2 text-gray-700 dark:text-gray-300">
            Individual Characteristics
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {chartGroups.demographic.map((chart: ChartOption) => (
              <ChartOptionItem
                key={chart.id}
                ageData={ageData}
                chart={chart}
                selectedCharts={selectedCharts}
                toggleChart={toggleChart}
              />
            ))}
          </div>
        </div> */}

        {/* Group Distribution */}
        {/* <div className="mb-6">
          <h3 className="text-md font-medium mb-2 text-gray-700 dark:text-gray-300">
            Group Distribution
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {chartGroups.geographic.map((chart: ChartOption) => (
              <ChartOptionItem
                key={chart.id}
                ageData={ageData}
                chart={chart}
                selectedCharts={selectedCharts}
                toggleChart={toggleChart}
              />
            ))}
          </div>
        </div> */}

        {/* Characteristic Relationships */}
        {/* <div className="mb-6">
          <h3 className="text-md font-medium mb-2 text-gray-700 dark:text-gray-300">
            Characteristic Relationships
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {chartGroups.bivariate.map((chart: ChartOption) => (
              <ChartOptionItem
                key={chart.id}
                ageData={ageData}
                chart={chart}
                selectedCharts={selectedCharts}
                toggleChart={toggleChart}
              />
            ))}
          </div>
        </div> */}

        {/* Institutions */}
        <div>
          <h3 className="text-md font-medium mb-2 text-gray-700 dark:text-gray-300">
            Institutions
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {/* {chartGroups.institutions.map((institute: ChartOption) => {
              console.log("Institute:", institute);

              if (institute.id === "all-institutions") {
                return null;
              }

              return (
                <InstituteOptionItem
                  key={institute.id}
                  ageData={ageData}
                  institute={institute}
                  lastSelectedInstitute={lastSelectedInstitute}
                  toggleInstitute={toggleInstitute}
                />
              );
            })} */}
            {chartGroups.institutions.map((institute: ChartOption) => {
              console.log("Institute:", institute);

              return (
                <InstituteOptionItem
                  key={institute.id}
                  ageData={ageData}
                  institute={institute}
                  lastSelectedInstitute={lastSelectedInstitute}
                  toggleInstitute={toggleInstitute}
                  disabled={institute.id === "all-institutions"} // disabled prop 추가
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
