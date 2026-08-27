// src/stores/usePatientId.tsx
//
// The active patient id is SESSION-SCOPED and derived from the URL (?patid / ?f).
// It is deliberately NOT persisted to localStorage: a stale id from a previous
// session must never leak into a new one (a non-existent patient there makes
// survey submits 404 → "Failed to submit"), and per the webapp convention
// patient identifiers must not live in localStorage.
import { create } from "zustand";

interface PatientIdStore {
  patientId: string | null;
  setPatientId: (id: string) => void;
  clearPatientId: () => void;
  // Kept for call-site compatibility (page.tsx). No-op now that the id is
  // URL-only — there is nothing to load from storage.
  initFromStorage: () => void;
}

export const usePatientId = create<PatientIdStore>((set) => ({
  patientId: null,

  setPatientId: (id) => {
    set({ patientId: id });
  },

  clearPatientId: () => {
    set({ patientId: null });
  },

  initFromStorage: () => {
    /* no-op: patient id is URL-only, never read from localStorage */
  },
}));
