// src/stores/useDoctorId.tsx
//
// The active doctor id is SESSION-SCOPED and derived from the URL (?doctorid).
// It is deliberately NOT persisted to localStorage — identifiers must not leak
// across sessions and must not live in localStorage (webapp convention).
import { create } from "zustand";

interface DoctorIdState {
  doctorId: string | null;
  setDoctorId: (id: string) => void;
  clearDoctorId: () => void;
  // Kept for call-site compatibility (page.tsx). No-op now that the id is
  // URL-only — there is nothing to load from storage.
  initFromStorage: () => void;
}

export const useDoctorId = create<DoctorIdState>((set) => ({
  doctorId: null,

  setDoctorId: (id: string) => {
    set({ doctorId: id });
  },

  clearDoctorId: () => {
    set({ doctorId: null });
  },

  initFromStorage: () => {
    /* no-op: doctor id is URL-only, never read from localStorage */
  },
}));
