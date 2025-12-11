import { Request, Response } from 'express';
import { InvoiceService, CreateInvoiceData } from '../services/invoiceService.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

export class InvoiceController {
  /**
   * Create new invoice
   * POST /api/invoices
   */
  static async createInvoice(req: Request, res: Response) {
    try {
      const invoiceData: CreateInvoiceData = req.body;

      // Validate required fields
      if (!invoiceData.items || invoiceData.items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Invoice items are required'
        });
      }

      if (!invoiceData.paymentMethod) {
        return res.status(400).json({
          success: false,
          message: 'Payment method is required'
        });
      }

      // For guest checkout, customerId can be null
      if (!invoiceData.customerId && !invoiceData.customerName) {
        return res.status(400).json({
          success: false,
          message: 'Customer information is required'
        });
      }

      // Set pharmacist ID from authenticated user (if available)
      const authReq = req as AuthenticatedRequest;
      if (authReq.user && authReq.user.role === 'pharmacist') {
        invoiceData.pharmacistId = authReq.user.id;
      } else {
        // For guest checkout, set a default pharmacist or null
        invoiceData.pharmacistId = null;
      }

      const invoice = await InvoiceService.createInvoice(invoiceData);

      return res.status(201).json({
        success: true,
        data: invoice,
        message: 'Invoice created successfully'
      });
    } catch (error) {
      console.error('Create invoice error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Get invoice by ID
   * GET /api/invoices/:id
   */
  static async getInvoiceById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Invoice ID is required'
        });
      }
      
      const invoice = await InvoiceService.getInvoiceById(id);

      return res.json({
        success: true,
        data: invoice,
        message: 'Invoice retrieved successfully'
      });
    } catch (error) {
      console.error('Get invoice by ID error:', error);
      return res.status(404).json({
        success: false,
        message: error instanceof Error ? error.message : 'Invoice not found'
      });
    }
  }

  /**
   * Get invoice by invoice number
   * GET /api/invoices/number/:invoiceNumber
   */
  static async getInvoiceByNumber(req: Request, res: Response) {
    try {
      const { invoiceNumber } = req.params;
      
      if (!invoiceNumber) {
        return res.status(400).json({
          success: false,
          message: 'Invoice number is required'
        });
      }
      
      const invoice = await InvoiceService.getInvoiceByNumber(invoiceNumber);

      return res.json({
        success: true,
        data: invoice,
        message: 'Invoice retrieved successfully'
      });
    } catch (error) {
      console.error('Get invoice by number error:', error);
      return res.status(404).json({
        success: false,
        message: error instanceof Error ? error.message : 'Invoice not found'
      });
    }
  }

  /**
   * Track invoice by invoice number (for order tracking)
   * GET /api/invoices/track/:invoiceNumber
   */
  static async trackInvoice(req: Request, res: Response) {
    try {
      const { invoiceNumber } = req.params;
      
      if (!invoiceNumber) {
        return res.status(400).json({
          success: false,
          message: 'Invoice number is required'
        });
      }
      
      const invoice = await InvoiceService.getInvoiceByNumber(invoiceNumber);
      
      // Add tracking history based on invoice status
      const trackingHistory = InvoiceService.generateTrackingHistory(invoice);

      // Format the response for tracking page
      const trackingData = {
        _id: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        createdAt: invoice.createdAt,
        updatedAt: invoice.updatedAt,
        totalAmount: invoice.totalAmount,
        items: invoice.items.map((item: any) => ({
          product: {
            name: item.productName || 'Unknown Product',
            imageUrl: item.productImageUrl || '/placeholder-product.jpg'
          },
          quantity: item.quantity,
          price: item.unitPrice?.toString() || '0'
        })),
        deliveryInfo: {
          receiverName: invoice.shippingAddress?.name || invoice.customerName || 'N/A',
          receiverPhone: invoice.shippingAddress?.phone || invoice.customerPhone || 'N/A',
          address: invoice.shippingAddress?.address || invoice.customerAddress || 'N/A',
          province: invoice.shippingAddress?.province || 'N/A',
          district: invoice.shippingAddress?.district || 'N/A',
          ward: invoice.shippingAddress?.ward || 'N/A'
        },
        trackingHistory
      };

      return res.json({
        success: true,
        data: trackingData,
        message: 'Invoice tracking data retrieved successfully'
      });
    } catch (error) {
      console.error('Track invoice error:', error);
      return res.status(404).json({
        success: false,
        message: error instanceof Error ? error.message : 'Invoice not found'
      });
    }
  }

  /**
   * Get all invoices with filters
   * GET /api/invoices
   */
  static async getInvoices(req: Request, res: Response) {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        paymentStatus,
        customerId,
        startDate,
        endDate,
        search,
      } = req.query;

      const filters: any = {
        page: Number(page),
        limit: Number(limit),
      };

      if (status) filters.status = status;
      if (paymentStatus) filters.paymentStatus = paymentStatus;
      if (customerId) filters.customerId = customerId;
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);
      if (search) filters.search = search;

      const result = await InvoiceService.getInvoices(filters);

      return res.json({
        success: true,
        data: result,
        message: 'Invoices retrieved successfully'
      });
    } catch (error) {
      console.error('Get invoices error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Update invoice status
   * PUT /api/invoices/:id/status
   */
  static async updateInvoiceStatus(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const { status, paymentStatus } = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Invoice ID is required'
        });
      }

      if (!status) {
        return res.status(400).json({
          success: false,
          message: 'Status is required'
        });
      }

      const validStatuses = ['draft', 'confirmed', 'completed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status'
        });
      }

      const invoice = await InvoiceService.updateInvoiceStatus(id, status, paymentStatus);

      return res.json({
        success: true,
        data: invoice,
        message: 'Invoice status updated successfully'
      });
    } catch (error) {
      console.error('Update invoice status error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Cancel invoice
   * PUT /api/invoices/:id/cancel
   */
  static async cancelInvoice(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Invoice ID is required'
        });
      }
      
      const invoice = await InvoiceService.cancelInvoice(id);

      return res.json({
        success: true,
        data: invoice,
        message: 'Invoice cancelled successfully'
      });
    } catch (error) {
      console.error('Cancel invoice error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Get invoice statistics
   * GET /api/invoices/stats?period=today
   */
  static async getInvoiceStats(req: Request, res: Response) {
    try {
      const { period = 'today' } = req.query;
      const validPeriods = ['today', 'week', 'month', 'year'];
      
      if (!validPeriods.includes(period as string)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid period. Must be one of: today, week, month, year'
        });
      }

      const stats = await InvoiceService.getInvoiceStats(period as any);

      return res.json({
        success: true,
        data: stats,
        message: 'Invoice statistics retrieved successfully'
      });
    } catch (error) {
      console.error('Get invoice stats error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Calculate invoice totals (preview)
   * POST /api/invoices/calculate
   */
  static async calculateInvoice(req: Request, res: Response) {
    try {
      const invoiceData: CreateInvoiceData = req.body;

      if (!invoiceData.items || invoiceData.items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Invoice items are required'
        });
      }

      const calculation = await InvoiceService.calculateInvoiceTotals(invoiceData);

      return res.json({
        success: true,
        data: calculation,
        message: 'Invoice calculation completed successfully'
      });
    } catch (error) {
      console.error('Calculate invoice error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Get customer invoices
   * GET /api/invoices/customer/:customerId
   */
  static async getCustomerInvoices(req: Request, res: Response) {
    try {
      const { customerId } = req.params;
      const { page = 1, limit = 20 } = req.query;

      if (!customerId) {
        return res.status(400).json({
          success: false,
          message: 'Customer ID is required'
        });
      }

      const filters = {
        page: Number(page),
        limit: Number(limit),
        customerId: customerId,
      };

      const result = await InvoiceService.getInvoices(filters);

      return res.json({
        success: true,
        data: result,
        message: 'Customer invoices retrieved successfully'
      });
    } catch (error) {
      console.error('Get customer invoices error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}
