import { create } from 'zustand';

type ModalMode = 'auth' | 'wizard';

interface UiStore {
  isModalOpen: boolean;
  modalMode: ModalMode;
  openModal: (mode?: ModalMode) => void;
  closeModal: () => void;
  setModalMode: (mode: ModalMode) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  isModalOpen: false,
  modalMode: 'auth',
  openModal: (mode = 'auth') => set({ isModalOpen: true, modalMode: mode }),
  closeModal: () => set({ isModalOpen: false }),
  setModalMode: (mode) => set({ modalMode: mode }),
}));
