import { authApi } from '../api/auth';
import { authStorage } from './storage';
import { logger } from './logger';

let refreshPromise: Promise<string | null> | null = null;

/**
 * Refresh the authentication token
 * Prevents multiple simultaneous refresh calls
 */
export const refreshToken = async (): Promise<string | null> => {
  // Prevent multiple simultaneous refresh calls
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const currentToken = await authStorage.getToken();
      if (!currentToken) {
        logger.warn('No token available for refresh');
        return null;
      }

      // Call refresh endpoint (cần implement trong backend)
      // For now, we'll use a placeholder - backend needs to implement /api/auth/refresh-token
      const response = await authApi.refreshToken(currentToken);
      
      if (response.success && response.data?.token) {
        await authStorage.setToken(response.data.token);
        logger.log('Token refreshed successfully');
        return response.data.token;
      }
      
      logger.warn('Token refresh failed: Invalid response');
      return null;
    } catch (error: any) {
      logger.error('Token refresh error:', error);
      
      // Refresh failed, logout user
      await authStorage.removeToken();
      await authStorage.removeUser();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

