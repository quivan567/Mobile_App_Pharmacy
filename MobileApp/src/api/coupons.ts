import { apiClient } from './client';

export interface Coupon {
  _id: string;
  code: string;
  name: string;
  description?: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minPurchase?: number;
  maxDiscount?: number;
  validFrom: string;
  validTo: string;
  isActive: boolean;
}

export interface ValidateCouponResponse {
  success: boolean;
  data?: {
    coupon: Coupon;
    discountAmount: number;
  };
  message?: string;
}

export const couponsApi = {
  getActiveCoupons: async (): Promise<{ success: boolean; data: Coupon[] }> => {
    return apiClient.get('/api/coupons/active');
  },

  validateCoupon: async (code: string, total: number): Promise<ValidateCouponResponse> => {
    return apiClient.post('/api/coupons/validate', { code, total });
  },

  applyCoupon: async (code: string): Promise<{ success: boolean; data: any }> => {
    return apiClient.post('/api/coupons/apply', { code });
  },
};

