import { apiClient } from './client';
import { Order } from '../types/order';

export interface CreateOrderRequest {
  items: Array<{ productId: string; quantity: number; price?: number }>;
  shippingAddress: string;
  shippingPhone: string;
  paymentMethod: string;
  couponCode?: string;
  discountAmount?: number;
  notes?: string;
}

export interface GuestOrderRequest {
  items: Array<{ productId: string; quantity: number; price?: number }>;
  shippingAddress: string;
  shippingPhone: string;
  shippingName: string;
  paymentMethod: string;
  couponCode?: string;
  discountAmount?: number;
  notes?: string;
}

export interface UpdateOrderRequest {
  shippingAddress?: string;
  shippingPhone?: string;
  notes?: string;
}

export interface OrderStats {
  totalOrders: number;
  totalSpent: number;
  pendingOrders: number;
  completedOrders: number;
  cancelledOrders: number;
}

export const ordersApi = {
  // Create order (authenticated or guest)
  createOrder: async (data: CreateOrderRequest): Promise<{ success: boolean; data: Order; message?: string }> => {
    return apiClient.post('/api/orders', data);
  },

  // Guest checkout
  createGuestOrder: async (data: GuestOrderRequest): Promise<{ success: boolean; data: Order; message?: string }> => {
    return apiClient.post('/api/orders/guest-checkout', data);
  },

  // Get orders with filters
  getOrders: async (params?: {
    page?: number;
    limit?: number;
    status?: string;
  }): Promise<{ success: boolean; data: Order[]; pagination?: { page: number; limit: number; total: number; pages: number }; total?: number }> => {
    return apiClient.get('/api/orders', { params });
  },

  // Get order by ID
  getOrderById: async (id: string): Promise<{ success: boolean; data: Order }> => {
    return apiClient.get(`/api/orders/${id}`);
  },

  // Get most recent order
  getMostRecentOrder: async (): Promise<{ success: boolean; data: Order | null }> => {
    return apiClient.get('/api/orders/most-recent');
  },

  // Get order stats
  getOrderStats: async (): Promise<{ success: boolean; data: OrderStats }> => {
    const response = await apiClient.get<any>('/api/orders/stats');
    // Transform backend response to frontend format
    if (response.success && response.data) {
      return {
        success: true,
        data: {
          totalOrders: response.data.totalOrders || 0,
          totalSpent: response.data.totalAmount || 0, // Map totalAmount to totalSpent
          pendingOrders: response.data.pendingOrders || 0,
          completedOrders: response.data.completedOrders || 0,
          cancelledOrders: response.data.cancelledOrders || 0,
        },
      };
    }
    return response;
  },

  // Track order by order number (public)
  trackOrder: async (orderNumber: string): Promise<{ success: boolean; data: Order }> => {
    return apiClient.get(`/api/orders/track/${orderNumber}`);
  },

  // Get guest order by order number
  getGuestOrderByNumber: async (orderNumber: string): Promise<{ success: boolean; data: Order }> => {
    return apiClient.get(`/api/orders/guest/${orderNumber}`);
  },

  // Get guest order by ID
  getGuestOrderById: async (id: string): Promise<{ success: boolean; data: Order }> => {
    return apiClient.get(`/api/orders/guest-by-id/${id}`);
  },

  // Update order
  updateOrder: async (id: string, data: UpdateOrderRequest): Promise<{ success: boolean; data: Order; message?: string }> => {
    return apiClient.put(`/api/orders/${id}`, data);
  },

  // Update order status (user can cancel)
  updateOrderStatus: async (id: string, status: string): Promise<{ success: boolean; data: Order; message?: string }> => {
    return apiClient.put(`/api/orders/${id}/status`, { status });
  },

  // Confirm payment (for cash payment)
  confirmPayment: async (id: string): Promise<{ success: boolean; data: Order; message?: string }> => {
    return apiClient.put(`/api/orders/${id}/confirm-payment`);
  },

  // Link guest order to user account
  linkGuestOrderToUser: async (id: string): Promise<{ success: boolean; data: Order; message?: string }> => {
    return apiClient.put(`/api/orders/${id}/link`);
  },

  // Reorder from existing order
  reorderFromOrder: async (id: string): Promise<{ success: boolean; data: Order; message?: string }> => {
    return apiClient.post(`/api/orders/${id}/reorder`);
  },
};

