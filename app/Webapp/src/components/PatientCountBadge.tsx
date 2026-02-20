// src/components/PatientCountBadge.tsx
"use client";

import React, { useEffect, useState } from "react";
import { Users, TrendingUp } from "lucide-react";

interface PatientCountData {
  [organization: string]: {
    unique_patients: number;
  };
}

interface PatientCountBadgeProps {
  data: PatientCountData | null;
  selectedInstitutionKey: string | null;
  isDarkMode?: boolean;
}

export const PatientCountBadge: React.FC<PatientCountBadgeProps> = ({
  data,
  selectedInstitutionKey,
}) => {
  const targetNumber =
    data && selectedInstitutionKey
      ? data[selectedInstitutionKey]?.unique_patients || 0
      : 0;

  // Start with the target number to avoid hydration mismatch
  const [displayNumber, setDisplayNumber] = useState(targetNumber);
  const [isClient, setIsClient] = useState(false);

  // Only run animation on client side
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Animated counter effect - only on client
  useEffect(() => {
    if (!isClient) return;

    // Reset to 0 for animation
    setDisplayNumber(0);

    const duration = 1500; // 1.5 seconds
    const steps = 60;
    const increment = targetNumber / steps;
    let currentStep = 0;

    const timer = setInterval(() => {
      currentStep++;
      if (currentStep >= steps) {
        setDisplayNumber(targetNumber);
        clearInterval(timer);
      } else {
        setDisplayNumber(Math.floor(increment * currentStep));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [targetNumber, isClient]);

  if (!data || !selectedInstitutionKey) return null;

  const allData = data["ALL"];
  const percentage =
    allData && selectedInstitutionKey !== "ALL"
      ? ((targetNumber / allData.unique_patients) * 100).toFixed(1)
      : null;

  return (
    <div className="inline-flex items-center gap-4 px-6 py-3 bg-gradient-to-r from-blue-500/10 to-purple-500/10 dark:from-blue-500/20 dark:to-purple-500/20 backdrop-blur-sm rounded-full border border-blue-200/50 dark:border-blue-700/50 shadow-lg">
      <div className="flex items-center gap-2">
        <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full shadow-inner">
          <Users className="w-4 h-4 text-white" />
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-gray-600 dark:text-gray-400 font-medium uppercase tracking-wider">
            Total Patients
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
              {displayNumber.toLocaleString()}
            </span>
            {percentage && (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                ({percentage}%)
              </span>
            )}
          </div>
        </div>
      </div>

      {selectedInstitutionKey !== "ALL" && allData && (
        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 border-l border-gray-300 dark:border-gray-600 pl-4">
          <TrendingUp className="w-3 h-3" />
          <span>of {allData.unique_patients.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
};

// Alternative: Minimal floating badge
export const PatientCountMinimal: React.FC<PatientCountBadgeProps> = ({
  data,
  selectedInstitutionKey,
}) => {
  if (!data || !selectedInstitutionKey) return null;

  const count = data[selectedInstitutionKey]?.unique_patients || 0;

  return (
    <div className="fixed top-24 right-8 z-40">
      <div className="group relative">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg blur opacity-75 group-hover:opacity-100 transition duration-200"></div>
        <div className="relative flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-900 rounded-lg shadow-xl">
          <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            {count.toLocaleString()} patients
          </span>
        </div>
      </div>
    </div>
  );
};

// Alternative: Inline stats for chart headers
export const PatientCountInline: React.FC<PatientCountBadgeProps> = ({
  data,
  selectedInstitutionKey,
}) => {
  if (!data || !selectedInstitutionKey) return null;

  const count = data[selectedInstitutionKey]?.unique_patients || 0;
  const allCount = data["ALL"]?.unique_patients || 0;

  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 dark:bg-blue-900/30 rounded-full">
        <Users className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
        <span className="font-medium text-blue-700 dark:text-blue-300">
          {count.toLocaleString()}
        </span>
      </div>
      {selectedInstitutionKey !== "ALL" && (
        <span className="text-gray-500 dark:text-gray-400">
          {((count / allCount) * 100).toFixed(1)}% of total
        </span>
      )}
    </div>
  );
};
