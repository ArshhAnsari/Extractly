import { apiClient } from './client';
import { ApiResponse } from '@/types/api';
import { Job, FieldDefinition } from '@/types/job';
import { ExtractedRow } from '@/types/row';

interface UploadSignature {
  upload_url: string;
  upload_params: Record<string, string | number>;
  cloudinary_public_id: string;
}

interface RegisterFileInput {
  cloudinary_public_id: string;
  original_filename: string;
  file_type: 'PDF' | 'DOCX' | 'IMAGE';
  storage_url?: string;
  bytes?: number;
}

interface JobStatusPayload {
  job_id: string;
  status: Job['status'];
  done_files: number;
  failed_files: number;
  total_files: number;
}

const unwrap = <T, U>(response: ApiResponse<T>, selector: (data: T) => U): ApiResponse<U> => {
  if (!response.success) return response;
  return { ...response, data: selector(response.data) };
};

export const jobsApi = {
  getJobs: async (): Promise<ApiResponse<Job[]>> => {
    const res = await apiClient.get('/jobs/');
    return unwrap(res.data, (data: { jobs: Job[] }) => data.jobs);
  },

  getJob: async (jobId: string): Promise<ApiResponse<Job>> => {
    const res = await apiClient.get(`/jobs/${jobId}/`);
    return unwrap(res.data, (data: { job: Job }) => data.job);
  },

  createJob: async (name: string, fields: FieldDefinition[]): Promise<ApiResponse<Job>> => {
    const res = await apiClient.post('/jobs/', { name, fields });
    return unwrap(res.data, (data: { job: Job }) => data.job);
  },

  deleteJob: async (jobId: string): Promise<ApiResponse<{ message: string }>> => {
    const res = await apiClient.delete(`/jobs/${jobId}/`);
    return res.data;
  },
  
  getUploadSignature: async (
    jobId: string,
    file: Pick<File, 'name' | 'type' | 'size'>
  ): Promise<ApiResponse<UploadSignature>> => {
    const res = await apiClient.post(`/jobs/${jobId}/upload/sign/`, {
      filename: file.name,
      file_type: file.type,
      file_size: file.size,
    });
    return unwrap(res.data, (data: UploadSignature) => data);
  },

  registerFiles: async (
    jobId: string,
    files: RegisterFileInput[]
  ): Promise<ApiResponse<{ registered: number; job_status: Job['status'] }>> => {
    const res = await apiClient.post(`/jobs/${jobId}/files/`, { files });
    return res.data;
  },

  startProcessing: async (
    jobId: string
  ): Promise<ApiResponse<{ job_id: string; status: Job['status']; total_files: number; message: string }>> => {
    // Longer timeout: backend wakes the sleeping Render worker and waits
    // for Celery readiness before dispatching (can take up to ~100 s on
    // free-tier cold start).
    const res = await apiClient.post(`/jobs/${jobId}/process/`, {}, {
      timeout: 150_000,
    });
    return res.data;
  },

  getJobStatus: async (jobId: string): Promise<ApiResponse<JobStatusPayload>> => {
    const res = await apiClient.get(`/jobs/${jobId}/status/`);
    return res.data;
  },

  getLastFields: async (jobId: string): Promise<ApiResponse<FieldDefinition[]>> => {
    const res = await apiClient.get(`/jobs/${jobId}/last-fields/`);
    return unwrap(res.data, (data: { fields: FieldDefinition[] }) => data.fields);
  },

  exportJob: async (jobId: string, format: 'xlsx' | 'csv'): Promise<Blob> => {
    const res = await apiClient.get(`/jobs/${jobId}/export/?export_format=${format}`, {
      responseType: 'blob'
    });
    return res.data;
  },
  
  mergeExport: async (jobIds: string[], format: 'xlsx' | 'csv', force: boolean = false): Promise<import('axios').AxiosResponse> => {
    const res = await apiClient.post('/exports/merge/', { job_ids: jobIds, format, force }, {
      responseType: 'blob',
      validateStatus: (status) => status < 500
    });
    return res;
  },

  exportJobToSheets: async (
    jobId: string
  ): Promise<ApiResponse<{ spreadsheet_url: string; spreadsheet_id: string }>> => {
    const res = await apiClient.get(`/jobs/${jobId}/export/?export_format=sheets`);
    return res.data;
  },

  mergeExportToSheets: async (
    jobIds: string[],
    force: boolean = false
  ): Promise<ApiResponse<{ spreadsheet_url: string; spreadsheet_id: string }>> => {
    const res = await apiClient.post('/exports/merge/', { job_ids: jobIds, format: 'sheets', force });
    return res.data;
  },
};

export const rowsApi = {
  getRows: async (jobId: string): Promise<ApiResponse<ExtractedRow[]>> => {
    const res = await apiClient.get(`/jobs/${jobId}/rows/`);
    return unwrap(res.data, (data: { rows: ExtractedRow[] }) => data.rows);
  },

  updateRow: async (
    jobId: string,
    rowId: string,
    data: Record<string, unknown>
  ): Promise<ApiResponse<{ row_id: string; data: Record<string, unknown> }>> => {
    const res = await apiClient.patch(`/jobs/${jobId}/rows/${rowId}/`, { data });
    return unwrap(
      res.data,
      (payload: { row_id: string; data: Record<string, unknown> }) => payload
    );
  }
};
