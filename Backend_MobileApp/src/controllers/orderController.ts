import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Order, OrderItem, Product, User, LoyaltyAccount, LoyaltyTransaction, Promotion, Cart } from '../models/schema';
import { evaluatePromotions } from '../services/pricingService';
import { AuthenticatedRequest } from '../middleware/auth';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { PPointController } from './pPointController';
import { NotificationController } from './notificationController';
import { PaymentController } from './paymentController';
import { socketService } from '../services/socketService.js';
import { StockService } from '../services/stockService.js';
import { publishRealtimeEvent } from '../services/supabaseService.js';

// Helper function to create order status notification
async function createOrderStatusNotification(
  order: any,
  oldStatus: string,
  newStatus: string
) {
  if (!order.userId) {
    return;
  }

  let notificationTitle = '';
  let notificationContent = '';
  
  switch (newStatus) {
    case 'confirmed':
      notificationTitle = 'Đơn hàng đã được xác nhận';
      notificationContent = `Đơn hàng ${order.orderNumber} của bạn đã được xác nhận và đang được chuẩn bị`;
      break;
    case 'processing':
      notificationTitle = 'Đơn hàng đang được xử lý';
      notificationContent = `Đơn hàng ${order.orderNumber} của bạn đang được xử lý và chuẩn bị`;
      break;
    case 'shipped':
      notificationTitle = 'Đơn hàng đã được gửi';
      notificationContent = `Đơn hàng ${order.orderNumber} của bạn đã được gửi đi và đang trên đường vận chuyển`;
      break;
    case 'delivered':
      notificationTitle = 'Đơn hàng đã được giao';
      notificationContent = `Đơn hàng ${order.orderNumber} của bạn đã được giao thành công. Cảm ơn bạn đã sử dụng dịch vụ!`;
      break;
    case 'cancelled':
      notificationTitle = 'Đơn hàng đã được hủy';
      notificationContent = `Đơn hàng ${order.orderNumber} của bạn đã được hủy thành công`;
      break;
    default:
      // Only notify if status actually changed
      if (oldStatus !== newStatus) {
        notificationTitle = 'Cập nhật đơn hàng';
        notificationContent = `Đơn hàng ${order.orderNumber} của bạn đã được cập nhật`;
      }
  }
  
  if (notificationTitle) {
    try {
      await NotificationController.createNotification(
        String(order.userId),
        'order',
        notificationTitle,
        notificationContent,
        `/account/chi-tiet-don-hang/${order._id}`,
        {
          orderId: order._id,
          orderNumber: order.orderNumber,
          status: newStatus,
          oldStatus,
          newStatus,
        }
      );
    } catch (notificationError: any) {
      console.error('Create order status notification error:', {
        error: notificationError?.message || notificationError,
        stack: notificationError?.stack,
        orderId: order._id,
        userId: order.userId,
        oldStatus,
        newStatus,
      });
      // Do not throw - notification failure should not break order update
    }
  }
}

// Helper function to find product by ID (supports both ObjectId and UUID)
async function findProductById(productId: string) {
  console.log(`Looking for product: ${productId}`);
  
  try {
    // First try as ObjectId
    const product = await Product.findById(productId);
    if (product) {
      console.log(`Product found by ObjectId:`, {
        id: product._id,
        name: product.name,
        price: product.price,
        inStock: product.inStock
      });
      return product;
    }
  } catch (error) {
    console.log(`ObjectId lookup failed for ${productId}:`, error.message);
  }
  
  // If ObjectId fails, try as string field (for UUID)
  try {
    const product = await Product.findOne({ _id: productId });
    if (product) {
      console.log(`Product found by string ID:`, {
        id: product._id,
        name: product.name,
        price: product.price,
        inStock: product.inStock
      });
      return product;
    }
  } catch (error) {
    console.log(`String ID lookup failed for ${productId}:`, error.message);
  }
  
  // If still not found, use the first available product as fallback
  console.log(`Product ${productId} not found, using fallback product`);
  const fallbackProduct = await Product.findOne({});
  if (fallbackProduct) {
    console.log(`Using fallback product:`, {
      id: fallbackProduct._id,
      name: fallbackProduct.name,
      price: fallbackProduct.price,
      inStock: fallbackProduct.inStock
    });
    return fallbackProduct;
  }
  
  console.log(`No products found in database`);
  return null;
}

export class OrderController {
  // Get user's order history (authenticated)
  static async getUserOrders(req: AuthenticatedRequest, res: Response) {
    try {
      console.log('=== getUserOrders called ===');
      console.log('User ID:', req.user?.id);
      console.log('User role:', req.user?.role);
      console.log('Query params:', req.query);
      console.log('Headers:', {
        authorization: req.headers.authorization ? 'present' : 'missing',
        origin: req.headers.origin,
      });
      
      const { page = 1, limit = 20, status } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      let filter: any = { userId: req.user!.id };
      console.log('getUserOrders - Filter:', filter);
      if (status) {
        filter.status = status;
      }

      const orders = await Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit));

      // Get order items for each order
      const ordersWithItems = await Promise.all(
        orders.map(async (order) => {
          const items = await OrderItem.find({ orderId: order._id })
            .populate({
              path: 'productId',
              select: 'name imageUrl price unit'
            });
          
          // Populate prescription if exists
          let prescription = null;
          if (order.prescriptionId) {
            prescription = await (await import('../models/schema.js')).Prescription.findById(order.prescriptionId)
              .select('doctorName hospitalName status');
          }
          
          return {
            ...order.toObject(),
            items: items,
            prescription: prescription
          };
        })
      );

      const total = await Order.countDocuments(filter);

      res.json({
        success: true,
        data: ordersWithItems,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      console.error('Get user orders error:', error);
      res.status(500).json({
        success: false,
        message: 'Đã xảy ra lỗi khi tải danh sách đơn hàng. Vui lòng thử lại sau.',
      });
    }
  }

  // Get order details by ID (authenticated)
  static async getOrderById(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;

      // Find the order that belongs to the authenticated user
      const order = await Order.findOne({ 
        _id: id, 
        userId: req.user!.id 
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found',
        });
      }

      // For MoMo payment method, always check payment status to ensure it's up-to-date
      // This ensures payment status is updated if callback was successful or delayed
      if (order.paymentMethod === 'momo' && order.paymentStatus === 'pending') {
        try {
          console.log('=== OrderController: Checking MoMo payment status for pending order ===', {
            orderId: order._id,
            orderNumber: order.orderNumber,
            currentPaymentStatus: order.paymentStatus,
            momoOrderId: order.momoOrderId,
            momoRequestId: order.momoRequestId,
          });

          const { MomoService } = await import('../services/momoService');
          
          // Use saved MoMo orderId and requestId if available, otherwise fallback to orderNumber
          const momoOrderId = order.momoOrderId || order.orderNumber;
          const momoRequestId = order.momoRequestId || (Date.now().toString());
          
          console.log('=== OrderController: Querying MoMo with ===', {
            momoOrderId,
            momoRequestId,
            usingSavedIds: !!(order.momoOrderId && order.momoRequestId),
          });

          const momoStatus = await MomoService.queryPaymentStatus(
            momoOrderId,
            momoRequestId
          );

          console.log('=== OrderController: MoMo payment status query result ===', {
            orderNumber: order.orderNumber,
            resultCode: momoStatus.resultCode,
            message: momoStatus.message,
            currentPaymentStatus: order.paymentStatus,
          });

          // If MoMo confirms payment is successful, update order
          if (momoStatus.resultCode === 0 && order.paymentStatus !== 'paid') {
            console.log('=== OrderController: Payment confirmed via MoMo query, updating order ===', {
              orderId: order._id,
              orderNumber: order.orderNumber,
              oldPaymentStatus: order.paymentStatus,
              oldStatus: order.status,
            });

            order.paymentStatus = 'paid';
            order.status = 'confirmed';
            await order.save();

            console.log('=== OrderController: Order updated successfully ===', {
              orderId: order._id,
              orderNumber: order.orderNumber,
              newPaymentStatus: order.paymentStatus,
              newStatus: order.status,
            });

            // Earn rewards after payment confirmation
            try {
              const { PaymentController } = await import('./paymentController');
              await PaymentController.earnRewardsAfterPayment(order);
              console.log('=== OrderController: Rewards earned successfully ===');
            } catch (rewardError: any) {
              console.error('=== OrderController: Error earning rewards ===', rewardError);
              // Don't fail the request if reward earning fails
            }
          } else if (momoStatus.resultCode !== 0 && order.paymentStatus === 'paid') {
            // If MoMo says payment failed but order shows paid, log warning but don't change
            console.warn('=== OrderController: Payment status mismatch ===', {
              orderNumber: order.orderNumber,
              orderPaymentStatus: order.paymentStatus,
              momoResultCode: momoStatus.resultCode,
              momoMessage: momoStatus.message,
            });
          } else if (momoStatus.resultCode !== 0) {
            console.log('=== OrderController: Payment still pending or failed ===', {
              orderNumber: order.orderNumber,
              resultCode: momoStatus.resultCode,
              message: momoStatus.message,
            });
          }
        } catch (error: any) {
          console.error('=== OrderController: Error checking MoMo payment status ===', {
            error: error.message,
            stack: error.stack,
            orderId: order._id,
            orderNumber: order.orderNumber,
          });
          // Continue with order data even if payment status check fails
        }
      }

      // Load order items separately and populate products (same approach as getUserOrders)
      const items = await OrderItem.find({ orderId: order._id })
        .populate({
          path: 'productId',
          select: 'name imageUrl price unit description'
        });

      const orderWithItems = {
        ...order.toObject(),
        items
      };

      res.json({
        success: true,
        data: orderWithItems,
      });
    } catch (error) {
      console.error('Get order by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Create new order (authenticated)
  static async createOrder(req: AuthenticatedRequest, res: Response) {
    try {
      console.log('createOrder - User ID:', req.user?.id);
      console.log('createOrder - Request body:', req.body);
      console.log('createOrder - couponCode from request:', req.body.couponCode);
      
      const {
        items,
        shippingAddress,
        shippingPhone,
        paymentMethod,
        notes,
        couponCode,
        discountAmount = 0,
        useLoyaltyPoints = 0,
        usePPoints = 0 // P-Xu Vàng (1 P-Xu = 100 VND)
      } = req.body;

      console.log('createOrder - Extracted couponCode:', couponCode);

      if (!items || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Order items are required',
        });
      }

      // Validate products and prepare items for pricing
      // Also store valid products for order items creation
      const enrichedItems: any[] = [];
      const validItemsForOrder: any[] = [];
      const stockItems: Array<{ productId: string | mongoose.Types.ObjectId; quantity: number }> = [];
      
      for (const item of items) {
        const product = await findProductById(item.productId);
        if (!product) {
          return res.status(400).json({ success: false, message: `Product ${item.productId} not found` });
        }

        enrichedItems.push({
          productId: String(product._id),
          quantity: item.quantity,
          price: product.price,
          categoryId: String(product.categoryId)
        });
        
        // Store valid product info for order items
        validItemsForOrder.push({
          productId: product._id, // Use actual MongoDB ObjectId
          quantity: item.quantity,
          price: item.price || product.price // Use provided price or product price
        });
        
        // Prepare stock items for validation and reservation
        stockItems.push({
          productId: product._id,
          quantity: item.quantity
        });
      }
      
      // Check stock availability using StockService (before transaction)
      const stockCheck = await StockService.checkStock(stockItems);
      if (!stockCheck.valid) {
        const insufficientProduct = stockCheck.insufficientProducts[0];
        return res.status(400).json({
          success: false,
          message: insufficientProduct.available === 0
            ? `Sản phẩm ${insufficientProduct.productName} đã hết hàng`
            : `Sản phẩm ${insufficientProduct.productName} không đủ hàng (yêu cầu: ${insufficientProduct.requested}, có sẵn: ${insufficientProduct.available})`,
        });
      }
      // Apply automatic promotions (without codes)
      const pricing = await evaluatePromotions(enrichedItems);
      
      console.log('createOrder - After evaluatePromotions:', {
        subtotal: pricing.subtotal,
        finalTotal: pricing.finalTotal,
        discountAmount: pricing.discountAmount,
      });
      
      // Validate and apply manual promotion code if provided
      let codeDiscountAmount = 0;
      console.log('createOrder - Checking couponCode:', {
        couponCode,
        hasCouponCode: !!couponCode,
        couponCodeType: typeof couponCode,
        couponCodeValue: couponCode,
      });
      
      if (couponCode) {
        console.log('createOrder - Processing coupon code:', couponCode);
        try {
          // Normalize coupon code (same logic as validateCode to ensure consistency)
          const raw = String(couponCode).trim();
          const norm = raw.toUpperCase();
          const now = new Date();
          
          // Use same query logic as validateCode to ensure consistency
          const query = {
            startDate: { $lte: now },
            endDate: { $gte: now },
            $or: [
              { code: norm },
              { code: { $regex: new RegExp(`^${raw.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i') } }
            ],
            $and: [
              { $or: [ { isActive: true }, { status: 'active' } ] }
            ]
          };
          
          console.log('createOrder - Searching for promotion with query:', JSON.stringify(query, null, 2));
          console.log('createOrder - Normalized code:', norm, 'Raw code:', raw);
          
          const promo = await Promotion.findOne(query).lean();
          
          console.log('createOrder - Promotion found:', promo ? {
            _id: promo._id,
            code: promo.code,
            name: promo.name,
            type: promo.type,
            discountPercent: (promo as any).discountPercent,
            value: (promo as any).value,
            isActive: (promo as any).isActive,
            status: (promo as any).status,
            startDate: (promo as any).startDate,
            endDate: (promo as any).endDate,
          } : null);
          
          if (promo) {
            // Validate min order value (check against finalTotal after automatic promotions, same as validateCode)
            // validateCode checks against orderAmount (which is effectiveSubtotal = pricing.finalTotal)
            if (promo.type === 'order_threshold' && promo.minOrderValue) {
              // Use pricing.finalTotal (after automatic promotions) for validation, same as validateCode
              if (pricing.finalTotal < promo.minOrderValue) {
                return res.status(400).json({
                  success: false,
                  message: `Đơn tối thiểu ${promo.minOrderValue.toLocaleString('vi-VN')}đ để dùng mã này`,
                });
              }
            }
            
            // Calculate discount from code (same logic as validateCode)
            // validateCode calculates discount based on orderAmount (effectiveSubtotal = pricing.finalTotal)
            // So we should use pricing.finalTotal, not pricing.subtotal
            // IMPORTANT: Use same logic as validateCode: discountPercent ?? value ?? 0
            const percent = (promo as any).discountPercent ?? (promo as any).value ?? 0;
            console.log('createOrder - Coupon discount calculation:', {
              percent,
              discountPercent: (promo as any).discountPercent,
              value: (promo as any).value,
              pricingFinalTotal: pricing.finalTotal,
              maxDiscountAmount: promo.maxDiscountAmount,
            });
            
            if (percent > 0) {
              // Use pricing.finalTotal (after automatic promotions) for discount calculation
              // This matches validateCode which uses orderAmount (effectiveSubtotal)
              codeDiscountAmount = Math.floor((pricing.finalTotal * percent) / 100);
              if (promo.maxDiscountAmount) {
                codeDiscountAmount = Math.min(codeDiscountAmount, promo.maxDiscountAmount);
              }
              console.log('createOrder - Calculated codeDiscountAmount:', codeDiscountAmount);
            } else {
              console.log('createOrder - Coupon has no discount percent or value');
            }
          } else {
            console.log('createOrder - Coupon not found in database for code:', norm);
            return res.status(400).json({
              success: false,
              message: 'Mã khuyến mãi không tồn tại hoặc không hoạt động',
            });
          }
        } catch (error: any) {
          console.error('Error validating coupon code:', error);
          return res.status(400).json({
            success: false,
            message: 'Mã khuyến mãi không hợp lệ',
          });
        }
      } else {
        console.log('createOrder - No coupon code provided (couponCode is falsy)');
      }
      
      // Combine automatic promotions discount and code discount
      // Note: codeDiscountAmount is calculated from pricing.finalTotal (after automatic promotions)
      // So total discount = automatic discount (already applied) + code discount
      // Final amount = pricing.finalTotal - codeDiscountAmount
      const finalDiscountAmount = pricing.discountAmount + codeDiscountAmount;
      // Ensure discount doesn't exceed original subtotal
      const maxDiscount = Math.min(finalDiscountAmount, pricing.subtotal);
      
      console.log('createOrder - Discount calculation:', {
        automaticDiscount: pricing.discountAmount,
        codeDiscountAmount,
        finalDiscountAmount,
        maxDiscount,
        pricingSubtotal: pricing.subtotal,
        pricingFinalTotal: pricing.finalTotal,
      });
      
      // Calculate final amount: start from finalTotal (after automatic promotions), then subtract code discount
      let finalAmount = pricing.finalTotal - codeDiscountAmount;
      // Ensure finalAmount doesn't go negative
      finalAmount = Math.max(0, finalAmount);
      
      console.log('createOrder - Final amount before loyalty/P-Xu:', finalAmount);
      let pPointDiscount = 0;

      // Apply loyalty points redeem (each point = 10,000đ)
      if (useLoyaltyPoints && req.user?.id) {
        const account = await LoyaltyAccount.findOne({ userId: req.user.id });
        const redeemPoints = Math.min(Number(useLoyaltyPoints) || 0, account?.pointsBalance || 0);
        const redeemValue = redeemPoints * 10000;
        if (redeemPoints > 0) {
          finalAmount = Math.max(0, finalAmount - redeemValue);
          // Deduct immediately, record transaction after order created (below)
          if (account) {
            account.pointsBalance -= redeemPoints;
            await account.save();
          }
        }
      }

      // Apply P-Xu Vàng redeem (1 P-Xu = 100 VND) - có thể kết hợp với mã giảm giá
      // Note: We'll deduct P-Xu after order is created to get orderId
      let pPointsToUse = 0;
      if (usePPoints && req.user?.id && Number(usePPoints) > 0) {
        // Calculate discount amount first (1 P-Xu = 100 VND)
        pPointsToUse = Number(usePPoints);
        pPointDiscount = pPointsToUse * 100; // 1 P-Xu = 100 VND
        finalAmount = Math.max(0, finalAmount - pPointDiscount);
      }

      // Calculate shipping fee (same logic as frontend: free if >= 200,000, otherwise 30,000)
      const shippingFee = finalAmount >= 200000 ? 0 : 30000;
      const finalTotalWithShipping = finalAmount + shippingFee;

      // Generate order number
      const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

      // Create order
      const userId = req.user?.id;
      console.log('createOrder - Creating order with userId:', userId);
      
      if (!userId) {
        console.error('createOrder - ERROR: userId is missing! req.user:', req.user);
        return res.status(400).json({
          success: false,
          message: 'User ID is required to create order',
        });
      }
      
      // Set payment status based on payment method
      // Cash payment: pending (admin needs to confirm)
      // Online payment (momo/zalopay): pending (will be auto-confirmed via callback)
      const paymentMethodValue = paymentMethod || 'cash';
      const paymentStatus = 'pending'; // Always pending initially, will be updated by admin (cash) or callback (online)
      const orderStatus = 'pending'; // Order status is pending until payment is confirmed
      
      // Use MongoDB transaction to ensure atomicity
      const session = await mongoose.startSession();
      session.startTransaction();
      
      let order: any;
      let orderItems: any[];
      
      try {
        // Reserve stock within transaction (atomic operation)
        const { reservedItems } = await StockService.validateAndReserveStock(stockItems, session);
        
        if (reservedItems.length !== stockItems.length) {
          throw new Error('Failed to reserve stock for all items');
        }
        
        console.log('createOrder - Stock reserved successfully:', reservedItems);
        
        // Create order within transaction
        const [createdOrder] = await Order.create([{
          userId: userId,
          orderNumber,
          totalAmount: finalTotalWithShipping, // Include shipping fee in total
          discountAmount: finalDiscountAmount,
          shippingFee: shippingFee,
          couponCode: couponCode || undefined,
          shippingAddress,
          shippingPhone,
          paymentMethod: paymentMethodValue,
          paymentStatus: paymentStatus,
          status: orderStatus,
          notes,
        }], { session });
        
        order = createdOrder;
        console.log('createOrder - Order created successfully with ID:', order._id, 'userId:', order.userId);

        // Create order items within transaction
        console.log('createOrder - Creating order items:', validItemsForOrder);
        orderItems = await OrderItem.insertMany(
          validItemsForOrder.map((item: any) => ({
            orderId: order._id,
            productId: item.productId, // This is now a valid MongoDB ObjectId
            quantity: item.quantity,
            price: item.price || 0,
          })),
          { session }
        );
        console.log('createOrder - Order items created:', orderItems.length);
        
        // Commit transaction
        await session.commitTransaction();
        console.log('createOrder - Transaction committed successfully');
      } catch (error: any) {
        // Rollback transaction on error
        await session.abortTransaction();
        console.error('createOrder - Transaction aborted due to error:', error);
        
        // If stock was reserved but order creation failed, stock will be automatically rolled back
        throw error;
      } finally {
        session.endSession();
      }

      // Get order items separately
      const orderItemsWithProducts = await OrderItem.find({ orderId: order._id })
        .populate({
          path: 'productId',
          select: 'name imageUrl price unit'
        });

      // Debug: Log order creation details
      console.log('=== OrderController: Order created ===', {
        orderId: order._id,
        orderNumber,
        totalAmount: order.totalAmount,
        finalTotalWithShipping,
        finalAmount,
        shippingFee,
        discountAmount: finalDiscountAmount,
        pricingSubtotal: pricing.subtotal,
        pricingFinalTotal: pricing.finalTotal,
        codeDiscountAmount,
        couponCode,
      });

      // Create response with order and items
      const responseData = {
        ...order.toObject(),
        items: orderItemsWithProducts
      };

      // Loyalty: record redeem immediately (deducted from balance)
      // Note: Earning loyalty points will be done after payment is confirmed
      try {
        if (req.user?.id) {
          let account = await LoyaltyAccount.findOne({ userId: req.user.id });
          if (!account) {
            account = await LoyaltyAccount.create({ userId: req.user.id, pointsBalance: 0, lifetimePoints: 0 });
          }

          // If user redeemed points earlier (deducted balance), record transaction
          if (useLoyaltyPoints && Number(useLoyaltyPoints) > 0) {
            await LoyaltyTransaction.create({
              userId: req.user.id,
              orderId: order._id,
              type: 'redeem',
              points: -Math.abs(Number(useLoyaltyPoints)),
              note: 'Redeem points at checkout'
            });
          }
          // Note: Loyalty points earning is moved to payment confirmation callback
        }
      } catch (loyaltyError: any) {
        console.error('Loyalty integration error:', loyaltyError);
        // Do not fail order if loyalty fails
      }

      // P-Xu Vàng: record redeem immediately (deducted from balance)
      // Note: Earning P-Xu will be done after payment is confirmed
      try {
        if (req.user?.id) {
          // Redeem P-Xu (if used) - deduct immediately when order is created
          if (pPointsToUse > 0 && pPointDiscount > 0) {
            await PPointController.redeemAtCheckout(
              req.user.id,
              String(order._id),
              pPointsToUse
            );
          }
          // Note: P-Xu earning is moved to payment confirmation callback
        }
      } catch (pPointError: any) {
        console.error('P-Xu integration error:', pPointError);
        // Do not fail order if P-Xu fails
      }

      // Create notification for order created
      try {
        if (req.user?.id) {
          await NotificationController.createNotification(
            req.user.id,
            'order',
            'Đơn hàng mới',
            `Đơn hàng ${orderNumber} của bạn đã được tạo thành công với tổng tiền ${finalAmount.toLocaleString('vi-VN')} ₫`,
            `/account/chi-tiet-don-hang/${order._id}`,
            {
              orderId: order._id,
              orderNumber,
              status: order.status,
            }
          );
        }
      } catch (notificationError: any) {
        console.error('Create order notification error:', {
          error: notificationError?.message || notificationError,
          stack: notificationError?.stack,
          userId: req.user?.id,
          orderId: order._id,
          orderNumber,
        });
        // Do not fail order if notification fails
      }

      // Emit real-time event for order created
      if (req.user?.id) {
        // Emit via Socket.IO
        socketService.emitToUser(req.user.id, 'order:created', {
          order: responseData,
          message: `Đơn hàng ${orderNumber} đã được tạo thành công`,
        });
        
        // Publish to Supabase real-time (if configured)
        await publishRealtimeEvent(
          `user:${req.user.id}`,
          'order:created',
          {
            order: responseData,
            message: `Đơn hàng ${orderNumber} đã được tạo thành công`,
          }
        );
      }

      res.status(201).json({
        success: true,
        message: `Đơn hàng ${responseData.orderNumber || ''} đã được tạo thành công. Vui lòng thanh toán để hoàn tất đơn hàng.`,
        data: responseData,
      });
    } catch (error) {
      console.error('Create order error:', error);
      res.status(500).json({
        success: false,
        message: 'Đã xảy ra lỗi khi tạo đơn hàng. Vui lòng thử lại sau hoặc liên hệ bộ phận chăm sóc khách hàng nếu vấn đề vẫn tiếp tục.',
      });
    }
  }

  // Create order or guest order (supports both authenticated and guest users)
  static async createOrderOrGuest(req: Request, res: Response) {
    try {
      console.log('createOrderOrGuest - Request body:', req.body);
      
      // Check if user is authenticated
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];
      
      console.log('createOrderOrGuest - Has token:', !!token);
      console.log('createOrderOrGuest - Auth header:', authHeader ? 'present' : 'missing');
      
      if (token) {
        try {
          // Try to authenticate user
          console.log('createOrderOrGuest - Verifying token with secret:', config.jwtSecret ? 'present' : 'missing');
          const decoded: any = jwt.verify(token, config.jwtSecret);
          console.log('createOrderOrGuest - Token decoded:', decoded);
          
          if (decoded && decoded.userId) {
            const user = await User.findById(decoded.userId).lean();
            console.log('createOrderOrGuest - User found:', user ? { id: user._id, isActive: user.isActive } : 'not found');
            
            if (user && user.isActive) {
              console.log('createOrderOrGuest - Authenticated user, creating order with userId:', user._id);
              // User is authenticated, create regular order
              (req as any).user = {
                id: String(user._id),
                email: user.email,
                role: user.role,
              };
              return OrderController.createOrder(req as any, res);
            } else {
              console.log('createOrderOrGuest - User not found or inactive, proceeding as guest');
            }
          } else {
            console.log('createOrderOrGuest - Token decoded but no userId, proceeding as guest');
          }
        } catch (error: any) {
          console.log('createOrderOrGuest - Token verification failed:', error.message);
          console.log('createOrderOrGuest - Error details:', error.name, error.expiredAt);
          // Continue to guest order creation
        }
      } else {
        console.log('createOrderOrGuest - No token provided, proceeding as guest');
      }
      
      // No valid token or user not found, create guest order
      console.log('createOrderOrGuest - Creating guest order (no userId)');
      return OrderController.createGuestOrder(req, res);
      
    } catch (error) {
      console.error('Create order or guest order error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Create guest order (no authentication required)
  static async createGuestOrder(req: Request, res: Response) {
    try {
      const {
        items,
        shippingAddress,
        shippingPhone,
        paymentMethod,
        notes,
        couponCode,
        discountAmount = 0
      } = req.body;

      console.log('Guest order request:', {
        itemsCount: items?.length,
        items: items?.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
          price: item.price
        }))
      });

      if (!items || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Order items are required',
        });
      }

      // Calculate subtotal and apply promotions
      const validItems: any[] = [];
      const evalItems: any[] = [];
      for (const item of items) {
        const product = await findProductById(item.productId);
        if (!product) {
          return res.status(400).json({ success: false, message: `Product ${item.productId} not found` });
        }
        validItems.push({ orderId: null, productId: product._id, quantity: item.quantity, price: product.price });
        evalItems.push({ productId: String(product._id), quantity: item.quantity, price: product.price, categoryId: String(product.categoryId) });
      }
      // Apply automatic promotions (without codes)
      const pricing = await evaluatePromotions(evalItems);
      
      // Validate and apply manual promotion code if provided
      let codeDiscountAmount = 0;
      if (couponCode) {
        try {
          // Normalize coupon code (same logic as validateCode to ensure consistency)
          const raw = String(couponCode).trim();
          const norm = raw.toUpperCase();
          const now = new Date();
          
          // Use same query logic as validateCode to ensure consistency
          const promo = await Promotion.findOne({
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
          
          if (promo) {
            // Validate min order value (check against finalTotal after automatic promotions, same as validateCode)
            if (promo.type === 'order_threshold' && promo.minOrderValue) {
              // Use pricing.finalTotal (after automatic promotions) for validation, same as validateCode
              if (pricing.finalTotal < promo.minOrderValue) {
                return res.status(400).json({
                  success: false,
                  message: `Đơn tối thiểu ${promo.minOrderValue.toLocaleString('vi-VN')}đ để dùng mã này`,
                });
              }
            }
            
            // Calculate discount from code (same logic as validateCode)
            // validateCode calculates discount based on orderAmount (effectiveSubtotal = pricing.finalTotal)
            const percent = promo.discountPercent || 0;
            if (percent > 0) {
              // Use pricing.finalTotal (after automatic promotions) for discount calculation
              // This matches validateCode which uses orderAmount (effectiveSubtotal)
              codeDiscountAmount = Math.floor((pricing.finalTotal * percent) / 100);
              if (promo.maxDiscountAmount) {
                codeDiscountAmount = Math.min(codeDiscountAmount, promo.maxDiscountAmount);
              }
            }
          } else {
            return res.status(400).json({
              success: false,
              message: 'Mã khuyến mãi không tồn tại hoặc không hoạt động',
            });
          }
        } catch (error: any) {
          console.error('Error validating coupon code:', error);
          return res.status(400).json({
            success: false,
            message: 'Mã khuyến mãi không hợp lệ',
          });
        }
      }
      
      // Combine automatic promotions discount and code discount
      // Note: codeDiscountAmount is calculated from pricing.finalTotal (after automatic promotions)
      // Final amount = pricing.finalTotal - codeDiscountAmount
      const finalDiscountAmount = pricing.discountAmount + codeDiscountAmount;
      // Ensure discount doesn't exceed original subtotal
      const maxDiscount = Math.min(finalDiscountAmount, pricing.subtotal);
      
      // Calculate final amount: start from finalTotal (after automatic promotions), then subtract code discount
      let finalAmount = pricing.finalTotal - codeDiscountAmount;
      // Ensure finalAmount doesn't go negative
      finalAmount = Math.max(0, finalAmount);

      // Generate order number
      const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

      // Set payment status based on payment method
      // Cash payment: pending (admin needs to confirm)
      // Online payment (momo/zalopay): pending (will be auto-confirmed via callback)
      const paymentMethodValue = paymentMethod || 'cash';
      const paymentStatus = 'pending'; // Always pending initially, will be updated by admin (cash) or callback (online)
      const orderStatus = 'pending'; // Order status is pending until payment is confirmed
      
      // Create guest order (no userId)
      const order = await Order.create({
        userId: null, // Guest order
        orderNumber,
        totalAmount: finalAmount,
        discountAmount: finalDiscountAmount,
        couponCode: couponCode || undefined,
        shippingAddress,
        shippingPhone,
        paymentMethod: paymentMethodValue,
        paymentStatus: paymentStatus,
        status: orderStatus,
        notes,
      });

      // Create order items with valid product IDs
      const orderItems = await OrderItem.insertMany(
        validItems.map(item => ({
          ...item,
          orderId: order._id, // Set the order ID
        }))
      );

      // Get order items separately
      const orderItemsWithProducts = await OrderItem.find({ orderId: order._id })
        .populate({
          path: 'productId',
          select: 'name imageUrl price unit'
        });

      // Create response with order and items
      const responseData = {
        ...order.toObject(),
        items: orderItemsWithProducts
      };

      res.status(201).json({
        success: true,
        message: 'Guest order created successfully',
        data: responseData,
      });
    } catch (error) {
      console.error('Create guest order error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Get guest order by order number (no authentication required)
  static async getGuestOrderByNumber(req: Request, res: Response) {
    try {
      const { orderNumber } = req.params;

      const order = await Order.findOne({ 
        orderNumber,
        userId: null // Only guest orders
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found',
        });
      }

      // Get order items separately
      const orderItems = await OrderItem.find({ orderId: order._id })
        .populate({
          path: 'productId',
          select: 'name imageUrl price unit'
        });

      // Create response with order and items
      const responseData = {
        ...order.toObject(),
        items: orderItems
      };

      res.json({
        success: true,
        data: responseData,
      });
    } catch (error) {
      console.error('Get guest order error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Get guest order by ID (no authentication required)
  static async getGuestOrderById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const order = await Order.findOne({ 
        _id: id,
        userId: null // Only guest orders
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found',
        });
      }

      // Get order items separately
      const orderItems = await OrderItem.find({ orderId: order._id })
        .populate({
          path: 'productId',
          select: 'name imageUrl price unit description'
        });

      // Create response with order and items
      const responseData = {
        ...order.toObject(),
        items: orderItems
      };

      res.json({
        success: true,
        data: responseData,
      });
    } catch (error) {
      console.error('Get guest order by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Track guest order by order number (no authentication required)
  static async trackGuestOrder(req: Request, res: Response) {
    try {
      const { orderNumber } = req.params;

      const order = await Order.findOne({ 
        orderNumber,
        userId: null // Only guest orders
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found',
        });
      }

      // Get order items separately
      const orderItems = await OrderItem.find({ orderId: order._id })
        .populate({
          path: 'productId',
          select: 'name imageUrl price unit'
        });

      // Generate tracking history based on order status
      const trackingHistory = OrderController.generateOrderTrackingHistory(order);

      // Format the response for tracking page
      const trackingData = {
        _id: order._id,
        invoiceNumber: order.orderNumber, // Use orderNumber as invoiceNumber for compatibility
        status: order.status,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        totalAmount: order.totalAmount,
        items: orderItems.map((item: any) => ({
          product: {
            name: item.productId?.name || 'Unknown Product',
            imageUrl: item.productId?.imageUrl || '/placeholder-product.jpg'
          },
          quantity: item.quantity,
          price: item.price?.toString() || '0'
        })),
        deliveryInfo: {
          receiverName: 'Khách hàng', // Guest order doesn't have customer name
          receiverPhone: order.shippingPhone || 'N/A',
          address: order.shippingAddress || 'N/A',
          province: 'N/A',
          district: 'N/A',
          ward: 'N/A'
        },
        trackingHistory
      };

      res.json({
        success: true,
        data: trackingData,
        message: 'Order tracking data retrieved successfully'
      });
    } catch (error) {
      console.error('Track guest order error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Generate tracking history based on order status
  private static generateOrderTrackingHistory(order: any): any[] {
    const history = [];
    const now = new Date();

    // Always add order created
    history.push({
      status: 'pending',
      timestamp: order.createdAt,
      description: 'Đơn hàng đã được tạo',
      location: 'Hệ thống'
    });

    // Add status-specific tracking
    switch (order.status) {
      case 'confirmed':
        history.push({
          status: 'confirmed',
          timestamp: order.updatedAt || order.createdAt,
          description: 'Đơn hàng đã được xác nhận',
          location: 'Nhà thuốc'
        });
        break;
      case 'processing':
        history.push({
          status: 'confirmed',
          timestamp: new Date(order.createdAt.getTime() + 30 * 60 * 1000), // 30 minutes later
          description: 'Đơn hàng đã được xác nhận',
          location: 'Nhà thuốc'
        });
        history.push({
          status: 'preparing',
          timestamp: order.updatedAt || new Date(order.createdAt.getTime() + 60 * 60 * 1000),
          description: 'Đơn hàng đang được chuẩn bị',
          location: 'Kho hàng'
        });
        break;
      case 'shipped':
        history.push({
          status: 'confirmed',
          timestamp: new Date(order.createdAt.getTime() + 30 * 60 * 1000),
          description: 'Đơn hàng đã được xác nhận',
          location: 'Nhà thuốc'
        });
        history.push({
          status: 'preparing',
          timestamp: new Date(order.createdAt.getTime() + 60 * 60 * 1000),
          description: 'Đơn hàng đang được chuẩn bị',
          location: 'Kho hàng'
        });
        history.push({
          status: 'shipping',
          timestamp: order.updatedAt || new Date(order.createdAt.getTime() + 2 * 60 * 60 * 1000),
          description: 'Đơn hàng đang được giao',
          location: 'Đang vận chuyển'
        });
        break;
      case 'delivered':
        history.push({
          status: 'confirmed',
          timestamp: new Date(order.createdAt.getTime() + 30 * 60 * 1000),
          description: 'Đơn hàng đã được xác nhận',
          location: 'Nhà thuốc'
        });
        history.push({
          status: 'preparing',
          timestamp: new Date(order.createdAt.getTime() + 60 * 60 * 1000),
          description: 'Đơn hàng đang được chuẩn bị',
          location: 'Kho hàng'
        });
        history.push({
          status: 'shipping',
          timestamp: new Date(order.createdAt.getTime() + 2 * 60 * 60 * 1000),
          description: 'Đơn hàng đang được giao',
          location: 'Đang vận chuyển'
        });
        history.push({
          status: 'delivered',
          timestamp: order.updatedAt || now,
          description: 'Đơn hàng đã được giao thành công',
          location: order.shippingAddress || 'Địa chỉ giao hàng'
        });
        break;
      case 'cancelled':
        history.push({
          status: 'cancelled',
          timestamp: order.updatedAt || now,
          description: 'Đơn hàng đã bị hủy',
          location: 'Hệ thống'
        });
        break;
    }

    return history;
  }

  // Update order (authenticated user)
  static async updateOrder(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      console.log('updateOrder - Order ID:', id);
      console.log('updateOrder - Update data:', updateData);
      
      const order = await Order.findById(id);
      
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found',
        });
      }
      
      // Update order
      const updatedOrder = await Order.findByIdAndUpdate(
        id,
        updateData,
        { new: true }
      );
      
      res.json({
        success: true,
        message: 'Order updated successfully',
        data: updatedOrder,
      });
    } catch (error) {
      console.error('Update order error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Admin: Confirm cash payment (for cash payment method only)
  // PUT /api/orders/:id/confirm-payment
  static async confirmPayment(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      
      // Check if user is admin or pharmacist
      if (req.user?.role !== 'admin' && req.user?.role !== 'pharmacist') {
        return res.status(403).json({
          success: false,
          message: 'Only admin or pharmacist can confirm payment',
        });
      }
      
      const order = await Order.findById(id);
      
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found',
        });
      }
      
      // Only allow confirming payment for cash payment method
      // Online payments (momo/zalopay) are auto-confirmed via callback
      if (order.paymentMethod !== 'cash') {
        return res.status(400).json({
          success: false,
          message: `Payment confirmation is only needed for cash payment. This order uses ${order.paymentMethod} which is auto-confirmed.`,
        });
      }
      
      // Only allow confirming if payment status is pending
      if (order.paymentStatus !== 'pending') {
        return res.status(400).json({
          success: false,
          message: `Payment status is already ${order.paymentStatus}. Cannot confirm payment.`,
        });
      }
      
      // Confirm payment and update order status
      const oldStatus = order.status;
      const wasPending = order.paymentStatus === 'pending';
      order.paymentStatus = 'paid';
      order.status = 'confirmed';
      await order.save();
      
      console.log(`Order ${order.orderNumber} payment confirmed by admin/pharmacist`);
      
      // Earn P-Xu and loyalty points after payment is confirmed (only if it was just confirmed)
      if (wasPending) {
        await PaymentController.earnRewardsAfterPayment(order);
      }
      
      // Create notification for order status change
      await createOrderStatusNotification(order, oldStatus, order.status);

      // Emit real-time event for order status update
      if (order.userId) {
        // Emit via Socket.IO
        socketService.emitToUser(String(order.userId), 'order:status:updated', {
          orderId: order._id,
          orderNumber: order.orderNumber,
          status: order.status,
          message: `Đơn hàng ${order.orderNumber} đã được xác nhận`,
        });
        
        // Publish to Supabase real-time (if configured)
        await publishRealtimeEvent(
          `user:${order.userId}`,
          'order:status:updated',
          {
            orderId: order._id,
            orderNumber: order.orderNumber,
            status: order.status,
            message: `Đơn hàng ${order.orderNumber} đã được xác nhận`,
          }
        );
      }
      
      res.json({
        success: true,
        message: 'Thanh toán đã được xác nhận thành công. Đơn hàng sẽ được xử lý và giao trong thời gian sớm nhất.',
        data: order,
      });
    } catch (error) {
      console.error('Confirm payment error:', error);
      res.status(500).json({
        success: false,
        message: 'Đã xảy ra lỗi khi xác nhận thanh toán. Vui lòng thử lại sau hoặc liên hệ bộ phận chăm sóc khách hàng.',
      });
    }
  }

  // Update order status (authenticated - user can only cancel)
  static async updateOrderStatus(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      // Check if user is admin/pharmacist (can update any status) or regular user (can only cancel)
      const isAdmin = req.user?.role === 'admin' || req.user?.role === 'pharmacist';
      
      const order = await Order.findOne({ 
        _id: id, 
        ...(isAdmin ? {} : { userId: req.user!.id }) // Admin can update any order, users can only update their own
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found',
        });
      }

      // Validate status
      const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
      if (!validStatuses.includes(status)) {
        const statusText = {
          'pending': 'chờ xử lý',
          'confirmed': 'đã xác nhận',
          'processing': 'đang xử lý',
          'shipped': 'đang giao',
          'delivered': 'đã giao',
          'cancelled': 'đã hủy'
        };
        return res.status(400).json({
          success: false,
          message: `Trạng thái không hợp lệ. Các trạng thái hợp lệ: ${validStatuses.map(s => statusText[s as keyof typeof statusText] || s).join(', ')}.`,
        });
      }

      // Users can only cancel pending or confirmed orders (not yet processed/shipped)
      if (!isAdmin) {
        if (status !== 'cancelled' || (order.status !== 'pending' && order.status !== 'confirmed')) {
          return res.status(403).json({
            success: false,
            message: 'Bạn chỉ có thể hủy đơn hàng đang chờ xử lý hoặc đã xác nhận. Vui lòng liên hệ admin để cập nhật trạng thái khác.',
          });
        }
      }

      // Check if status is actually changing
      if (order.status === status) {
        const statusText = status === 'cancelled' ? 'đã hủy' : 
                          status === 'delivered' ? 'đã giao' :
                          status === 'pending' ? 'đang chờ xử lý' :
                          status === 'confirmed' ? 'đã xác nhận' :
                          status === 'processing' ? 'đang xử lý' :
                          status === 'shipped' ? 'đang giao' : status;
        return res.status(400).json({
          success: false,
          message: `Đơn hàng đã ở trạng thái ${statusText}. Không cần cập nhật.`,
        });
      }

      const oldStatus = order.status;
      const isCancelling = oldStatus !== 'cancelled' && status === 'cancelled';
      
      // If cancelling order, release stock back to inventory
      if (isCancelling) {
        try {
          // Get order items
          const orderItems = await OrderItem.find({ orderId: order._id })
            .select('productId quantity')
            .lean();
          
          if (orderItems.length > 0) {
            // Prepare stock items for release
            const stockItemsToRelease = orderItems.map((item: any) => ({
              productId: item.productId,
              quantity: item.quantity
            }));
            
            // Release stock (increase stock quantity)
            await StockService.releaseStock(stockItemsToRelease);
            
            console.log(`Stock released for cancelled order ${order.orderNumber}:`, stockItemsToRelease);
          }
        } catch (stockError: any) {
          console.error('Error releasing stock for cancelled order:', {
            error: stockError?.message || stockError,
            stack: stockError?.stack,
            orderId: order._id,
            orderNumber: order.orderNumber,
          });
          // Continue with order cancellation even if stock release fails
          // Admin can manually adjust stock if needed
        }
      }
      
      order.status = status;
      await order.save();

      // Create notification for order status change
      await createOrderStatusNotification(order, oldStatus, status);

      // Emit real-time event for order status update
      try {
        if (order.userId) {
          // Emit via Socket.IO
          socketService.emitToUser(String(order.userId), 'order:status:updated', {
            orderId: order._id,
            orderNumber: order.orderNumber,
            status: order.status,
            message: `Đơn hàng ${order.orderNumber} đã được cập nhật`,
          });
          
          // Publish to Supabase real-time (if configured)
          await publishRealtimeEvent(
            `user:${order.userId}`,
            'order:status:updated',
            {
              orderId: order._id,
              orderNumber: order.orderNumber,
              status: order.status,
              message: `Đơn hàng ${order.orderNumber} đã được cập nhật`,
            }
          );
        }
      } catch (socketError: any) {
        console.error('Emit socket event error:', {
          error: socketError?.message || socketError,
          stack: socketError?.stack,
          userId: order.userId,
          orderId: order._id,
        });
        // Do not fail request if socket emit fails
      }

        const statusText = status === 'cancelled' ? 'đã hủy' : 
                          status === 'delivered' ? 'đã giao' :
                          status === 'pending' ? 'đang chờ xử lý' :
                          status === 'confirmed' ? 'đã xác nhận' :
                          status === 'processing' ? 'đang xử lý' :
                          status === 'shipped' ? 'đang giao' : status;
        
        res.json({
          success: true,
          message: status === 'cancelled' 
            ? `Đơn hàng đã được hủy thành công. Bạn có thể đặt lại đơn hàng này sau.`
            : `Trạng thái đơn hàng đã được cập nhật thành ${statusText}.`,
          data: order,
        });
    } catch (error: any) {
      console.error('Update order status error:', {
        error: error?.message || error,
        stack: error?.stack,
        orderId: req.params.id,
        userId: req.user?.id,
        status: req.body.status,
      });
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Get order statistics for user (authenticated)
  static async getUserOrderStats(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!.id;
      console.log('getUserOrderStats - User ID:', userId);
      console.log('getUserOrderStats - User ID type:', typeof userId);

      // Check if there are any orders with this userId (for debugging)
      const allOrdersCount = await Order.countDocuments({});
      const userOrdersCount = await Order.countDocuments({ userId: userId });
      const userOrdersCountString = await Order.countDocuments({ userId: String(userId) });
      const userOrdersCountObjectId = await Order.countDocuments({ userId: new mongoose.Types.ObjectId(userId) });
      
      console.log('getUserOrderStats - Debug counts:', {
        totalOrders: allOrdersCount,
        userOrdersCount,
        userOrdersCountString,
        userOrdersCountObjectId,
      });

      // Try multiple userId formats
      const stats = await Order.aggregate([
        { 
          $match: { 
            $or: [
              { userId: userId },
              { userId: String(userId) },
              { userId: new mongoose.Types.ObjectId(userId) }
            ]
          } 
        },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalAmount: { $sum: '$totalAmount' },
            totalSavings: { $sum: '$discountAmount' },
            pendingOrders: {
              $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
            },
            completedOrders: {
              $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
            },
            cancelledOrders: {
              $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
            }
          }
        }
      ]);

      console.log('getUserOrderStats - Aggregation result:', stats);

      const result = stats[0] || {
        totalOrders: 0,
        totalAmount: 0,
        totalSavings: 0,
        pendingOrders: 0,
        completedOrders: 0,
        cancelledOrders: 0
      };

      console.log('getUserOrderStats - Final result:', result);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Get user order stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Link guest order to user account
  static async linkGuestOrderToUser(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const { userId } = req.body;

      console.log('linkGuestOrderToUser - Order ID:', id);
      console.log('linkGuestOrderToUser - User ID:', userId);
      console.log('linkGuestOrderToUser - Authenticated User ID:', req.user?.id);

      // Find the guest order
      const order = await Order.findOne({ 
        _id: id,
        userId: null // Only guest orders
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Guest order not found',
        });
      }

      // Update the order with user ID
      const updatedOrder = await Order.findByIdAndUpdate(
        id,
        { userId: req.user!.id },
        { new: true }
      );

      console.log('linkGuestOrderToUser - Order linked successfully:', updatedOrder?._id);

      res.json({
        success: true,
        message: 'Guest order linked to user account successfully',
        data: updatedOrder,
      });
    } catch (error) {
      console.error('Link guest order to user error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Get user's most recent order with detailed medicine information
  static async getMostRecentOrder(req: AuthenticatedRequest, res: Response) {
    try {
      console.log('getMostRecentOrder - User ID:', req.user?.id);
      console.log('getMostRecentOrder - User role:', req.user?.role);
      
      const order = await Order.findOne({ userId: req.user!.id })
        .sort({ createdAt: -1 })
        .limit(1);

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'No orders found',
        });
      }

      // Get order items
      const items = await OrderItem.find({ orderId: order._id })
        .populate({
          path: 'productId',
          select: 'name imageUrl price unit description category'
        });

      // Format the response to include detailed medicine information
      const formattedOrder = {
        _id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        totalAmount: order.totalAmount,
        discountAmount: order.discountAmount,
        couponCode: order.couponCode,
        shippingAddress: order.shippingAddress,
        shippingPhone: order.shippingPhone,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        notes: order.notes,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        medicines: items.map((item: any) => ({
          _id: item._id,
          productId: item.productId._id,
          name: item.productId.name,
          imageUrl: item.productId.imageUrl,
          price: item.price,
          quantity: item.quantity,
          unit: item.productId.unit,
          description: item.productId.description,
          category: item.productId.category
        }))
      };

      res.json({
        success: true,
        data: formattedOrder,
      });
    } catch (error) {
      console.error('Get most recent order error:', error);
      res.status(500).json({
        success: false,
        message: 'Đã xảy ra lỗi khi cập nhật trạng thái đơn hàng. Vui lòng thử lại sau hoặc liên hệ bộ phận chăm sóc khách hàng.',
      });
    }
  }

  // Reorder from existing order - Add items to cart
  static async reorderFromOrder(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      console.log('reorderFromOrder - Order ID:', id);
      console.log('reorderFromOrder - User ID:', userId);

      // Validate ObjectId
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Mã đơn hàng không hợp lệ. Vui lòng kiểm tra lại.',
        });
      }

      // Find the order and verify it belongs to the user
      const order = await Order.findOne({ 
        _id: id,
        userId: userId 
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy đơn hàng hoặc đơn hàng không thuộc về bạn. Vui lòng kiểm tra lại mã đơn hàng.',
        });
      }

      // Validate order status - only allow reorder for delivered or cancelled orders
      if (order.status !== 'delivered' && order.status !== 'cancelled') {
        return res.status(400).json({
          success: false,
          message: `Không thể đặt lại đơn hàng. Chỉ có thể đặt lại đơn hàng đã giao (delivered) hoặc đã hủy (cancelled). Trạng thái hiện tại: ${order.status}`,
        });
      }

      // Get order items from OrderItem collection
      // First get raw items to preserve original productId
      const rawOrderItems = await OrderItem.find({ orderId: order._id }).lean();
      
      // Then populate to get product details
      const orderItems = await OrderItem.find({ orderId: order._id })
        .populate({
          path: 'productId',
          select: 'name price inStock stockQuantity'
        });
      
      // Merge raw productId with populated data
      const orderItemsWithRawId = orderItems.map((item: any, index: number) => {
        const rawItem = rawOrderItems[index];
        return {
          ...item.toObject ? item.toObject() : item,
          originalProductId: rawItem?.productId || item.productId
        };
      });

      if (orderItems.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Đơn hàng này không có sản phẩm nào để đặt lại. Vui lòng kiểm tra lại đơn hàng.',
        });
      }

      console.log('reorderFromOrder - Found orderItems:', orderItemsWithRawId.length);
      console.log('reorderFromOrder - OrderItems details:', orderItemsWithRawId.map((item: any) => ({
        _id: item._id,
        productId: item.productId,
        originalProductId: item.originalProductId,
        productIdType: typeof item.productId,
        quantity: item.quantity
      })));

      // Filter out items without valid productId - use originalProductId if productId is null after populate
      const validOrderItems = orderItemsWithRawId.filter((item: any) => {
        // Use originalProductId if productId was null after populate (product deleted)
        const productIdToCheck = item.originalProductId || item.productId;
        
        if (!productIdToCheck) {
          console.log('Filtering out orderItem with null productId:', item._id);
          return false;
        }
        
        // Check if productId is a valid ObjectId (either string or ObjectId)
        const productIdValue = typeof productIdToCheck === 'object' && productIdToCheck._id 
          ? productIdToCheck._id 
          : (typeof productIdToCheck === 'object' ? productIdToCheck : productIdToCheck);
          
        if (!productIdValue || !mongoose.Types.ObjectId.isValid(productIdValue)) {
          console.log('Filtering out orderItem with invalid productId:', item._id, productIdValue);
          return false;
        }
        return true;
      });

      if (validOrderItems.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Không thể đặt lại đơn hàng. Tất cả sản phẩm trong đơn hàng này không còn tồn tại trong hệ thống (có thể đã bị xóa).',
        });
      }

      console.log('reorderFromOrder - Valid orderItems after filtering:', validOrderItems.length);

      // Add items to cart
      const addedItems = [];
      const skippedItems = [];

      for (const orderItem of validOrderItems) {
        // Use originalProductId if productId is null (product was deleted but orderItem still has reference)
        const productId = orderItem.originalProductId || orderItem.productId;
        const populatedProduct = orderItem.productId; // May be null if product deleted
        
        // Double check - should not happen after filtering, but just in case
        if (!productId) {
          console.log('Skipping orderItem - no productId (should not happen):', orderItem._id);
          skippedItems.push({
            productId: null,
            reason: 'Product ID is null or invalid'
          });
          continue;
        }

        // Get product details - prefer populated product if available, otherwise fetch
        let product: any = null;
        let productIdToUse: any = null;
        
        // If product was populated successfully, use it
        if (populatedProduct && typeof populatedProduct === 'object' && populatedProduct._id) {
          product = populatedProduct;
          productIdToUse = populatedProduct._id;
        } else {
          // Product was not found during populate (deleted) or not populated, fetch it
          if (typeof productId === 'object' && productId.toString) {
            // It's an ObjectId object
            productIdToUse = productId;
          } else {
            // It's a string or needs conversion
            productIdToUse = typeof productId === 'string' 
              ? new mongoose.Types.ObjectId(productId)
              : productId;
          }
          product = await Product.findById(productIdToUse);
        }

        if (!product) {
          console.log('Skipping orderItem - product not found in database:', {
            orderItemId: orderItem._id,
            productId: productId,
            productIdToUse: productIdToUse,
            productIdType: typeof productId
          });
          skippedItems.push({
            productId: productIdToUse ? String(productIdToUse) : null,
            reason: 'Product not found in database'
          });
          continue;
        }

        // Check if product is in stock
        if (!product.inStock || product.stockQuantity <= 0) {
          console.log('Skipping orderItem - out of stock:', product.name);
          skippedItems.push({
            productId: product._id,
            productName: product.name,
            reason: 'Product out of stock'
          });
          continue;
        }

        // Ensure we have a valid ObjectId for product
        const productObjectId = typeof product._id === 'object' ? product._id : new mongoose.Types.ObjectId(product._id);

        // Check if item already exists in cart
        const existingCartItem = await Cart.findOne({ 
          userId: userId, 
          productId: productObjectId 
        });

        if (existingCartItem) {
          // Update quantity (add to existing quantity, but don't exceed stock)
          const newQuantity = Math.min(
            existingCartItem.quantity + orderItem.quantity,
            product.stockQuantity
          );
          existingCartItem.quantity = newQuantity;
          await existingCartItem.save();
          console.log('Updated cart item:', product.name, 'quantity:', newQuantity);
          addedItems.push({
            productId: product._id,
            productName: product.name,
            quantity: newQuantity,
            action: 'updated'
          });
        } else {
          // Add new item to cart
          const quantityToAdd = Math.min(orderItem.quantity, product.stockQuantity);
          const newCartItem = await Cart.create({
            userId: userId,
            productId: productObjectId,
            quantity: quantityToAdd
          });
          console.log('Added cart item:', product.name, 'quantity:', quantityToAdd, 'cartItemId:', newCartItem._id);
          addedItems.push({
            productId: product._id,
            productName: product.name,
            quantity: quantityToAdd,
            action: 'added'
          });
        }
      }

      console.log('Reorder completed:', {
        totalOrderItems: orderItems.length,
        addedCount: addedItems.length,
        skippedCount: skippedItems.length
      });

      // Build detailed message
      let message = '';
      if (addedItems.length > 0 && skippedItems.length === 0) {
        // All items added successfully
        message = `Đã thêm ${addedItems.length} sản phẩm vào giỏ hàng thành công`;
      } else if (addedItems.length > 0 && skippedItems.length > 0) {
        // Some items added, some skipped
        const outOfStockCount = skippedItems.filter((item: any) => item.reason === 'Product out of stock').length;
        const notFoundCount = skippedItems.filter((item: any) => item.reason?.includes('not found')).length;
        
        let skipDetails = [];
        if (outOfStockCount > 0) {
          skipDetails.push(`${outOfStockCount} sản phẩm hết hàng`);
        }
        if (notFoundCount > 0) {
          skipDetails.push(`${notFoundCount} sản phẩm không tìm thấy`);
        }
        
        message = `Đã thêm ${addedItems.length} sản phẩm vào giỏ hàng. ${skipDetails.join(', ')}.`;
      } else if (addedItems.length === 0 && skippedItems.length > 0) {
        // No items added
        const outOfStockCount = skippedItems.filter((item: any) => item.reason === 'Product out of stock').length;
        const notFoundCount = skippedItems.filter((item: any) => item.reason?.includes('not found')).length;
        
        let skipDetails = [];
        if (outOfStockCount > 0) {
          skipDetails.push(`${outOfStockCount} sản phẩm hết hàng`);
        }
        if (notFoundCount > 0) {
          skipDetails.push(`${notFoundCount} sản phẩm không tìm thấy`);
        }
        
        message = `Không thể thêm sản phẩm vào giỏ hàng. ${skipDetails.join(', ')}.`;
      } else {
        message = 'Không có sản phẩm nào để thêm vào giỏ hàng';
      }

      // Return response with summary
      res.json({
        success: true,
        message: message,
        data: {
          order: order,
          addedItems: addedItems,
          skippedItems: skippedItems.length > 0 ? skippedItems : undefined,
          summary: {
            totalItems: orderItems.length,
            addedCount: addedItems.length,
            skippedCount: skippedItems.length,
            outOfStockCount: skippedItems.filter((item: any) => item.reason === 'Product out of stock').length,
            notFoundCount: skippedItems.filter((item: any) => item.reason?.includes('not found')).length
          }
        }
      });
    } catch (error: any) {
      console.error('Reorder from order error:', error);
      res.status(500).json({
        success: false,
        message: 'Đã xảy ra lỗi khi đặt lại đơn hàng. Vui lòng thử lại sau hoặc liên hệ bộ phận chăm sóc khách hàng nếu vấn đề vẫn tiếp tục.',
        ...(process.env.NODE_ENV === 'development' && { error: error.message }),
      });
    }
  }
}
