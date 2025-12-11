import { Product } from '../models/schema.js';

export interface ExpirationAlert {
  productId: string;
  productName: string;
  expirationDate: Date;
  daysUntilExpiration: number;
  batchNumber?: string | undefined;
  stockQuantity: number;
  alertLevel: 'warning' | 'critical' | 'expired';
}

export class ExpirationService {
  /**
   * Get products that are expiring soon or have expired
   * @param daysThreshold Number of days to check ahead (default: 30)
   * @returns Array of expiration alerts
   */
  static async getExpirationAlerts(daysThreshold: number = 30): Promise<ExpirationAlert[]> {
    try {
      const today = new Date();
      const thresholdDate = new Date();
      thresholdDate.setDate(today.getDate() + daysThreshold);

      // Find products with expiration dates within the threshold
      const products = await Product.find({
        expirationDate: { $exists: true, $lte: thresholdDate },
        stockQuantity: { $gt: 0 }, // Only products with stock
        inStock: true
      }).select('name expirationDate batchNumber stockQuantity');

      const alerts: ExpirationAlert[] = [];

      for (const product of products) {
        if (!product.expirationDate) continue;

        const daysUntilExpiration = Math.ceil(
          (product.expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );

        let alertLevel: 'warning' | 'critical' | 'expired';
        
        if (daysUntilExpiration < 0) {
          alertLevel = 'expired';
        } else if (daysUntilExpiration <= 7) {
          alertLevel = 'critical';
        } else {
          alertLevel = 'warning';
        }

        alerts.push({
          productId: String(product._id),
          productName: product.name,
          expirationDate: product.expirationDate,
          daysUntilExpiration,
          batchNumber: product.batchNumber || undefined,
          stockQuantity: product.stockQuantity,
          alertLevel
        });
      }

      // Sort by urgency (expired first, then by days until expiration)
      return alerts.sort((a, b) => {
        if (a.alertLevel === 'expired' && b.alertLevel !== 'expired') return -1;
        if (b.alertLevel === 'expired' && a.alertLevel !== 'expired') return 1;
        return a.daysUntilExpiration - b.daysUntilExpiration;
      });

    } catch (error) {
      console.error('Error getting expiration alerts:', error);
      throw new Error('Failed to get expiration alerts');
    }
  }

  /**
   * Get products that have expired
   */
  static async getExpiredProducts(): Promise<ExpirationAlert[]> {
    try {
      const today = new Date();
      const products = await Product.find({
        expirationDate: { $exists: true, $lt: today },
        stockQuantity: { $gt: 0 },
        inStock: true
      }).select('name expirationDate batchNumber stockQuantity');

      return products.map(product => ({
        productId: String(product._id),
        productName: product.name,
        expirationDate: product.expirationDate!,
        daysUntilExpiration: Math.ceil(
          (product.expirationDate!.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        ),
        batchNumber: product.batchNumber || undefined,
        stockQuantity: product.stockQuantity,
        alertLevel: 'expired' as const
      }));

    } catch (error) {
      console.error('Error getting expired products:', error);
      throw new Error('Failed to get expired products');
    }
  }

  /**
   * Get products expiring within specified days
   */
  static async getProductsExpiringSoon(days: number = 7): Promise<ExpirationAlert[]> {
    try {
      const today = new Date();
      const futureDate = new Date();
      futureDate.setDate(today.getDate() + days);

      const products = await Product.find({
        expirationDate: { 
          $exists: true, 
          $gte: today, 
          $lte: futureDate 
        },
        stockQuantity: { $gt: 0 },
        inStock: true
      }).select('name expirationDate batchNumber stockQuantity');

      return products.map(product => ({
        productId: String(product._id),
        productName: product.name,
        expirationDate: product.expirationDate!,
        daysUntilExpiration: Math.ceil(
          (product.expirationDate!.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        ),
        batchNumber: product.batchNumber || undefined,
        stockQuantity: product.stockQuantity,
        alertLevel: days <= 7 ? 'critical' as const : 'warning' as const
      }));

    } catch (error) {
      console.error('Error getting products expiring soon:', error);
      throw new Error('Failed to get products expiring soon');
    }
  }

  /**
   * Update product expiration date
   */
  static async updateExpirationDate(
    productId: string, 
    expirationDate: Date, 
    batchNumber?: string
  ): Promise<boolean> {
    try {
      const updateData: any = { expirationDate };
      if (batchNumber) {
        updateData.batchNumber = batchNumber;
      }

      const result = await Product.findByIdAndUpdate(
        productId,
        updateData,
        { new: true }
      );

      return !!result;
    } catch (error) {
      console.error('Error updating expiration date:', error);
      throw new Error('Failed to update expiration date');
    }
  }

  /**
   * Get expiration statistics
   */
  static async getExpirationStats(): Promise<{
    totalProducts: number;
    productsWithExpiration: number;
    expiredProducts: number;
    expiringSoon: number;
    expiringThisMonth: number;
  }> {
    try {
      const today = new Date();
      const oneWeekFromNow = new Date();
      oneWeekFromNow.setDate(today.getDate() + 7);
      const oneMonthFromNow = new Date();
      oneMonthFromNow.setMonth(today.getMonth() + 1);

      const [
        totalProducts,
        productsWithExpiration,
        expiredProducts,
        expiringSoon,
        expiringThisMonth
      ] = await Promise.all([
        Product.countDocuments({ inStock: true, stockQuantity: { $gt: 0 } }),
        Product.countDocuments({ 
          expirationDate: { $exists: true },
          inStock: true,
          stockQuantity: { $gt: 0 }
        }),
        Product.countDocuments({
          expirationDate: { $exists: true, $lt: today },
          inStock: true,
          stockQuantity: { $gt: 0 }
        }),
        Product.countDocuments({
          expirationDate: { 
            $exists: true, 
            $gte: today, 
            $lte: oneWeekFromNow 
          },
          inStock: true,
          stockQuantity: { $gt: 0 }
        }),
        Product.countDocuments({
          expirationDate: { 
            $exists: true, 
            $gte: today, 
            $lte: oneMonthFromNow 
          },
          inStock: true,
          stockQuantity: { $gt: 0 }
        })
      ]);

      return {
        totalProducts,
        productsWithExpiration,
        expiredProducts,
        expiringSoon,
        expiringThisMonth
      };
    } catch (error) {
      console.error('Error getting expiration stats:', error);
      throw new Error('Failed to get expiration statistics');
    }
  }
}
