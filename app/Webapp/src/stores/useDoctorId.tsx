// src/stores/useDoctorId.tsx
import { create } from "zustand";

interface DoctorIdState {
  doctorId: string | null;
  setDoctorId: (id: string) => void;
  clearDoctorId: () => void;
  initFromStorage: () => void;
}

const STORAGE_KEY = "doctorId";

export const useDoctorId = create<DoctorIdState>((set) => ({
  doctorId: null,

  setDoctorId: (id: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, id);
    }
    set({ doctorId: id });
    console.log("👨‍⚕️ Doctor ID set:", id);
  },

  clearDoctorId: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
    set({ doctorId: null });
    console.log("👨‍⚕️ Doctor ID cleared");
  },

  initFromStorage: () => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        set({ doctorId: stored });
        console.log("👨‍⚕️ Doctor ID loaded from storage:", stored);
      }
    }
  },
}));
