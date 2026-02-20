// src/components/DashboardHeader.tsx
import React from "react";
import { LayoutDashboard, ChevronDown, ChevronUp } from "lucide-react";

interface DashboardHeaderProps {
  isSettingsOpen: boolean;
  setIsSettingsOpen: (isOpen: boolean) => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  isSettingsOpen,
  setIsSettingsOpen,
}) => (
  <div
    id="dashboard-header"
    className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg border-b border-gray-200 dark:border-gray-700"
  >
    <div className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400">
            {/* NUSPAR Visualization */}
            SARS-CoV-2 Visualization
          </h1>
        </div>

        <button
          onClick={() => setIsSettingsOpen(!isSettingsOpen)}
          title={
            isSettingsOpen
              ? "Hide visualization options"
              : "Show visualization options"
          }
          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200"
        >
          {isSettingsOpen ? (
            <ChevronUp className="w-5 h-5" />
          ) : (
            <ChevronDown className="w-5 h-5" />
          )}
        </button>
      </div>
    </div>
  </div>
);
