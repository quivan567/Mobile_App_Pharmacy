import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { cartApi, CartItem } from '../api/cart';
import { useAuth } from './AuthContext';
import { storage } from '../utils/storage';
import { STORAGE_KEYS } from '../utils/constants';
import Toast from 'react-native-toast-message';
import { hapticFeedback } from '../utils/haptics';

interface CartContextType {
  items: CartItem[];
  isLoading: boolean;
  subtotal: number;
  itemCount: number;
  addToCart: (productId: string, quantity?: number) => Promise<void>;
  updateQuantity: (itemId: string, quantity: number) => Promise<void>;
  removeFromCart: (itemId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  refreshCart: () => Promise<void>;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within CartProvider');
  }
  return context;
};

interface CartProviderProps {
  children: ReactNode;
}

export const CartProvider: React.FC<CartProviderProps> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadLocalCart = async () => {
    try {
      const localCart = await storage.getItem<CartItem[]>(STORAGE_KEYS.CART);
      if (localCart) {
        setItems(localCart);
      }
    } catch (error) {
      console.error('Error loading local cart:', error);
    }
  };

  const saveLocalCart = async (cartItems: CartItem[]) => {
    try {
      await storage.setItem(STORAGE_KEYS.CART, cartItems);
    } catch (error) {
      console.error('Error saving local cart:', error);
    }
  };

  const refreshCart = useCallback(async (showLoading: boolean = false) => {
    if (!isAuthenticated) return;

    // Only show loading if explicitly requested (e.g., initial load)
    if (showLoading) {
      setIsLoading(true);
    }
    try {
      const response = await cartApi.getCart();
      if (response.success) {
        // Backend returns data as array directly or as object with items
        const cartItems = Array.isArray(response.data) 
          ? response.data 
          : (response.data.items || []);
        setItems(cartItems);
      }
    } catch (error: any) {
      console.error('Error refreshing cart:', error);
      // Only show error toast if not in background refresh
      if (showLoading) {
        Toast.show({
          type: 'error',
          text1: 'Lỗi',
          text2: 'Không thể tải giỏ hàng',
        });
      }
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  }, [isAuthenticated]);

  // Load cart from backend when authenticated (initial load with loading indicator)
  useEffect(() => {
    if (isAuthenticated) {
      refreshCart(true); // Show loading on initial load
    } else {
      // Load from local storage if not authenticated
      loadLocalCart();
    }
  }, [isAuthenticated, refreshCart]);

  // Realtime cart sync: Poll cart every 2 minutes when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    const intervalId = setInterval(() => {
      refreshCart(false); // Background refresh, no loading indicator
    }, 120000); // Poll every 2 minutes

    return () => clearInterval(intervalId);
  }, [isAuthenticated, refreshCart]);

  const addToCart = async (productId: string, quantity: number = 1) => {
    if (!isAuthenticated) {
      Toast.show({
        type: 'info',
        text1: 'Vui lòng đăng nhập',
        text2: 'Bạn cần đăng nhập để thêm sản phẩm vào giỏ hàng',
      });
      return;
    }

    try {
      const response = await cartApi.addToCart(productId, quantity);
      
      if (response.success) {
        // Backend returns single item, so we need to refresh the entire cart
        // to get the updated list with populated product data
        await refreshCart();
        
        hapticFeedback.success();
        Toast.show({
          type: 'success',
          text1: 'Thành công',
          text2: 'Đã thêm vào giỏ hàng',
        });
      }
    } catch (error: any) {
      console.error('Error adding to cart:', error);
      hapticFeedback.error();
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: error.response?.data?.message || 'Không thể thêm vào giỏ hàng',
      });
    }
  };

  const updateQuantity = async (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      await removeFromCart(itemId);
      return;
    }

    if (!isAuthenticated) {
      // Update local cart
      const updatedItems = items.map(item =>
        item._id === itemId ? { ...item, quantity } : item
      );
      setItems(updatedItems);
      await saveLocalCart(updatedItems);
      return;
    }

    // Optimistic update: Update UI immediately
    const previousItems = [...items];
    const optimisticItems = items.map(item =>
      item._id === itemId ? { ...item, quantity } : item
    );
    setItems(optimisticItems);

    try {
      const response = await cartApi.updateCartItem(itemId, quantity);
      if (response.success) {
        // Sync with server to get updated data
        await refreshCart();
      } else {
        // Rollback on failure
        setItems(previousItems);
        hapticFeedback.error();
        Toast.show({
          type: 'error',
          text1: 'Lỗi',
          text2: 'Không thể cập nhật số lượng',
        });
      }
    } catch (error: any) {
      // Rollback on error
      setItems(previousItems);
      console.error('Error updating cart item:', error);
      hapticFeedback.error();
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: error.response?.data?.message || 'Không thể cập nhật số lượng',
      });
    }
  };

  const removeFromCart = async (itemId: string) => {
    if (!isAuthenticated) {
      // Remove from local cart
      const updatedItems = items.filter(item => item._id !== itemId);
      setItems(updatedItems);
      await saveLocalCart(updatedItems);
      return;
    }

    // Optimistic update: Remove from UI immediately
    const previousItems = [...items];
    const removedItem = items.find(item => item._id === itemId);
    const optimisticItems = items.filter(item => item._id !== itemId);
    setItems(optimisticItems);

    try {
      const response = await cartApi.removeFromCart(itemId);
      if (response.success) {
        // Sync with server to confirm
        await refreshCart();
        hapticFeedback.success();
        Toast.show({
          type: 'success',
          text1: 'Đã xóa',
          text2: 'Sản phẩm đã được xóa khỏi giỏ hàng',
        });
      } else {
        // Rollback on failure
        setItems(previousItems);
        hapticFeedback.error();
        Toast.show({
          type: 'error',
          text1: 'Lỗi',
          text2: 'Không thể xóa sản phẩm',
        });
      }
    } catch (error: any) {
      // Rollback on error
      setItems(previousItems);
      hapticFeedback.error();
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.errors?.[0]?.msg ||
                          'Không thể xóa sản phẩm';
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: errorMessage,
      });
    }
  };

  const clearCart = async () => {
    if (!isAuthenticated) {
      setItems([]);
      await storage.removeItem(STORAGE_KEYS.CART);
      return;
    }

    try {
      const response = await cartApi.clearCart();
      if (response.success) {
        setItems([]);
      }
    } catch (error: any) {
      console.error('Error clearing cart:', error);
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: 'Không thể xóa giỏ hàng',
      });
    }
  };

  const subtotal = items.reduce((sum, item) => {
    // Backend returns productId (populated) instead of product
    const product = typeof item.product === 'object' ? item.product : 
                    (typeof item.productId === 'object' ? item.productId : null);
    const price = item.price || product?.price || 0;
    const quantity = item.quantity || 0;
    return sum + (price * quantity);
  }, 0);

  const itemCount = items.reduce((sum, item) => sum + (item.quantity || 0), 0);

  return (
    <CartContext.Provider
      value={{
        items,
        isLoading,
        subtotal,
        itemCount,
        addToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
        refreshCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

