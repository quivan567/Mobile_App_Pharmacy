import { apiClient } from './client';

export interface PPointAccount {
  userId: string;
  balance: number;
  totalEarned: number;
  totalRedeemed: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface PPointTransaction {
  _id: string;
  userId: string;
  type: 'earn' | 'redeem';
  points: number;
  description: string;
  orderId?: string;
  createdAt: string;
}

export const pPointsApi = {
  getAccount: async (): Promise<{ success: boolean; data: PPointAccount }> => {
    return apiClient.get('/api/p-points/account');
  },

  getTransactions: async (params?: {
    page?: number;
    limit?: number;
    type?: string;
  }): Promise<{ success: boolean; data: PPointTransaction[]; total?: number }> => {
    return apiClient.get('/api/p-points/transactions', { params });
  },
};

