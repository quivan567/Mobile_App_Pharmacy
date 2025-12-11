import { Response } from 'express';
import { PPointAccount, PPointTransaction } from '../models/schema';
import { AuthenticatedRequest } from '../middleware/auth';

// Constants
export const VND_PER_P_POINT = 5000; // 5,000 VND = 1 P-Xu (khi nhận)
export const P_POINT_VALUE_VND = 100; // 1 P-Xu = 100 VND (khi dùng)

export class PPointController {
  // Get user's P-Xu account balance
  static async getAccount(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!.id;
      let account = await PPointAccount.findOne({ userId });
      
      if (!account) {
        account = await PPointAccount.create({ 
          userId, 
          balance: 0, 
          lifetimePoints: 0 
        });
      }
      
      res.json({ 
        success: true, 
        data: {
          balance: account.balance,
          lifetimePoints: account.lifetimePoints
        }
      });
    } catch (error) {
      console.error('Get P-Xu account error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Internal server error' 
      });
    }
  }

  // Get user's P-Xu transaction history
  static async getTransactions(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { startDate, endDate, limit = 50, offset = 0 } = req.query;

      const query: any = { userId };

      // Date range filter
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) {
          query.createdAt.$gte = new Date(startDate as string);
        }
        if (endDate) {
          query.createdAt.$lte = new Date(endDate as string);
        }
      }

      const transactions = await PPointTransaction.find(query)
        .populate('orderId', 'orderNumber totalAmount')
        .sort({ createdAt: -1 })
        .limit(Number(limit))
        .skip(Number(offset))
        .lean();

      const total = await PPointTransaction.countDocuments(query);

      res.json({
        success: true,
        data: {
          transactions,
          total,
          limit: Number(limit),
          offset: Number(offset)
        }
      });
    } catch (error) {
      console.error('Get P-Xu transactions error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Earn P-Xu from order (called from order controller)
  static async earnFromOrder(userId: string, orderId: string, orderAmount: number): Promise<number> {
    try {
      // Calculate P-Xu: 5,000 VND = 1 P-Xu
      const pointsEarned = Math.floor(orderAmount / VND_PER_P_POINT);
      
      if (pointsEarned <= 0) {
        return 0;
      }

      // Get or create account
      let account = await PPointAccount.findOne({ userId });
      if (!account) {
        account = await PPointAccount.create({ 
          userId, 
          balance: 0, 
          lifetimePoints: 0 
        });
      }

      // Update balance
      account.balance += pointsEarned;
      account.lifetimePoints += pointsEarned;
      await account.save();

      // Create transaction record
      await PPointTransaction.create({
        userId: userId as any,
        orderId: orderId as any,
        type: 'earn',
        points: pointsEarned,
        description: `Nhận P-Xu từ đơn hàng ${orderAmount.toLocaleString('vi-VN')} ₫`
      });

      return pointsEarned;
    } catch (error) {
      console.error('Earn P-Xu from order error:', error);
      return 0;
    }
  }

  // Redeem P-Xu at checkout (called from order controller)
  static async redeemAtCheckout(userId: string, orderId: string, pointsToRedeem: number): Promise<number> {
    try {
      if (pointsToRedeem <= 0) {
        return 0;
      }

      // Get account
      const account = await PPointAccount.findOne({ userId });
      if (!account || account.balance < pointsToRedeem) {
        return 0; // Not enough balance
      }

      // Update balance
      account.balance -= pointsToRedeem;
      await account.save();

      // Calculate discount amount (1 P-Xu = 100 VND)
      const discountAmount = pointsToRedeem * P_POINT_VALUE_VND;

      // Create transaction record
      await PPointTransaction.create({
        userId: userId as any,
        orderId: orderId as any,
        type: 'redeem',
        points: -pointsToRedeem,
        description: `Sử dụng ${pointsToRedeem} P-Xu để giảm ${discountAmount.toLocaleString('vi-VN')} ₫`
      });

      return discountAmount;
    } catch (error) {
      console.error('Redeem P-Xu error:', error);
      return 0;
    }
  }
}

