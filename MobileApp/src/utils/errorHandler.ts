/**
 * Error handling utilities for the mobile app
 */

export interface AppError {
  message: string;
  code?: string;
  statusCode?: number;
  isNetworkError?: boolean;
  isAuthError?: boolean;
}

/**
 * Parse error from API response or network error
 */
export const parseError = (error: any): AppError => {
  // Network error or timeout
  if (!error?.response) {
    const isTimeout = error?.code === 'ECONNABORTED' || 
                     error?.code === 'ETIMEDOUT' ||
                     error?.message?.includes('timeout');
    
    return {
      message: isTimeout 
        ? 'Kết nối quá lâu. Vui lòng thử lại.'
        : 'Không có kết nối mạng. Vui lòng kiểm tra kết nối và thử lại.',
      code: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
      isNetworkError: true,
    };
  }

  const statusCode = error.response?.status;
  const data = error.response?.data;

  // Authentication error
  if (statusCode === 401 || statusCode === 403) {
    return {
      message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
      code: 'AUTH_ERROR',
      statusCode,
      isAuthError: true,
    };
  }

  // Server error
  if (statusCode >= 500) {
    return {
      message: 'Lỗi máy chủ. Vui lòng thử lại sau.',
      code: 'SERVER_ERROR',
      statusCode,
    };
  }

  // Not found
  if (statusCode === 404) {
    return {
      message: 'Không tìm thấy dữ liệu.',
      code: 'NOT_FOUND',
      statusCode,
    };
  }

  // Validation error
  if (statusCode === 400) {
    const message = data?.message || 
                   data?.errors?.[0]?.msg || 
                   'Dữ liệu không hợp lệ.';
    return {
      message,
      code: 'VALIDATION_ERROR',
      statusCode,
    };
  }

  // Default error message
  const message = data?.message || 
                 data?.errors?.[0]?.msg || 
                 error?.message || 
                 'Đã xảy ra lỗi. Vui lòng thử lại.';

  return {
    message,
    code: 'UNKNOWN_ERROR',
    statusCode,
  };
};

/**
 * Check if error is retryable
 */
export const isRetryableError = (error: AppError): boolean => {
  return (
    error.isNetworkError ||
    error.code === 'TIMEOUT' ||
    (error.statusCode && error.statusCode >= 500) ||
    error.statusCode === 502 ||
    error.statusCode === 503 ||
    error.statusCode === 504
  );
};

/**
 * Get retry delay in milliseconds with exponential backoff
 */
export const getRetryDelay = (attempt: number, baseDelay: number = 1000): number => {
  // Exponential backoff: baseDelay * 2^attempt, max 10s
  return Math.min(baseDelay * Math.pow(2, attempt), 10000);
};

/**
 * Retry a function with exponential backoff
 * @param fn - Function to retry
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param baseDelay - Base delay in milliseconds (default: 1000)
 * @returns Promise that resolves with the function result or rejects with the last error
 */
export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> => {
  let lastError: any;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Parse error to check if retryable
      const appError = parseError(error);
      
      // If not retryable or max retries reached, throw immediately
      if (attempt >= maxRetries || !isRetryableError(appError)) {
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const delay = getRetryDelay(attempt, baseDelay);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Continue to next attempt
      continue;
    }
  }
  
  // If we get here, all retries failed
  throw lastError;
};

/**
 * Retry a function with exponential backoff and user feedback
 * @param fn - Function to retry
 * @param onRetry - Callback called on each retry attempt
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param baseDelay - Base delay in milliseconds (default: 1000)
 * @returns Promise that resolves with the function result or rejects with the last error
 */
export const retryWithBackoffAndFeedback = async <T>(
  fn: () => Promise<T>,
  onRetry?: (attempt: number, maxRetries: number) => void,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> => {
  let lastError: any;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Parse error to check if retryable
      const appError = parseError(error);
      
      // If not retryable or max retries reached, throw immediately
      if (attempt >= maxRetries || !isRetryableError(appError)) {
        throw error;
      }
      
      // Notify user about retry
      if (onRetry) {
        onRetry(attempt + 1, maxRetries);
      }
      
      // Calculate delay with exponential backoff
      const delay = getRetryDelay(attempt, baseDelay);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Continue to next attempt
      continue;
    }
  }
  
  // If we get here, all retries failed
  throw lastError;
};

