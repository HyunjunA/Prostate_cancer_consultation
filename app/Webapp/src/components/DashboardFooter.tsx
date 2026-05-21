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
      {/* `pl-16 sm:pl-4` reserves space on the left for the fixed ThemeToggle
          (bottom-8 left-4) so its icon never overlaps the attribution text on
          narrow viewports. On sm+ the toggle no longer reaches the footer. */}
      <div className="max-w-[90rem] mx-auto pl-16 pr-4 sm:px-6 lg:px-8 py-2">
        {/* Stack metadata + © on mobile, side-by-side on sm+. */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-2">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-600 shrink-0" />
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
              Last updated: {dateString}
            </p>
          </div>

          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            © {year} COMPASS. All rights reserved.
          </p>
        </div>

        {/* Attribution — abbreviated on mobile, full on sm+ to avoid 3-line wrap. */}
        <p className="mt-1 text-[11px] sm:text-xs text-center text-gray-500 dark:text-gray-400">
          <span className="sm:hidden">
            R01 Prostate Cancer Communication Study, Cedars-Sinai
          </span>
          <span className="hidden sm:inline">
            COMPASS — Communication of Prognosis, Alternatives, and Side Effects for Shared Decision Making
            {" · "}
            R01 Prostate Cancer Communication Study, Cedars-Sinai Medical Center
          </span>
        </p>
      </div>
    </footer>
  );
};
