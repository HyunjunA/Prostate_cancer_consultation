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

interface ChartSettingsProps {
  ageData: any[];
  isSettingsOpen: boolean;
  selectedCharts: Set<string>;
  toggleChart: (chartId: string) => void;
}

interface ChartOptionProps {
  ageData: any[];
  chart: ChartOption;
  selectedCharts: Set<string>;
  toggleChart: (chartId: string) => void;
}

const ChartOptionItem: React.FC<ChartOptionProps> = ({
  ageData,
  chart,
  selectedCharts,
  toggleChart,
}) => (
  <label
    key={chart.id}
    className="flex items-center space-x-2 cursor-pointer group"
  >
    <input
      type="checkbox"
      checked={selectedCharts.has(chart.id)}
      onChange={() => toggleChart(chart.id)}
      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
    />
    <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-200">
      {chart.label}
    </span>
  </label>
);

export const ChartSettings: React.FC<ChartSettingsProps> = ({
  ageData,
  isSettingsOpen,
  selectedCharts,
  toggleChart,
}) => {
  // Calculate total count using useMemo to optimize performance
  const totalCount = useMemo(() => ageData?.length || 0, [ageData]);
  console.log("ChartSettings-selectedCharts", selectedCharts);
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
            {chartGroups.institutions.map((chart: ChartOption) => (
              <ChartOptionItem
                key={chart.id}
                ageData={ageData}
                chart={chart}
                selectedCharts={selectedCharts}
                toggleChart={toggleChart}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
