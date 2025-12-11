import mongoose, { Schema, Document, Types } from 'mongoose';

// User Schema
export interface IUser extends Document {
  email?: string; // Email không bắt buộc
  phone: string;
  password: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: Date;
  gender?: string;
  address?: string;
  avatar?: string;
  isActive: boolean;
  isVerified: boolean;
  role: 'customer' | 'admin';
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>({
  email: {
    type: String,
    required: false, // Email không bắt buộc
    unique: false,   // Email không cần unique
    lowercase: true,
    trim: true,
  },
  phone: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
  },
  firstName: {
    type: String,
    required: true,
    trim: true,
  },
  lastName: {
    type: String,
    required: true,
    trim: true,
  },
  dateOfBirth: {
    type: Date,
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other'],
  },
  address: {
    type: String,
    trim: true,
  },
  avatar: {
    type: String,
    trim: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  role: {
    type: String,
    enum: ['customer', 'admin'],
    default: 'customer',
  },
}, {
  timestamps: true,
});

// Category Schema
export interface ICategory extends Document {
  name: string;
  icon: string;
  slug: string;
  description?: string;
  parentId?: mongoose.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
}

const categorySchema = new Schema<ICategory>({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  icon: {
    type: String,
    required: true,
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  parentId: {
    type: Schema.Types.ObjectId,
    ref: 'Category',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: { createdAt: true, updatedAt: false },
});

// Product Schema
export interface IProduct extends mongoose.Document {
  name: string;
  description?: string;
  price: number;
  originalPrice?: number;
  discountPercentage: number;
  imageUrl: string;
  categoryId: mongoose.Types.ObjectId;
  brand?: string;
  unit: string;
  inStock: boolean;
  stockQuantity: number;
  isHot: boolean;
  isNew: boolean;
  isPrescription: boolean;
  // Expiration tracking fields
  expirationDate?: Date;
  batchNumber?: string;
  manufacturingDate?: Date;
  supplierId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  originalPrice: {
    type: Number,
    min: 0,
  },
  discountPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  imageUrl: {
    type: String,
    required: true,
  },
  categoryId: {
    type: Schema.Types.ObjectId,
    ref: 'Category',
    required: true,
  },
  brand: {
    type: String,
    trim: true,
  },
  unit: {
    type: String,
    default: 'Hộp',
    trim: true,
  },
  inStock: {
    type: Boolean,
    default: true,
  },
  stockQuantity: {
    type: Number,
    default: 0,
    min: 0,
  },
  isHot: {
    type: Boolean,
    default: false,
  },
  isNew: {
    type: Boolean,
    default: false,
  },
  isPrescription: {
    type: Boolean,
    default: false,
  },
  // Expiration tracking fields
  expirationDate: {
    type: Date,
  },
  batchNumber: {
    type: String,
    trim: true,
  },
  manufacturingDate: {
    type: Date,
  },
  supplierId: {
    type: Schema.Types.ObjectId,
    ref: 'Supplier',
  },
}, {
  timestamps: true,
});

// Order Schema
export interface IOrder extends Document {
  userId: mongoose.Types.ObjectId;
  orderNumber: string;
  status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  totalAmount: number;
  discountAmount?: number;
  shippingFee?: number;
  couponCode?: string;
  shippingAddress: string;
  shippingPhone: string;
  paymentMethod: 'cash' | 'card' | 'bank_transfer' | 'momo' | 'zalopay' | 'vnpay';
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  momoOrderId?: string; // MoMo's orderId (used for querying payment status)
  momoRequestId?: string; // MoMo's requestId (used for querying payment status)
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const orderSchema = new Schema<IOrder>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: false, // Allow null for guest orders
  },
  orderNumber: {
    type: String,
    required: true,
    unique: true,
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending',
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0,
  },
  discountAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  shippingFee: {
    type: Number,
    default: 0,
    min: 0,
  },
  couponCode: {
    type: String,
    trim: true,
  },
  shippingAddress: {
    type: String,
    required: true,
    trim: true,
  },
  shippingPhone: {
    type: String,
    required: true,
    trim: true,
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'bank_transfer', 'momo', 'zalopay', 'vnpay'],
    required: true,
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending',
  },
  momoOrderId: {
    type: String,
    trim: true,
  },
  momoRequestId: {
    type: String,
    trim: true,
  },
  notes: {
    type: String,
    trim: true,
  },
}, {
  timestamps: true,
});

// Order Item Schema
export interface IOrderItem extends Document {
  orderId: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId;
  quantity: number;
  price: number;
  createdAt: Date;
}

const orderItemSchema = new Schema<IOrderItem>({
  orderId: {
    type: Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
  },
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
}, {
  timestamps: { createdAt: true, updatedAt: false },
});

// Cart Schema
export interface ICart extends Document {
  userId: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId;
  quantity: number;
  createdAt: Date;
  updatedAt: Date;
}

const cartSchema = new Schema<ICart>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1,
  },
}, {
  timestamps: true,
});

// Prescription Schema
export interface IPrescription extends Document {
  userId: mongoose.Types.ObjectId;
  customerName: string;
  phoneNumber: string;
  doctorName: string;
  hospitalName?: string;
  prescriptionImage: string;
  examinationDate?: Date;
  diagnosis?: string;
  status: 'pending' | 'approved' | 'rejected' | 'saved';
  notes?: string;
  rejectionReason?: string;
  prescriptionNumber?: string; // Optional unique prescription number
  suggestedMedicines?: Array<{
    productId: string;
    productName: string;
    price: number;
    unit: string;
    confidence?: number;
    matchReason?: string;
    originalText?: string;
  }>; // Suggested medicines from analysis
  createdAt: Date;
  updatedAt: Date;
}

const prescriptionSchema = new Schema<IPrescription>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  customerName: {
    type: String,
    required: true,
    trim: true,
  },
  phoneNumber: {
    type: String,
    required: true,
    trim: true,
  },
  doctorName: {
    type: String,
    required: true,
    trim: true,
  },
  hospitalName: {
    type: String,
    trim: true,
  },
  prescriptionImage: {
    type: String,
    required: true,
  },
  examinationDate: {
    type: Date,
  },
  diagnosis: {
    type: String,
    trim: true,
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'saved'],
    default: 'pending',
  },
  notes: {
    type: String,
    trim: true,
  },
  rejectionReason: {
    type: String,
    trim: true,
  },
  prescriptionNumber: {
    type: String,
    trim: true,
    unique: true,
    sparse: true, // Only index non-null values to avoid duplicate null error
  },
  suggestedMedicines: [{
    productId: {
      type: String,
      required: true,
    },
    productName: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    unit: {
      type: String,
      required: true,
    },
    confidence: {
      type: Number,
    },
    matchReason: {
      type: String,
    },
    originalText: {
      type: String,
    },
  }],
}, {
  timestamps: true,
});

// Review Schema
export interface IReview extends Document {
  userId: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId;
  rating: number;
  comment?: string;
  isVerified: boolean;
  createdAt: Date;
}

const reviewSchema = new Schema<IReview>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
  },
  comment: {
    type: String,
    trim: true,
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: { createdAt: true, updatedAt: false },
});

// Supplier Schema
export interface ISupplier extends Document {
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  taxCode?: string;
  bankAccount?: string;
  bankName?: string;
  isActive: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const supplierSchema = new Schema<ISupplier>({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  contactPerson: {
    type: String,
    trim: true,
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
  },
  phone: {
    type: String,
    trim: true,
  },
  address: {
    type: String,
    trim: true,
  },
  taxCode: {
    type: String,
    trim: true,
  },
  bankAccount: {
    type: String,
    trim: true,
  },
  bankName: {
    type: String,
    trim: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  notes: {
    type: String,
    trim: true,
  },
}, {
  timestamps: true,
});

// Invoice Schema
export interface IInvoice extends Document {
  invoiceNumber: string;
  orderId?: mongoose.Types.ObjectId;
  customerId?: mongoose.Types.ObjectId;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerEmail?: string;
  items: IInvoiceItem[];
  subtotal: number;
  discountAmount: number;
  discountPercentage: number;
  taxAmount: number;
  taxPercentage: number;
  totalAmount: number;
  paymentMethod: 'cash' | 'card' | 'bank_transfer' | 'momo' | 'zalopay';
  paymentStatus: 'pending' | 'paid' | 'partial' | 'refunded';
  status: 'draft' | 'confirmed' | 'completed' | 'cancelled';
  notes?: string;
  prescriptionId?: mongoose.Types.ObjectId;
  pharmacistId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IInvoiceItem {
  productId: mongoose.Types.ObjectId;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  discountPercentage: number;
  totalPrice: number;
  batchNumber?: string | undefined;
  expirationDate?: Date | undefined;
}

const invoiceItemSchema = new Schema<IInvoiceItem>({
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  productName: {
    type: String,
    required: true,
    trim: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  discountAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  discountPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  totalPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  batchNumber: {
    type: String,
    trim: true,
  },
  expirationDate: {
    type: Date,
  },
}, { _id: false });

const invoiceSchema = new Schema<IInvoice>({
  invoiceNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  orderId: {
    type: Schema.Types.ObjectId,
    ref: 'Order',
  },
  customerId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  customerName: {
    type: String,
    trim: true,
  },
  customerPhone: {
    type: String,
    trim: true,
  },
  customerAddress: {
    type: String,
    trim: true,
  },
  customerEmail: {
    type: String,
    trim: true,
    lowercase: true,
  },
  items: [invoiceItemSchema],
  subtotal: {
    type: Number,
    required: true,
    min: 0,
  },
  discountAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  discountPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  taxAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  taxPercentage: {
    type: Number,
    default: 10, // 10% VAT
    min: 0,
    max: 100,
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0,
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'bank_transfer', 'momo', 'zalopay', 'cod', 'qr', 'atm', 'vnpay'],
    required: true,
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'partial', 'refunded'],
    default: 'pending',
  },
  status: {
    type: String,
    enum: ['draft', 'confirmed', 'completed', 'cancelled', 'pending', 'processing', 'shipped', 'delivered'],
    default: 'draft',
  },
  notes: {
    type: String,
    trim: true,
  },
  prescriptionId: {
    type: Schema.Types.ObjectId,
    ref: 'Prescription',
  },
  pharmacistId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});

// Import/Receipt Schema (Nhập kho)
export interface IImport extends Document {
  importNumber: string;
  supplierId: mongoose.Types.ObjectId;
  supplierName: string;
  items: IImportItem[];
  totalQuantity: number;
  totalAmount: number;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  notes?: string;
  receivedBy: mongoose.Types.ObjectId;
  receivedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IImportItem {
  productId: mongoose.Types.ObjectId;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  batchNumber: string;
  expirationDate: Date;
  manufacturingDate?: Date | undefined;
  receivedQuantity?: number | undefined;
  status: 'pending' | 'partial' | 'completed';
}

const importItemSchema = new Schema<IImportItem>({
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  productName: {
    type: String,
    required: true,
    trim: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  totalPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  batchNumber: {
    type: String,
    required: true,
    trim: true,
  },
  expirationDate: {
    type: Date,
    required: true,
  },
  manufacturingDate: {
    type: Date,
  },
  receivedQuantity: {
    type: Number,
    default: 0,
    min: 0,
  },
  status: {
    type: String,
    enum: ['pending', 'partial', 'completed'],
    default: 'pending',
  },
}, { _id: false });

const importSchema = new Schema<IImport>({
  importNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  supplierId: {
    type: Schema.Types.ObjectId,
    ref: 'Supplier',
    required: true,
  },
  supplierName: {
    type: String,
    required: true,
    trim: true,
  },
  items: [importItemSchema],
  totalQuantity: {
    type: Number,
    required: true,
    min: 0,
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0,
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'completed', 'cancelled'],
    default: 'pending',
  },
  notes: {
    type: String,
    trim: true,
  },
  receivedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  receivedAt: {
    type: Date,
  },
}, {
  timestamps: true,
});

// Export/Issue Schema (Xuất kho)
export interface IExport extends Document {
  exportNumber: string;
  reason: 'sale' | 'transfer' | 'damage' | 'expired' | 'adjustment' | 'other';
  items: IExportItem[];
  totalQuantity: number;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  notes?: string;
  issuedBy: mongoose.Types.ObjectId;
  issuedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IExportItem {
  productId: mongoose.Types.ObjectId;
  productName: string;
  quantity: number;
  batchNumber?: string | undefined;
  expirationDate?: Date | undefined;
  reason?: string | undefined;
  status: 'pending' | 'completed';
}

const exportItemSchema = new Schema<IExportItem>({
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  productName: {
    type: String,
    required: true,
    trim: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  batchNumber: {
    type: String,
    trim: true,
  },
  expirationDate: {
    type: Date,
  },
  reason: {
    type: String,
    trim: true,
  },
  status: {
    type: String,
    enum: ['pending', 'completed'],
    default: 'pending',
  },
}, { _id: false });

const exportSchema = new Schema<IExport>({
  exportNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  reason: {
    type: String,
    enum: ['sale', 'transfer', 'damage', 'expired', 'adjustment', 'other'],
    required: true,
  },
  items: [exportItemSchema],
  totalQuantity: {
    type: Number,
    required: true,
    min: 0,
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'completed', 'cancelled'],
    default: 'pending',
  },
  notes: {
    type: String,
    trim: true,
  },
  issuedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  issuedAt: {
    type: Date,
  },
}, {
  timestamps: true,
});

// Stock Movement Schema (Lịch sử tồn kho)
export interface IStockMovement extends Document {
  productId: mongoose.Types.ObjectId;
  productName: string;
  movementType: 'import' | 'export' | 'adjustment' | 'sale' | 'return';
  quantity: number;
  previousStock: number;
  newStock: number;
  referenceType: 'import' | 'export' | 'invoice' | 'adjustment';
  referenceId: mongoose.Types.ObjectId;
  referenceNumber: string;
  batchNumber?: string;
  expirationDate?: Date;
  reason?: string;
  performedBy: mongoose.Types.ObjectId;
  createdAt: Date;
}

const stockMovementSchema = new Schema<IStockMovement>({
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  productName: {
    type: String,
    required: true,
    trim: true,
  },
  movementType: {
    type: String,
    enum: ['import', 'export', 'adjustment', 'sale', 'return'],
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
  },
  previousStock: {
    type: Number,
    required: true,
    min: 0,
  },
  newStock: {
    type: Number,
    required: true,
    min: 0,
  },
  referenceType: {
    type: String,
    enum: ['import', 'export', 'invoice', 'adjustment'],
    required: true,
  },
  referenceId: {
    type: Schema.Types.ObjectId,
    required: true,
  },
  referenceNumber: {
    type: String,
    required: true,
    trim: true,
  },
  batchNumber: {
    type: String,
    trim: true,
  },
  expirationDate: {
    type: Date,
  },
  reason: {
    type: String,
    trim: true,
  },
  performedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, {
  timestamps: { createdAt: true, updatedAt: false },
});

// Create indexes for better performance
userSchema.index({ email: 1 });
userSchema.index({ phone: 1 });
categorySchema.index({ slug: 1 });
// Text index for full-text search (includes name, description, and brand)
productSchema.index({ name: 'text', description: 'text', brand: 'text' });
productSchema.index({ categoryId: 1 });
productSchema.index({ isHot: 1 });
productSchema.index({ isNew: 1 });
orderSchema.index({ userId: 1 });
orderSchema.index({ orderNumber: 1 });
cartSchema.index({ userId: 1 });
prescriptionSchema.index({ userId: 1 });
reviewSchema.index({ productId: 1 });
invoiceSchema.index({ invoiceNumber: 1 });
invoiceSchema.index({ customerId: 1 });
invoiceSchema.index({ createdAt: -1 });
invoiceSchema.index({ status: 1 });
invoiceSchema.index({ paymentStatus: 1 });
importSchema.index({ importNumber: 1 });
importSchema.index({ supplierId: 1 });
importSchema.index({ status: 1 });
importSchema.index({ createdAt: -1 });
exportSchema.index({ exportNumber: 1 });
exportSchema.index({ reason: 1 });
exportSchema.index({ status: 1 });
exportSchema.index({ createdAt: -1 });
stockMovementSchema.index({ productId: 1 });
stockMovementSchema.index({ movementType: 1 });
stockMovementSchema.index({ createdAt: -1 });
stockMovementSchema.index({ referenceType: 1, referenceId: 1 });

// Coupon Schema
export interface ICoupon extends Document {
  code: string;
  name: string;
  description?: string;
  type: 'percentage' | 'fixed';
  value: number; // percentage (0-100) or fixed amount
  minOrderAmount?: number;
  maxDiscountAmount?: number;
  usageLimit?: number;
  usedCount: number;
  isActive: boolean;
  validFrom: Date;
  validUntil: Date;
  applicableCategories?: mongoose.Types.ObjectId[];
  applicableProducts?: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const couponSchema = new Schema<ICoupon>({
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  type: {
    type: String,
    enum: ['percentage', 'fixed'],
    required: true,
  },
  value: {
    type: Number,
    required: true,
    min: 0,
  },
  minOrderAmount: {
    type: Number,
    min: 0,
  },
  maxDiscountAmount: {
    type: Number,
    min: 0,
  },
  usageLimit: {
    type: Number,
    min: 1,
  },
  usedCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  validFrom: {
    type: Date,
    required: true,
  },
  validUntil: {
    type: Date,
    required: true,
  },
  applicableCategories: [{
    type: Schema.Types.ObjectId,
    ref: 'Category',
  }],
  applicableProducts: [{
    type: Schema.Types.ObjectId,
    ref: 'Product',
  }],
}, {
  timestamps: true,
});

// Coupon Usage Schema
export interface ICouponUsage extends Document {
  couponId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  orderId: mongoose.Types.ObjectId;
  discountAmount: number;
  createdAt: Date;
}

const couponUsageSchema = new Schema<ICouponUsage>({
  couponId: {
    type: Schema.Types.ObjectId,
    ref: 'Coupon',
    required: true,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  orderId: {
    type: Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
  },
  discountAmount: {
    type: Number,
    required: true,
    min: 0,
  },
}, {
  timestamps: { createdAt: true, updatedAt: false },
});

// Indexes
couponSchema.index({ code: 1 });
couponSchema.index({ isActive: 1 });
couponSchema.index({ validFrom: 1, validUntil: 1 });
couponUsageSchema.index({ couponId: 1 });
couponUsageSchema.index({ userId: 1 });
couponUsageSchema.index({ orderId: 1 });

// Saved Prescription Schema (for reordering)
export interface ISavedPrescription extends Document {
  userId: mongoose.Types.ObjectId;
  prescriptionId?: mongoose.Types.ObjectId; // Reference to original prescription
  orderId?: mongoose.Types.ObjectId; // Reference to original order
  name: string; // User-defined name for the saved prescription
  description?: string;
  items: {
    productId: mongoose.Types.ObjectId;
    productName: string;
    quantity: number;
    unit: string;
    price: number;
    notes?: string; // User notes for this item
  }[];
  totalAmount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const savedPrescriptionSchema = new Schema<ISavedPrescription>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  prescriptionId: {
    type: Schema.Types.ObjectId,
    ref: 'Prescription',
  },
  orderId: {
    type: Schema.Types.ObjectId,
    ref: 'Order',
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  items: [{
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    productName: {
      type: String,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    unit: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    notes: {
      type: String,
      trim: true,
    },
  }],
  totalAmount: {
    type: Number,
    required: true,
    min: 0,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

// Address Schema
export interface IAddress extends Document {
  userId: mongoose.Types.ObjectId;
  receiverName: string;
  receiverPhone: string;
  province: string;
  provinceName: string;
  district: string;
  districtName: string;
  ward: string;
  wardName: string;
  address: string; // Số nhà, tên đường
  addressType: 'home' | 'company';
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const addressSchema = new Schema<IAddress>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  receiverName: {
    type: String,
    required: true,
    trim: true,
  },
  receiverPhone: {
    type: String,
    required: true,
    trim: true,
  },
  province: {
    type: String,
    required: true,
    trim: true,
  },
  provinceName: {
    type: String,
    required: true,
    trim: true,
  },
  district: {
    type: String,
    required: true,
    trim: true,
  },
  districtName: {
    type: String,
    required: true,
    trim: true,
  },
  ward: {
    type: String,
    required: true,
    trim: true,
  },
  wardName: {
    type: String,
    required: true,
    trim: true,
  },
  address: {
    type: String,
    required: true,
    trim: true,
  },
  addressType: {
    type: String,
    enum: ['home', 'company'],
    default: 'home',
  },
  isDefault: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

// Indexes
savedPrescriptionSchema.index({ userId: 1 });
savedPrescriptionSchema.index({ prescriptionId: 1 });
savedPrescriptionSchema.index({ orderId: 1 });
savedPrescriptionSchema.index({ isActive: 1 });
addressSchema.index({ userId: 1 });
addressSchema.index({ userId: 1, isDefault: 1 });

// Export models
export const User = mongoose.model<IUser>('User', userSchema);
export const Category = mongoose.model<ICategory>('Category', categorySchema);
export const Product = mongoose.model<IProduct>('Product', productSchema);
export const Order = mongoose.model<IOrder>('Order', orderSchema);
export const OrderItem = mongoose.model<IOrderItem>('OrderItem', orderItemSchema);
export const Cart = mongoose.model<ICart>('Cart', cartSchema);
export const Prescription = mongoose.model<IPrescription>('Prescription', prescriptionSchema);
export const Review = mongoose.model<IReview>('Review', reviewSchema);
export const Supplier = mongoose.model<ISupplier>('Supplier', supplierSchema);
export const Address = mongoose.model<IAddress>('Address', addressSchema);
export const Invoice = mongoose.model<IInvoice>('Invoice', invoiceSchema);
export const Import = mongoose.model<IImport>('Import', importSchema);
export const Export = mongoose.model<IExport>('Export', exportSchema);
export const StockMovement = mongoose.model<IStockMovement>('StockMovement', stockMovementSchema);
export const Coupon = mongoose.model<ICoupon>('Coupon', couponSchema);
export const CouponUsage = mongoose.model<ICouponUsage>('CouponUsage', couponUsageSchema);
export const SavedPrescription = mongoose.model<ISavedPrescription>('SavedPrescription', savedPrescriptionSchema);



// Promotion Schema
export interface IPromotion extends Document {
  name: string;
  description?: string;
  type: 'order_threshold' | 'combo' | 'flash_sale' | 'category_bundle';
  code?: string; // optional promotion code for user input
  isActive: boolean;
  startDate: Date;
  endDate: Date;
  // Order threshold (A)
  minOrderValue?: number;
  discountPercent?: number;
  // Flash sale (D) specific optional fields
  dailyStartTime?: string; // e.g. '18:00'
  dailyEndTime?: string;   // e.g. '20:00'
  // Category based (E)
  applicableCategoryId?: mongoose.Types.ObjectId;
  // Generic caps
  maxDiscountAmount?: number;
  createdAt: Date;
  updatedAt: Date;
}

const promotionSchema = new Schema<IPromotion>({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  type: { type: String, enum: ['order_threshold', 'combo', 'flash_sale', 'category_bundle'], required: true },
  code: { type: String, trim: true, uppercase: true, unique: true, sparse: true },
  isActive: { type: Boolean, default: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  minOrderValue: { type: Number, min: 0 },
  discountPercent: { type: Number, min: 0, max: 100 },
  dailyStartTime: { type: String, trim: true },
  dailyEndTime: { type: String, trim: true },
  applicableCategoryId: { type: Schema.Types.ObjectId, ref: 'Category' },
  maxDiscountAmount: { type: Number, min: 0 },
}, { timestamps: true });

promotionSchema.index({ isActive: 1 });
promotionSchema.index({ startDate: 1, endDate: 1 });
promotionSchema.index({ type: 1 });
promotionSchema.index({ code: 1 });

// Promotion Item Schema (for combo rules - B)
export interface IPromotionItem extends Document {
  promotionId: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId;
  requiredQuantity: number; // quantity required for the combo rule
  createdAt: Date;
  updatedAt: Date;
}

const promotionItemSchema = new Schema<IPromotionItem>({
  promotionId: { type: Schema.Types.ObjectId, ref: 'Promotion', required: true },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  requiredQuantity: { type: Number, required: true, min: 1 },
}, { timestamps: true });

promotionItemSchema.index({ promotionId: 1 });
promotionItemSchema.index({ productId: 1 });

// Loyalty (C)
export interface ILoyaltyAccount extends Document {
  userId: mongoose.Types.ObjectId;
  pointsBalance: number;
  lifetimePoints: number;
  createdAt: Date;
  updatedAt: Date;
}

const loyaltyAccountSchema = new Schema<ILoyaltyAccount>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  pointsBalance: { type: Number, default: 0, min: 0 },
  lifetimePoints: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

loyaltyAccountSchema.index({ userId: 1 });

export interface ILoyaltyTransaction extends Document {
  userId: mongoose.Types.ObjectId;
  orderId?: mongoose.Types.ObjectId;
  type: 'earn' | 'redeem' | 'adjust';
  points: number; // positive for earn, negative for redeem/adjust down
  note?: string;
  createdAt: Date;
}

const loyaltyTransactionSchema = new Schema<ILoyaltyTransaction>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
  type: { type: String, enum: ['earn', 'redeem', 'adjust'], required: true },
  points: { type: Number, required: true },
  note: { type: String, trim: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

loyaltyTransactionSchema.index({ userId: 1, createdAt: -1 });
loyaltyTransactionSchema.index({ orderId: 1 });

// P-Xu Vàng Schema
export interface IPPointAccount extends Document {
  userId: mongoose.Types.ObjectId;
  balance: number; // Số P-Xu hiện tại
  lifetimePoints: number; // Tổng P-Xu đã nhận (không bao gồm đã dùng)
  createdAt: Date;
  updatedAt: Date;
}

const pPointAccountSchema = new Schema<IPPointAccount>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  balance: { type: Number, default: 0, min: 0 },
  lifetimePoints: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

pPointAccountSchema.index({ userId: 1 });

export interface IPPointTransaction extends Document {
  userId: mongoose.Types.ObjectId;
  orderId?: mongoose.Types.ObjectId;
  type: 'earn' | 'redeem' | 'adjust';
  points: number; // Dương khi nhận, âm khi dùng
  description?: string;
  createdAt: Date;
}

const pPointTransactionSchema = new Schema<IPPointTransaction>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
  type: { type: String, enum: ['earn', 'redeem', 'adjust'], required: true },
  points: { type: Number, required: true },
  description: { type: String, trim: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

pPointTransactionSchema.index({ userId: 1, createdAt: -1 });
pPointTransactionSchema.index({ orderId: 1 });

// Exports for new models
export const Promotion = mongoose.model<IPromotion>('Promotion', promotionSchema);
export const PromotionItem = mongoose.model<IPromotionItem>('PromotionItem', promotionItemSchema);
export const LoyaltyAccount = mongoose.model<ILoyaltyAccount>('LoyaltyAccount', loyaltyAccountSchema);
export const LoyaltyTransaction = mongoose.model<ILoyaltyTransaction>('LoyaltyTransaction', loyaltyTransactionSchema);
export const PPointAccount = mongoose.model<IPPointAccount>('PPointAccount', pPointAccountSchema);
export const PPointTransaction = mongoose.model<IPPointTransaction>('PPointTransaction', pPointTransactionSchema);

// Notification Schema
export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  type: 'order' | 'brand' | 'promotion' | 'health' | 'news' | 'system';
  title: string;
  content: string;
  link?: string; // URL to related page
  isRead: boolean;
  metadata?: {
    orderId?: mongoose.Types.ObjectId;
    orderNumber?: string;
    [key: string]: any;
  };
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: ['order', 'brand', 'promotion', 'health', 'news', 'system'],
    required: true,
    index: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  content: {
    type: String,
    required: true,
    trim: true,
  },
  link: {
    type: String,
    trim: true,
  },
  isRead: {
    type: Boolean,
    default: false,
    index: true,
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {},
  },
}, {
  timestamps: true,
});

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index({ userId: 1, type: 1 });

// Search History Schema - Lưu lịch sử tìm kiếm
export interface ISearchHistory extends Document {
  userId?: mongoose.Types.ObjectId; // Optional vì guest cũng có thể tìm kiếm
  keyword: string;
  clickResult?: mongoose.Types.ObjectId; // Product ID nếu user click vào kết quả
  createdAt: Date;
}

const searchHistorySchema = new Schema<ISearchHistory>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: false, // Allow null for guest searches
    index: true,
  },
  keyword: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  clickResult: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: false,
  },
}, {
  timestamps: { createdAt: true, updatedAt: false },
});

// View History Schema - Lưu lịch sử xem sản phẩm
export interface IViewHistory extends Document {
  userId?: mongoose.Types.ObjectId; // Optional vì guest cũng có thể xem
  productId: mongoose.Types.ObjectId;
  viewDuration?: number; // Thời gian xem (seconds) - optional, có thể tính sau
  createdAt: Date;
}

const viewHistorySchema = new Schema<IViewHistory>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: false, // Allow null for guest views
    index: true,
  },
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    index: true,
  },
  viewDuration: {
    type: Number,
    default: 0,
    min: 0,
  },
}, {
  timestamps: { createdAt: true, updatedAt: false },
});

// Indexes for better query performance
searchHistorySchema.index({ userId: 1, createdAt: -1 });
searchHistorySchema.index({ keyword: 1, createdAt: -1 });
viewHistorySchema.index({ userId: 1, createdAt: -1 });
viewHistorySchema.index({ productId: 1, createdAt: -1 });
viewHistorySchema.index({ userId: 1, productId: 1 }); // Composite index for user-product queries

export const Notification = mongoose.model<INotification>('Notification', notificationSchema);
export const SearchHistory = mongoose.model<ISearchHistory>('SearchHistory', searchHistorySchema);
export const ViewHistory = mongoose.model<IViewHistory>('ViewHistory', viewHistorySchema);

