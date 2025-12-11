import { apiClient } from './client';

export interface Notification {
  _id: string;
  userId: string;
  type: 'order' | 'promotion' | 'system' | 'brand' | 'health' | 'news';
  title: string;
  message?: string; // Frontend uses 'message'
  content?: string; // Backend uses 'content'
  link?: string;
  metadata?: any;
  data?: any; // Legacy field
  isRead: boolean;
  createdAt: string;
  updatedAt?: string;
}

export const notificationsApi = {
  getNotifications: async (params?: {
    page?: number;
    limit?: number;
    type?: string;
  }): Promise<{ success: boolean; data: Notification[]; total?: number }> => {
    const response = await apiClient.get<any>('/api/notifications', { 
      params: {
        ...params,
        offset: params?.page ? (params.page - 1) * (params.limit || 20) : 0,
        limit: params?.limit || 20,
      }
    });
    
    // Backend returns { success: true, data: { notifications: [], total, unreadCount } }
    // Map to frontend format { success: true, data: [], total }
    if (response.success && response.data?.notifications) {
      return {
        success: true,
        data: response.data.notifications.map((notif: any) => ({
          ...notif,
          message: notif.content || notif.message, // Map content to message for compatibility
        })),
        total: response.data.total,
      };
    }
    
    return response;
  },

  getUnreadCount: async (): Promise<{ success: boolean; data: { count: number } }> => {
    return apiClient.get('/api/notifications/unread-count');
  },

  markAsRead: async (notificationId: string): Promise<{ success: boolean; message?: string }> => {
    return apiClient.patch(`/api/notifications/${notificationId}/read`);
  },

  markAllAsRead: async (): Promise<{ success: boolean; message?: string }> => {
    return apiClient.patch('/api/notifications/mark-all-read');
  },
};

