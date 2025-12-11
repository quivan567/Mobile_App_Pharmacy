import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../utils/constants';
import { authStorage } from '../utils/storage';
import { useAuth } from './AuthContext';
import { logger } from '../utils/logger';
import { refreshToken } from '../utils/tokenRefresh';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  connectionError: string | null;
  reconnect: () => void;
  disconnect: () => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const { isAuthenticated, user } = useAuth();
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 10; // Increased from 5 to 10
  const isManualReconnectRef = useRef(false);
  const tokenRefreshAttemptedRef = useRef(false);

  const connectSocket = async () => {
    if (!isAuthenticated || !user) {
      logger.log('Socket: Not authenticated, skipping connection');
      return;
    }

    try {
      const token = await authStorage.getToken();
      if (!token) {
        logger.warn('Socket: No token available');
        return;
      }

      // Disconnect existing socket if any
      if (socket) {
        socket.disconnect();
      }

      logger.log('Socket: Connecting to server...', { 
        url: API_BASE_URL,
        hasToken: !!token,
        tokenLength: token?.length,
      });

      const newSocket = io(API_BASE_URL, {
        transports: ['websocket', 'polling'],
        auth: {
          token,
        },
        extraHeaders: token ? {
          Authorization: `Bearer ${token}`,
        } : {},
        reconnection: true, // Always enable built-in reconnection
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
        reconnectionAttempts: maxReconnectAttempts,
        timeout: 20000,
        forceNew: isManualReconnectRef.current, // Only force new connection on manual reconnect
      });

      // Connection events
      newSocket.on('connect', () => {
        logger.log('Socket: Connected successfully');
        setIsConnected(true);
        setConnectionError(null);
        reconnectAttemptsRef.current = 0;
        isManualReconnectRef.current = false;
        tokenRefreshAttemptedRef.current = false; // Reset on successful connection
      });

      newSocket.on('disconnect', (reason) => {
        logger.log('Socket: Disconnected', { reason });
        setIsConnected(false);
        
        // Only set error for unexpected disconnects
        if (reason === 'io server disconnect' || reason === 'transport close') {
          setConnectionError('Connection lost. Attempting to reconnect...');
        } else if (reason === 'io client disconnect') {
          // User-initiated disconnect, don't show error
          setConnectionError(null);
        }
      });

      newSocket.on('reconnect_attempt', (attemptNumber) => {
        logger.log(`Socket: Reconnection attempt ${attemptNumber}/${maxReconnectAttempts}`);
        reconnectAttemptsRef.current = attemptNumber;
        setConnectionError(`Reconnecting... (${attemptNumber}/${maxReconnectAttempts})`);
      });

      newSocket.on('reconnect', (attemptNumber) => {
        logger.log(`Socket: Reconnected after ${attemptNumber} attempts`);
        setIsConnected(true);
        setConnectionError(null);
        reconnectAttemptsRef.current = 0;
      });

      newSocket.on('reconnect_failed', () => {
        logger.error('Socket: Reconnection failed after all attempts');
        setConnectionError('Failed to reconnect. Tap to retry.');
        setIsConnected(false);
        reconnectAttemptsRef.current = maxReconnectAttempts;
      });

      newSocket.on('connect_error', async (error) => {
        // Only log significant errors, not every connection attempt
        const shouldLog = reconnectAttemptsRef.current === 0 || reconnectAttemptsRef.current % 5 === 0;
        if (shouldLog) {
          logger.error('Socket: Connection error', {
            message: error.message,
            type: error.type,
            attempt: reconnectAttemptsRef.current + 1,
          });
        }
        
        setIsConnected(false);
        
        // Check if this is a token expiration error
        const isTokenError = error.message?.includes('Token expired') || 
                            error.message?.includes('token') || 
                            error.message?.includes('Authentication') || 
                            error.message?.includes('Unauthorized');
        
        // Try to refresh token if it's expired and we haven't tried yet
        if (isTokenError && !tokenRefreshAttemptedRef.current) {
          logger.log('Socket: Token expired, attempting to refresh...');
          tokenRefreshAttemptedRef.current = true;
          
          // Disable automatic reconnection temporarily
          newSocket.disconnect();
          
          try {
            const newToken = await refreshToken();
            if (newToken) {
              logger.log('Socket: Token refreshed successfully, reconnecting...');
              tokenRefreshAttemptedRef.current = false;
              // Reconnect with new token after a short delay
              setTimeout(() => {
                connectSocket();
              }, 500);
              return;
            } else {
              logger.error('Socket: Token refresh failed');
              setConnectionError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
            }
          } catch (refreshError) {
            logger.error('Socket: Token refresh error', refreshError);
            tokenRefreshAttemptedRef.current = false;
            setConnectionError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
            return;
          }
        }
        
        // If token refresh was attempted but failed, or it's a different auth error
        if (isTokenError && tokenRefreshAttemptedRef.current) {
          logger.error('Socket: Authentication failed after token refresh attempt');
          newSocket.disconnect();
          setConnectionError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
          return;
        }
        
        // Reset token refresh flag for non-token errors
        if (!isTokenError) {
          tokenRefreshAttemptedRef.current = false;
        }
        
        // Set error message - Socket.IO will handle reconnection automatically
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          // Error message will be updated by reconnect_attempt event
        } else {
          setConnectionError('Connection failed. Tap to retry.');
        }
      });

      // Listen for real-time events
      newSocket.on('order:created', (data) => {
        logger.log('Socket: Order created event', data);
        // This will be handled by screens that subscribe to this event
      });

      newSocket.on('order:status:updated', (data) => {
        logger.log('Socket: Order status updated event', data);
        // This will be handled by screens that subscribe to this event
      });

      newSocket.on('notification:new', (data) => {
        logger.log('Socket: New notification event', data);
        // This will be handled by screens that subscribe to this event
      });

      setSocket(newSocket);
    } catch (error) {
      logger.error('Socket: Connection failed', error);
      setIsConnected(false);
    }
  };

  const disconnectSocket = () => {
    if (socket) {
      logger.log('Socket: Disconnecting...');
      socket.disconnect();
      setSocket(null);
      setIsConnected(false);
    }
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    reconnectAttemptsRef.current = 0;
  };

  // Connect when authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      connectSocket();
    } else {
      disconnectSocket();
    }

    return () => {
      disconnectSocket();
    };
  }, [isAuthenticated, user?._id]);

  // Reconnect function
  const reconnect = () => {
    logger.log('Socket: Manual reconnect requested');
    disconnectSocket();
    reconnectAttemptsRef.current = 0;
    isManualReconnectRef.current = true;
    tokenRefreshAttemptedRef.current = false; // Reset token refresh flag on manual reconnect
    setConnectionError(null);
    setTimeout(() => {
      connectSocket();
    }, 1000);
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        connectionError,
        reconnect,
        disconnect: disconnectSocket,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

