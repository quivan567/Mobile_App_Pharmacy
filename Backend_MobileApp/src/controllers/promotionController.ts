import { Request, Response } from 'express';
import { Promotion, PromotionItem } from '../models/schema';
import { evaluatePromotions } from '../services/pricingService';
import { NotificationController } from './notificationController';

export class PromotionController {
  static async getAllPromotions(req: Request, res: Response) {
    try {
      const { activeOnly, page = 1, limit = 20 } = req.query;
      const pageNum = Math.max(1, Number(page));
      const limitNum = Math.min(100, Math.max(1, Number(limit)));
      const offset = (pageNum - 1) * limitNum;

      const now = new Date();
      const filter: any = {};
      
      if (String(activeOnly) === 'true') {
        filter.isActive = true;
        filter.startDate = { $lte: now };
        filter.endDate = { $gte: now };
      }

      const promotions = await Promotion.find(filter)
        .sort({ updatedAt: -1 })
        .skip(offset)
        .limit(limitNum)
        .lean();
      
      const totalCount = await Promotion.countDocuments(filter);

      res.json({ 
        success: true, 
        data: promotions,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalCount,
          pages: Math.ceil(totalCount / limitNum),
        },
      });
    } catch (error: any) {
      console.error('Get promotions error:', {
        message: error.message,
        stack: error.stack,
        query: req.query,
      });
      res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch promotions',
        ...(process.env.NODE_ENV === 'development' && { error: error.message }),
      });
    }
  }

  static async getActivePromotions(req: Request, res: Response) {
    try {
      const now = new Date();
      const promotions = await Promotion.find({
        isActive: true,
        startDate: { $lte: now },
        endDate: { $gte: now },
      }).lean();

      res.json({ success: true, data: promotions });
    } catch (error) {
      console.error('Get active promotions error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  static async getPromotionById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      if (!id || id.length < 1) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid promotion ID' 
        });
      }

      let promotion;
      try {
        promotion = await Promotion.findById(id).lean();
      } catch (error: any) {
        if (error.name === 'CastError') {
          return res.status(400).json({ 
            success: false, 
            message: 'Invalid promotion ID format' 
          });
        }
        throw error;
      }

      if (!promotion) {
        return res.status(404).json({ 
          success: false, 
          message: 'Promotion not found' 
        });
      }

      const items = await PromotionItem.find({ promotionId: promotion._id })
        .populate('productId', 'name price imageUrl unit inStock stockQuantity')
        .lean();

      res.json({ 
        success: true, 
        data: { 
          ...promotion, 
          items,
          isCurrentlyActive: promotion.isActive && 
            new Date() >= new Date(promotion.startDate) && 
            new Date() <= new Date(promotion.endDate),
        } 
      });
    } catch (error: any) {
      console.error('Get promotion by id error:', {
        message: error.message,
        stack: error.stack,
        id: req.params.id,
      });
      res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch promotion',
        ...(process.env.NODE_ENV === 'development' && { error: error.message }),
      });
    }
  }

  static async createPromotion(req: Request, res: Response) {
    try {
      const { items, ...data } = req.body;

      // Validate required fields
      if (!data.name || !data.type || !data.startDate || !data.endDate) {
        return res.status(400).json({ 
          success: false, 
          message: 'Name, type, startDate, and endDate are required' 
        });
      }

      // Validate date range
      const startDate = new Date(data.startDate);
      const endDate = new Date(data.endDate);
      if (startDate >= endDate) {
        return res.status(400).json({ 
          success: false, 
          message: 'End date must be after start date' 
        });
      }

      // Validate discount percent
      if (data.discountPercent && (data.discountPercent < 0 || data.discountPercent > 100)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Discount percent must be between 0 and 100' 
        });
      }

      // Validate combo type requires items
      if (data.type === 'combo' && (!Array.isArray(items) || items.length === 0)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Combo promotions require at least one item' 
        });
      }

      const promotion = await Promotion.create(data);

      if (Array.isArray(items) && items.length > 0) {
        // Validate items before inserting
        const validItems = items.filter((it: any) => it.productId && it.requiredQuantity > 0);
        if (validItems.length > 0) {
          await PromotionItem.insertMany(validItems.map((it: any) => ({
            promotionId: promotion._id,
            productId: it.productId,
            requiredQuantity: it.requiredQuantity || 1,
          })));
        }
      }

      // Populate items for response
      const promotionItems = await PromotionItem.find({ promotionId: promotion._id })
        .populate('productId', 'name price imageUrl')
        .lean();

      // Create notification for all users about new promotion
      try {
        if (promotion.isActive && new Date(promotion.startDate) <= new Date()) {
          await NotificationController.createNotificationForAllUsers(
            'promotion',
            'Khuyến mãi mới',
            promotion.description || promotion.name,
            `/promotions`,
            {
              promotionId: promotion._id,
              promotionName: promotion.name,
            }
          );
        }
      } catch (notificationError: any) {
        console.error('Create promotion notification error:', notificationError);
        // Do not fail promotion creation if notification fails
      }

      res.status(201).json({ 
        success: true, 
        message: 'Promotion created successfully', 
        data: { ...promotion.toObject(), items: promotionItems } 
      });
    } catch (error: any) {
      console.error('Create promotion error:', {
        message: error.message,
        stack: error.stack,
        body: req.body,
      });
      
      if (error.code === 11000) {
        return res.status(409).json({ 
          success: false, 
          message: 'Promotion code already exists' 
        });
      }

      res.status(500).json({ 
        success: false, 
        message: 'Failed to create promotion',
        ...(process.env.NODE_ENV === 'development' && { error: error.message }),
      });
    }
  }

  static async updatePromotion(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { items, ...data } = req.body;
      const promotion = await Promotion.findByIdAndUpdate(id, data, { new: true, runValidators: true });
      if (!promotion) {
        return res.status(404).json({ success: false, message: 'Promotion not found' });
      }

      if (Array.isArray(items)) {
        await PromotionItem.deleteMany({ promotionId: promotion._id });
        if (items.length > 0) {
          await PromotionItem.insertMany(items.map((it: any) => ({
            promotionId: promotion._id,
            productId: it.productId,
            requiredQuantity: it.requiredQuantity || 1,
          })));
        }
      }

      res.json({ success: true, message: 'Promotion updated', data: promotion });
    } catch (error) {
      console.error('Update promotion error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  static async deletePromotion(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const promotion = await Promotion.findByIdAndDelete(id);
      if (!promotion) {
        return res.status(404).json({ success: false, message: 'Promotion not found' });
      }
      await PromotionItem.deleteMany({ promotionId: id });
      res.json({ success: true, message: 'Promotion deleted' });
    } catch (error) {
      console.error('Delete promotion error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  // Apply promotions to a cart (public)
  static async applyToCart(req: Request, res: Response) {
    try {
      const { items } = req.body;
      
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Items array is required and cannot be empty' 
        });
      }

      // Validate items structure
      for (const item of items) {
        if (!item.productId || !item.quantity || !item.price) {
          return res.status(400).json({ 
            success: false, 
            message: 'Each item must have productId, quantity, and price' 
          });
        }
        if (Number(item.quantity) < 1 || Number(item.price) < 0) {
          return res.status(400).json({ 
            success: false, 
            message: 'Invalid quantity or price' 
          });
        }
      }

      const result = await evaluatePromotions(items);
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Apply promotions error:', {
        message: error.message,
        stack: error.stack,
        body: req.body,
      });
      res.status(500).json({ 
        success: false, 
        message: 'Failed to apply promotions',
        ...(process.env.NODE_ENV === 'development' && { error: error.message }),
      });
    }
  }

  // Validate promotion code against order amount
  static async validateCode(req: Request, res: Response) {
    try {
      let { code, orderAmount } = req.body as any;
      
      if (!code) {
        return res.status(400).json({ 
          success: false, 
          message: 'Promotion code is required' 
        });
      }

      const raw = String(code).trim();
      if (raw.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Promotion code cannot be empty' 
        });
      }

      const norm = raw.toUpperCase();
      const body: any = req.body || {};
      const amount = Number(
        orderAmount ?? body.amount ?? body.total ?? body.subtotal ?? body.orderTotal ?? 0
      );

      if (isNaN(amount) || amount < 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid order amount' 
        });
      }

      const now = new Date();
      // Support both our schema and admin data: isActive or status='active'
      let promo;
      try {
        promo = await Promotion.findOne({
          startDate: { $lte: now },
          endDate: { $gte: now },
          $or: [
            { code: norm },
            { code: { $regex: new RegExp(`^${raw.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i') } }
          ],
          $and: [
            { $or: [ { isActive: true }, { status: 'active' } ] }
          ]
        }).lean();
      } catch (error: any) {
        console.error('Database error in validateCode:', error);
        throw error;
      }

      if (!promo) {
        return res.status(404).json({ 
          success: false, 
          message: 'Mã khuyến mãi không tồn tại hoặc không hoạt động' 
        });
      }

      // Basic validation per type
      if (promo.type === 'order_threshold') {
        if (promo.minOrderValue && amount < promo.minOrderValue) {
          return res.status(400).json({ 
            success: false, 
            message: `Đơn tối thiểu ${promo.minOrderValue.toLocaleString('vi-VN')}đ để dùng mã này`,
            minOrderValue: promo.minOrderValue,
            currentAmount: amount,
          });
        }
      }

      // Calculate discount amount purely by percentage on orderAmount with cap
      let discountAmount = 0;
      const percent = (promo as any).discountPercent ?? (promo as any).value ?? 0;
      if (percent && percent > 0) {
        discountAmount = Math.floor((amount * Number(percent)) / 100);
      }
      if (promo.maxDiscountAmount && discountAmount > promo.maxDiscountAmount) {
        discountAmount = promo.maxDiscountAmount;
      }

      const finalAmount = Math.max(0, amount - discountAmount);

      return res.json({ 
        success: true, 
        data: { 
          code: promo.code || norm,
          promotionId: promo._id,
          promotionName: promo.name,
          discountAmount,
          discountPercent: percent,
          originalAmount: amount,
          finalAmount,
          type: promo.type,
        } 
      });
    } catch (error: any) {
      console.error('Validate promotion code error:', {
        message: error.message,
        stack: error.stack,
        body: req.body,
      });
      res.status(500).json({ 
        success: false, 
        message: 'Failed to validate promotion code',
        ...(process.env.NODE_ENV === 'development' && { error: error.message }),
      });
    }
  }
}


