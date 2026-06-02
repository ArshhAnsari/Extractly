import axios from 'axios';
import { apiClient, BASE_URL } from './client';
import { ApiResponse } from '@/types/api';

export interface AuthResponseData {
  access_token: string;
  user?: {
    id: string;
    email: string;
    fullName: string;
  };
}

interface BackendUser {
  id: string;
  email: string;
  full_name: string;
}

interface BackendAuthResponseData {
  access_token: string;
  user?: BackendUser;
}

const mapUser = (user?: BackendUser) => {
  if (!user) return undefined;
  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
  };
};

const mapAuthResponse = (res: ApiResponse<BackendAuthResponseData>): ApiResponse<AuthResponseData> => {
  if (!res.success) return res;
  return {
    ...res,
    data: {
      access_token: res.data.access_token,
      user: mapUser(res.data.user),
    },
  };
};

export const authApi = {
  login: async (data: Record<string, unknown>): Promise<ApiResponse<AuthResponseData>> => {
    const res = await apiClient.post<ApiResponse<BackendAuthResponseData>>('/auth/login/', data);
    return mapAuthResponse(res.data);
  },
  register: async (data: Record<string, unknown>): Promise<ApiResponse<AuthResponseData>> => {
    const payload = {
      email: data.email,
      password: data.password,
      full_name: data.fullName,
    };
    const res = await apiClient.post<ApiResponse<BackendAuthResponseData>>('/auth/register/', payload);
    return mapAuthResponse(res.data);
  },
  logout: async (): Promise<ApiResponse<unknown>> => {
    const res = await apiClient.post('/auth/logout/');
    return res.data;
  },
  refresh: async (): Promise<string | null> => {
    try {
      const res = await axios.post(
        `${BASE_URL}/auth/token/refresh/`,
        {},
        { withCredentials: true }
      );
      return res.data?.data?.access_token ?? null;
    } catch {
      return null;
    }
  },
};
