import { Request, Response } from 'express';
import { PrintService, PrintOptions } from '../services/printService.js';
import { InvoiceService } from '../services/invoiceService.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

export class PrintController {
  /**
   * Print invoice as HTML
   * GET /api/print/invoice/:id/html
   */
  static async printInvoiceHTML(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { includeLogo = 'true', includeQRCode = 'false', language = 'vi' } = req.query;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Invoice ID is required'
        });
      }

      const invoice = await InvoiceService.getInvoiceById(id);
      
      const options: PrintOptions = {
        format: 'html',
        includeLogo: includeLogo === 'true',
        includeQRCode: includeQRCode === 'true',
        language: language as 'vi' | 'en'
      };

      const result = await PrintService.printInvoice(invoice, options);

      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: result.error
        });
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `inline; filename="${result.filename}"`);
      return res.send(result.data);
    } catch (error) {
      console.error('Print invoice HTML error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Print invoice as thermal format
   * GET /api/print/invoice/:id/thermal
   */
  static async printInvoiceThermal(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Invoice ID is required'
        });
      }
      
      const invoice = await InvoiceService.getInvoiceById(id);
      
      const options: PrintOptions = {
        format: 'thermal'
      };

      const result = await PrintService.printInvoice(invoice, options);

      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: result.error
        });
      }

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      return res.send(result.data);
    } catch (error) {
      console.error('Print invoice thermal error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Print invoice as PDF
   * GET /api/print/invoice/:id/pdf
   */
  static async printInvoicePDF(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { includeLogo = 'true', includeQRCode = 'false', language = 'vi' } = req.query;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Invoice ID is required'
        });
      }

      const invoice = await InvoiceService.getInvoiceById(id);
      
      const options: PrintOptions = {
        format: 'pdf',
        includeLogo: includeLogo === 'true',
        includeQRCode: includeQRCode === 'true',
        language: language as 'vi' | 'en',
        paperSize: 'A4'
      };

      const result = await PrintService.printInvoice(invoice, options);

      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: result.error
        });
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      return res.send(result.data);
    } catch (error) {
      console.error('Print invoice PDF error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Print invoice by invoice number
   * GET /api/print/invoice/number/:invoiceNumber/html
   */
  static async printInvoiceByNumberHTML(req: Request, res: Response) {
    try {
      const { invoiceNumber } = req.params;
      const { includeLogo = 'true', includeQRCode = 'false', language = 'vi' } = req.query;

      if (!invoiceNumber) {
        return res.status(400).json({
          success: false,
          message: 'Invoice number is required'
        });
      }

      const invoice = await InvoiceService.getInvoiceByNumber(invoiceNumber);
      
      const options: PrintOptions = {
        format: 'html',
        includeLogo: includeLogo === 'true',
        includeQRCode: includeQRCode === 'true',
        language: language as 'vi' | 'en'
      };

      const result = await PrintService.printInvoice(invoice, options);

      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: result.error
        });
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `inline; filename="${result.filename}"`);
      return res.send(result.data);
    } catch (error) {
      console.error('Print invoice by number HTML error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Print receipt (thermal format) for POS
   * GET /api/print/receipt/:id
   */
  static async printReceipt(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Invoice ID is required'
        });
      }
      
      const invoice = await InvoiceService.getInvoiceById(id);
      
      const options: PrintOptions = {
        format: 'thermal',
        paperSize: 'thermal-80mm'
      };

      const result = await PrintService.printInvoice(invoice, options);

      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: result.error
        });
      }

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `inline; filename="receipt-${invoice.invoiceNumber}.txt"`);
      return res.send(result.data);
    } catch (error) {
      console.error('Print receipt error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Preview invoice (HTML format)
   * GET /api/print/preview/:id
   */
  static async previewInvoice(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { includeLogo = 'true', includeQRCode = 'false', language = 'vi' } = req.query;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Invoice ID is required'
        });
      }

      const invoice = await InvoiceService.getInvoiceById(id);
      
      const options: PrintOptions = {
        format: 'html',
        includeLogo: includeLogo === 'true',
        includeQRCode: includeQRCode === 'true',
        language: language as 'vi' | 'en'
      };

      const result = await PrintService.printInvoice(invoice, options);

      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: result.error
        });
      }

      // Return HTML for preview
      return res.json({
        success: true,
        data: {
          html: result.data,
          invoice: {
            id: invoice._id,
            invoiceNumber: invoice.invoiceNumber,
            totalAmount: invoice.totalAmount,
            status: invoice.status,
            paymentStatus: invoice.paymentStatus
          }
        },
        message: 'Invoice preview generated successfully'
      });
    } catch (error) {
      console.error('Preview invoice error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Get print options
   * GET /api/print/options
   */
  static async getPrintOptions(req: Request, res: Response) {
    try {
      const options = {
        formats: [
          { value: 'html', label: 'HTML (Web View)' },
          { value: 'thermal', label: 'Thermal (POS Printer)' },
          { value: 'pdf', label: 'PDF (Download)' }
        ],
        paperSizes: [
          { value: 'A4', label: 'A4' },
          { value: 'A5', label: 'A5' },
          { value: 'thermal-80mm', label: 'Thermal 80mm' }
        ],
        languages: [
          { value: 'vi', label: 'Tiếng Việt' },
          { value: 'en', label: 'English' }
        ],
        features: [
          { value: 'includeLogo', label: 'Include Logo' },
          { value: 'includeQRCode', label: 'Include QR Code' }
        ]
      };

      return res.json({
        success: true,
        data: options,
        message: 'Print options retrieved successfully'
      });
    } catch (error) {
      console.error('Get print options error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}
