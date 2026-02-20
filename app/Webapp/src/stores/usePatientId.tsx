import { create } from "zustand";

interface PatientIdStore {
  patientId: string | null;
  setPatientId: (id: string) => void;
  clearPatientId: () => void;
  initFromStorage: () => void;
}

export const usePatientId = create<PatientIdStore>((set) => ({
  patientId: null,

  setPatientId: (id) => {
    localStorage.setItem("patientId", id);
    set({ patientId: id });
  },

  clearPatientId: () => {
    localStorage.removeItem("patientId");
    set({ patientId: null });
  },

  initFromStorage: () => {
    const stored = localStorage.getItem("patientId");
    if (stored) set({ patientId: stored });
  },
}));
