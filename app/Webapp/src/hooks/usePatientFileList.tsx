// src/hooks/usePatientFileList.tsx
//
// Loads the processed-transcript list for /admin/patients and keeps it fresh
// while the screen is open. Extracted from AdminPatientPicker so that
// component stays inside the ~150-line limit.
import { useEffect, useState } from "react";

export interface PatientFileList {
  patientList: string[];
  loading: boolean;
  /** Uploaded transcripts still being processed, from the pipeline drop folder. */
  processingCount: number;
}

export const usePatientFileList = (): PatientFileList => {
  const [patientList, setPatientList] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingCount, setProcessingCount] = useState(0);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const loadFiles = async (showSpinner: boolean): Promise<string[]> => {
      if (showSpinner) setLoading(true);
      try {
        const data = await fetch(`/api/backend/patient/files`).then((r) => r.json());
        if (cancelled) return [];
        const files = data.files || data.patients || [];
        setPatientList(files);
        return files;
      } catch (err) {
        console.error("[usePatientFileList] Failed to load patients:", err);
        return [];
      } finally {
        if (showSpinner) setLoading(false);
      }
    };

    let prevProcessing = 0;

    const loadProcessing = async (): Promise<number> => {
      try {
        const data = await fetch(`/api/backend/patient/processing-count`).then((r) =>
          r.json(),
        );
        const count = data.processing || 0;
        if (!cancelled) setProcessingCount(count);
        return count;
      } catch {
        /* non-fatal: just don't show the processing hint */
        return prevProcessing;
      }
    };

    // Initial load, then poll every 5s for as long as this screen is open. The
    // count must keep updating even once patients are listed — uploads happen far
    // more often with records already on the screen than on an empty one, and the
    // banner is the only signal that work is in flight. A transcript leaves the
    // drop folder when it finishes, so a DROP in the count is the cue to reload
    // the list (it now has one more patient); an empty list keeps reloading so the
    // very first transcript still appears on its own.
    loadFiles(true).then(async (files) => {
      if (cancelled) return;
      let listEmpty = files.length === 0;
      prevProcessing = await loadProcessing();
      interval = setInterval(async () => {
        if (cancelled) return;
        const count = await loadProcessing();
        if (count < prevProcessing || listEmpty) {
          const f = await loadFiles(false);
          listEmpty = f.length === 0;
        }
        prevProcessing = count;
      }, 5000);
    });

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, []);

  return { patientList, loading, processingCount };
};

export default usePatientFileList;
