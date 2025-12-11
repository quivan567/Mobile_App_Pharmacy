export interface Medicine {
  _id: string;
  name: string;
  slug?: string;
  description?: string;
  price: number;
  originalPrice?: number;
  salePrice?: number; // Backend returns this
  image?: string;
  imageUrl?: string;
  images?: string[];
  category: string;
  categoryName?: string;
  stock: number;
  stockQuantity?: number; // Backend returns this as stockQuantity
  unit?: string;
  manufacturer?: string;
  manufacturerId?: string; // Backend returns this as manufacturerId
  strength?: string; // Backend returns this as strength
  expiryDate?: string;
  isActive?: boolean;
  isHot?: boolean;
  isNew?: boolean;
  isOnSale?: boolean;
  inStock?: boolean;
}

export interface MedicineListResponse {
  success: boolean;
  data: Medicine[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

