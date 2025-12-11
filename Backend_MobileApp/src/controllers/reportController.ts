import { Request, Response } from 'express';
import { ReportService, DateRange } from '../services/reportService.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

export class ReportController {
  /**
   * Get sales report
   * GET /api/reports/sales?startDate=2024-01-01&endDate=2024-12-31
   */
  static async getSalesReport(req: Request, res: Response) {
    try {
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: 'Start date and end date are required'
        });
      }

      const dateRange: DateRange = {
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string)
      };

      // Validate dates
      if (isNaN(dateRange.startDate.getTime()) || isNaN(dateRange.endDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date format'
        });
      }

      if (dateRange.startDate > dateRange.endDate) {
        return res.status(400).json({
          success: false,
          message: 'Start date must be before end date'
        });
      }

      const report = await ReportService.getSalesReport(dateRange);

      res.json({
        success: true,
        data: report,
        message: 'Sales report generated successfully'
      });
    } catch (error) {
      console.error('Get sales report error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get inventory report
   * GET /api/reports/inventory
   */
  static async getInventoryReport(req: Request, res: Response) {
    try {
      const report = await ReportService.getInventoryReport();

      res.json({
        success: true,
        data: report,
        message: 'Inventory report generated successfully'
      });
    } catch (error) {
      console.error('Get inventory report error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get profit/loss report
   * GET /api/reports/profit-loss?startDate=2024-01-01&endDate=2024-12-31
   */
  static async getProfitLossReport(req: Request, res: Response) {
    try {
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: 'Start date and end date are required'
        });
      }

      const dateRange: DateRange = {
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string)
      };

      // Validate dates
      if (isNaN(dateRange.startDate.getTime()) || isNaN(dateRange.endDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date format'
        });
      }

      if (dateRange.startDate > dateRange.endDate) {
        return res.status(400).json({
          success: false,
          message: 'Start date must be before end date'
        });
      }

      const report = await ReportService.getProfitLossReport(dateRange);

      res.json({
        success: true,
        data: report,
        message: 'Profit/Loss report generated successfully'
      });
    } catch (error) {
      console.error('Get profit/loss report error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get dashboard data
   * GET /api/reports/dashboard
   */
  static async getDashboardData(req: Request, res: Response) {
    try {
      const data = await ReportService.getDashboardData();

      res.json({
        success: true,
        data,
        message: 'Dashboard data retrieved successfully'
      });
    } catch (error) {
      console.error('Get dashboard data error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get top selling products
   * GET /api/reports/top-products?limit=10&startDate=2024-01-01&endDate=2024-12-31
   */
  static async getTopProducts(req: Request, res: Response) {
    try {
      const { limit = 10, startDate, endDate } = req.query;

      let dateRange: DateRange | undefined;

      if (startDate && endDate) {
        dateRange = {
          startDate: new Date(startDate as string),
          endDate: new Date(endDate as string)
        };

        // Validate dates
        if (isNaN(dateRange.startDate.getTime()) || isNaN(dateRange.endDate.getTime())) {
          return res.status(400).json({
            success: false,
            message: 'Invalid date format'
          });
        }
      }

      // Use last 30 days if no date range provided
      if (!dateRange) {
        const endDate = new Date();
        const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        dateRange = { startDate, endDate };
      }

      const salesReport = await ReportService.getSalesReport(dateRange);
      const topProducts = salesReport.topProducts.slice(0, Number(limit));

      res.json({
        success: true,
        data: {
          products: topProducts,
          dateRange,
          totalProducts: salesReport.topProducts.length
        },
        message: 'Top products retrieved successfully'
      });
    } catch (error) {
      console.error('Get top products error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get revenue trends
   * GET /api/reports/revenue-trends?period=month&startDate=2024-01-01&endDate=2024-12-31
   */
  static async getRevenueTrends(req: Request, res: Response) {
    try {
      const { period = 'day', startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: 'Start date and end date are required'
        });
      }

      const dateRange: DateRange = {
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string)
      };

      // Validate dates
      if (isNaN(dateRange.startDate.getTime()) || isNaN(dateRange.endDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date format'
        });
      }

      const salesReport = await ReportService.getSalesReport(dateRange);

      let trends;
      if (period === 'month') {
        trends = salesReport.revenueByMonth;
      } else {
        trends = salesReport.revenueByDay;
      }

      res.json({
        success: true,
        data: {
          trends,
          period,
          dateRange,
          totalRevenue: salesReport.totalRevenue,
          totalInvoices: salesReport.totalInvoices
        },
        message: 'Revenue trends retrieved successfully'
      });
    } catch (error) {
      console.error('Get revenue trends error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get category performance
   * GET /api/reports/category-performance?startDate=2024-01-01&endDate=2024-12-31
   */
  static async getCategoryPerformance(req: Request, res: Response) {
    try {
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: 'Start date and end date are required'
        });
      }

      const dateRange: DateRange = {
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string)
      };

      // Validate dates
      if (isNaN(dateRange.startDate.getTime()) || isNaN(dateRange.endDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date format'
        });
      }

      const profitLossReport = await ReportService.getProfitLossReport(dateRange);

      res.json({
        success: true,
        data: {
          categories: profitLossReport.revenueByCategory,
          dateRange,
          totalRevenue: profitLossReport.totalRevenue,
          totalProfit: profitLossReport.grossProfit
        },
        message: 'Category performance retrieved successfully'
      });
    } catch (error) {
      console.error('Get category performance error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get stock movement report
   * GET /api/reports/stock-movements?startDate=2024-01-01&endDate=2024-12-31
   */
  static async getStockMovements(req: Request, res: Response) {
    try {
      const { startDate, endDate } = req.query;

      let dateRange: DateRange | undefined;

      if (startDate && endDate) {
        dateRange = {
          startDate: new Date(startDate as string),
          endDate: new Date(endDate as string)
        };

        // Validate dates
        if (isNaN(dateRange.startDate.getTime()) || isNaN(dateRange.endDate.getTime())) {
          return res.status(400).json({
            success: false,
            message: 'Invalid date format'
          });
        }
      }

      // Use last 30 days if no date range provided
      if (!dateRange) {
        const endDate = new Date();
        const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        dateRange = { startDate, endDate };
      }

      const inventoryReport = await ReportService.getInventoryReport();

      res.json({
        success: true,
        data: {
          stockMovements: inventoryReport.stockMovements,
          topMovingProducts: inventoryReport.topMovingProducts,
          dateRange
        },
        message: 'Stock movements retrieved successfully'
      });
    } catch (error) {
      console.error('Get stock movements error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get low stock report
   * GET /api/reports/low-stock?threshold=10
   */
  static async getLowStockReport(req: Request, res: Response) {
    try {
      const threshold = parseInt(req.query.threshold as string) || 10;

      const inventoryReport = await ReportService.getInventoryReport();

      // Filter products by category for low stock
      const lowStockByCategory = inventoryReport.productsByCategory.map(category => ({
        ...category,
        lowStockProducts: 0 // This would need to be calculated based on actual low stock products
      }));

      res.json({
        success: true,
        data: {
          threshold,
          lowStockProducts: inventoryReport.lowStockProducts,
          outOfStockProducts: inventoryReport.outOfStockProducts,
          lowStockByCategory,
          totalProducts: inventoryReport.totalProducts
        },
        message: 'Low stock report retrieved successfully'
      });
    } catch (error) {
      console.error('Get low stock report error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Export report data
   * GET /api/reports/export?type=sales&format=csv&startDate=2024-01-01&endDate=2024-12-31
   */
  static async exportReport(req: Request, res: Response) {
    try {
      const { type, format = 'json', startDate, endDate } = req.query;

      if (!type) {
        return res.status(400).json({
          success: false,
          message: 'Report type is required'
        });
      }

      let reportData: any;

      switch (type) {
        case 'sales':
          if (!startDate || !endDate) {
            return res.status(400).json({
              success: false,
              message: 'Start date and end date are required for sales report'
            });
          }
          const dateRange: DateRange = {
            startDate: new Date(startDate as string),
            endDate: new Date(endDate as string)
          };
          reportData = await ReportService.getSalesReport(dateRange);
          break;

        case 'inventory':
          reportData = await ReportService.getInventoryReport();
          break;

        case 'profit-loss':
          if (!startDate || !endDate) {
            return res.status(400).json({
              success: false,
              message: 'Start date and end date are required for profit/loss report'
            });
          }
          const plDateRange: DateRange = {
            startDate: new Date(startDate as string),
            endDate: new Date(endDate as string)
          };
          reportData = await ReportService.getProfitLossReport(plDateRange);
          break;

        default:
          return res.status(400).json({
            success: false,
            message: 'Invalid report type'
          });
      }

      if (format === 'csv') {
        // Convert to CSV format (simplified)
        const csvData = this.convertToCSV(reportData);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${type}-report.csv"`);
        res.send(csvData);
      } else {
        res.json({
          success: true,
          data: reportData,
          message: `${type} report exported successfully`
        });
      }
    } catch (error) {
      console.error('Export report error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Convert data to CSV format
   */
  private static convertToCSV(data: any): string {
    // Simplified CSV conversion - in real scenario, you'd use a proper CSV library
    if (data.topProducts && Array.isArray(data.topProducts)) {
      const headers = ['Product Name', 'Category', 'Quantity Sold', 'Revenue', 'Percentage'];
      const rows = data.topProducts.map((product: any) => [
        product.productName,
        product.category,
        product.quantitySold,
        product.revenue,
        product.percentage
      ]);
      
      return [headers, ...rows].map(row => row.join(',')).join('\n');
    }
    
    return JSON.stringify(data, null, 2);
  }
}
