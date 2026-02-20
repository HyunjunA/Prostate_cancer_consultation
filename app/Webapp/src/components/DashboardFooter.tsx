import React, { useState, useEffect } from "react";
import { Info } from "lucide-react";

export const DashboardFooter: React.FC = () => {
  const [dateString, setDateString] = useState("");
  const [year, setYear] = useState("");

  // Only run on client-side to avoid hydration mismatch
  useEffect(() => {
    setDateString(new Date().toLocaleDateString());
    setYear(new Date().getFullYear().toString());
  }, []);

  return (
    <footer
      id="dashboard-footer"
      className="w-full bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700"
    >
      <div className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-blue-600" />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Last updated: {dateString}
            </p>
          </div>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            © {year} Prostate_cancer_consultation_dashboard. All rights
          </p>
        </div>
      </div>
    </footer>
  );
};
