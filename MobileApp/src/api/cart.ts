import { apiClient } from './client';

export interface CartItem {
  _id: string;
  product?: any;
  productId?: string | any; // Can be string ID or populated object
  quantity: number;
  price?: number; // May not be present, get from productId.price
  total?: number;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Cart {
  items: CartItem[];
  total: number;
  subtotal: number;
  itemCount: number;
}

export const cartApi = {
  getCart: async (): Promise<{ success: boolean; data: CartItem[] | Cart }> => {
    return apiClient.get('/api/cart');
  },

  addToCart: async (productId: string, quantity: number): Promise<{ success: boolean; data: CartItem; message?: string }> => {
    return apiClient.post('/api/cart', { productId, quantity });
  },

  updateCartItem: async (itemId: string, quantity: number): Promise<{ success: boolean; data: CartItem }> => {
    return apiClient.put(`/api/cart/${itemId}`, { quantity });
  },

  removeFromCart: async (itemId: string): Promise<{ success: boolean; message?: string }> => {
    return apiClient.delete(`/api/cart/${itemId}`);
  },

  clearCart: async (): Promise<{ success: boolean; message: string }> => {
    return apiClient.delete('/api/cart');
  },
};

