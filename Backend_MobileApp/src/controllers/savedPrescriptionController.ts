import { Request, Response } from 'express';
import { SavedPrescription, Product, Order } from '../models/schema';
import { AuthenticatedRequest } from '../middleware/auth';

export class SavedPrescriptionController {
  // Get user's saved prescriptions (authenticated)
  static async getUserSavedPrescriptions(req: AuthenticatedRequest, res: Response) {
    try {
      const { page = 1, limit = 20 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const savedPrescriptions = await SavedPrescription.find({ 
        userId: req.user!.id,
        isActive: true 
      })
        .populate('prescriptionId', 'doctorName hospitalName')
        .populate('orderId', 'orderNumber createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit));

      const total = await SavedPrescription.countDocuments({ 
        userId: req.user!.id,
        isActive: true 
      });

      res.json({
        success: true,
        data: savedPrescriptions,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      console.error('Get user saved prescriptions error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Get saved prescription by ID (authenticated)
  static async getSavedPrescriptionById(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;

      const savedPrescription = await SavedPrescription.findOne({ 
        _id: id, 
        userId: req.user!.id,
        isActive: true 
      })
        .populate('prescriptionId', 'doctorName hospitalName prescriptionImage')
        .populate('orderId', 'orderNumber createdAt')
        .populate('items.productId', 'name imageUrl price unit inStock stockQuantity');

      if (!savedPrescription) {
        return res.status(404).json({
          success: false,
          message: 'Saved prescription not found',
        });
      }

      res.json({
        success: true,
        data: savedPrescription,
      });
    } catch (error) {
      console.error('Get saved prescription by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Save prescription from order (authenticated)
  static async savePrescriptionFromOrder(req: AuthenticatedRequest, res: Response) {
    try {
      const { orderId, name, description } = req.body;

      if (!orderId || !name) {
        return res.status(400).json({
          success: false,
          message: 'Order ID and name are required',
        });
      }

      // Get order with items
      const order = await Order.findOne({ 
        _id: orderId, 
        userId: req.user!.id 
      }).populate({
        path: 'items',
        populate: {
          path: 'productId',
          select: 'name price unit'
        }
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found',
        });
      }

      // Create saved prescription
      const savedPrescription = await SavedPrescription.create({
        userId: req.user!.id,
        orderId: order._id,
        name,
        description,
        items: order.items.map((item: any) => ({
          productId: item.productId._id,
          productName: item.productId.name,
          quantity: item.quantity,
          unit: item.productId.unit,
          price: item.productId.price,
        })),
        totalAmount: order.totalAmount,
      });

      res.status(201).json({
        success: true,
        message: 'Prescription saved successfully',
        data: savedPrescription,
      });
    } catch (error) {
      console.error('Save prescription from order error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Save prescription from prescription (authenticated)
  static async savePrescriptionFromPrescription(req: AuthenticatedRequest, res: Response) {
    try {
      const { prescriptionId, name, description, items } = req.body;

      if (!prescriptionId || !name || !items || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Prescription ID, name, and items are required',
        });
      }

      // Calculate total amount
      let totalAmount = 0;
      for (const item of items) {
        const product = await Product.findById(item.productId);
        if (!product) {
          return res.status(400).json({
            success: false,
            message: `Product ${item.productId} not found`,
          });
        }
        totalAmount += product.price * item.quantity;
      }

      // Create saved prescription
      const savedPrescription = await SavedPrescription.create({
        userId: req.user!.id,
        prescriptionId,
        name,
        description,
        items: items.map((item: any) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unit: item.unit,
          price: item.price,
          notes: item.notes,
        })),
        totalAmount,
      });

      res.status(201).json({
        success: true,
        message: 'Prescription saved successfully',
        data: savedPrescription,
      });
    } catch (error) {
      console.error('Save prescription from prescription error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Update saved prescription (authenticated)
  static async updateSavedPrescription(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const { name, description, items } = req.body;

      const savedPrescription = await SavedPrescription.findOne({ 
        _id: id, 
        userId: req.user!.id,
        isActive: true 
      });

      if (!savedPrescription) {
        return res.status(404).json({
          success: false,
          message: 'Saved prescription not found',
        });
      }

      // Calculate new total amount if items are updated
      let totalAmount = savedPrescription.totalAmount;
      if (items && items.length > 0) {
        totalAmount = 0;
        for (const item of items) {
          const product = await Product.findById(item.productId);
          if (!product) {
            return res.status(400).json({
              success: false,
              message: `Product ${item.productId} not found`,
            });
          }
          totalAmount += product.price * item.quantity;
        }
      }

      // Update saved prescription
      const updateData: any = {};
      if (name) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (items) {
        updateData.items = items.map((item: any) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unit: item.unit,
          price: item.price,
          notes: item.notes,
        }));
        updateData.totalAmount = totalAmount;
      }

      const updatedPrescription = await SavedPrescription.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      );

      res.json({
        success: true,
        message: 'Saved prescription updated successfully',
        data: updatedPrescription,
      });
    } catch (error) {
      console.error('Update saved prescription error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Delete saved prescription (authenticated)
  static async deleteSavedPrescription(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;

      const savedPrescription = await SavedPrescription.findOne({ 
        _id: id, 
        userId: req.user!.id,
        isActive: true 
      });

      if (!savedPrescription) {
        return res.status(404).json({
          success: false,
          message: 'Saved prescription not found',
        });
      }

      // Soft delete by setting isActive to false
      await SavedPrescription.findByIdAndUpdate(id, { isActive: false });

      res.json({
        success: true,
        message: 'Saved prescription deleted successfully',
      });
    } catch (error) {
      console.error('Delete saved prescription error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Reorder from saved prescription (authenticated)
  static async reorderFromSavedPrescription(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const { modifications } = req.body; // Optional modifications to quantities

      const savedPrescription = await SavedPrescription.findOne({ 
        _id: id, 
        userId: req.user!.id,
        isActive: true 
      }).populate('items.productId', 'name price unit inStock stockQuantity');

      if (!savedPrescription) {
        return res.status(404).json({
          success: false,
          message: 'Saved prescription not found',
        });
      }

      // Check product availability and apply modifications
      const availableItems = [];
      const unavailableItems = [];
      let totalAmount = 0;

      for (const item of savedPrescription.items) {
        const product = item.productId as any;
        let quantity = item.quantity;

        // Apply modifications if provided
        if (modifications && modifications[item.productId._id]) {
          quantity = modifications[item.productId._id];
        }

        if (product.inStock && product.stockQuantity >= quantity) {
          availableItems.push({
            productId: product._id,
            productName: product.name,
            quantity,
            unit: product.unit,
            price: product.price,
            notes: item.notes,
          });
          totalAmount += product.price * quantity;
        } else {
          unavailableItems.push({
            productId: product._id,
            productName: product.name,
            requestedQuantity: quantity,
            availableStock: product.stockQuantity || 0,
            reason: !product.inStock ? 'Hết hàng' : 'Không đủ số lượng',
          });
        }
      }

      res.json({
        success: true,
        data: {
          availableItems,
          unavailableItems,
          totalAmount,
          originalPrescription: {
            id: savedPrescription._id,
            name: savedPrescription.name,
            createdAt: savedPrescription.createdAt,
          },
        },
      });
    } catch (error) {
      console.error('Reorder from saved prescription error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Get saved prescription statistics (authenticated)
  static async getSavedPrescriptionStats(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!.id;

      const stats = await SavedPrescription.aggregate([
        { $match: { userId: userId, isActive: true } },
        {
          $group: {
            _id: null,
            totalSaved: { $sum: 1 },
            totalItems: { $sum: { $size: '$items' } },
            totalValue: { $sum: '$totalAmount' },
            averageItemsPerPrescription: { $avg: { $size: '$items' } },
            averageValuePerPrescription: { $avg: '$totalAmount' },
          }
        }
      ]);

      const result = stats[0] || {
        totalSaved: 0,
        totalItems: 0,
        totalValue: 0,
        averageItemsPerPrescription: 0,
        averageValuePerPrescription: 0,
      };

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Get saved prescription stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }
}
