// src/components/PatientCountDynamic.tsx
import dynamic from "next/dynamic";

// Loading skeleton component
const LoadingSkeleton = () => (
  <div className="inline-flex items-center gap-4 px-6 py-3 bg-gray-100 dark:bg-gray-800 rounded-full animate-pulse">
    <div className="w-8 h-8 bg-gray-300 dark:bg-gray-600 rounded-full" />
    <div className="space-y-2">
      <div className="w-20 h-3 bg-gray-300 dark:bg-gray-600 rounded" />
      <div className="w-24 h-6 bg-gray-300 dark:bg-gray-600 rounded" />
    </div>
  </div>
);

// Dynamic import for PatientCountBadge with SSR disabled
export const PatientCountBadge = dynamic(
  () => import("./PatientCountBadge").then((mod) => mod.PatientCountBadge),
  {
    ssr: false,
    loading: () => <LoadingSkeleton />,
  }
);

// Dynamic import for PatientCountMinimal with SSR disabled
export const PatientCountMinimal = dynamic(
  () => import("./PatientCountBadge").then((mod) => mod.PatientCountMinimal),
  { ssr: false }
);

// Dynamic import for PatientCountInline with SSR disabled
export const PatientCountInline = dynamic(
  () => import("./PatientCountBadge").then((mod) => mod.PatientCountInline),
  { ssr: false }
);
