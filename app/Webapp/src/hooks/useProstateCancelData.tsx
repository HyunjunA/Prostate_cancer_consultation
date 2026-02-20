import { useState, useEffect } from "react";
import Papa from "papaparse";

// Type definition for CSV data (modify as needed)
export interface CSVRowData {
  [key: string]: string | number;
}

export const useProstateCancelData = () => {
  // State for NLP Pilot Manual Scores CSV data
  const [nlpPilotManualScoresData, setNlpPilotManualScoresData] = useState<
    CSVRowData[] | null
  >(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Parsing function for NLP Pilot Manual Scores CSV
  const parseNlpPilotCSV = (csvText: string): CSVRowData[] => {
    const result = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      delimitersToGuess: [",", "\t", "|", ";"],
      transform: (value: string) => {
        // Trim whitespace from strings
        return typeof value === "string" ? value.trim() : value;
      },
    });

    if (result.errors && result.errors.length > 0) {
      console.warn("NLP Pilot CSV parsing errors:", result.errors);
    }

    console.log("NLP Pilot CSV parsing complete:", {
      rowCount: result.data.length,
      fields: result.meta.fields,
      sample: result.data.slice(0, 3), // First 3 rows as sample
    });

    return result.data as CSVRowData[];
  };

  // useEffect(() => {
  //   const loadData = async () => {
  //     try {
  //       setLoading(true);
  //       setError(null);

  //       // Load NLP Pilot Manual Scores CSV file
  //       const nlpPilotManualScoresCSV = await fetch(
  //         "/csv_prostate_cancer_consultation_dashboard_related/nlp-pilot-manual-scores(cp).csv"
  //       ).then((res) => {
  //         if (!res.ok) {
  //           throw new Error(
  //             `Failed to fetch CSV: ${res.status} ${res.statusText}`
  //           );
  //         }
  //         return res.text();
  //       });

  //       // Parse and set NLP Pilot Manual Scores CSV data
  //       const parsedNlpPilotData = parseNlpPilotCSV(nlpPilotManualScoresCSV);
  //       setNlpPilotManualScoresData(parsedNlpPilotData);
  //     } catch (error) {
  //       console.error("Error loading NLP Pilot data:", error);
  //       setError(
  //         error instanceof Error ? error.message : "Unknown error occurred"
  //       );
  //     } finally {
  //       setLoading(false);
  //     }
  //   };

  //   loadData();
  // }, []);

  return {
    nlpPilotManualScoresData,
    loading,
    error,
  };
};
