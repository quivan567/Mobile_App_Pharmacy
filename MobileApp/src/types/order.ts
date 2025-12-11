export interface OrderItem {
  product: string | any;
  quantity: number;
  price: number;
  total: number;
}

export interface Order {
  _id: string;
  orderNumber: string;
  user?: string;
  userId?: string;
  items: OrderItem[];
  total: number;
  totalAmount: number;
  subtotal: number;
  shippingFee: number;
  discountAmount: number;
  status: 'pending' | 'confirmed' | 'processing' | 'shipping' | 'delivered' | 'cancelled';
  paymentMethod: string;
  paymentStatus: 'pending' | 'paid' | 'failed';
  shippingAddress: string;
  shippingPhone: string;
  createdAt: string;
  updatedAt: string;
}

export interface Address {
  _id?: string;
  fullName: string;
  phone: string;
  address: string;
  ward: string;
  district: string;
  province: string;
  isDefault?: boolean;
}

