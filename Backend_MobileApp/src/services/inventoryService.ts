import { Import, Export, StockMovement, Product, Supplier } from '../models/schema.js';
import { IImportItem, IExportItem } from '../models/schema.js';

export interface CreateImportData {
  supplierId: string;
  items: {
    productId: string;
    quantity: number;
    unitPrice: number;
    batchNumber: string;
    expirationDate: Date;
    manufacturingDate?: Date;
  }[];
  notes?: string;
  receivedBy: string;
}

export interface CreateExportData {
  reason: 'sale' | 'transfer' | 'damage' | 'expired' | 'adjustment' | 'other';
  items: {
    productId: string;
    quantity: number;
    batchNumber?: string;
    reason?: string;
  }[];
  notes?: string;
  issuedBy: string;
}

export interface StockAdjustmentData {
  productId: string;
  quantity: number;
  reason: string;
  performedBy: string;
}

export class InventoryService {
  /**
   * Generate unique import number
   */
  static async generateImportNumber(): Promise<string> {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    
    const count = await Import.countDocuments({
      createdAt: { $gte: startOfDay, $lt: endOfDay }
    });
    
    const sequence = String(count + 1).padStart(4, '0');
    return `IMP-${year}${month}${day}-${sequence}`;
  }

  /**
   * Generate unique export number
   */
  static async generateExportNumber(): Promise<string> {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    
    const count = await Export.countDocuments({
      createdAt: { $gte: startOfDay, $lt: endOfDay }
    });
    
    const sequence = String(count + 1).padStart(4, '0');
    return `EXP-${year}${month}${day}-${sequence}`;
  }

  /**
   * Create stock movement record
   */
  static async createStockMovement(data: {
    productId: string;
    productName: string;
    movementType: 'import' | 'export' | 'adjustment' | 'sale' | 'return';
    quantity: number;
    previousStock: number;
    newStock: number;
    referenceType: 'import' | 'export' | 'invoice' | 'adjustment';
    referenceId: string;
    referenceNumber: string;
    batchNumber?: string | undefined;
    expirationDate?: Date | undefined;
    reason?: string | undefined;
    performedBy: string;
  }): Promise<void> {
    await StockMovement.create({
      productId: data.productId,
      productName: data.productName,
      movementType: data.movementType,
      quantity: data.quantity,
      previousStock: data.previousStock,
      newStock: data.newStock,
      referenceType: data.referenceType,
      referenceId: data.referenceId,
      referenceNumber: data.referenceNumber,
      batchNumber: data.batchNumber,
      expirationDate: data.expirationDate,
      reason: data.reason,
      performedBy: data.performedBy,
    });
  }

  /**
   * Create import (nhập kho)
   */
  static async createImport(data: CreateImportData): Promise<any> {
    try {
      // Generate import number
      const importNumber = await this.generateImportNumber();

      // Get supplier info
      const supplier = await Supplier.findById(data.supplierId);
      if (!supplier) {
        throw new Error('Supplier not found');
      }

      // Process items
      const items: IImportItem[] = [];
      let totalQuantity = 0;
      let totalAmount = 0;

      for (const itemData of data.items) {
        const product = await Product.findById(itemData.productId);
        if (!product) {
          throw new Error(`Product with ID ${itemData.productId} not found`);
        }

        const item: IImportItem = {
          productId: product._id as any,
          productName: product.name,
          quantity: itemData.quantity,
          unitPrice: itemData.unitPrice,
          totalPrice: itemData.quantity * itemData.unitPrice,
          batchNumber: itemData.batchNumber,
          expirationDate: itemData.expirationDate,
          manufacturingDate: itemData.manufacturingDate || undefined,
          receivedQuantity: 0,
          status: 'pending',
        };

        items.push(item);
        totalQuantity += itemData.quantity;
        totalAmount += item.totalPrice;
      }

      // Create import
      const importRecord = await Import.create({
        importNumber,
        supplierId: data.supplierId,
        supplierName: supplier.name,
        items,
        totalQuantity,
        totalAmount,
        status: 'pending',
        notes: data.notes,
        receivedBy: data.receivedBy,
      });

      return importRecord;
    } catch (error) {
      console.error('Error creating import:', error);
      throw error;
    }
  }

  /**
   * Confirm import (xác nhận nhập kho)
   */
  static async confirmImport(importId: string, userId: string): Promise<any> {
    try {
      const importRecord = await Import.findById(importId);
      if (!importRecord) {
        throw new Error('Import not found');
      }

      if (importRecord.status !== 'pending') {
        throw new Error('Import is not in pending status');
      }

      // Update product stock and create stock movements
      for (const item of importRecord.items) {
        const product = await Product.findById(item.productId);
        if (!product) continue;

        const previousStock = product.stockQuantity;
        const newStock = previousStock + item.quantity;

        // Update product stock
        await Product.findByIdAndUpdate(item.productId, {
          $inc: { stockQuantity: item.quantity },
          batchNumber: item.batchNumber,
          expirationDate: item.expirationDate,
          manufacturingDate: item.manufacturingDate,
        });

        // Create stock movement
        await this.createStockMovement({
          productId: String(item.productId),
          productName: item.productName,
          movementType: 'import',
          quantity: item.quantity,
          previousStock,
          newStock,
          referenceType: 'import',
          referenceId: importId,
          referenceNumber: importRecord.importNumber,
          batchNumber: item.batchNumber,
          expirationDate: item.expirationDate,
          reason: 'Import from supplier',
          performedBy: userId,
        });

        // Update item status
        item.receivedQuantity = item.quantity;
        item.status = 'completed';
      }

      // Update import status
      importRecord.status = 'completed';
      importRecord.receivedAt = new Date();
      await importRecord.save();

      return importRecord;
    } catch (error) {
      console.error('Error confirming import:', error);
      throw error;
    }
  }

  /**
   * Create export (xuất kho)
   */
  static async createExport(data: CreateExportData): Promise<any> {
    try {
      // Generate export number
      const exportNumber = await this.generateExportNumber();

      // Process items
      const items: IExportItem[] = [];
      let totalQuantity = 0;

      for (const itemData of data.items) {
        const product = await Product.findById(itemData.productId);
        if (!product) {
          throw new Error(`Product with ID ${itemData.productId} not found`);
        }

        if (product.stockQuantity < itemData.quantity) {
          throw new Error(`Insufficient stock for product ${product.name}. Available: ${product.stockQuantity}, Requested: ${itemData.quantity}`);
        }

        const item: IExportItem = {
          productId: product._id as any,
          productName: product.name,
          quantity: itemData.quantity,
          batchNumber: itemData.batchNumber || product.batchNumber || undefined,
          expirationDate: product.expirationDate || undefined,
          reason: itemData.reason || undefined,
          status: 'pending',
        };

        items.push(item);
        totalQuantity += itemData.quantity;
      }

      // Create export
      const exportRecord = await Export.create({
        exportNumber,
        reason: data.reason,
        items,
        totalQuantity,
        status: 'pending',
        notes: data.notes,
        issuedBy: data.issuedBy,
      });

      return exportRecord;
    } catch (error) {
      console.error('Error creating export:', error);
      throw error;
    }
  }

  /**
   * Confirm export (xác nhận xuất kho)
   */
  static async confirmExport(exportId: string, userId: string): Promise<any> {
    try {
      const exportRecord = await Export.findById(exportId);
      if (!exportRecord) {
        throw new Error('Export not found');
      }

      if (exportRecord.status !== 'pending') {
        throw new Error('Export is not in pending status');
      }

      // Update product stock and create stock movements
      for (const item of exportRecord.items) {
        const product = await Product.findById(item.productId);
        if (!product) continue;

        const previousStock = product.stockQuantity;
        const newStock = Math.max(0, previousStock - item.quantity);

        // Update product stock
        await Product.findByIdAndUpdate(item.productId, {
          $inc: { stockQuantity: -item.quantity }
        });

        // Create stock movement
        await this.createStockMovement({
          productId: String(item.productId),
          productName: item.productName,
          movementType: 'export',
          quantity: -item.quantity,
          previousStock,
          newStock,
          referenceType: 'export',
          referenceId: exportId,
          referenceNumber: exportRecord.exportNumber,
          batchNumber: item.batchNumber || undefined,
          expirationDate: item.expirationDate || undefined,
          reason: item.reason || exportRecord.reason,
          performedBy: userId,
        });

        // Update item status
        item.status = 'completed';
      }

      // Update export status
      exportRecord.status = 'completed';
      exportRecord.issuedAt = new Date();
      await exportRecord.save();

      return exportRecord;
    } catch (error) {
      console.error('Error confirming export:', error);
      throw error;
    }
  }

  /**
   * Stock adjustment
   */
  static async adjustStock(data: StockAdjustmentData): Promise<any> {
    try {
      const product = await Product.findById(data.productId);
      if (!product) {
        throw new Error('Product not found');
      }

      const previousStock = product.stockQuantity;
      const newStock = Math.max(0, previousStock + data.quantity);

      // Update product stock
      await Product.findByIdAndUpdate(data.productId, {
        stockQuantity: newStock
      });

      // Create stock movement
      await this.createStockMovement({
        productId: data.productId,
        productName: product.name,
        movementType: 'adjustment',
        quantity: data.quantity,
        previousStock,
        newStock,
        referenceType: 'adjustment',
        referenceId: data.productId,
        referenceNumber: `ADJ-${Date.now()}`,
        batchNumber: product.batchNumber || undefined,
        expirationDate: product.expirationDate || undefined,
        reason: data.reason,
        performedBy: data.performedBy,
      });

      return {
        productId: data.productId,
        productName: product.name,
        previousStock,
        newStock,
        adjustment: data.quantity,
        reason: data.reason
      };
    } catch (error) {
      console.error('Error adjusting stock:', error);
      throw error;
    }
  }

  /**
   * Get stock movements
   */
  static async getStockMovements(filters: {
    productId?: string;
    movementType?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  } = {}): Promise<{
    movements: any[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  }> {
    const {
      productId,
      movementType,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = filters;

    const offset = (page - 1) * limit;
    const conditions: any = {};

    if (productId) conditions.productId = productId;
    if (movementType) conditions.movementType = movementType;

    if (startDate || endDate) {
      conditions.createdAt = {};
      if (startDate) conditions.createdAt.$gte = startDate;
      if (endDate) conditions.createdAt.$lte = endDate;
    }

    const movements = await StockMovement.find(conditions)
      .populate('performedBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean();

    const total = await StockMovement.countDocuments(conditions);

    return {
      movements,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get low stock products
   */
  static async getLowStockProducts(threshold: number = 10): Promise<any[]> {
    const products = await Product.find({
      stockQuantity: { $lte: threshold },
      inStock: true
    }).populate('categoryId', 'name').lean();

    return products.map(product => ({
      id: product._id,
      name: product.name,
      currentStock: product.stockQuantity,
      threshold,
      category: (product.categoryId as any)?.name,
      batchNumber: product.batchNumber,
      expirationDate: product.expirationDate,
      isLowStock: product.stockQuantity <= threshold,
      isOutOfStock: product.stockQuantity === 0,
    }));
  }

  /**
   * Get inventory statistics
   */
  static async getInventoryStats(): Promise<{
    totalProducts: number;
    totalStockValue: number;
    lowStockProducts: number;
    outOfStockProducts: number;
    totalImports: number;
    totalExports: number;
    recentMovements: number;
  }> {
    const [
      totalProducts,
      lowStockProducts,
      outOfStockProducts,
      totalImports,
      totalExports,
      recentMovements
    ] = await Promise.all([
      Product.countDocuments({ inStock: true }),
      Product.countDocuments({ stockQuantity: { $lte: 10, $gt: 0 }, inStock: true }),
      Product.countDocuments({ stockQuantity: 0, inStock: true }),
      Import.countDocuments(),
      Export.countDocuments(),
      StockMovement.countDocuments({
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      })
    ]);

    // Calculate total stock value (simplified)
    const products = await Product.find({ inStock: true }).lean();
    const totalStockValue = products.reduce((sum, product) => {
      return sum + (product.price * product.stockQuantity);
    }, 0);

    return {
      totalProducts,
      totalStockValue,
      lowStockProducts,
      outOfStockProducts,
      totalImports,
      totalExports,
      recentMovements,
    };
  }
}
