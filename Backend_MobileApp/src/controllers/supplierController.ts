import { Request, Response } from 'express';
import { Supplier } from '../models/schema.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

export class SupplierController {
  /**
   * Get all suppliers
   * GET /api/suppliers
   */
  static async getSuppliers(req: Request, res: Response) {
    try {
      const { page = 1, limit = 20, search, isActive } = req.query;
      const offset = (Number(page) - 1) * Number(limit);
      const conditions: any = {};

      // Search by name or contact person
      if (search) {
        conditions.$or = [
          { name: { $regex: String(search), $options: 'i' } },
          { contactPerson: { $regex: String(search), $options: 'i' } },
          { email: { $regex: String(search), $options: 'i' } }
        ];
      }

      // Filter by active status
      if (isActive !== undefined) {
        conditions.isActive = isActive === 'true';
      }

      const suppliers = await Supplier.find(conditions)
        .sort({ name: 1 })
        .skip(offset)
        .limit(Number(limit))
        .lean();

      const totalCount = await Supplier.countDocuments(conditions);

      res.json({
        success: true,
        data: {
          suppliers,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total: totalCount,
            pages: Math.ceil(totalCount / Number(limit)),
          },
        },
        message: 'Suppliers retrieved successfully'
      });
    } catch (error) {
      console.error('Get suppliers error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get supplier by ID
   * GET /api/suppliers/:id
   */
  static async getSupplierById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const supplier = await Supplier.findById(id).lean();

      if (!supplier) {
        return res.status(404).json({
          success: false,
          message: 'Supplier not found'
        });
      }

      res.json({
        success: true,
        data: supplier,
        message: 'Supplier retrieved successfully'
      });
    } catch (error) {
      console.error('Get supplier by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Create new supplier
   * POST /api/suppliers
   */
  static async createSupplier(req: AuthenticatedRequest, res: Response) {
    try {
      const supplierData = req.body;

      // Check if supplier with same name already exists
      const existingSupplier = await Supplier.findOne({
        name: { $regex: new RegExp(`^${supplierData.name}$`, 'i') }
      });

      if (existingSupplier) {
        return res.status(409).json({
          success: false,
          message: 'Supplier with this name already exists'
        });
      }

      const newSupplier = await Supplier.create(supplierData);

      res.status(201).json({
        success: true,
        data: newSupplier,
        message: 'Supplier created successfully'
      });
    } catch (error) {
      console.error('Create supplier error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Update supplier
   * PUT /api/suppliers/:id
   */
  static async updateSupplier(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      // Check if supplier exists
      const existingSupplier = await Supplier.findById(id);
      if (!existingSupplier) {
        return res.status(404).json({
          success: false,
          message: 'Supplier not found'
        });
      }

      // Check if name is being changed and if new name already exists
      if (updateData.name && updateData.name !== existingSupplier.name) {
        const nameExists = await Supplier.findOne({
          name: { $regex: new RegExp(`^${updateData.name}$`, 'i') },
          _id: { $ne: id }
        });

        if (nameExists) {
          return res.status(409).json({
            success: false,
            message: 'Supplier with this name already exists'
          });
        }
      }

      const updatedSupplier = await Supplier.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      );

      res.json({
        success: true,
        data: updatedSupplier,
        message: 'Supplier updated successfully'
      });
    } catch (error) {
      console.error('Update supplier error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Delete supplier
   * DELETE /api/suppliers/:id
   */
  static async deleteSupplier(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;

      // Check if supplier exists
      const supplier = await Supplier.findById(id);
      if (!supplier) {
        return res.status(404).json({
          success: false,
          message: 'Supplier not found'
        });
      }

      // Check if supplier has associated products
      const { Product } = await import('../models/schema.js');
      const productsWithSupplier = await Product.countDocuments({ supplierId: id });
      
      if (productsWithSupplier > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot delete supplier. ${productsWithSupplier} products are associated with this supplier.`
        });
      }

      await Supplier.findByIdAndDelete(id);

      res.json({
        success: true,
        message: 'Supplier deleted successfully'
      });
    } catch (error) {
      console.error('Delete supplier error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get supplier statistics
   * GET /api/suppliers/stats
   */
  static async getSupplierStats(req: Request, res: Response) {
    try {
      const { Product } = await import('../models/schema.js');
      
      const [
        totalSuppliers,
        activeSuppliers,
        suppliersWithProducts
      ] = await Promise.all([
        Supplier.countDocuments(),
        Supplier.countDocuments({ isActive: true }),
        Supplier.aggregate([
          {
            $lookup: {
              from: 'products',
              localField: '_id',
              foreignField: 'supplierId',
              as: 'products'
            }
          },
          {
            $match: {
              'products.0': { $exists: true }
            }
          },
          {
            $count: 'count'
          }
        ])
      ]);

      res.json({
        success: true,
        data: {
          totalSuppliers,
          activeSuppliers,
          inactiveSuppliers: totalSuppliers - activeSuppliers,
          suppliersWithProducts: suppliersWithProducts[0]?.count || 0
        },
        message: 'Supplier statistics retrieved successfully'
      });
    } catch (error) {
      console.error('Get supplier stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}
