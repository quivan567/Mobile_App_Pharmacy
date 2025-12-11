import { Request, Response } from 'express';
import { Coupon, CouponUsage, Order } from '../models/schema';
import { AuthenticatedRequest } from '../middleware/auth';

export class CouponController {
  // Debug: Inspect a coupon and return diagnostic info
  static async debugCoupon(req: Request, res: Response) {
    try {
      let { code, orderAmount, userId } = req.query as any;
      if (!code) {
        return res.status(400).json({ success: false, message: 'code is required' });
      }
      code = String(code).trim().toUpperCase();
      const amount = Number(orderAmount || 0);

      const coupon = await Coupon.findOne({ code }).lean();
      if (!coupon) {
        return res.status(404).json({ success: false, message: 'Coupon not found', data: { code } });
      }

      const now = new Date();
      const diagnostics: any[] = [];
      if (!coupon.isActive) diagnostics.push('Coupon is not active');
      if (now < coupon.validFrom) diagnostics.push('Coupon not started yet');
      if (now > coupon.validUntil) diagnostics.push('Coupon expired');
      if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) diagnostics.push('Usage limit reached');
      if (coupon.minOrderAmount && amount < coupon.minOrderAmount) diagnostics.push(`Min order ${coupon.minOrderAmount}`);

      let userUsed = false;
      if (userId) {
        const used = await CouponUsage.findOne({ couponId: coupon._id, userId });
        userUsed = !!used;
        if (userUsed) diagnostics.push('User already used this coupon');
      }

      return res.json({ success: true, data: { coupon, orderAmount: amount, userId: userId || null, diagnostics } });
    } catch (error) {
      console.error('Debug coupon error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
  // Get all active coupons (public)
  static async getActiveCoupons(req: Request, res: Response) {
    try {
      const now = new Date();
      const coupons = await Coupon.find({
        isActive: true,
        validFrom: { $lte: now },
        validUntil: { $gte: now },
        $or: [
          { usageLimit: { $exists: false } },
          { $expr: { $lt: ['$usedCount', '$usageLimit'] } }
        ]
      }).populate('applicableCategories', 'name')
        .populate('applicableProducts', 'name');

      res.json({
        success: true,
        data: coupons,
      });
    } catch (error) {
      console.error('Get active coupons error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Validate coupon code
  static async validateCoupon(req: Request, res: Response) {
    try {
      let { code, orderAmount, userId } = req.body;

      if (!code) {
        return res.status(400).json({
          success: false,
          message: 'Coupon code is required',
        });
      }

      code = String(code).trim();
      const coupon = await Coupon.findOne({ 
        code: code.toUpperCase(),
        isActive: true 
      });

      if (!coupon) {
        return res.status(404).json({
          success: false,
          message: 'Mã giảm giá không tồn tại',
        });
      }

      const now = new Date();
      if (now < coupon.validFrom || now > coupon.validUntil) {
        return res.status(400).json({
          success: false,
          message: 'Mã giảm giá đã hết hạn',
        });
      }

      if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
        return res.status(400).json({
          success: false,
          message: 'Mã giảm giá đã hết lượt sử dụng',
        });
      }

      if (coupon.minOrderAmount && orderAmount < coupon.minOrderAmount) {
        return res.status(400).json({
          success: false,
          message: `Đơn hàng tối thiểu ${coupon.minOrderAmount.toLocaleString('vi-VN')}đ để sử dụng mã này`,
        });
      }

      // Check if user has already used this coupon
      if (userId) {
        const existingUsage = await CouponUsage.findOne({
          couponId: coupon._id,
          userId: userId
        });

        if (existingUsage) {
          return res.status(400).json({
            success: false,
            message: 'Bạn đã sử dụng mã giảm giá này rồi',
          });
        }
      }

      // Calculate discount amount
      let discountAmount = 0;
      if (coupon.type === 'percentage') {
        discountAmount = (orderAmount * coupon.value) / 100;
        if (coupon.maxDiscountAmount) {
          discountAmount = Math.min(discountAmount, coupon.maxDiscountAmount);
        }
      } else {
        discountAmount = Math.min(coupon.value, orderAmount);
      }

      res.json({
        success: true,
        data: {
          coupon: {
            id: coupon._id,
            code: coupon.code,
            name: coupon.name,
            description: coupon.description,
            type: coupon.type,
            value: coupon.value,
            minOrderAmount: coupon.minOrderAmount,
            maxDiscountAmount: coupon.maxDiscountAmount,
          },
          discountAmount: Math.round(discountAmount),
          finalAmount: orderAmount - Math.round(discountAmount),
        },
      });
    } catch (error) {
      console.error('Validate coupon error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Apply coupon to order (authenticated)
  static async applyCoupon(req: AuthenticatedRequest, res: Response) {
    try {
      let { couponCode, orderId } = req.body;

      if (!couponCode || !orderId) {
        return res.status(400).json({
          success: false,
          message: 'Coupon code and order ID are required',
        });
      }

      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found',
        });
      }

      if (order.userId.toString() !== req.user!.id) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      couponCode = String(couponCode).trim();
      const coupon = await Coupon.findOne({ 
        code: couponCode.toUpperCase(),
        isActive: true 
      });

      if (!coupon) {
        return res.status(404).json({
          success: false,
          message: 'Mã giảm giá không tồn tại',
        });
      }

      const now = new Date();
      if (now < coupon.validFrom || now > coupon.validUntil) {
        return res.status(400).json({
          success: false,
          message: 'Mã giảm giá đã hết hạn',
        });
      }

      if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
        return res.status(400).json({
          success: false,
          message: 'Mã giảm giá đã hết lượt sử dụng',
        });
      }

      if (coupon.minOrderAmount && order.totalAmount < coupon.minOrderAmount) {
        return res.status(400).json({
          success: false,
          message: `Đơn hàng tối thiểu ${coupon.minOrderAmount.toLocaleString('vi-VN')}đ để sử dụng mã này`,
        });
      }

      // Check if user has already used this coupon
      const existingUsage = await CouponUsage.findOne({
        couponId: coupon._id,
        userId: req.user!.id
      });

      if (existingUsage) {
        return res.status(400).json({
          success: false,
          message: 'Bạn đã sử dụng mã giảm giá này rồi',
        });
      }

      // Calculate discount amount
      let discountAmount = 0;
      if (coupon.type === 'percentage') {
        discountAmount = (order.totalAmount * coupon.value) / 100;
        if (coupon.maxDiscountAmount) {
          discountAmount = Math.min(discountAmount, coupon.maxDiscountAmount);
        }
      } else {
        discountAmount = Math.min(coupon.value, order.totalAmount);
      }

      // Create coupon usage record
      const couponUsage = await CouponUsage.create({
        couponId: coupon._id,
        userId: req.user!.id,
        orderId: order._id,
        discountAmount: Math.round(discountAmount),
      });

      // Update coupon usage count
      await Coupon.findByIdAndUpdate(coupon._id, {
        $inc: { usedCount: 1 }
      });

      // Update order with discount
      const finalAmount = order.totalAmount - Math.round(discountAmount);
      await Order.findByIdAndUpdate(order._id, {
        totalAmount: finalAmount,
        discountAmount: Math.round(discountAmount),
        couponCode: coupon.code,
      });

      res.json({
        success: true,
        message: 'Coupon applied successfully',
        data: {
          discountAmount: Math.round(discountAmount),
          finalAmount: finalAmount,
          couponUsage: couponUsage,
        },
      });
    } catch (error) {
      console.error('Apply coupon error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Get user's coupon usage history (authenticated)
  static async getUserCouponHistory(req: AuthenticatedRequest, res: Response) {
    try {
      const couponUsages = await CouponUsage.find({ userId: req.user!.id })
        .populate('couponId', 'code name type value')
        .populate('orderId', 'orderNumber totalAmount createdAt')
        .sort({ createdAt: -1 });

      res.json({
        success: true,
        data: couponUsages,
      });
    } catch (error) {
      console.error('Get user coupon history error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Admin: Create coupon
  static async createCoupon(req: AuthenticatedRequest, res: Response) {
    try {
      const {
        code,
        name,
        description,
        type,
        value,
        minOrderAmount,
        maxDiscountAmount,
        usageLimit,
        validFrom,
        validUntil,
        applicableCategories,
        applicableProducts,
      } = req.body;

      // Check if coupon code already exists
      const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
      if (existingCoupon) {
        return res.status(400).json({
          success: false,
          message: 'Coupon code already exists',
        });
      }

      const coupon = await Coupon.create({
        code: code.toUpperCase(),
        name,
        description,
        type,
        value,
        minOrderAmount,
        maxDiscountAmount,
        usageLimit,
        validFrom: new Date(validFrom),
        validUntil: new Date(validUntil),
        applicableCategories,
        applicableProducts,
      });

      res.status(201).json({
        success: true,
        message: 'Coupon created successfully',
        data: coupon,
      });
    } catch (error) {
      console.error('Create coupon error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Admin: Get all coupons
  static async getAllCoupons(req: AuthenticatedRequest, res: Response) {
    try {
      const { page = 1, limit = 20, status = 'all' } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      let filter: any = {};
      if (status === 'active') {
        const now = new Date();
        filter = {
          isActive: true,
          validFrom: { $lte: now },
          validUntil: { $gte: now },
        };
      } else if (status === 'expired') {
        filter = {
          $or: [
            { validUntil: { $lt: new Date() } },
            { isActive: false }
          ]
        };
      }

      const coupons = await Coupon.find(filter)
        .populate('applicableCategories', 'name')
        .populate('applicableProducts', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit));

      const total = await Coupon.countDocuments(filter);

      res.json({
        success: true,
        data: coupons,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      console.error('Get all coupons error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Admin: Update coupon
  static async updateCoupon(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      // Remove fields that shouldn't be updated directly
      delete updateData.usedCount;
      delete updateData.createdAt;

      const coupon = await Coupon.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      );

      if (!coupon) {
        return res.status(404).json({
          success: false,
          message: 'Coupon not found',
        });
      }

      res.json({
        success: true,
        message: 'Coupon updated successfully',
        data: coupon,
      });
    } catch (error) {
      console.error('Update coupon error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Admin: Delete coupon
  static async deleteCoupon(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;

      const coupon = await Coupon.findByIdAndDelete(id);
      if (!coupon) {
        return res.status(404).json({
          success: false,
          message: 'Coupon not found',
        });
      }

      // Also delete related coupon usages
      await CouponUsage.deleteMany({ couponId: id });

      res.json({
        success: true,
        message: 'Coupon deleted successfully',
      });
    } catch (error) {
      console.error('Delete coupon error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }
}
