import { apiClient } from './client';
import { Medicine, MedicineListResponse } from '../types/medicine';

export const medicinesApi = {
  getMedicines: async (params?: {
    page?: number;
    limit?: number;
    category?: string;
    search?: string;
    sort?: string;
    minPrice?: number;
    maxPrice?: number;
    inStock?: boolean;
    fuzzy?: boolean;
  }): Promise<MedicineListResponse> => {
    return apiClient.get('/api/medicines', { params });
  },

  getMedicineById: async (id: string): Promise<{ success: boolean; data: Medicine }> => {
    return apiClient.get(`/api/medicines/${id}`);
  },

  getHotMedicines: async (): Promise<MedicineListResponse> => {
    return apiClient.get('/api/medicines/hot');
  },
};

