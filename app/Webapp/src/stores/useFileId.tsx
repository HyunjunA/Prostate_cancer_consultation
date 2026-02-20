// src/stores/useFileId.tsx
import { create } from "zustand";

interface FileIdStore {
  fileId: string | null;
  setFileId: (id: string) => void;
  clearFileId: () => void;
  initFromStorage: () => void;
}

export const useFileId = create<FileIdStore>((set) => ({
  fileId: null,

  setFileId: (id) => {
    localStorage.setItem("fileId", id);
    set({ fileId: id });
  },

  clearFileId: () => {
    localStorage.removeItem("fileId");
    set({ fileId: null });
  },

  initFromStorage: () => {
    const stored = localStorage.getItem("fileId");
    if (stored) set({ fileId: stored });
  },
}));
