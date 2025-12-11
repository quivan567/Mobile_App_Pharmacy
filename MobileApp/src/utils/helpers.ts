export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount);
};

export const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('vi-VN').format(num);
};

export const validatePhone = (phone: string): boolean => {
  return /^[0-9]{10,11}$/.test(phone);
};

export const validateEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

/**
 * Extract error message from API error response
 */
export const getErrorMessage = (error: any): string => {
  if (error?.response?.data?.message) {
    return error.response.data.message;
  }
  if (error?.response?.data?.errors?.[0]?.msg) {
    return error.response.data.errors[0].msg;
  }
  if (error?.message) {
    return error.message;
  }
  return 'Đã xảy ra lỗi. Vui lòng thử lại.';
};

/**
 * Check if error is network related
 */
export const isNetworkError = (error: any): boolean => {
  return (
    !error?.response ||
    error?.code === 'NETWORK_ERROR' ||
    error?.message?.includes('Network Error') ||
    error?.message?.includes('timeout')
  );
};

/**
 * Get user-friendly error message based on error type
 */
export const getUserFriendlyErrorMessage = (error: any): string => {
  if (isNetworkError(error)) {
    return 'Không có kết nối mạng. Vui lòng kiểm tra kết nối và thử lại.';
  }
  
  if (error?.response?.status === 401) {
    return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  }
  
  if (error?.response?.status === 403) {
    return 'Bạn không có quyền thực hiện thao tác này.';
  }
  
  if (error?.response?.status === 404) {
    return 'Không tìm thấy dữ liệu.';
  }
  
  if (error?.response?.status === 500) {
    return 'Lỗi máy chủ. Vui lòng thử lại sau.';
  }
  
  return getErrorMessage(error);
};

