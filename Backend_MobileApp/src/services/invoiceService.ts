import { Invoice, Product, User } from '../models/schema.js';
import { IInvoiceItem } from '../models/schema.js';

export interface CreateInvoiceData {
  customerId?: string | null;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerEmail?: string;
  items: {
    productId: string;
    productName?: string;
    quantity: number;
    unitPrice?: number;
    discountAmount?: number;
  }[];
  subtotal?: number;
  discountAmount?: number;
  discountPercentage?: number;
  taxAmount?: number;
  taxPercentage?: number;
  totalAmount?: number;
  paymentMethod: 'cash' | 'card' | 'bank_transfer' | 'momo' | 'zalopay' | 'cod' | 'qr' | 'atm' | 'zalopay' | 'vnpay';
  paymentStatus?: 'pending' | 'paid' | 'partial' | 'refunded';
  status?: 'draft' | 'confirmed' | 'completed' | 'cancelled';
  notes?: string;
  prescriptionId?: string;
  pharmacistId?: string | null;
  shippingAddress?: {
    name: string;
    phone: string;
    province: string;
    district: string;
    ward: string;
    address: string;
  };
}

export interface InvoiceCalculationResult {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  items: IInvoiceItem[];
}

export class InvoiceService {
  /**
   * Generate unique invoice number
   */
  static async generateInvoiceNumber(): Promise<string> {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    
    // Get count of invoices today
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    
    const count = await Invoice.countDocuments({
      createdAt: { $gte: startOfDay, $lt: endOfDay }
    });
    
    const sequence = String(count + 1).padStart(4, '0');
    return `INV-${year}${month}${day}-${sequence}`;
  }

  /**
   * Calculate invoice totals
   */
  static async calculateInvoiceTotals(data: CreateInvoiceData): Promise<InvoiceCalculationResult> {
    const items: IInvoiceItem[] = [];
    let subtotal = 0;

    // Process each item
    for (const itemData of data.items) {
      const product = await Product.findById(itemData.productId);
      if (!product) {
        throw new Error(`Product with ID ${itemData.productId} not found`);
      }

      if (product.stockQuantity < itemData.quantity) {
        throw new Error(`Insufficient stock for product ${product.name}. Available: ${product.stockQuantity}, Requested: ${itemData.quantity}`);
      }

      const unitPrice = itemData.unitPrice || product.price;
      const discountAmount = itemData.discountAmount || 0;
      const totalPrice = (unitPrice * itemData.quantity) - discountAmount;

      const item: IInvoiceItem = {
        productId: product._id as any,
        productName: product.name,
        quantity: itemData.quantity,
        unitPrice,
        discountAmount,
        discountPercentage: 0,
        totalPrice,
        batchNumber: product.batchNumber,
        expirationDate: product.expirationDate,
      };

      items.push(item);
      subtotal += totalPrice;
    }

    // Apply overall discount
    const overallDiscountPercentage = data.discountPercentage || 0;
    const overallDiscountAmount = data.discountAmount || (subtotal * overallDiscountPercentage / 100);
    const discountedSubtotal = subtotal - overallDiscountAmount;

    // Calculate tax
    const taxPercentage = data.taxPercentage || 10; // Default 10% VAT
    const taxAmount = (discountedSubtotal * taxPercentage) / 100;
    const totalAmount = discountedSubtotal + taxAmount;

    return {
      subtotal,
      discountAmount: overallDiscountAmount,
      taxAmount,
      totalAmount,
      items,
    };
  }

  /**
   * Create new invoice
   */
  static async createInvoice(data: CreateInvoiceData): Promise<any> {
    try {
      // Generate invoice number
      const invoiceNumber = await this.generateInvoiceNumber();

      // Calculate totals (use provided values if available, otherwise calculate)
      let calculation;
      if (data.subtotal && data.totalAmount) {
        // Use provided values for guest checkout
        calculation = {
          subtotal: data.subtotal,
          discountAmount: data.discountAmount || 0,
          taxAmount: data.taxAmount || 0,
          totalAmount: data.totalAmount,
          items: data.items.map(item => ({
            productId: item.productId,
            productName: item.productName || '',
            quantity: item.quantity,
            unitPrice: item.unitPrice || 0,
            discountAmount: item.discountAmount || 0,
            totalPrice: (item.unitPrice || 0) * item.quantity - (item.discountAmount || 0),
            batchNumber: '',
            expirationDate: new Date()
          }))
        };
      } else {
        // Calculate for authenticated users
        calculation = await this.calculateInvoiceTotals(data);
      }

      // Create invoice
      const invoice = await Invoice.create({
        invoiceNumber,
        customerId: data.customerId || null,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        customerAddress: data.customerAddress,
        customerEmail: data.customerEmail,
        items: calculation.items,
        subtotal: calculation.subtotal,
        discountAmount: calculation.discountAmount,
        discountPercentage: data.discountPercentage || 0,
        taxAmount: calculation.taxAmount,
        taxPercentage: data.taxPercentage || 10,
        totalAmount: calculation.totalAmount,
        paymentMethod: data.paymentMethod,
        paymentStatus: data.paymentStatus || 'pending',
        status: data.status || 'pending',
        notes: data.notes,
        prescriptionId: data.prescriptionId,
        pharmacistId: data.pharmacistId,
      });

      // Update product stock (only for authenticated users with proper inventory management)
      if (data.pharmacistId) {
        for (const item of calculation.items) {
          await Product.findByIdAndUpdate(
            item.productId,
            { $inc: { stockQuantity: -item.quantity } }
          );
        }
      }

      return invoice;
    } catch (error) {
      console.error('Error creating invoice:', error);
      throw error;
    }
  }

  /**
   * Get invoice by ID
   */
  static async getInvoiceById(invoiceId: string): Promise<any> {
    const invoice = await Invoice.findById(invoiceId)
      .populate('customerId', 'firstName lastName email phone')
      .populate('pharmacistId', 'firstName lastName')
      .populate('prescriptionId')
      .lean();

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    return invoice;
  }

  /**
   * Get invoice by invoice number
   */
  static async getInvoiceByNumber(invoiceNumber: string): Promise<any> {
    const invoice = await Invoice.findOne({ invoiceNumber })
      .populate('customerId', 'firstName lastName email phone')
      .populate('pharmacistId', 'firstName lastName')
      .populate('prescriptionId')
      .lean();

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    return invoice;
  }

  /**
   * Generate tracking history based on invoice status
   */
  static generateTrackingHistory(invoice: any): any[] {
    const history = [];
    const now = new Date();

    // Always add order created
    history.push({
      status: 'pending',
      timestamp: invoice.createdAt,
      description: 'Đơn hàng đã được tạo',
      location: 'Hệ thống'
    });

    // Add status-specific tracking
    switch (invoice.status) {
      case 'confirmed':
        history.push({
          status: 'confirmed',
          timestamp: invoice.updatedAt || invoice.createdAt,
          description: 'Đơn hàng đã được xác nhận',
          location: 'Nhà thuốc'
        });
        break;
      case 'completed':
        history.push({
          status: 'confirmed',
          timestamp: new Date(invoice.createdAt.getTime() + 30 * 60 * 1000), // 30 minutes later
          description: 'Đơn hàng đã được xác nhận',
          location: 'Nhà thuốc'
        });
        history.push({
          status: 'preparing',
          timestamp: new Date(invoice.createdAt.getTime() + 60 * 60 * 1000), // 1 hour later
          description: 'Đơn hàng đang được chuẩn bị',
          location: 'Kho hàng'
        });
        history.push({
          status: 'shipping',
          timestamp: new Date(invoice.createdAt.getTime() + 2 * 60 * 60 * 1000), // 2 hours later
          description: 'Đơn hàng đang được giao',
          location: 'Đang vận chuyển'
        });
        history.push({
          status: 'delivered',
          timestamp: invoice.updatedAt || now,
          description: 'Đơn hàng đã được giao thành công',
          location: invoice.shippingAddress?.address || 'Địa chỉ giao hàng'
        });
        break;
      case 'cancelled':
        history.push({
          status: 'cancelled',
          timestamp: invoice.updatedAt || now,
          description: 'Đơn hàng đã bị hủy',
          location: 'Hệ thống'
        });
        break;
      default:
        // For pending status, add estimated timeline
        history.push({
          status: 'confirmed',
          timestamp: new Date(invoice.createdAt.getTime() + 30 * 60 * 1000),
          description: 'Dự kiến xác nhận trong 30 phút',
          location: 'Nhà thuốc'
        });
    }

    return history.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  /**
   * Get all invoices with pagination and filters
   */
  static async getInvoices(filters: {
    page?: number;
    limit?: number;
    status?: string;
    paymentStatus?: string;
    customerId?: string;
    startDate?: Date;
    endDate?: Date;
    search?: string;
  } = {}): Promise<{
    invoices: any[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  }> {
    const {
      page = 1,
      limit = 20,
      status,
      paymentStatus,
      customerId,
      startDate,
      endDate,
      search,
    } = filters;

    const offset = (page - 1) * limit;
    const conditions: any = {};

    // Apply filters
    if (status) conditions.status = status;
    if (paymentStatus) conditions.paymentStatus = paymentStatus;
    if (customerId) conditions.customerId = customerId;

    // Date range filter
    if (startDate || endDate) {
      conditions.createdAt = {};
      if (startDate) conditions.createdAt.$gte = startDate;
      if (endDate) conditions.createdAt.$lte = endDate;
    }

    // Search filter
    if (search) {
      conditions.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { customerPhone: { $regex: search, $options: 'i' } },
      ];
    }

    const invoices = await Invoice.find(conditions)
      .populate('customerId', 'firstName lastName email phone')
      .populate('pharmacistId', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean();

    const total = await Invoice.countDocuments(conditions);

    return {
      invoices,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update invoice status
   */
  static async updateInvoiceStatus(
    invoiceId: string,
    status: 'draft' | 'confirmed' | 'completed' | 'cancelled',
    paymentStatus?: 'pending' | 'paid' | 'partial' | 'refunded'
  ): Promise<any> {
    const updateData: any = { status };
    if (paymentStatus) updateData.paymentStatus = paymentStatus;

    const invoice = await Invoice.findByIdAndUpdate(
      invoiceId,
      updateData,
      { new: true }
    ).populate('customerId', 'firstName lastName email phone');

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    return invoice;
  }

  /**
   * Cancel invoice and restore stock
   */
  static async cancelInvoice(invoiceId: string): Promise<any> {
    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (invoice.status === 'cancelled') {
      throw new Error('Invoice is already cancelled');
    }

    // Restore product stock
    for (const item of invoice.items) {
      await Product.findByIdAndUpdate(
        item.productId,
        { $inc: { stockQuantity: item.quantity } }
      );
    }

    // Update invoice status
    invoice.status = 'cancelled';
    invoice.paymentStatus = 'refunded';
    await invoice.save();

    return invoice;
  }

  /**
   * Get invoice statistics
   */
  static async getInvoiceStats(period: 'today' | 'week' | 'month' | 'year' = 'today'): Promise<{
    totalInvoices: number;
    totalRevenue: number;
    totalItems: number;
    averageOrderValue: number;
    statusBreakdown: Record<string, number>;
    paymentMethodBreakdown: Record<string, number>;
  }> {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    const invoices = await Invoice.find({
      createdAt: { $gte: startDate },
      status: { $ne: 'cancelled' }
    }).lean();

    const totalInvoices = invoices.length;
    const totalRevenue = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
    const totalItems = invoices.reduce((sum, inv) => 
      sum + inv.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0
    );
    const averageOrderValue = totalInvoices > 0 ? totalRevenue / totalInvoices : 0;

    // Status breakdown
    const statusBreakdown = invoices.reduce((acc, inv) => {
      acc[inv.status] = (acc[inv.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Payment method breakdown
    const paymentMethodBreakdown = invoices.reduce((acc, inv) => {
      acc[inv.paymentMethod] = (acc[inv.paymentMethod] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalInvoices,
      totalRevenue,
      totalItems,
      averageOrderValue,
      statusBreakdown,
      paymentMethodBreakdown,
    };
  }
}
