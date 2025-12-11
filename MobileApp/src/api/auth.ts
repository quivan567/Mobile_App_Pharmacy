import { apiClient } from './client';
import { LoginRequest, LoginResponse, RegisterRequest, RegisterResponse, User } from '../types/auth';
import { API_BASE_URL } from '../utils/constants';
import { authStorage } from '../utils/storage';

export const authApi = {
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    return apiClient.post('/api/auth/login', data);
  },

  register: async (data: RegisterRequest): Promise<RegisterResponse> => {
    return apiClient.post('/api/auth/register', data);
  },

  sendOTP: async (phone: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.post('/api/auth/send-otp', { phone });
  },

  verifyOTP: async (phone: string, otp: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.post('/api/auth/verify-otp', { phone, otp });
  },

  forgotPassword: async (phone: string, method: string = 'sms'): Promise<{ success: boolean; message: string; data?: { method: string; phone: string; expiresIn: number } }> => {
    return apiClient.post('/api/auth/forgot-password', { phone, method });
  },

  resetPassword: async (phone: string, otp: string, newPassword: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.post('/api/auth/reset-password', { phone, otp, newPassword });
  },

  getProfile: async (): Promise<{ success: boolean; data: User }> => {
    return apiClient.get('/api/auth/profile');
  },

  updateProfile: async (data: Partial<User> & { avatar?: any }): Promise<{ success: boolean; data: User }> => {
    // If avatar is provided, use fetch API for FormData (Axios has issues with FormData in React Native)
    if (data.avatar) {
      const formData = new FormData();
      
      // Add text fields
      if (data.firstName) formData.append('firstName', data.firstName);
      if (data.lastName) formData.append('lastName', data.lastName);
      if (data.email) formData.append('email', data.email);
      if (data.phone) formData.append('phone', data.phone);
      if (data.dateOfBirth) formData.append('dateOfBirth', data.dateOfBirth);
      if (data.gender) formData.append('gender', data.gender);
      if (data.address) formData.append('address', data.address);
      
      // Add avatar file
      formData.append('avatar', {
        uri: data.avatar.uri,
        type: data.avatar.type || 'image/jpeg',
        name: data.avatar.name || 'avatar.jpg',
      } as any);
      
      // Use fetch API for FormData upload in React Native
      const token = await authStorage.getToken();
      
      const headers: any = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      // Don't set Content-Type - fetch will set it automatically with boundary for FormData
      
      const response = await fetch(`${API_BASE_URL}/api/auth/profile`, {
        method: 'PUT',
        headers,
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      
      const responseData = await response.json();
      return responseData;
    }
    
    // Otherwise, use regular JSON with apiClient
    return apiClient.put('/api/auth/profile', data);
  },

  changePassword: async (oldPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.put('/api/auth/change-password', { oldPassword, newPassword });
  },

  refreshToken: async (token: string): Promise<{ success: boolean; data?: { token: string }; message?: string }> => {
    return apiClient.post('/api/auth/refresh-token', { token });
  },
};

