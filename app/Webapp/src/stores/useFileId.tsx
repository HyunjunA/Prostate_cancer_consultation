// src/stores/useFileId.tsx
//
// The active file id is SESSION-SCOPED and derived from the URL (?fileid / ?f).
// It is deliberately NOT persisted to localStorage: a stale id from a previous
// session must never leak into a new one (a non-existent patient there makes
// survey submits 404 → "Failed to submit"), and per the webapp convention
// patient/file identifiers must not live in localStorage.
import { create } from "zustand";

interface FileIdStore {
  fileId: string | null;
  setFileId: (id: string) => void;
  clearFileId: () => void;
  // Kept for call-site compatibility (page.tsx). No-op now that the id is
  // URL-only — there is nothing to load from storage.
  initFromStorage: () => void;
}

export const useFileId = create<FileIdStore>((set) => ({
  fileId: null,

  setFileId: (id) => {
    set({ fileId: id });
  },

  clearFileId: () => {
    set({ fileId: null });
  },

  initFromStorage: () => {
    /* no-op: file id is URL-only, never read from localStorage */
  },
}));
