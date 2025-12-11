import { IInvoice } from '../models/schema.js';

export interface PrintOptions {
  format: 'pdf' | 'thermal' | 'html';
  includeLogo?: boolean;
  includeQRCode?: boolean;
  paperSize?: 'A4' | 'A5' | 'thermal-80mm';
  language?: 'vi' | 'en';
}

export interface PrintResult {
  success: boolean;
  data?: string | Buffer;
  filename?: string;
  error?: string;
}

export class PrintService {
  /**
   * Generate invoice HTML template
   */
  static generateInvoiceHTML(invoice: any, options: PrintOptions = { format: 'html' }): string {
    const {
      includeLogo = true,
      includeQRCode = false,
      language = 'vi'
    } = options;

    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND'
      }).format(amount);
    };

    const formatDate = (date: Date) => {
      return new Intl.DateTimeFormat('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(date));
    };

    const html = `
<!DOCTYPE html>
<html lang="${language}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hóa đơn ${invoice.invoiceNumber}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Arial', sans-serif;
            font-size: 12px;
            line-height: 1.4;
            color: #333;
            background: white;
        }
        
        .invoice-container {
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #007bff;
            padding-bottom: 20px;
        }
        
        .logo {
            font-size: 24px;
            font-weight: bold;
            color: #007bff;
            margin-bottom: 10px;
        }
        
        .pharmacy-info {
            font-size: 14px;
            color: #666;
        }
        
        .invoice-title {
            font-size: 20px;
            font-weight: bold;
            text-align: center;
            margin: 20px 0;
            color: #007bff;
        }
        
        .invoice-details {
            display: flex;
            justify-content: space-between;
            margin-bottom: 30px;
        }
        
        .invoice-info, .customer-info {
            flex: 1;
        }
        
        .info-section h3 {
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 10px;
            color: #007bff;
            border-bottom: 1px solid #eee;
            padding-bottom: 5px;
        }
        
        .info-row {
            display: flex;
            margin-bottom: 5px;
        }
        
        .info-label {
            font-weight: bold;
            min-width: 120px;
        }
        
        .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
        }
        
        .items-table th,
        .items-table td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
        }
        
        .items-table th {
            background-color: #f8f9fa;
            font-weight: bold;
            text-align: center;
        }
        
        .items-table .text-center {
            text-align: center;
        }
        
        .items-table .text-right {
            text-align: right;
        }
        
        .totals-section {
            margin-top: 20px;
        }
        
        .totals-table {
            width: 100%;
            border-collapse: collapse;
        }
        
        .totals-table td {
            padding: 5px 10px;
            border: none;
        }
        
        .totals-table .label {
            font-weight: bold;
            text-align: right;
            width: 60%;
        }
        
        .totals-table .amount {
            text-align: right;
            width: 40%;
        }
        
        .total-row {
            font-weight: bold;
            font-size: 14px;
            border-top: 2px solid #007bff;
            background-color: #f8f9fa;
        }
        
        .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 11px;
            color: #666;
            border-top: 1px solid #eee;
            padding-top: 20px;
        }
        
        .payment-info {
            margin: 20px 0;
            padding: 15px;
            background-color: #f8f9fa;
            border-radius: 5px;
        }
        
        .status-badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: bold;
            text-transform: uppercase;
        }
        
        .status-draft { background-color: #6c757d; color: white; }
        .status-confirmed { background-color: #17a2b8; color: white; }
        .status-completed { background-color: #28a745; color: white; }
        .status-cancelled { background-color: #dc3545; color: white; }
        
        .payment-pending { background-color: #ffc107; color: black; }
        .payment-paid { background-color: #28a745; color: white; }
        .payment-partial { background-color: #17a2b8; color: white; }
        .payment-refunded { background-color: #dc3545; color: white; }
        
        @media print {
            body { margin: 0; }
            .invoice-container { padding: 0; }
        }
    </style>
</head>
<body>
    <div class="invoice-container">
        <!-- Header -->
        <div class="header">
            ${includeLogo ? '<div class="logo">🏥 NHÀ THUỐC THÔNG MINH</div>' : ''}
            <div class="pharmacy-info">
                <div><strong>Địa chỉ:</strong> 123 Đường ABC, Quận XYZ, TP.HCM</div>
                <div><strong>Điện thoại:</strong> (028) 1234-5678 | <strong>Email:</strong> info@nhathuoc.com</div>
                <div><strong>MST:</strong> 0123456789</div>
            </div>
        </div>
        
        <!-- Invoice Title -->
        <div class="invoice-title">HÓA ĐƠN BÁN HÀNG</div>
        
        <!-- Invoice Details -->
        <div class="invoice-details">
            <div class="invoice-info">
                <div class="info-section">
                    <h3>Thông tin hóa đơn</h3>
                    <div class="info-row">
                        <span class="info-label">Số hóa đơn:</span>
                        <span>${invoice.invoiceNumber}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Ngày tạo:</span>
                        <span>${formatDate(invoice.createdAt)}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Trạng thái:</span>
                        <span class="status-badge status-${invoice.status}">${invoice.status}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Thanh toán:</span>
                        <span class="status-badge payment-${invoice.paymentStatus}">${invoice.paymentStatus}</span>
                    </div>
                </div>
            </div>
            
            <div class="customer-info">
                <div class="info-section">
                    <h3>Thông tin khách hàng</h3>
                    ${invoice.customerName ? `
                    <div class="info-row">
                        <span class="info-label">Tên:</span>
                        <span>${invoice.customerName}</span>
                    </div>
                    ` : ''}
                    ${invoice.customerPhone ? `
                    <div class="info-row">
                        <span class="info-label">Điện thoại:</span>
                        <span>${invoice.customerPhone}</span>
                    </div>
                    ` : ''}
                    ${invoice.customerAddress ? `
                    <div class="info-row">
                        <span class="info-label">Địa chỉ:</span>
                        <span>${invoice.customerAddress}</span>
                    </div>
                    ` : ''}
                    ${invoice.customerEmail ? `
                    <div class="info-row">
                        <span class="info-label">Email:</span>
                        <span>${invoice.customerEmail}</span>
                    </div>
                    ` : ''}
                </div>
            </div>
        </div>
        
        <!-- Items Table -->
        <table class="items-table">
            <thead>
                <tr>
                    <th>STT</th>
                    <th>Tên sản phẩm</th>
                    <th class="text-center">Số lượng</th>
                    <th class="text-right">Đơn giá</th>
                    <th class="text-right">Giảm giá</th>
                    <th class="text-right">Thành tiền</th>
                </tr>
            </thead>
            <tbody>
                ${invoice.items.map((item: any, index: number) => `
                <tr>
                    <td class="text-center">${index + 1}</td>
                    <td>
                        <div><strong>${item.productName}</strong></div>
                        ${item.batchNumber ? `<div style="font-size: 10px; color: #666;">Lô: ${item.batchNumber}</div>` : ''}
                        ${item.expirationDate ? `<div style="font-size: 10px; color: #666;">HSD: ${formatDate(item.expirationDate)}</div>` : ''}
                    </td>
                    <td class="text-center">${item.quantity}</td>
                    <td class="text-right">${formatCurrency(item.unitPrice)}</td>
                    <td class="text-right">${item.discountAmount > 0 ? formatCurrency(item.discountAmount) : '-'}</td>
                    <td class="text-right"><strong>${formatCurrency(item.totalPrice)}</strong></td>
                </tr>
                `).join('')}
            </tbody>
        </table>
        
        <!-- Totals -->
        <div class="totals-section">
            <table class="totals-table">
                <tr>
                    <td class="label">Tạm tính:</td>
                    <td class="amount">${formatCurrency(invoice.subtotal)}</td>
                </tr>
                ${invoice.discountAmount > 0 ? `
                <tr>
                    <td class="label">Giảm giá (${invoice.discountPercentage}%):</td>
                    <td class="amount">-${formatCurrency(invoice.discountAmount)}</td>
                </tr>
                ` : ''}
                <tr>
                    <td class="label">Thuế VAT (${invoice.taxPercentage}%):</td>
                    <td class="amount">${formatCurrency(invoice.taxAmount)}</td>
                </tr>
                <tr class="total-row">
                    <td class="label">TỔNG CỘNG:</td>
                    <td class="amount">${formatCurrency(invoice.totalAmount)}</td>
                </tr>
            </table>
        </div>
        
        <!-- Payment Info -->
        <div class="payment-info">
            <div class="info-row">
                <span class="info-label">Phương thức thanh toán:</span>
                <span><strong>${this.getPaymentMethodText(invoice.paymentMethod)}</strong></span>
            </div>
            ${invoice.pharmacistId ? `
            <div class="info-row">
                <span class="info-label">Dược sĩ:</span>
                <span>${invoice.pharmacistId.firstName} ${invoice.pharmacistId.lastName}</span>
            </div>
            ` : ''}
        </div>
        
        ${invoice.notes ? `
        <div class="payment-info">
            <div class="info-row">
                <span class="info-label">Ghi chú:</span>
                <span>${invoice.notes}</span>
            </div>
        </div>
        ` : ''}
        
        <!-- Footer -->
        <div class="footer">
            <p><strong>Cảm ơn quý khách đã sử dụng dịch vụ!</strong></p>
            <p>Hóa đơn này được tạo tự động bởi hệ thống quản lý nhà thuốc</p>
            ${includeQRCode ? '<p>Quét mã QR để xem chi tiết hóa đơn</p>' : ''}
        </div>
    </div>
</body>
</html>`;

    return html;
  }

  /**
   * Get payment method text in Vietnamese
   */
  private static getPaymentMethodText(method: string): string {
    const methods: Record<string, string> = {
      'cash': 'Tiền mặt',
      'card': 'Thẻ',
      'bank_transfer': 'Chuyển khoản',
      'momo': 'MoMo',
      'zalopay': 'ZaloPay'
    };
    return methods[method] || method;
  }

  /**
   * Generate thermal printer format (simple text)
   */
  static generateThermalFormat(invoice: any): string {
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND'
      }).format(amount);
    };

    const formatDate = (date: Date) => {
      return new Intl.DateTimeFormat('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(date));
    };

    let receipt = '';
    
    // Header
    receipt += '='.repeat(32) + '\n';
    receipt += '    NHÀ THUỐC THÔNG MINH\n';
    receipt += '='.repeat(32) + '\n';
    receipt += 'Địa chỉ: 123 Đường ABC, Q.XYZ\n';
    receipt += 'Điện thoại: (028) 1234-5678\n';
    receipt += 'MST: 0123456789\n';
    receipt += '-'.repeat(32) + '\n';
    
    // Invoice info
    receipt += `HÓA ĐƠN: ${invoice.invoiceNumber}\n`;
    receipt += `Ngày: ${formatDate(invoice.createdAt)}\n`;
    receipt += `Trạng thái: ${invoice.status.toUpperCase()}\n`;
    receipt += `Thanh toán: ${invoice.paymentStatus.toUpperCase()}\n`;
    receipt += '-'.repeat(32) + '\n';
    
    // Customer info
    if (invoice.customerName) {
      receipt += `Khách hàng: ${invoice.customerName}\n`;
    }
    if (invoice.customerPhone) {
      receipt += `Điện thoại: ${invoice.customerPhone}\n`;
    }
    receipt += '-'.repeat(32) + '\n';
    
    // Items
    receipt += 'SẢN PHẨM\n';
    receipt += '-'.repeat(32) + '\n';
    
    invoice.items.forEach((item: any, index: number) => {
      receipt += `${index + 1}. ${item.productName}\n`;
      receipt += `   SL: ${item.quantity} x ${formatCurrency(item.unitPrice)}\n`;
      if (item.discountAmount > 0) {
        receipt += `   Giảm: -${formatCurrency(item.discountAmount)}\n`;
      }
      receipt += `   = ${formatCurrency(item.totalPrice)}\n`;
      if (item.batchNumber) {
        receipt += `   Lô: ${item.batchNumber}\n`;
      }
      receipt += '\n';
    });
    
    receipt += '-'.repeat(32) + '\n';
    
    // Totals
    receipt += `Tạm tính: ${formatCurrency(invoice.subtotal)}\n`;
    if (invoice.discountAmount > 0) {
      receipt += `Giảm giá: -${formatCurrency(invoice.discountAmount)}\n`;
    }
    receipt += `Thuế VAT: ${formatCurrency(invoice.taxAmount)}\n`;
    receipt += '='.repeat(32) + '\n';
    receipt += `TỔNG CỘNG: ${formatCurrency(invoice.totalAmount)}\n`;
    receipt += '='.repeat(32) + '\n';
    
    // Payment method
    receipt += `Thanh toán: ${this.getPaymentMethodText(invoice.paymentMethod)}\n`;
    if (invoice.pharmacistId) {
      receipt += `Dược sĩ: ${invoice.pharmacistId.firstName} ${invoice.pharmacistId.lastName}\n`;
    }
    
    receipt += '\n';
    receipt += 'Cảm ơn quý khách!\n';
    receipt += '='.repeat(32) + '\n';
    
    return receipt;
  }

  /**
   * Generate PDF (placeholder - would need puppeteer or similar)
   */
  static async generatePDF(invoice: any, options: PrintOptions = { format: 'pdf' }): Promise<PrintResult> {
    try {
      // This is a placeholder implementation
      // In a real implementation, you would use puppeteer or similar to convert HTML to PDF
      const html = this.generateInvoiceHTML(invoice, { ...options, format: 'html' });
      
      return {
        success: true,
        data: html, // In real implementation, this would be PDF buffer
        filename: `invoice-${invoice.invoiceNumber}.pdf`
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'PDF generation failed'
      };
    }
  }

  /**
   * Print invoice in different formats
   */
  static async printInvoice(invoice: any, options: PrintOptions = { format: 'html' }): Promise<PrintResult> {
    try {
      switch (options.format) {
        case 'html':
          return {
            success: true,
            data: this.generateInvoiceHTML(invoice, options),
            filename: `invoice-${invoice.invoiceNumber}.html`
          };
          
        case 'thermal':
          return {
            success: true,
            data: this.generateThermalFormat(invoice),
            filename: `receipt-${invoice.invoiceNumber}.txt`
          };
          
        case 'pdf':
          return await this.generatePDF(invoice, options);
          
        default:
          return {
            success: false,
            error: 'Unsupported format'
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Print generation failed'
      };
    }
  }
}
