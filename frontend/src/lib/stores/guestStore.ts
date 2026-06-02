import { create } from 'zustand';

interface GuestStore {
  pendingFiles: File[];
  addFiles: (files: File[]) => void;
  removeFile: (index: number) => void;
  clearFiles: () => void;
}

export const useGuestStore = create<GuestStore>((set) => ({
  pendingFiles: [],
  addFiles: (files) => set((state) => ({ pendingFiles: [...state.pendingFiles, ...files] })),
  removeFile: (index) => set((state) => ({
    pendingFiles: state.pendingFiles.filter((_, i) => i !== index)
  })),
  clearFiles: () => set({ pendingFiles: [] }),
}));
