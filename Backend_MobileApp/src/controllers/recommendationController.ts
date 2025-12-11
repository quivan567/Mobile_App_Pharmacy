import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { RecommendationService } from '../services/recommendationService.js';
import { Product } from '../models/schema.js';
import { toProductDto } from '../controllers/productController.js';

export class RecommendationController {
  /**
   * GET /api/recommend/by-history/:customerId
   * Đề xuất sản phẩm dựa trên lịch sử mua hàng
   */
  static async getRecommendationsByHistory(req: AuthenticatedRequest, res: Response) {
    try {
      const { customerId } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;

      // Kiểm tra quyền: user chỉ có thể xem recommendations của chính mình
      const userId = req.user?.id;
      if (userId !== customerId) {
        return res.status(403).json({
          success: false,
          message: 'Bạn không có quyền xem recommendations của user khác',
        });
      }

      const products = await RecommendationService.getRecommendationsByHistory(customerId, limit);

      const productsDto = products.map(p => toProductDto(p));

      res.json({
        success: true,
        data: {
          products: productsDto,
          count: productsDto.length,
        },
      });
    } catch (error) {
      console.error('Error in getRecommendationsByHistory:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  /**
   * GET /api/recommend/by-category/:customerId
   * Đề xuất sản phẩm dựa trên category
   */
  static async getRecommendationsByCategory(req: AuthenticatedRequest, res: Response) {
    try {
      const { customerId } = req.params;
      const categoryName = req.query.categoryName as string;
      const limit = parseInt(req.query.limit as string) || 10;

      if (!categoryName) {
        return res.status(400).json({
          success: false,
          message: 'categoryName is required',
        });
      }

      // Kiểm tra quyền
      const userId = req.user?.id;
      if (userId !== customerId) {
        return res.status(403).json({
          success: false,
          message: 'Bạn không có quyền xem recommendations của user khác',
        });
      }

      const products = await RecommendationService.getRecommendationsByCategory(
        customerId,
        categoryName,
        limit
      );

      const productsDto = products.map(p => toProductDto(p));

      res.json({
        success: true,
        data: {
          products: productsDto,
          count: productsDto.length,
        },
      });
    } catch (error) {
      console.error('Error in getRecommendationsByCategory:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  /**
   * GET /api/recommend/alternative/:medicineId
   * Đề xuất sản phẩm thay thế
   */
  static async getAlternativeProducts(req: Request, res: Response) {
    try {
      const { medicineId } = req.params;
      const limit = parseInt(req.query.limit as string) || 5;

      if (!medicineId) {
        return res.status(400).json({
          success: false,
          message: 'medicineId is required',
        });
      }

      const products = await RecommendationService.getAlternativeProducts(medicineId, limit);

      const productsDto = products.map(p => toProductDto(p));

      res.json({
        success: true,
        data: {
          products: productsDto,
          count: productsDto.length,
        },
      });
    } catch (error) {
      console.error('Error in getAlternativeProducts:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  /**
   * GET /api/recommend/popular
   * Lấy sản phẩm phổ biến
   */
  static async getPopularProducts(req: Request, res: Response) {
    try {
      const limit = parseInt(req.query.limit as string) || 10;

      const products = await RecommendationService.getPopularProducts(limit);

      const productsDto = products.map(p => toProductDto(p));

      res.json({
        success: true,
        data: {
          products: productsDto,
          count: productsDto.length,
        },
      });
    } catch (error) {
      console.error('Error in getPopularProducts:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  /**
   * GET /api/recommend/search-history
   * Lấy lịch sử tìm kiếm của user
   */
  static async getSearchHistory(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const limit = parseInt(req.query.limit as string) || 10;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const { SearchHistory } = await import('../models/schema.js');
      const history = await SearchHistory.find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      res.json({
        success: true,
        data: {
          history: history.map(h => ({
            keyword: h.keyword,
            createdAt: h.createdAt,
          })),
          count: history.length,
        },
      });
    } catch (error) {
      console.error('Error in getSearchHistory:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  /**
   * GET /api/recommend/recent-views
   * Lấy sản phẩm đã xem gần đây
   */
  static async getRecentViews(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const limit = parseInt(req.query.limit as string) || 10;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const { ViewHistory } = await import('../models/schema.js');
      const views = await ViewHistory.find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('productId')
        .lean();

      const products = views
        .map(v => v.productId)
        .filter(p => p !== null && typeof p === 'object')
        .map(p => toProductDto(p as any));

      res.json({
        success: true,
        data: {
          products,
          count: products.length,
        },
      });
    } catch (error) {
      console.error('Error in getRecentViews:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }
}

