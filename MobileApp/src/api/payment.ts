import { apiClient } from './client';

export interface MomoPaymentRequest {
  orderId: string;
  amount: number;
  orderInfo: string;
}

export interface MomoPaymentResponse {
  success: boolean;
  data?: {
    payUrl?: string;
    qrCodeUrl?: string;
    deeplink?: string;
    orderId: string;
  };
  message?: string;
}

export const paymentApi = {
  createMomoPayment: async (data: MomoPaymentRequest): Promise<MomoPaymentResponse> => {
    return apiClient.post('/api/payment/momo/create', data);
  },

  getPaymentStatus: async (orderId: string): Promise<{ success: boolean; data: any }> => {
    return apiClient.get(`/api/payment/momo/status/${orderId}`);
  },
};

