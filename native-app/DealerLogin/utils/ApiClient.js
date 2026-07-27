import axios from 'axios';
import { API_BASE } from '../config';
import { getToken, saveToken, clearSession } from './SecureStorage';

/**
 * ApiClient
 * Axios instance with automatic JWT attachment and 401 token refresh logic.
 *
 * Request interceptor: attaches Bearer token from SecureStorage.
 * Response interceptor: on 401, attempts POST /api/auth/refresh,
 *   saves new token, and retries the original request once.
 */

const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── Request Interceptor ────────────────────────────────

apiClient.interceptors.request.use(
  async (config) => {
    const token = await getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response Interceptor (Token Refresh) ───────────────

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Only handle 401 and don't retry refresh requests or already-retried requests
    if (
      error.response?.status !== 401 ||
      originalRequest._retry ||
      originalRequest.url?.includes('/api/auth/refresh') ||
      originalRequest.url?.includes('/api/auth/validate')
    ) {
      return Promise.reject(error);
    }

    // If already refreshing, queue the request
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return apiClient(originalRequest);
        })
        .catch((err) => Promise.reject(err));
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const currentToken = await getToken();
      if (!currentToken) {
        console.warn('[ApiClient] No token available for refresh');
        processQueue(new Error('No token'), null);
        return Promise.reject(error);
      }

      console.log('[ApiClient] Attempting token refresh...');
      const response = await axios.post(
        `${API_BASE}/api/auth/refresh`,
        {},
        {
          headers: {
            Authorization: `Bearer ${currentToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const newToken = response.data.token;
      console.log('[ApiClient] Token refreshed successfully');
      await saveToken(newToken);

      // Update the original request and retry
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      processQueue(null, newToken);

      return apiClient(originalRequest);
    } catch (refreshError) {
      console.error('[ApiClient] Token refresh failed:', refreshError?.message);
      processQueue(refreshError, null);

      // Token refresh failed — clear session so user gets prompted to re-login
      await clearSession();

      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default apiClient;
