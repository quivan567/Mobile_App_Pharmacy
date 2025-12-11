import { Response } from 'express';
import { Order } from '../models/schema';
import { AuthenticatedRequest } from '../middleware/auth';

export class HealthSpendingController {
  // Get health spending statistics
  static async getHealthSpendingStats(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: 'startDate and endDate are required'
        });
      }

      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      
      // Set end date to end of day
      end.setHours(23, 59, 59, 999);

      // Query orders within date range
      const orders = await Order.find({
        userId,
        createdAt: {
          $gte: start,
          $lte: end
        },
        // Only count completed/paid orders
        $or: [
          { paymentStatus: 'paid' },
          { status: { $in: ['delivered', 'completed'] } }
        ]
      })
        .sort({ createdAt: 1 })
        .lean();

      // Calculate total spending and order count
      const totalSpending = orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
      const totalOrders = orders.length;

      // Group by month for chart data
      const monthlyData: { [key: string]: { total: number; count: number } } = {};
      
      orders.forEach(order => {
        const date = new Date(order.createdAt);
        const monthKey = `${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
        
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = { total: 0, count: 0 };
        }
        
        monthlyData[monthKey].total += order.totalAmount || 0;
        monthlyData[monthKey].count += 1;
      });

      // Generate chart data for all months in the selected date range
      // This ensures all months are shown even if they have no orders
      const chartData: Array<{ month: string; total: number; count: number }> = [];
      
      // Start from the first day of the start month
      const startMonth = new Date(start.getFullYear(), start.getMonth(), 1);
      // End at the last day of the end month
      const endMonth = new Date(end.getFullYear(), end.getMonth() + 1, 0);
      
      // Iterate through each month in the range
      let currentMonth = new Date(startMonth);
      
      while (currentMonth <= endMonth) {
        const monthKey = `${String(currentMonth.getMonth() + 1).padStart(2, '0')}/${currentMonth.getFullYear()}`;
        
        // Use actual data if available, otherwise use zero values
        chartData.push({
          month: monthKey,
          total: monthlyData[monthKey]?.total || 0,
          count: monthlyData[monthKey]?.count || 0
        });
        
        // Move to next month
        currentMonth.setMonth(currentMonth.getMonth() + 1);
      }

      // Get order details for spending details section
      const orderDetails = orders.map(order => ({
        _id: order._id,
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
        createdAt: order.createdAt,
        status: order.status,
        paymentStatus: order.paymentStatus
      }));

      res.json({
        success: true,
        data: {
          totalSpending,
          totalOrders,
          orders: orderDetails,
          chartData
        }
      });
    } catch (error) {
      console.error('Get health spending stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get health status message (simplified version)
  static async getHealthStatus(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!.id;
      
      // Calculate total spending in last 12 months
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

      const orders = await Order.find({
        userId,
        createdAt: { $gte: twelveMonthsAgo },
        $or: [
          { paymentStatus: 'paid' },
          { status: { $in: ['delivered', 'completed'] } }
        ]
      }).lean();

      const totalSpending = orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);

      // Simple health status logic (can be customized)
      let healthStatus = 'good'; // 'good', 'moderate', 'needs_attention'
      let message = 'Bạn nằm trong nhóm có sức khỏe tốt. Hãy tiếp tục duy trì lối sống lành mạnh và kiểm tra sức khỏe định kỳ để giữ vững phong độ.';

      if (totalSpending === 0) {
        message = 'Bạn chưa có đơn hàng nào. Hãy bắt đầu chăm sóc sức khỏe của mình ngay hôm nay!';
      }

      res.json({
        success: true,
        data: {
          status: healthStatus,
          message
        }
      });
    } catch (error) {
      console.error('Get health status error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}

