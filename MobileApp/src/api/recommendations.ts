import { apiClient } from './client';

export interface Product {
  id: string;
  name: string;
  description?: string;
  price: string;
  originalPrice?: string;
  discountPercentage: number;
  imageUrl: string;
  brand?: string;
  unit: string;
  inStock: boolean;
  stockQuantity: number;
  isHot: boolean;
  isNew: boolean;
  isPrescription: boolean;
  categoryId?: string;
}

export interface RecommendationResponse {
  success: boolean;
  data: {
    products: Product[];
    count: number;
  };
}

export interface SearchHistoryResponse {
  success: boolean;
  data: {
    history: Array<{
      keyword: string;
      createdAt: string;
    }>;
    count: number;
  };
}

export const recommendationApi = {
  /**
   * Lấy gợi ý sản phẩm dựa trên lịch sử mua hàng
   */
  getByHistory: async (customerId: string, limit = 10): Promise<RecommendationResponse> => {
    const response = await apiClient.get<RecommendationResponse>(
      `/recommend/by-history/${customerId}?limit=${limit}`
    );
    return response;
  },

  /**
   * Lấy gợi ý sản phẩm dựa trên category
   */
  getByCategory: async (
    customerId: string,
    categoryName: string,
    limit = 10
  ): Promise<RecommendationResponse> => {
    const response = await apiClient.get<RecommendationResponse>(
      `/recommend/by-category/${customerId}?categoryName=${encodeURIComponent(categoryName)}&limit=${limit}`
    );
    return response;
  },

  /**
   * Lấy sản phẩm thay thế cho một sản phẩm
   */
  getAlternatives: async (medicineId: string, limit = 5): Promise<RecommendationResponse> => {
    const response = await apiClient.get<RecommendationResponse>(
      `/recommend/alternative/${medicineId}?limit=${limit}`
    );
    return response;
  },

  /**
   * Lấy sản phẩm phổ biến
   */
  getPopular: async (limit = 10): Promise<RecommendationResponse> => {
    const response = await apiClient.get<RecommendationResponse>(
      `/recommend/popular?limit=${limit}`
    );
    return response;
  },

  /**
   * Lấy lịch sử tìm kiếm của user
   */
  getSearchHistory: async (limit = 10): Promise<SearchHistoryResponse> => {
    const response = await apiClient.get<SearchHistoryResponse>(
      `/recommend/search-history?limit=${limit}`
    );
    return response;
  },

  /**
   * Lấy sản phẩm đã xem gần đây
   */
  getRecentViews: async (limit = 10): Promise<RecommendationResponse> => {
    const response = await apiClient.get<RecommendationResponse>(
      `/recommend/recent-views?limit=${limit}`
    );
    return response;
  },
};

