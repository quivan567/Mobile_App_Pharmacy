import { Request, Response } from 'express';
import { ExpirationService } from '../services/expirationService.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

export class ExpirationController {
  /**
   * Get all expiration alerts
   * GET /api/expiration/alerts?days=30
   */
  static async getExpirationAlerts(req: Request, res: Response) {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const alerts = await ExpirationService.getExpirationAlerts(days);

      res.json({
        success: true,
        data: {
          alerts,
          total: alerts.length,
          expired: alerts.filter(a => a.alertLevel === 'expired').length,
          critical: alerts.filter(a => a.alertLevel === 'critical').length,
          warning: alerts.filter(a => a.alertLevel === 'warning').length,
        },
        message: 'Expiration alerts retrieved successfully'
      });
    } catch (error) {
      console.error('Get expiration alerts error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get expired products
   * GET /api/expiration/expired
   */
  static async getExpiredProducts(req: Request, res: Response) {
    try {
      const expiredProducts = await ExpirationService.getExpiredProducts();

      res.json({
        success: true,
        data: {
          products: expiredProducts,
          total: expiredProducts.length
        },
        message: 'Expired products retrieved successfully'
      });
    } catch (error) {
      console.error('Get expired products error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get products expiring soon
   * GET /api/expiration/expiring-soon?days=7
   */
  static async getProductsExpiringSoon(req: Request, res: Response) {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const products = await ExpirationService.getProductsExpiringSoon(days);

      res.json({
        success: true,
        data: {
          products,
          total: products.length,
          days
        },
        message: 'Products expiring soon retrieved successfully'
      });
    } catch (error) {
      console.error('Get products expiring soon error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Update product expiration date
   * PUT /api/expiration/:productId
   */
  static async updateExpirationDate(req: AuthenticatedRequest, res: Response) {
    try {
      const { productId } = req.params;
      const { expirationDate, batchNumber } = req.body;

      if (!productId) {
        return res.status(400).json({
          success: false,
          message: 'Product ID is required'
        });
      }

      if (!expirationDate) {
        return res.status(400).json({
          success: false,
          message: 'Expiration date is required'
        });
      }

      const date = new Date(expirationDate);
      if (isNaN(date.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid expiration date format'
        });
      }

      const success = await ExpirationService.updateExpirationDate(
        productId,
        date,
        batchNumber
      );

      if (!success) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      return res.json({
        success: true,
        message: 'Expiration date updated successfully'
      });
    } catch (error) {
      console.error('Update expiration date error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get expiration statistics
   * GET /api/expiration/stats
   */
  static async getExpirationStats(req: Request, res: Response) {
    try {
      const stats = await ExpirationService.getExpirationStats();

      res.json({
        success: true,
        data: stats,
        message: 'Expiration statistics retrieved successfully'
      });
    } catch (error) {
      console.error('Get expiration stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}
