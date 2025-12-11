import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from './constants';

export const storage = {
  async getItem<T>(key: string): Promise<T | null> {
    try {
      const value = await AsyncStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`Error getting ${key} from storage:`, error);
      return null;
    }
  },

  async setItem<T>(key: string, value: T): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Error setting ${key} to storage:`, error);
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error(`Error removing ${key} from storage:`, error);
    }
  },

  async clear(): Promise<void> {
    try {
      await AsyncStorage.clear();
    } catch (error) {
      console.error('Error clearing storage:', error);
    }
  },
};

// Convenience methods for auth
export const authStorage = {
  getToken: () => storage.getItem<string>(STORAGE_KEYS.AUTH_TOKEN),
  setToken: (token: string) => storage.setItem(STORAGE_KEYS.AUTH_TOKEN, token),
  removeToken: () => storage.removeItem(STORAGE_KEYS.AUTH_TOKEN),
  
  getUser: () => storage.getItem(STORAGE_KEYS.USER),
  setUser: (user: any) => storage.setItem(STORAGE_KEYS.USER, user),
  removeUser: () => storage.removeItem(STORAGE_KEYS.USER),
};

// Convenience methods for saved promotions
export const savedPromotionsStorage = {
  getSavedPromotions: async (): Promise<string[]> => {
    const saved = await storage.getItem<string[]>(STORAGE_KEYS.SAVED_PROMOTIONS);
    return saved || [];
  },

  savePromotion: async (promotionId: string): Promise<void> => {
    const saved = await savedPromotionsStorage.getSavedPromotions();
    if (!saved.includes(promotionId)) {
      await storage.setItem(STORAGE_KEYS.SAVED_PROMOTIONS, [...saved, promotionId]);
    }
  },

  unsavePromotion: async (promotionId: string): Promise<void> => {
    const saved = await savedPromotionsStorage.getSavedPromotions();
    const filtered = saved.filter(id => id !== promotionId);
    await storage.setItem(STORAGE_KEYS.SAVED_PROMOTIONS, filtered);
  },

  isPromotionSaved: async (promotionId: string): Promise<boolean> => {
    const saved = await savedPromotionsStorage.getSavedPromotions();
    return saved.includes(promotionId);
  },

  clearSavedPromotions: () => storage.removeItem(STORAGE_KEYS.SAVED_PROMOTIONS),
};

