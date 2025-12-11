import { apiClient } from './client';

export interface LoyaltyAccount {
  userId: string;
  pointsBalance: number;
  totalEarned: number;
  totalRedeemed: number;
  tier?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LoyaltyTransaction {
  _id: string;
  userId: string;
  type: 'earn' | 'redeem' | 'adjust';
  points: number;
  description: string;
  orderId?: string;
  createdAt: string;
}

export const loyaltyApi = {
  getAccount: async (): Promise<{ success: boolean; data: LoyaltyAccount }> => {
    return apiClient.get('/api/loyalty/account');
  },

  getTransactions: async (params?: {
    page?: number;
    limit?: number;
    type?: string;
  }): Promise<{ success: boolean; data: LoyaltyTransaction[]; total?: number }> => {
    return apiClient.get('/api/loyalty/transactions', { params });
  },

  adjustPoints: async (data: {
    points: number;
    description: string;
  }): Promise<{ success: boolean; data: LoyaltyAccount; message?: string }> => {
    return apiClient.post('/api/loyalty/adjust', data);
  },
};

