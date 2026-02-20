// PatientReport_Enhanced.tsx
// Example of how to integrate StarRatingWithTracking into existing PatientReport
// This shows the modifications needed without changing the original structure

"use client";

import React, { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import { StarRatingWithTracking } from "./StarRatingWithTracking";

interface PatientReportProps {
  isDarkMode?: boolean;
}

/* ---------------------------------------------
   Rating Engagement Analytics Hook
   Collects and manages all rating engagement data
---------------------------------------------- */
const useRatingEngagementAnalytics = () => {
  const [allRatingData, setAllRatingData] = useState<any[]>([]);

  const recordRatingEngagement = (data: any) => {
    setAllRatingData((prev) => [
      ...prev,
      { ...data, recordedAt: new Date().toISOString() },
    ]);

    // Send to analytics service (PostHog, Google Analytics, etc.)
    console.log("📊 Rating Engagement Data:", data);

    // Example: Send to PostHog
    if (typeof window !== "undefined" && (window as any).posthog) {
      (window as any).posthog.capture("rating_engagement", {
        topic: data.topic,
        finalRating: data.finalRating,
        timeToRate: data.timeToRate,
        hesitationTime: data.hesitationTime,
        ratingChanges: data.ratingChangeHistory.length,
        starsExplored: data.starsHovered.length,
        totalInteractionTime: data.totalInteractionTime,
      });
    }
  };

  const getRatingAnalytics = () => {
    if (allRatingData.length === 0) return null;

    return {
      totalRatings: allRatingData.length,
      averageTimeToRate:
        allRatingData.reduce((sum, d) => sum + d.timeToRate, 0) /
        allRatingData.length,
      averageHesitation:
        allRatingData.reduce((sum, d) => sum + d.hesitationTime, 0) /
        allRatingData.length,
      topicsWithChanges: allRatingData.filter(
        (d) => d.ratingChangeHistory.length > 1
      ).length,
      averageRating:
        allRatingData.reduce((sum, d) => sum + d.finalRating, 0) /
        allRatingData.length,
    };
  };

  return {
    allRatingData,
    recordRatingEngagement,
    getRatingAnalytics,
  };
};

/* ---------------------------------------------
   EXAMPLE INTEGRATION IN MAIN COMPONENT
---------------------------------------------- */

const PatientReport: React.FC<PatientReportProps> = ({
  isDarkMode = false,
}) => {
  // Original states
  const [patientData, setPatientData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"topics" | "full">("topics");
  const [ratings, setRatings] = useState<{
    overall: number;
    [k: string]: number;
  }>({
    overall: 0,
  });
  const [showKeys, setShowKeys] = useState<{ [k: string]: boolean }>({});

  // NEW: Rating engagement analytics
  const { recordRatingEngagement, getRatingAnalytics } =
    useRatingEngagementAnalytics();

  // Original functions
  const toggleKeyVisibility = (topic: string) =>
    setShowKeys((s) => ({ ...s, [topic]: !s[topic] }));

  const setTopicRating = (topic: string, v: number) =>
    setRatings((r) => ({ ...r, [topic]: v }));

  // NEW: Enhanced rating handler with engagement tracking
  const handleRatingWithEngagement = (
    topic: string,
    value: number,
    engagementData: any
  ) => {
    setTopicRating(topic, value);
    recordRatingEngagement(engagementData);
  };

  // Example of how to use the enhanced component in render
  // Replace original StarRating with StarRatingWithTracking:

  /*
  // BEFORE:
  <StarRating
    value={ratings[activeTab] || 0}
    onChange={(v) => setTopicRating(activeTab, v)}
    label="Rate clarity"
    isDark={isDarkMode}
    trackingName={`TopicRating_${activeTab?.replace(/\s+/g, "")}`}
  />

  // AFTER:
  <StarRatingWithTracking
    value={ratings[activeTab] || 0}
    onChange={(v) => setTopicRating(activeTab, v)}
    label="Rate clarity"
    isDark={isDarkMode}
    trackingName={`TopicRating_${activeTab?.replace(/\s+/g, "")}`}
    topicName={activeTab || ""}
    onEngagementData={(data) => recordRatingEngagement(data)}
  />
  */

  return (
    <div>
      {/* Your existing component JSX */}
      {/* Just replace StarRating with StarRatingWithTracking */}
    </div>
  );
};

export default PatientReport;
