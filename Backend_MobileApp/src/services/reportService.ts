import { Invoice, Product, Category, Import, Export, StockMovement, User } from '../models/schema.js';
import mongoose from 'mongoose';

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface SalesReportData {
  totalRevenue: number;
  totalInvoices: number;
  totalItemsSold: number;
  averageOrderValue: number;
  revenueByDay: Array<{
    date: string;
    revenue: number;
    invoices: number;
  }>;
  revenueByMonth: Array<{
    month: string;
    revenue: number;
    invoices: number;
  }>;
  topProducts: Array<{
    productId: string;
    productName: string;
    category: string;
    quantitySold: number;
    revenue: number;
    percentage: number;
  }>;
  paymentMethodStats: Array<{
    method: string;
    count: number;
    amount: number;
    percentage: number;
  }>;
}

export interface InventoryReportData {
  totalProducts: number;
  totalStockValue: number;
  lowStockProducts: number;
  outOfStockProducts: number;
  productsByCategory: Array<{
    categoryId: string;
    categoryName: string;
    productCount: number;
    stockValue: number;
    percentage: number;
  }>;
  stockMovements: Array<{
    date: string;
    imports: number;
    exports: number;
    adjustments: number;
    netChange: number;
  }>;
  topMovingProducts: Array<{
    productId: string;
    productName: string;
    totalImports: number;
    totalExports: number;
    netMovement: number;
  }>;
}

export interface ProfitLossData {
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  grossProfitMargin: number;
  operatingExpenses: number;
  netProfit: number;
  netProfitMargin: number;
  revenueByCategory: Array<{
    categoryId: string;
    categoryName: string;
    revenue: number;
    cost: number;
    profit: number;
    margin: number;
  }>;
}

export interface DashboardData {
  sales: {
    todayRevenue: number;
    todayInvoices: number;
    monthlyRevenue: number;
    monthlyInvoices: number;
    revenueGrowth: number;
    invoiceGrowth: number;
  };
  inventory: {
    totalProducts: number;
    totalStockValue: number;
    lowStockCount: number;
    outOfStockCount: number;
  };
  recent: {
    recentInvoices: any[];
    recentImports: any[];
    recentExports: any[];
    lowStockProducts: any[];
  };
  charts: {
    dailyRevenue: Array<{ date: string; revenue: number }>;
    topProducts: Array<{ name: string; revenue: number }>;
    categoryDistribution: Array<{ name: string; value: number }>;
  };
}

export class ReportService {
  /**
   * Get sales report for a date range
   */
  static async getSalesReport(dateRange: DateRange): Promise<SalesReportData> {
    const { startDate, endDate } = dateRange;

    // Get all invoices in date range
    const invoices = await Invoice.find({
      createdAt: { $gte: startDate, $lte: endDate },
      status: 'completed'
    }).populate('items.productId', 'name categoryId').lean();

    // Calculate basic metrics
    const totalRevenue = invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0);
    const totalInvoices = invoices.length;
    const totalItemsSold = invoices.reduce((sum, invoice) => 
      sum + invoice.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0
    );
    const averageOrderValue = totalInvoices > 0 ? totalRevenue / totalInvoices : 0;

    // Revenue by day
    const revenueByDay = await this.getRevenueByDay(startDate, endDate);

    // Revenue by month
    const revenueByMonth = await this.getRevenueByMonth(startDate, endDate);

    // Top products
    const topProducts = await this.getTopProducts(startDate, endDate);

    // Payment method stats
    const paymentMethodStats = await this.getPaymentMethodStats(startDate, endDate);

    return {
      totalRevenue,
      totalInvoices,
      totalItemsSold,
      averageOrderValue,
      revenueByDay,
      revenueByMonth,
      topProducts,
      paymentMethodStats
    };
  }

  /**
   * Get inventory report
   */
  static async getInventoryReport(): Promise<InventoryReportData> {
    // Get all products with categories
    const products = await Product.find({ inStock: true })
      .populate('categoryId', 'name')
      .lean();

    // Calculate basic metrics
    const totalProducts = products.length;
    const totalStockValue = products.reduce((sum, product) => 
      sum + (product.price * product.stockQuantity), 0
    );
    const lowStockProducts = products.filter(p => p.stockQuantity <= 10).length;
    const outOfStockProducts = products.filter(p => p.stockQuantity === 0).length;

    // Products by category
    const productsByCategory = await this.getProductsByCategory();

    // Stock movements
    const stockMovements = await this.getStockMovements();

    // Top moving products
    const topMovingProducts = await this.getTopMovingProducts();

    return {
      totalProducts,
      totalStockValue,
      lowStockProducts,
      outOfStockProducts,
      productsByCategory,
      stockMovements,
      topMovingProducts
    };
  }

  /**
   * Get profit/loss report
   */
  static async getProfitLossReport(dateRange: DateRange): Promise<ProfitLossData> {
    const { startDate, endDate } = dateRange;

    // Get revenue from invoices
    const invoices = await Invoice.find({
      createdAt: { $gte: startDate, $lte: endDate },
      status: 'completed'
    }).populate('items.productId', 'name categoryId').lean();

    const totalRevenue = invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0);

    // Calculate cost (simplified - using average cost from imports)
    const totalCost = await this.calculateTotalCost(invoices);

    const grossProfit = totalRevenue - totalCost;
    const grossProfitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    // Operating expenses (simplified)
    const operatingExpenses = totalRevenue * 0.15; // Assume 15% operating expenses
    const netProfit = grossProfit - operatingExpenses;
    const netProfitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    // Revenue by category
    const revenueByCategory = await this.getRevenueByCategory(startDate, endDate);

    return {
      totalRevenue,
      totalCost,
      grossProfit,
      grossProfitMargin,
      operatingExpenses,
      netProfit,
      netProfitMargin,
      revenueByCategory
    };
  }

  /**
   * Get dashboard data
   */
  static async getDashboardData(): Promise<DashboardData> {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endLastMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Today's sales
    const todayInvoices = await Invoice.find({
      createdAt: { $gte: startOfDay, $lt: endOfDay },
      status: 'completed'
    }).lean();

    const todayRevenue = todayInvoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0);
    const todayInvoiceCount = todayInvoices.length;

    // This month's sales
    const monthlyInvoices = await Invoice.find({
      createdAt: { $gte: startOfMonth, $lt: endOfMonth },
      status: 'completed'
    }).lean();

    const monthlyRevenue = monthlyInvoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0);
    const monthlyInvoiceCount = monthlyInvoices.length;

    // Last month's sales for growth calculation
    const lastMonthInvoices = await Invoice.find({
      createdAt: { $gte: lastMonth, $lt: endLastMonth },
      status: 'completed'
    }).lean();

    const lastMonthRevenue = lastMonthInvoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0);
    const lastMonthInvoiceCount = lastMonthInvoices.length;

    const revenueGrowth = lastMonthRevenue > 0 ? 
      ((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : 0;
    const invoiceGrowth = lastMonthInvoiceCount > 0 ? 
      ((monthlyInvoiceCount - lastMonthInvoiceCount) / lastMonthInvoiceCount) * 100 : 0;

    // Inventory stats
    const products = await Product.find({ inStock: true }).lean();
    const totalStockValue = products.reduce((sum, product) => 
      sum + (product.price * product.stockQuantity), 0);
    const lowStockCount = products.filter(p => p.stockQuantity <= 10).length;
    const outOfStockCount = products.filter(p => p.stockQuantity === 0).length;

    // Recent activities
    const recentInvoices = await Invoice.find({ status: 'completed' })
      .populate('customerId', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    const recentImports = await Import.find({ status: 'completed' })
      .populate('supplierId', 'name')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    const recentExports = await Export.find({ status: 'completed' })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    const lowStockProducts = await Product.find({
      stockQuantity: { $lte: 10, $gt: 0 },
      inStock: true
    }).populate('categoryId', 'name').limit(5).lean();

    // Chart data
    const dailyRevenue = await this.getDailyRevenueChart();
    const topProducts = await this.getTopProductsChart();
    const categoryDistribution = await this.getCategoryDistributionChart();

    return {
      sales: {
        todayRevenue,
        todayInvoices: todayInvoiceCount,
        monthlyRevenue,
        monthlyInvoices: monthlyInvoiceCount,
        revenueGrowth,
        invoiceGrowth
      },
      inventory: {
        totalProducts: products.length,
        totalStockValue,
        lowStockCount,
        outOfStockCount
      },
      recent: {
        recentInvoices,
        recentImports,
        recentExports,
        lowStockProducts
      },
      charts: {
        dailyRevenue,
        topProducts,
        categoryDistribution
      }
    };
  }

  // Helper methods
  private static async getRevenueByDay(startDate: Date, endDate: Date) {
    const pipeline = [
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          revenue: { $sum: '$totalAmount' },
          invoices: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 as 1 }
      }
    ];

    const result = await Invoice.aggregate(pipeline);
    return result.map(item => ({
      date: item._id,
      revenue: item.revenue,
      invoices: item.invoices
    }));
  }

  private static async getRevenueByMonth(startDate: Date, endDate: Date) {
    const pipeline = [
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m', date: '$createdAt' }
          },
          revenue: { $sum: '$totalAmount' },
          invoices: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 as 1 }
      }
    ];

    const result = await Invoice.aggregate(pipeline);
    return result.map(item => ({
      month: item._id,
      revenue: item.revenue,
      invoices: item.invoices
    }));
  }

  private static async getTopProducts(startDate: Date, endDate: Date) {
    const pipeline = [
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: 'completed'
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          productName: { $first: '$items.productName' },
          quantitySold: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.totalPrice' }
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $lookup: {
          from: 'categories',
          localField: 'product.categoryId',
          foreignField: '_id',
          as: 'category'
        }
      },
      { $unwind: '$category' },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$revenue' },
          products: { $push: '$$ROOT' }
        }
      },
      { $unwind: '$products' },
      {
        $addFields: {
          'products.percentage': {
            $multiply: [
              { $divide: ['$products.revenue', '$totalRevenue'] },
              100
            ]
          }
        }
      },
      {
        $replaceRoot: { newRoot: '$products' }
      },
      { $sort: { revenue: -1 as -1 } },
      { $limit: 10 }
    ];

    const result = await Invoice.aggregate(pipeline);
    return result.map(item => ({
      productId: String(item._id),
      productName: item.productName,
      category: item.category.name,
      quantitySold: item.quantitySold,
      revenue: item.revenue,
      percentage: item.percentage
    }));
  }

  private static async getPaymentMethodStats(startDate: Date, endDate: Date) {
    const pipeline = [
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: '$paymentMethod',
          count: { $sum: 1 },
          amount: { $sum: '$totalAmount' }
        }
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          methods: { $push: '$$ROOT' }
        }
      },
      { $unwind: '$methods' },
      {
        $addFields: {
          'methods.percentage': {
            $multiply: [
              { $divide: ['$methods.amount', '$totalAmount'] },
              100
            ]
          }
        }
      },
      {
        $replaceRoot: { newRoot: '$methods' }
      },
      { $sort: { amount: -1 as -1 } }
    ];

    const result = await Invoice.aggregate(pipeline);
    return result.map(item => ({
      method: item._id,
      count: item.count,
      amount: item.amount,
      percentage: item.percentage
    }));
  }

  private static async getProductsByCategory() {
    const pipeline = [
      {
        $lookup: {
          from: 'categories',
          localField: 'categoryId',
          foreignField: '_id',
          as: 'category'
        }
      },
      { $unwind: '$category' },
      {
        $group: {
          _id: '$categoryId',
          categoryName: { $first: '$category.name' },
          productCount: { $sum: 1 },
          stockValue: { $sum: { $multiply: ['$price', '$stockQuantity'] } }
        }
      },
      {
        $group: {
          _id: null,
          totalValue: { $sum: '$stockValue' },
          categories: { $push: '$$ROOT' }
        }
      },
      { $unwind: '$categories' },
      {
        $addFields: {
          'categories.percentage': {
            $multiply: [
              { $divide: ['$categories.stockValue', '$totalValue'] },
              100
            ]
          }
        }
      },
      {
        $replaceRoot: { newRoot: '$categories' }
      },
      { $sort: { stockValue: -1 as -1 } }
    ];

    const result = await Product.aggregate(pipeline);
    return result.map(item => ({
      categoryId: String(item._id),
      categoryName: item.categoryName,
      productCount: item.productCount,
      stockValue: item.stockValue,
      percentage: item.percentage
    }));
  }

  private static async getStockMovements() {
    const pipeline = [
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          imports: {
            $sum: {
              $cond: [{ $eq: ['$movementType', 'import'] }, '$quantity', 0]
            }
          },
          exports: {
            $sum: {
              $cond: [{ $eq: ['$movementType', 'export'] }, { $abs: '$quantity' }, 0]
            }
          },
          adjustments: {
            $sum: {
              $cond: [{ $eq: ['$movementType', 'adjustment'] }, '$quantity', 0]
            }
          }
        }
      },
      {
        $addFields: {
          netChange: { $subtract: ['$imports', '$exports'] }
        }
      },
      { $sort: { _id: -1 as -1 } },
      { $limit: 30 }
    ];

    const result = await StockMovement.aggregate(pipeline);
    return result.map(item => ({
      date: item._id,
      imports: item.imports,
      exports: item.exports,
      adjustments: item.adjustments,
      netChange: item.netChange
    }));
  }

  private static async getTopMovingProducts() {
    const pipeline = [
      {
        $group: {
          _id: '$productId',
          productName: { $first: '$productName' },
          totalImports: {
            $sum: {
              $cond: [{ $eq: ['$movementType', 'import'] }, '$quantity', 0]
            }
          },
          totalExports: {
            $sum: {
              $cond: [{ $eq: ['$movementType', 'export'] }, { $abs: '$quantity' }, 0]
            }
          }
        }
      },
      {
        $addFields: {
          netMovement: { $subtract: ['$totalImports', '$totalExports'] }
        }
      },
      { $sort: { netMovement: -1 as -1 } },
      { $limit: 10 }
    ];

    const result = await StockMovement.aggregate(pipeline);
    return result.map(item => ({
      productId: String(item._id),
      productName: item.productName,
      totalImports: item.totalImports,
      totalExports: item.totalExports,
      netMovement: item.netMovement
    }));
  }

  private static async calculateTotalCost(invoices: any[]): Promise<number> {
    // Simplified cost calculation - in real scenario, you'd track actual cost per product
    // For now, we'll use a percentage of revenue as cost
    const totalRevenue = invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0);
    return totalRevenue * 0.6; // Assume 60% cost ratio
  }

  private static async getRevenueByCategory(startDate: Date, endDate: Date) {
    const pipeline = [
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: 'completed'
        }
      },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.productId',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $lookup: {
          from: 'categories',
          localField: 'product.categoryId',
          foreignField: '_id',
          as: 'category'
        }
      },
      { $unwind: '$category' },
      {
        $group: {
          _id: '$category._id',
          categoryName: { $first: '$category.name' },
          revenue: { $sum: '$items.totalPrice' },
          cost: { $sum: { $multiply: ['$items.totalPrice', 0.6] } } // 60% cost ratio
        }
      },
      {
        $addFields: {
          profit: { $subtract: ['$revenue', '$cost'] },
          margin: {
            $multiply: [
              { $divide: [{ $subtract: ['$revenue', '$cost'] }, '$revenue'] },
              100
            ]
          }
        }
      },
      { $sort: { revenue: -1 as -1 } }
    ];

    const result = await Invoice.aggregate(pipeline);
    return result.map(item => ({
      categoryId: String(item._id),
      categoryName: item.categoryName,
      revenue: item.revenue,
      cost: item.cost,
      profit: item.profit,
      margin: item.margin
    }));
  }

  private static async getDailyRevenueChart() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const pipeline = [
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          revenue: { $sum: '$totalAmount' }
        }
      },
      { $sort: { _id: 1 as 1 } }
    ];

    const result = await Invoice.aggregate(pipeline);
    return result.map(item => ({
      date: item._id,
      revenue: item.revenue
    }));
  }

  private static async getTopProductsChart() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const pipeline = [
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo },
          status: 'completed'
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          name: { $first: '$items.productName' },
          revenue: { $sum: '$items.totalPrice' }
        }
      },
      { $sort: { revenue: -1 as -1 } },
      { $limit: 5 }
    ];

    const result = await Invoice.aggregate(pipeline);
    return result.map(item => ({
      name: item.name,
      revenue: item.revenue
    }));
  }

  private static async getCategoryDistributionChart() {
    const pipeline = [
      {
        $lookup: {
          from: 'categories',
          localField: 'categoryId',
          foreignField: '_id',
          as: 'category'
        }
      },
      { $unwind: '$category' },
      {
        $group: {
          _id: '$categoryId',
          name: { $first: '$category.name' },
          value: { $sum: { $multiply: ['$price', '$stockQuantity'] } }
        }
      },
      { $sort: { value: -1 as -1 } }
    ];

    const result = await Product.aggregate(pipeline);
    return result.map(item => ({
      name: item.name,
      value: item.value
    }));
  }
}
