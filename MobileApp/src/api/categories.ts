import { apiClient } from './client';

export interface Category {
  _id: string;
  name: string;
  description?: string;
  image?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export const categoriesApi = {
  getCategories: async (): Promise<{ success: boolean; data: Category[] }> => {
    return apiClient.get('/api/categories');
  },

  getCategoryById: async (id: string): Promise<{ success: boolean; data: Category }> => {
    return apiClient.get(`/api/categories/${id}`);
  },
};

