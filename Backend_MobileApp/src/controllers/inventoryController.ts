import { Request, Response } from 'express';
import { InventoryService, CreateImportData, CreateExportData, StockAdjustmentData } from '../services/inventoryService.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

export class InventoryController {
  /**
   * Create import (nhập kho)
   * POST /api/inventory/imports
   */
  static async createImport(req: AuthenticatedRequest, res: Response) {
    try {
      const importData: CreateImportData = req.body;

      // Validate required fields
      if (!importData.supplierId || !importData.items || importData.items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Supplier ID and items are required'
        });
      }

      // Set receivedBy from authenticated user
      importData.receivedBy = req.user!.id;

      const importRecord = await InventoryService.createImport(importData);

      res.status(201).json({
        success: true,
        data: importRecord,
        message: 'Import created successfully'
      });
    } catch (error) {
      console.error('Create import error:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Get all imports
   * GET /api/inventory/imports
   */
  static async getImports(req: Request, res: Response) {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        supplierId,
        startDate,
        endDate,
        search,
      } = req.query;

      const offset = (Number(page) - 1) * Number(limit);
      const conditions: any = {};

      if (status) conditions.status = status;
      if (supplierId) conditions.supplierId = supplierId;

      if (startDate || endDate) {
        conditions.createdAt = {};
        if (startDate) conditions.createdAt.$gte = new Date(startDate as string);
        if (endDate) conditions.createdAt.$lte = new Date(endDate as string);
      }

      if (search) {
        conditions.$or = [
          { importNumber: { $regex: search, $options: 'i' } },
          { supplierName: { $regex: search, $options: 'i' } },
        ];
      }

      const { Import } = await import('../models/schema.js');
      const imports = await Import.find(conditions)
        .populate('supplierId', 'name contactPerson')
        .populate('receivedBy', 'firstName lastName')
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(Number(limit))
        .lean();

      const total = await Import.countDocuments(conditions);

      res.json({
        success: true,
        data: {
          imports,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit)),
          },
        },
        message: 'Imports retrieved successfully'
      });
    } catch (error) {
      console.error('Get imports error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get import by ID
   * GET /api/inventory/imports/:id
   */
  static async getImportById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { Import } = await import('../models/schema.js');
      
      const importRecord = await Import.findById(id)
        .populate('supplierId', 'name contactPerson email phone')
        .populate('receivedBy', 'firstName lastName')
        .lean();

      if (!importRecord) {
        return res.status(404).json({
          success: false,
          message: 'Import not found'
        });
      }

      res.json({
        success: true,
        data: importRecord,
        message: 'Import retrieved successfully'
      });
    } catch (error) {
      console.error('Get import by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Confirm import
   * PUT /api/inventory/imports/:id/confirm
   */
  static async confirmImport(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const importRecord = await (InventoryService.confirmImport as any)(id, req.user!.id);

      res.json({
        success: true,
        data: importRecord,
        message: 'Import confirmed successfully'
      });
    } catch (error) {
      console.error('Confirm import error:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Create export (xuất kho)
   * POST /api/inventory/exports
   */
  static async createExport(req: AuthenticatedRequest, res: Response) {
    try {
      const exportData: CreateExportData = req.body;

      // Validate required fields
      if (!exportData.reason || !exportData.items || exportData.items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Reason and items are required'
        });
      }

      // Set issuedBy from authenticated user
      exportData.issuedBy = req.user!.id;

      const exportRecord = await InventoryService.createExport(exportData);

      res.status(201).json({
        success: true,
        data: exportRecord,
        message: 'Export created successfully'
      });
    } catch (error) {
      console.error('Create export error:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Get all exports
   * GET /api/inventory/exports
   */
  static async getExports(req: Request, res: Response) {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        reason,
        startDate,
        endDate,
        search,
      } = req.query;

      const offset = (Number(page) - 1) * Number(limit);
      const conditions: any = {};

      if (status) conditions.status = status;
      if (reason) conditions.reason = reason;

      if (startDate || endDate) {
        conditions.createdAt = {};
        if (startDate) conditions.createdAt.$gte = new Date(startDate as string);
        if (endDate) conditions.createdAt.$lte = new Date(endDate as string);
      }

      if (search) {
        conditions.$or = [
          { exportNumber: { $regex: search, $options: 'i' } },
          { notes: { $regex: search, $options: 'i' } },
        ];
      }

      const { Export } = await import('../models/schema.js');
      const exports = await Export.find(conditions)
        .populate('issuedBy', 'firstName lastName')
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(Number(limit))
        .lean();

      const total = await Export.countDocuments(conditions);

      res.json({
        success: true,
        data: {
          exports,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit)),
          },
        },
        message: 'Exports retrieved successfully'
      });
    } catch (error) {
      console.error('Get exports error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get export by ID
   * GET /api/inventory/exports/:id
   */
  static async getExportById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { Export } = await import('../models/schema.js');
      
      const exportRecord = await Export.findById(id)
        .populate('issuedBy', 'firstName lastName')
        .lean();

      if (!exportRecord) {
        return res.status(404).json({
          success: false,
          message: 'Export not found'
        });
      }

      res.json({
        success: true,
        data: exportRecord,
        message: 'Export retrieved successfully'
      });
    } catch (error) {
      console.error('Get export by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Confirm export
   * PUT /api/inventory/exports/:id/confirm
   */
  static async confirmExport(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const exportRecord = await (InventoryService.confirmExport as any)(id, req.user!.id);

      res.json({
        success: true,
        data: exportRecord,
        message: 'Export confirmed successfully'
      });
    } catch (error) {
      console.error('Confirm export error:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Stock adjustment
   * POST /api/inventory/adjustments
   */
  static async adjustStock(req: AuthenticatedRequest, res: Response) {
    try {
      const adjustmentData: StockAdjustmentData = req.body;

      if (!adjustmentData.productId || !adjustmentData.reason) {
        return res.status(400).json({
          success: false,
          message: 'Product ID and reason are required'
        });
      }

      adjustmentData.performedBy = req.user!.id;

      const result = await InventoryService.adjustStock(adjustmentData);

      res.json({
        success: true,
        data: result,
        message: 'Stock adjusted successfully'
      });
    } catch (error) {
      console.error('Adjust stock error:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Get stock movements
   * GET /api/inventory/movements
   */
  static async getStockMovements(req: Request, res: Response) {
    try {
      const {
        productId,
        movementType,
        startDate,
        endDate,
        page = 1,
        limit = 20,
      } = req.query;

      const filters: any = {
        page: Number(page),
        limit: Number(limit),
      };

      if (productId) filters.productId = productId;
      if (movementType) filters.movementType = movementType;
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);

      const result = await InventoryService.getStockMovements(filters);

      res.json({
        success: true,
        data: result,
        message: 'Stock movements retrieved successfully'
      });
    } catch (error) {
      console.error('Get stock movements error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get low stock products
   * GET /api/inventory/low-stock?threshold=10
   */
  static async getLowStockProducts(req: Request, res: Response) {
    try {
      const threshold = parseInt(req.query.threshold as string) || 10;
      const products = await InventoryService.getLowStockProducts(threshold);

      res.json({
        success: true,
        data: {
          products,
          threshold,
          total: products.length,
          lowStock: products.filter(p => p.isLowStock && !p.isOutOfStock).length,
          outOfStock: products.filter(p => p.isOutOfStock).length,
        },
        message: 'Low stock products retrieved successfully'
      });
    } catch (error) {
      console.error('Get low stock products error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get inventory statistics
   * GET /api/inventory/stats
   */
  static async getInventoryStats(req: Request, res: Response) {
    try {
      const stats = await InventoryService.getInventoryStats();

      res.json({
        success: true,
        data: stats,
        message: 'Inventory statistics retrieved successfully'
      });
    } catch (error) {
      console.error('Get inventory stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get product stock history
   * GET /api/inventory/products/:productId/stock-history
   */
  static async getProductStockHistory(req: Request, res: Response) {
    try {
      const { productId } = req.params;
      const { page = 1, limit = 50 } = req.query;

      const filters = {
        productId: productId,
        page: Number(page),
        limit: Number(limit),
      };

      const result = await InventoryService.getStockMovements(filters as any);

      res.json({
        success: true,
        data: result,
        message: 'Product stock history retrieved successfully'
      });
    } catch (error) {
      console.error('Get product stock history error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}
