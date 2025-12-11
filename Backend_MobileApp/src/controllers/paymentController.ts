import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { MomoService, MomoCallbackData } from '../services/momoService';
import { Order, LoyaltyAccount, LoyaltyTransaction, IOrder } from '../models/schema';
import { PPointController } from './pPointController';

export class PaymentController {
  /**
   * Create MoMo payment request
   * POST /api/payment/momo/create
   */
  static async createMomoPayment(req: Request, res: Response) {
    try {
      const { orderId, amount, orderInfo } = req.body;

      if (!orderId || !amount) {
        return res.status(400).json({
          success: false,
          message: 'Order ID and amount are required',
        });
      }

      // Verify order exists
      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found',
        });
      }

      // If user is authenticated, verify order belongs to them
      const authReq = req as AuthenticatedRequest;
      if (authReq.user?.id && order.userId && order.userId.toString() !== authReq.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized access to this order',
        });
      }

      // Debug: Log payment amount verification
      console.log('=== PaymentController: Verifying payment amount ===', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        orderTotalAmount: order.totalAmount,
        requestedAmount: amount,
        amountDifference: Math.abs(order.totalAmount - amount),
      });

      // Verify order amount matches (allow small difference due to rounding)
      const amountDifference = Math.abs(order.totalAmount - amount);
      if (amountDifference > 1) { // Allow 1 VND difference for rounding
        console.error('=== PaymentController: Amount mismatch ===', {
          orderTotalAmount: order.totalAmount,
          requestedAmount: amount,
          difference: amountDifference,
        });
        return res.status(400).json({
          success: false,
          message: `Amount mismatch: Order total is ${order.totalAmount} but payment amount is ${amount}`,
        });
      }

      // Verify payment method is momo
      if (order.paymentMethod !== 'momo') {
        return res.status(400).json({
          success: false,
          message: 'Order payment method is not MoMo',
        });
      }

      console.log('Creating MoMo payment request:', {
        orderId: order.orderNumber,
        amount: amount,
        orderInfo: orderInfo || `Thanh toán đơn hàng ${order.orderNumber}`,
      });

      // Create MoMo payment request
      const momoResponse = await MomoService.createPaymentRequest({
        orderId: order.orderNumber,
        orderInfo: orderInfo || `Thanh toán đơn hàng ${order.orderNumber}`,
        amount: amount,
        extraData: orderId, // Store order ID in extraData for callback
      });

      console.log('=== PaymentController: MoMo payment response received ===', {
        resultCode: momoResponse.resultCode,
        message: momoResponse.message,
        momoOrderId: momoResponse.orderId,
        momoRequestId: momoResponse.requestId,
        hasPayUrl: !!momoResponse.payUrl,
        hasQrCodeUrl: !!momoResponse.qrCodeUrl,
        hasDeeplink: !!momoResponse.deeplink,
        payUrl: momoResponse.payUrl,
        deeplink: momoResponse.deeplink,
        amount: amount,
        orderTotalAmount: order.totalAmount,
      });

      // Save MoMo's orderId and requestId to order for later querying
      // These are needed to query payment status from MoMo
      order.momoOrderId = momoResponse.orderId;
      order.momoRequestId = momoResponse.requestId;
      await order.save();

      console.log('=== PaymentController: Saved MoMo orderId and requestId to order ===', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        momoOrderId: order.momoOrderId,
        momoRequestId: order.momoRequestId,
      });

      // Check if payment URL is available
      if (!momoResponse.payUrl && !momoResponse.qrCodeUrl && !momoResponse.deeplink) {
        return res.status(500).json({
          success: false,
          message: 'MoMo không trả về URL thanh toán. Vui lòng thử lại.',
        });
      }

      res.json({
        success: true,
        data: {
          payUrl: momoResponse.payUrl,
          qrCodeUrl: momoResponse.qrCodeUrl,
          deeplink: momoResponse.deeplink,
          orderId: order.orderNumber,
        },
      });
    } catch (error: any) {
      console.error('Create MoMo payment error:', error);
      console.error('Error stack:', error.stack);
      
      // Extract error message
      let errorMessage = 'Không thể tạo yêu cầu thanh toán MoMo';
      if (error.message) {
        errorMessage = error.message;
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }

      // Determine status code based on error type
      let statusCode = 500;
      if (error.resultCode) {
        // MoMo API error
        statusCode = 400;
      } else if (error.response?.status) {
        statusCode = error.response.status;
      }

      res.status(statusCode).json({
        success: false,
        message: errorMessage,
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      });
    }
  }

  /**
   * Handle MoMo callback (IPN)
   * POST /api/payment/momo/callback
   */
  static async handleMomoCallback(req: Request, res: Response) {
    try {
      const callbackData: MomoCallbackData = req.body;

      console.log('=== PaymentController: MoMo callback received ===', {
        resultCode: callbackData.resultCode,
        orderId: callbackData.orderId,
        extraData: callbackData.extraData,
        amount: callbackData.amount,
        message: callbackData.message,
        fullBody: JSON.stringify(req.body),
      });

      // CRITICAL: Verify signature quickly (this is fast, just hash comparison)
      // MoMo needs a fast response (within 2 seconds) to show success message in app
      const isValid = MomoService.verifySignature(callbackData);
      if (!isValid) {
        console.error('=== PaymentController: Invalid MoMo callback signature ===', {
          orderId: callbackData.orderId,
          extraData: callbackData.extraData,
          resultCode: callbackData.resultCode,
          amount: callbackData.amount,
          timestamp: new Date().toISOString(),
          fullCallbackData: JSON.stringify(callbackData),
        });
        // Still return 200 to MoMo to avoid blocking success message
        return res.status(200).json({
          resultCode: 0,
          message: 'Success'
        });
      }

      console.log('=== PaymentController: Signature verified successfully ===');
      
      // CRITICAL: Return response to MoMo IMMEDIATELY (within 2 seconds)
      // MoMo app shows "Payment successful" ONLY if callback returns 200 OK quickly
      // Response format: JSON with resultCode (MoMo expects this format)
      const responseData = {
        resultCode: 0,
        message: 'Success'
      };
      
      console.log('=== PaymentController: Returning success response to MoMo (IMMEDIATE) ===', {
        resultCode: callbackData.resultCode,
        timestamp: new Date().toISOString(),
      });
      
      // Send response IMMEDIATELY to MoMo (before processing logic)
      // This triggers MoMo app to show "Payment successful" message
      res.status(200).json(responseData);

      // Process payment logic in background (after response sent)
      // This ensures MoMo receives response quickly while we handle database operations
      setImmediate(async () => {
        try {
          // Find order by extraData (contains database orderId)
          // MoMo orderId is different from database orderNumber
          // We store database orderId in extraData when creating payment request
          let order;
          
          if (callbackData.extraData) {
            console.log('=== PaymentController: Searching order by extraData ===', {
              extraData: callbackData.extraData,
            });
            order = await Order.findById(callbackData.extraData);
            if (order) {
              console.log('=== PaymentController: Order found by extraData ===', {
                orderId: order._id,
                orderNumber: order.orderNumber,
                currentPaymentStatus: order.paymentStatus,
                currentStatus: order.status,
              });
            }
          }
          
          // Fallback: try to find by orderNumber if extraData not found
          if (!order) {
            console.log('=== PaymentController: Order not found by extraData, trying orderNumber ===', {
              momoOrderId: callbackData.orderId,
            });
            order = await Order.findOne({
              orderNumber: callbackData.orderId,
            });
            if (order) {
              console.log('=== PaymentController: Order found by orderNumber ===', {
                orderId: order._id,
                orderNumber: order.orderNumber,
                currentPaymentStatus: order.paymentStatus,
                currentStatus: order.status,
              });
            }
          }

          if (!order) {
            console.error('=== PaymentController: Order not found for MoMo callback ===', {
              momoOrderId: callbackData.orderId,
              extraData: callbackData.extraData,
              resultCode: callbackData.resultCode,
              timestamp: new Date().toISOString(),
            });
            return;
          }

          // Amount verification in callback (security check)
          const amountDifference = Math.abs(order.totalAmount - callbackData.amount);
          if (amountDifference > 1) {
            console.error('=== PaymentController: Amount mismatch in callback ===', {
              orderId: order._id,
              orderNumber: order.orderNumber,
              orderTotalAmount: order.totalAmount,
              callbackAmount: callbackData.amount,
              difference: amountDifference,
              resultCode: callbackData.resultCode,
              timestamp: new Date().toISOString(),
            });
          }

          // Update order payment status based on resultCode
          // resultCode = 0: Success - Auto confirm payment and order for online payments
          // resultCode != 0: Failed
          if (callbackData.resultCode === 0) {
            // Idempotency check - prevent duplicate processing
            if (order.paymentStatus === 'paid') {
              console.log('=== PaymentController: Payment already processed (idempotency check) ===', {
                orderId: order._id,
                orderNumber: order.orderNumber,
                currentPaymentStatus: order.paymentStatus,
                currentStatus: order.status,
                resultCode: callbackData.resultCode,
                timestamp: new Date().toISOString(),
              });
              return;
            }

            // Track if payment status is changing from pending (for rewards processing)
            const wasPending = order.paymentStatus === 'pending';

            console.log('=== PaymentController: Payment successful, updating order ===', {
              orderId: order._id,
              orderNumber: order.orderNumber,
              oldPaymentStatus: order.paymentStatus,
              oldStatus: order.status,
              wasPending,
              amount: callbackData.amount,
              orderTotalAmount: order.totalAmount,
            });

            // For online payments (momo/zalopay), auto-confirm payment and order
            order.paymentStatus = 'paid';
            order.status = 'confirmed';
            await order.save();

            console.log('=== PaymentController: Order updated successfully ===', {
              orderId: order._id,
              orderNumber: order.orderNumber,
              newPaymentStatus: order.paymentStatus,
              newStatus: order.status,
            });
            
            // Process rewards in background ONLY if payment status just changed from pending
            if (wasPending) {
              try {
                // Re-fetch order to ensure we have latest data
                const updatedOrder = await Order.findById(order._id);
                if (updatedOrder && updatedOrder.paymentStatus === 'paid') {
                  await PaymentController.earnRewardsAfterPayment(updatedOrder);
                  console.log('=== PaymentController: Rewards earned successfully (background) ===', {
                    orderId: updatedOrder._id,
                    orderNumber: updatedOrder.orderNumber,
                  });
                } else {
                  console.warn('=== PaymentController: Skipping rewards - order status changed ===', {
                    orderId: order._id,
                    currentStatus: updatedOrder?.paymentStatus,
                  });
                }
              } catch (rewardError: any) {
                console.error('=== PaymentController: Error earning rewards (background) ===', {
                  orderId: order._id,
                  error: rewardError.message,
                  stack: rewardError.stack,
                });
              }
            } else {
              console.log('=== PaymentController: Skipping rewards - payment was not pending ===', {
                orderId: order._id,
                previousStatus: order.paymentStatus,
              });
            }
          } else {
            console.log('=== PaymentController: Payment failed, updating order ===', {
              orderId: order._id,
              orderNumber: order.orderNumber,
              resultCode: callbackData.resultCode,
              message: callbackData.message,
              oldPaymentStatus: order.paymentStatus,
            });

            order.paymentStatus = 'failed';
            await order.save();

            console.log('=== PaymentController: Order marked as failed ===', {
              orderId: order._id,
              orderNumber: order.orderNumber,
              newPaymentStatus: order.paymentStatus,
            });
          }
        } catch (error: any) {
          console.error('=== PaymentController: Background processing error ===', {
            error: error.message,
            stack: error.stack,
            callbackData: req.body,
          });
        }
      });
    } catch (error: any) {
      console.error('=== PaymentController: MoMo callback error ===', {
        error: error.message,
        stack: error.stack,
        callbackData: req.body,
      });
      // IMPORTANT: Still return 200 OK to MoMo even on error
      // Returning 500 might prevent MoMo from showing success message
      res.status(200).json({
        resultCode: 0,
        message: 'Error processed'
      });
    }
  }

  /**
   * Query payment status
   * GET /api/payment/momo/status/:orderId
   */
  static async getPaymentStatus(req: Request, res: Response) {
    try {
      const { orderId } = req.params;

      // Try to find by orderNumber first (for backward compatibility)
      let order: IOrder | null = await Order.findOne({ orderNumber: orderId });
      
      // If not found by orderNumber, try by database ID
      if (!order) {
        order = await Order.findById(orderId);
      }

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found',
        });
      }

      // If payment is already confirmed, return status
      if (order.paymentStatus === 'paid') {
        return res.json({
          success: true,
          data: {
            orderId: order.orderNumber,
            orderDbId: (order._id as any).toString(), // Add database order ID for frontend navigation
            paymentStatus: order.paymentStatus,
            orderStatus: order.status,
          },
        });
      }

      console.log('=== PaymentController: Querying MoMo payment status ===', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        momoOrderId: order.momoOrderId,
        momoRequestId: order.momoRequestId,
        currentPaymentStatus: order.paymentStatus,
      });

      // IMPROVEMENT 4: Improved fallback logic - don't query if MoMo IDs are missing
      // Using orderNumber and Date.now() as fallback is unreliable
      if (!order.momoOrderId || !order.momoRequestId) {
        console.warn('=== PaymentController: Cannot query MoMo - missing orderId or requestId ===', {
          orderId: order._id,
          orderNumber: order.orderNumber,
          hasMomoOrderId: !!order.momoOrderId,
          hasMomoRequestId: !!order.momoRequestId,
          currentPaymentStatus: order.paymentStatus,
        });
        // Return current status without querying MoMo
        return res.json({
          success: true,
          data: {
            orderId: order.orderNumber,
            orderDbId: (order._id as any).toString(),
            paymentStatus: order.paymentStatus,
            orderStatus: order.status,
            message: 'Cannot query MoMo payment status - missing MoMo order IDs. Please check payment via MoMo app.',
          },
        });
      }

      // Use saved MoMo orderId and requestId (guaranteed to exist at this point)
      const momoOrderId = order.momoOrderId;
      const momoRequestId = order.momoRequestId;
      
      console.log('=== PaymentController: Querying MoMo with ===', {
        momoOrderId,
        momoRequestId,
        usingSavedIds: true,
      });

      // Query MoMo for latest status
      const momoStatus = await MomoService.queryPaymentStatus(
        momoOrderId,
        momoRequestId
      );

      console.log('=== PaymentController: MoMo payment status query result ===', {
        orderNumber: order.orderNumber,
        resultCode: momoStatus.resultCode,
        message: momoStatus.message,
        currentPaymentStatus: order.paymentStatus,
      });

      // Update order if payment is confirmed
      // For online payments (momo/zalopay), auto-confirm payment and order
      if (momoStatus.resultCode === 0) {
        // IMPROVEMENT 2: Idempotency check - prevent duplicate processing
        // Refetch order to get latest status (could be updated by callback)
        const latestOrder = await Order.findById(order._id);
        if (!latestOrder) {
          return res.status(404).json({
            success: false,
            message: 'Order not found',
          });
        }
        
        // Check if payment is already confirmed (could be updated by callback)
        if (latestOrder.paymentStatus === 'paid') {
          console.log('=== PaymentController: Payment already confirmed (idempotency check) ===', {
            orderId: latestOrder._id,
            orderNumber: latestOrder.orderNumber,
            currentPaymentStatus: latestOrder.paymentStatus,
            currentStatus: latestOrder.status,
          });
          // Return current status without updating
          return res.json({
            success: true,
            data: {
              orderId: latestOrder.orderNumber,
              orderDbId: (latestOrder._id as any).toString(),
              paymentStatus: latestOrder.paymentStatus,
              orderStatus: latestOrder.status,
              momoStatus: momoStatus,
            },
          });
        }
        
        // Use latestOrder for updates
        order = latestOrder;

        const wasPending = order.paymentStatus === 'pending';
        
        console.log('=== PaymentController: Payment confirmed via MoMo query, updating order ===', {
          orderId: order._id,
          orderNumber: order.orderNumber,
          oldPaymentStatus: order.paymentStatus,
          oldStatus: order.status,
          wasPending,
        });

        order.paymentStatus = 'paid';
        order.status = 'confirmed';
        await order.save();

        console.log('=== PaymentController: Order updated successfully ===', {
          orderId: order._id,
          orderNumber: order.orderNumber,
          newPaymentStatus: order.paymentStatus,
          newStatus: order.status,
        });

        // Earn P-Xu and loyalty points after payment is confirmed (only if it was just confirmed)
        if (wasPending) {
          try {
            await PaymentController.earnRewardsAfterPayment(order);
            console.log('=== PaymentController: Rewards earned successfully ===');
          } catch (rewardError: any) {
            console.error('=== PaymentController: Error earning rewards ===', rewardError);
            // Don't fail the request if reward earning fails
          }
        }
      } else {
        console.log('=== PaymentController: Payment still pending or failed ===', {
          orderNumber: order.orderNumber,
          resultCode: momoStatus.resultCode,
          message: momoStatus.message,
        });
      }

      res.json({
        success: true,
        data: {
          orderId: order.orderNumber,
          orderDbId: (order._id as any).toString(), // Add database order ID for frontend navigation
          paymentStatus: order.paymentStatus,
          orderStatus: order.status,
          momoStatus: momoStatus,
        },
      });
    } catch (error: any) {
      console.error('Get payment status error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get payment status',
      });
    }
  }

  /**
   * Helper function to earn P-Xu and loyalty points after payment is confirmed
   */
  static async earnRewardsAfterPayment(order: any) {
    try {
      if (!order.userId) {
        return; // Guest order, no rewards
      }

      const userId = String(order.userId);
      
      // Calculate amount for rewards (totalAmount includes shipping, but we use subtotal before shipping)
      // totalAmount = subtotal - discount + shippingFee
      // So subtotal = totalAmount - shippingFee
      const subtotal = order.totalAmount - (order.shippingFee || 0);

      // Earn P-Xu from order (5,000 VND = 1 P-Xu)
      // Only earn if order amount > 0
      if (subtotal > 0) {
        try {
          await PPointController.earnFromOrder(userId, String(order._id), subtotal);
        } catch (pPointError: any) {
          console.error('Error earning P-Xu after payment:', pPointError);
          // Don't fail if P-Xu earning fails
        }
      }

      // Earn loyalty points (10,000 VND = 1 point)
      // Only earn if order amount > 0
      if (subtotal > 0) {
        try {
          let account = await LoyaltyAccount.findOne({ userId: order.userId });
          if (!account) {
            account = await LoyaltyAccount.create({ 
              userId: order.userId, 
              pointsBalance: 0, 
              lifetimePoints: 0 
            });
          }

          const earnPoints = Math.floor(subtotal / 10000);
          if (earnPoints > 0) {
            account.pointsBalance += earnPoints;
            account.lifetimePoints += earnPoints;
            await account.save();
            
            await LoyaltyTransaction.create({
              userId: order.userId,
              orderId: order._id,
              type: 'earn',
              points: earnPoints,
              note: 'Earn points from order (payment confirmed)'
            });
          }
        } catch (loyaltyError: any) {
          console.error('Error earning loyalty points after payment:', loyaltyError);
          // Don't fail if loyalty earning fails
        }
      }
    } catch (error: any) {
      console.error('Error in earnRewardsAfterPayment:', error);
      // Don't throw - this is a bonus feature, shouldn't affect payment processing
    }
  }
}

