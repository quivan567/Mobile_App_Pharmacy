export interface CartItem {
  _id: string;
  product: string | any;
  productId?: string;
  quantity: number;
  price: number;
  total: number;
}

export interface Cart {
  items: CartItem[];
  total: number;
  subtotal: number;
  itemCount: number;
}

