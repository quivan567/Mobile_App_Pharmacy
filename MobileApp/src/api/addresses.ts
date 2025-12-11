import { apiClient } from './client';

export interface Address {
  _id?: string;
  receiverName: string;
  receiverPhone: string;
  province: string;
  provinceName: string;
  district: string;
  districtName: string;
  ward: string;
  wardName: string;
  address: string; // Số nhà, tên đường
  addressType?: 'home' | 'company';
  isDefault?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// Legacy interface for backward compatibility with CheckoutScreen
export interface LegacyAddress {
  _id?: string;
  fullName: string;
  phone: string;
  address: string;
  ward: string;
  district: string;
  province: string;
  isDefault?: boolean;
}

export const addressesApi = {
  getAddresses: async (): Promise<{ success: boolean; data: Address[] }> => {
    return apiClient.get('/api/addresses');
  },

  getAddress: async (id: string): Promise<{ success: boolean; data: Address }> => {
    return apiClient.get(`/api/addresses/${id}`);
  },

  createAddress: async (data: Omit<Address, '_id'>): Promise<{ success: boolean; data: Address }> => {
    return apiClient.post('/api/addresses', data);
  },

  updateAddress: async (id: string, data: Partial<Address>): Promise<{ success: boolean; data: Address }> => {
    return apiClient.put(`/api/addresses/${id}`, data);
  },

  deleteAddress: async (id: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.delete(`/api/addresses/${id}`);
  },

  setDefaultAddress: async (id: string): Promise<{ success: boolean; data: Address }> => {
    return apiClient.patch(`/api/addresses/${id}/set-default`);
  },
};

