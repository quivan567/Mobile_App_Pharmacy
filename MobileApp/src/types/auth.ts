export interface User {
  _id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  role: string;
  avatar?: string;
  isActive: boolean;
}

export interface LoginRequest {
  username: string; // email or phone
  password: string;
}

export interface LoginResponse {
  success: boolean;
  data: {
    user: User;
    token: string;
  };
  message?: string;
}

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  email: string; // Bắt buộc
  phone: string;
  password: string;
  otp: string;
}

export interface RegisterResponse {
  success: boolean;
  data: {
    user: User;
    token: string;
  };
  message?: string;
}

