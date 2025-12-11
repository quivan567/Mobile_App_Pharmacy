import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, LoginRequest } from '../types/auth';
import { authApi } from '../api/auth';
import { authStorage } from '../utils/storage';
import { logger } from '../utils/logger';
import Toast from 'react-native-toast-message';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  const loadStoredAuth = async () => {
    try {
      const [storedToken, storedUser] = await Promise.all([
        authStorage.getToken(),
        authStorage.getUser(),
      ]);

      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(storedUser);
        // Verify token by fetching profile
        try {
          await refreshUser();
        } catch (error) {
          // Token invalid, clear storage
          await logout();
        }
      }
    } catch (error) {
      logger.error('Error loading stored auth:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (credentials: LoginRequest) => {
    try {
      const response = await authApi.login(credentials);
      if (response.success && response.data) {
        const { user: userData, token: authToken } = response.data;
        setUser(userData);
        setToken(authToken);
        await authStorage.setToken(authToken);
        await authStorage.setUser(userData);
        
        Toast.show({
          type: 'success',
          text1: 'Đăng nhập thành công',
        });
      } else {
        // If response doesn't indicate success, throw an error
        const errorMessage = response.message || 'Đăng nhập thất bại. Vui lòng thử lại.';
        Toast.show({
          type: 'error',
          text1: 'Đăng nhập thất bại',
          text2: errorMessage,
        });
        throw new Error(errorMessage);
      }
    } catch (error: any) {
      // Only show toast if it's not already shown (for network errors shown by interceptor)
      const errorMessage = error.response?.data?.message || error.message || 'Vui lòng thử lại';
      
      // Check if error is from network (already shown by interceptor)
      if (!error.response) {
        // Network error already handled by interceptor, just throw
        throw error;
      }
      
      Toast.show({
        type: 'error',
        text1: 'Đăng nhập thất bại',
        text2: errorMessage,
      });
      throw error;
    }
  };

  const logout = async () => {
    setUser(null);
    setToken(null);
    await authStorage.removeToken();
    await authStorage.removeUser();
    
    Toast.show({
      type: 'info',
      text1: 'Đã đăng xuất',
    });
  };

  const refreshUser = async () => {
    try {
      const response = await authApi.getProfile();
      if (response.success) {
        setUser(response.data);
        await authStorage.setUser(response.data);
      }
    } catch (error: any) {
      // Don't log rate limit errors as errors - they're expected in some cases
      if (error.response?.status === 429) {
        logger.log('Rate limit reached, skipping user refresh');
        // Return silently - don't throw, so UI doesn't break
        return;
      }
      logger.error('Error refreshing user:', error);
      // Only throw non-rate-limit errors
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        isLoading,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

