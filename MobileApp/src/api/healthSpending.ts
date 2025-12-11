import { apiClient } from './client';

export interface HealthSpendingStats {
  totalSpending: number;
  totalOrders: number;
  orders: Array<{
    _id: string;
    orderNumber: string;
    totalAmount: number;
    createdAt: string;
    status: string;
    paymentStatus: string;
  }>;
  chartData: Array<{
    month: string;
    total: number;
    count: number;
  }>;
}

export interface HealthStatus {
  status: 'good' | 'moderate' | 'needs_attention';
  message: string;
}

export const healthSpendingApi = {
  getHealthSpendingStats: async (
    startDate: string,
    endDate: string
  ): Promise<{ success: boolean; data: HealthSpendingStats }> => {
    return apiClient.get('/api/health-spending/stats', {
      params: { startDate, endDate },
    });
  },

  getHealthStatus: async (): Promise<{ success: boolean; data: HealthStatus }> => {
    return apiClient.get('/api/health-spending/status');
  },
};

