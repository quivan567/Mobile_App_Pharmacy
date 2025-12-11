import axios, { AxiosInstance, AxiosError } from 'axios';
import { API_BASE_URL } from '../utils/constants';
import { authStorage } from '../utils/storage';
import Toast from 'react-native-toast-message';
import { refreshToken } from '../utils/tokenRefresh';
import { logger } from '../utils/logger';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
      // Don't transform FormData - let it be sent as-is
      transformRequest: [(data, headers) => {
        // If data is FormData, don't transform it
        if (data instanceof FormData || (data && typeof data === 'object' && data._parts !== undefined)) {
          return data;
        }
        // For other data, use default JSON transformation
        return JSON.stringify(data);
      }],
    });

    // Request interceptor to add token
    this.client.interceptors.request.use(
      async (config) => {
        const token = await authStorage.getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        
        // Debug logging for orders endpoint
        if (config.url?.includes('/api/orders')) {
          logger.log('API Request - Orders:', {
            url: config.url,
            method: config.method,
            baseURL: config.baseURL,
            fullURL: `${config.baseURL}${config.url}`,
            hasToken: !!token,
            headers: {
              Authorization: token ? 'Bearer ***' : 'none',
              'Content-Type': config.headers['Content-Type'],
            },
          });
        }
        
        // Check if data is FormData (React Native FormData)
        // In React Native, FormData is a global object, not the same as browser FormData
        const isFormData = config.data instanceof FormData || 
                          (config.data && typeof config.data === 'object' && 
                           config.data._parts !== undefined);
        
        // For FormData, let axios set Content-Type automatically with boundary
        if (isFormData) {
          delete config.headers['Content-Type'];
          // Ensure axios knows this is FormData
          config.headers['Content-Type'] = undefined;
        }
        
        // Debug logging for analyze endpoint
        if (config.url?.includes('/analyze')) {
          logger.log('API Request - analyzePrescription:', {
            url: config.url,
            method: config.method,
            dataType: typeof config.data,
            isFormData: isFormData,
            isFormDataInstance: config.data instanceof FormData,
            hasParts: config.data?._parts !== undefined,
            headers: config.headers,
            contentType: config.headers['Content-Type'],
          });
        }
        
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor to handle errors
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        // Handle network errors
        if (!error.response) {
          // Network error or timeout
          const errorMessage = error.message || 'Unknown error';
          const isLocalhost = API_BASE_URL.includes('localhost') || API_BASE_URL.includes('127.0.0.1');
          
          let errorText = 'Không thể kết nối đến server.';
          
          if (isLocalhost) {
            errorText += '\n\nNếu bạn đang test trên điện thoại thật, vui lòng:';
            errorText += '\n1. Kiểm tra Backend đang chạy';
            errorText += '\n2. Thay localhost bằng IP máy tính trong file .env';
            errorText += '\n3. Đảm bảo điện thoại và máy tính cùng mạng WiFi';
          } else {
            errorText += '\n\nVui lòng kiểm tra:';
            errorText += '\n1. Backend đang chạy';
            errorText += '\n2. API URL: ' + API_BASE_URL;
            errorText += '\n3. Kết nối mạng';
          }
          
          logger.error('Network Error Details:', {
            message: errorMessage,
            baseURL: API_BASE_URL,
            url: error.config?.url,
            method: error.config?.method,
            code: (error as any).code,
            errno: (error as any).errno,
            syscall: (error as any).syscall,
            address: (error as any).address,
            port: (error as any).port,
          });
          
          // Additional diagnostic info
          if ((error as any).code === 'ECONNREFUSED') {
            logger.error('Connection Refused - Backend may not be running or IP/Port incorrect');
          } else if ((error as any).code === 'ETIMEDOUT') {
            logger.error('Connection Timeout - Backend may be slow or unreachable');
          } else if ((error as any).code === 'ENOTFOUND') {
            logger.error('DNS Error - Cannot resolve hostname');
          }
          
          Toast.show({
            type: 'error',
            text1: 'Lỗi kết nối',
            text2: errorText,
            visibilityTime: 6000,
          });
          return Promise.reject(error);
        }

        const url = error.config?.url || '';
        const isAuthEndpoint = url.includes('/api/auth/login') || 
                             url.includes('/api/auth/register') ||
                             url.includes('/api/auth/refresh-token');
        const originalRequest = error.config as any;

        // Handle authentication errors
        // Don't show "session expired" toast for login/register/refresh endpoints
        if ((error.response?.status === 401 || error.response?.status === 403) && !isAuthEndpoint) {
          // Try to refresh token if this is the first retry
          if (!originalRequest._retry) {
            originalRequest._retry = true;

            const newToken = await refreshToken();
            if (newToken) {
              // Retry the original request with new token
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              return this.client(originalRequest);
            }
          }

          // If refresh failed or already retried, clear auth data and logout
          await authStorage.removeToken();
          await authStorage.removeUser();
          
          Toast.show({
            type: 'error',
            text1: 'Phiên đăng nhập đã hết hạn',
            text2: 'Vui lòng đăng nhập lại',
          });
        }

        // Handle server errors
        if (error.response?.status >= 500) {
          Toast.show({
            type: 'error',
            text1: 'Lỗi máy chủ',
            text2: 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.',
          });
        }

        return Promise.reject(error);
      }
    );
  }

  async get<T>(url: string, config?: any): Promise<T> {
    const response = await this.client.get<T>(url, config);
    return response.data;
  }

  async post<T>(url: string, data?: any, config?: any): Promise<T> {
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }

  async put<T>(url: string, data?: any, config?: any): Promise<T> {
    const response = await this.client.put<T>(url, data, config);
    return response.data;
  }

  async delete<T>(url: string, config?: any): Promise<T> {
    const response = await this.client.delete<T>(url, config);
    return response.data;
  }

  async patch<T>(url: string, data?: any, config?: any): Promise<T> {
    const response = await this.client.patch<T>(url, data, config);
    return response.data;
  }
}

export const apiClient = new ApiClient();

