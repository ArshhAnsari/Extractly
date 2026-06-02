import { apiClient } from './client';
import { ApiResponse } from '@/types/api';

export interface GoogleStatus {
  connected: boolean;
  email: string | null;
}

export const integrationsApi = {
  getGoogleStatus: async (): Promise<ApiResponse<GoogleStatus>> => {
    const res = await apiClient.get('/integrations/google/status/');
    return res.data;
  },

  connectGoogle: async (): Promise<ApiResponse<{ auth_url: string }>> => {
    const res = await apiClient.get('/integrations/google/connect/');
    return res.data;
  },

  disconnectGoogle: async (): Promise<ApiResponse<{ message: string }>> => {
    const res = await apiClient.delete('/integrations/google/disconnect/');
    return res.data;
  },
};