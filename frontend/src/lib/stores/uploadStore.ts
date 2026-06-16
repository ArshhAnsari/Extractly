import { create } from 'zustand';
import axios from 'axios';
import { jobsApi } from '../api/jobs';

export type UploadStatus = 'PENDING' | 'SIGNING' | 'UPLOADING' | 'REGISTERING' | 'SUCCESS' | 'ERROR';
type BackendFileType = 'PDF' | 'DOCX' | 'IMAGE';

export interface UploadItem {
  id: string;
  file: File;
  jobId: string;
  status: UploadStatus;
  progress: number;
  error?: string;
  cloudinaryId?: string;
  storageUrl?: string;
  bytes?: number;
  fileType?: BackendFileType;
}

interface UploadStore {
  items: UploadItem[];
  isMinimized: boolean;
  registeringJobs: Record<string, boolean>;
  addUploads: (jobId: string, files: File[]) => void;
  setMinimized: (minimized: boolean) => void;
  removeUpload: (id: string) => void;
  retryUpload: (id: string) => void;
  clearCompleted: () => void;
  processNextBatch: () => void;
  registerReadyUploads: (jobId: string) => Promise<void>;
  startProcessingJob: (jobId: string) => Promise<void>;
}

const fileTypeMap: Record<string, BackendFileType> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'image/jpeg': 'IMAGE',
  'image/png': 'IMAGE',
};

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const apiError = error.response?.data?.error;
    if (apiError?.message) return apiError.message;
    return error.message;
  }
  if (error && typeof error === 'object' && 'error' in error) {
    const apiError = error as { error?: { message?: string } };
    if (apiError.error?.message) return apiError.error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Upload failed';
}

export const useUploadStore = create<UploadStore>((set, get) => ({
  items: [],
  isMinimized: false,
  registeringJobs: {},

  setMinimized: (minimized) => set({ isMinimized: minimized }),

  addUploads: (jobId, files) => {
    const timestamp = Date.now();
    const newItems: UploadItem[] = files.map((file, index) => ({
      id: `${jobId}-${file.name}-${timestamp}-${index}`,
      file,
      jobId,
      status: 'PENDING',
      progress: 0,
      fileType: fileTypeMap[file.type],
    }));

    set((state) => ({ items: [...state.items, ...newItems], isMinimized: false }));
    get().processNextBatch();
  },

  removeUpload: (id) => {
    const item = get().items.find((upload) => upload.id === id);
    set((state) => ({ items: state.items.filter((upload) => upload.id !== id) }));
    if (item) {
      void get().registerReadyUploads(item.jobId);
    }
  },

  retryUpload: (id) => {
    const item = get().items.find((upload) => upload.id === id);
    if (!item) return;

    if (item.cloudinaryId && item.storageUrl && item.fileType) {
      set((state) => ({
        items: state.items.map((upload) =>
          upload.id === id
            ? { ...upload, status: 'REGISTERING', progress: 100, error: undefined }
            : upload
        ),
      }));
      void get().registerReadyUploads(item.jobId);
      return;
    }

    set((state) => ({
      items: state.items.map((item) =>
        item.id === id
          ? {
            ...item,
            status: 'PENDING',
            progress: 0,
            error: undefined,
            cloudinaryId: undefined,
            storageUrl: undefined,
            bytes: undefined,
          }
          : item
      ),
    }));
    get().processNextBatch();
  },

  clearCompleted: () => {
    set((state) => ({
      items: state.items.filter((item) => item.status !== 'SUCCESS'),
    }));
  },

  processNextBatch: async () => {
    const state = get();
    const activeCount = state.items.filter((item) =>
      ['SIGNING', 'UPLOADING'].includes(item.status)
    ).length;

    if (activeCount >= 5) return;

    const availableSlots = 5 - activeCount;
    const pendingItems = state.items
      .filter((item) => item.status === 'PENDING')
      .slice(0, availableSlots);

    if (pendingItems.length === 0) return;

    set((s) => ({
      items: s.items.map((item) =>
        pendingItems.some((pending) => pending.id === item.id)
          ? { ...item, status: 'SIGNING' }
          : item
      ),
    }));

    pendingItems.forEach(async (item) => {
      try {
        const backendFileType = fileTypeMap[item.file.type];
        if (!backendFileType) {
          throw new Error('Unsupported file type.');
        }

        const signRes = await jobsApi.getUploadSignature(item.jobId, item.file);
        if (!signRes.success) {
          throw new Error(signRes.error.message);
        }

        const { upload_url, upload_params, cloudinary_public_id } = signRes.data;

        set((s) => ({
          items: s.items.map((upload) =>
            upload.id === item.id
              ? { ...upload, status: 'UPLOADING', cloudinaryId: cloudinary_public_id }
              : upload
          ),
        }));

        const formData = new FormData();
        Object.entries(upload_params).forEach(([key, value]) => {
          formData.append(key, String(value));
        });
        formData.append('file', item.file);

        const uploadRes = await axios.post(upload_url, formData, {
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const percentCompleted = Math.round(
                (progressEvent.loaded * 100) / progressEvent.total
              );
              set((s) => ({
                items: s.items.map((upload) =>
                  upload.id === item.id ? { ...upload, progress: percentCompleted } : upload
                ),
              }));
            }
          },
        });

        set((s) => ({
          items: s.items.map((upload) =>
            upload.id === item.id
              ? {
                ...upload,
                status: 'REGISTERING',
                cloudinaryId: cloudinary_public_id,
                storageUrl: uploadRes.data.secure_url,
                bytes: uploadRes.data.bytes,
                fileType: backendFileType,
                progress: 100,
              }
              : upload
          ),
        }));

        await get().registerReadyUploads(item.jobId);
      } catch (error) {
        console.error('Upload failed for', item.file.name, error);
        set((s) => ({
          items: s.items.map((upload) =>
            upload.id === item.id
              ? { ...upload, status: 'ERROR', error: getErrorMessage(error) }
              : upload
          ),
        }));
      } finally {
        get().processNextBatch();
      }
    });
  },

  registerReadyUploads: async (jobId: string) => {
    const state = get();
    if (state.registeringJobs[jobId]) return;

    const jobItems = state.items.filter((item) => item.jobId === jobId);
    const hasActiveItems = jobItems.some((item) =>
      ['PENDING', 'SIGNING', 'UPLOADING'].includes(item.status)
    );
    const readyItems = jobItems.filter((item) => item.status === 'REGISTERING');

    if (hasActiveItems || readyItems.length === 0) return;

    set((s) => ({
      registeringJobs: { ...s.registeringJobs, [jobId]: true },
    }));

    try {
      const registerRes = await jobsApi.registerFiles(
        jobId,
        readyItems.map((item) => ({
          cloudinary_public_id: item.cloudinaryId as string,
          original_filename: item.file.name,
          file_type: item.fileType as BackendFileType,
        }))
      );

      if (!registerRes.success) {
        throw new Error(registerRes.error.message);
      }

      const readyIds = new Set(readyItems.map((item) => item.id));
      set((s) => ({
        items: s.items.map((item) =>
          readyIds.has(item.id) ? { ...item, status: 'SUCCESS', progress: 100 } : item
        ),
      }));
    } catch (error) {
      const message = getErrorMessage(error);
      const readyIds = new Set(readyItems.map((item) => item.id));
      set((s) => ({
        items: s.items.map((item) =>
          readyIds.has(item.id) ? { ...item, status: 'ERROR', error: message } : item
        ),
      }));
    } finally {
      set((s) => {
        const next = { ...s.registeringJobs };
        delete next[jobId];
        return { registeringJobs: next };
      });
    }
  },

   startProcessingJob: async (jobId: string) => {
    try {
      const res = await jobsApi.startProcessing(jobId);
      if (!res.success) {
        throw new Error(res.error.message);
      }
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },
}));
