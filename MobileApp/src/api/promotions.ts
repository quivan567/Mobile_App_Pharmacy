import { apiClient } from './client';

export interface Promotion {
  _id: string;
  name: string;
  description?: string;
  code?: string;
  type: 'order_threshold' | 'combo' | 'flash_sale' | 'category_bundle';
  isActive: boolean;
  startDate: string;
  endDate: string;
  // Order threshold fields
  minOrderValue?: number;
  discountPercent?: number;
  // Flash sale fields
  dailyStartTime?: string;
  dailyEndTime?: string;
  // Category bundle fields
  applicableCategoryId?: string;
  // Generic caps
  maxDiscountAmount?: number;
  // Image (if available)
  image?: string;
  imageUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PromotionResponse {
  success: boolean;
  data: Promotion[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface ValidateCodeResponse {
  success: boolean;
  data: {
    code: string;
    promotionId?: string;
    promotionName?: string;
    discountAmount: number;
    discountPercent?: number;
    originalAmount: number;
    finalAmount: number;
    type?: string;
    minOrderValue?: number;
  };
}

export const promotionsApi = {
  getAllPromotions: async (params?: {
    page?: number;
    limit?: number;
    activeOnly?: boolean;
  }): Promise<PromotionResponse> => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.activeOnly) queryParams.append('activeOnly', 'true');
    
    const queryString = queryParams.toString();
    return apiClient.get(`/api/promotions${queryString ? `?${queryString}` : ''}`);
  },

  getActivePromotions: async (): Promise<PromotionResponse> => {
    return apiClient.get('/api/promotions/active');
  },

  getPromotionById: async (id: string): Promise<{ success: boolean; data: Promotion & { items?: any[]; isCurrentlyActive?: boolean } }> => {
    return apiClient.get(`/api/promotions/${id}`);
  },

  applyToCart: async (data: {
    items: Array<{ productId: string; quantity: number; price: number; categoryId?: string }>;
  }): Promise<{ 
    success: boolean; 
    data: { 
      subtotal: number;
      discountAmount: number; 
      finalTotal: number;
      appliedRules: Array<{ id: string; name: string; type: string; discount: number }>;
    } 
  }> => {
    return apiClient.post('/api/promotions/apply', data);
  },

  validateCode: async (code: string, orderAmount: number): Promise<ValidateCodeResponse> => {
    return apiClient.post('/api/promotions/validate-code', { code, orderAmount });
  },
};

