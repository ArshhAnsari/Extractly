import axios, { AxiosError, AxiosResponse } from 'axios';
import { ApiError } from '@/types/api';
import { useAuthStore } from '../stores/authStore';

export const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  withCredentials: true, // Required for sending/receiving HttpOnly cookies (refresh token)
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Attach access token
apiClient.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken;
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Handle 401 and wrap responses
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    // If the response explicitly contains success: false, it's an error from the backend.
    if (response.data && response.data.success === false) {
      return Promise.reject(response.data as ApiError);
    }
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config;

    // Handle 401 Unauthorized -> Refresh Token
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (error.response?.status === 401 && originalRequest && !(originalRequest as any)._retry) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (originalRequest as any)._retry = true;
      try {
        // Attempt to refresh token using the HttpOnly cookie
        const refreshResponse = await axios.post(
          `${BASE_URL}/auth/token/refresh/`,
          {},
          { withCredentials: true }
        );

        const newAccessToken = refreshResponse.data.data?.access_token || refreshResponse.data.access_token;
        if (newAccessToken) {
          useAuthStore.getState().setToken(newAccessToken);
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          }
          return apiClient(originalRequest);
        }
      } catch (refreshError) {
        // Refresh failed (e.g., refresh token expired)
        useAuthStore.getState().logout();
        if (typeof window !== 'undefined' && window.location.pathname !== '/login' && window.location.pathname !== '/') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      }
    }

    // Wrap the error into our ApiError type
    let apiError: ApiError = {
      success: false,
      error: {
        code: 'UNKNOWN_ERROR',
        message: 'An unexpected error occurred.',
      },
    };

    if (error.response?.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = error.response.data as any;
      if (data.error) {
        apiError = data as ApiError;
      } else {
        apiError.error.message = data.detail || error.message;
      }
    } else {
      apiError.error.message = error.message;
    }

    return Promise.reject(apiError);
  }
);
