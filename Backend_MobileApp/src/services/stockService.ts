import mongoose from 'mongoose';
import { Product } from '../models/schema.js';

export interface StockReservation {
  productId: mongoose.Types.ObjectId;
  quantity: number;
}

export interface StockCheckResult {
  valid: boolean;
  insufficientProducts: Array<{
    productId: string;
    productName: string;
    requested: number;
    available: number;
  }>;
}

/**
 * Stock Management Service
 * Handles stock operations with atomicity and consistency
 */
export class StockService {
  /**
   * Check if products have sufficient stock
   * @param items Array of {productId, quantity}
   * @param session Optional MongoDB session for transaction
   * @returns StockCheckResult with validation status
   */
  static async checkStock(
    items: Array<{ productId: string | mongoose.Types.ObjectId; quantity: number }>,
    session?: mongoose.ClientSession
  ): Promise<StockCheckResult> {
    const insufficientProducts: StockCheckResult['insufficientProducts'] = [];

    for (const item of items) {
      const productId = typeof item.productId === 'string' 
        ? new mongoose.Types.ObjectId(item.productId)
        : item.productId;

      const product = await Product.findById(productId)
        .session(session || null)
        .select('name inStock stockQuantity')
        .lean();

      if (!product) {
        insufficientProducts.push({
          productId: productId.toString(),
          productName: 'Unknown Product',
          requested: item.quantity,
          available: 0,
        });
        continue;
      }

      if (!product.inStock) {
        insufficientProducts.push({
          productId: productId.toString(),
          productName: product.name,
          requested: item.quantity,
          available: 0,
        });
        continue;
      }

      const availableStock = product.stockQuantity || 0;
      if (availableStock < item.quantity) {
        insufficientProducts.push({
          productId: productId.toString(),
          productName: product.name,
          requested: item.quantity,
          available: availableStock,
        });
      }
    }

    return {
      valid: insufficientProducts.length === 0,
      insufficientProducts,
    };
  }

  /**
   * Reserve stock (decrease stock quantity)
   * Should be called within a transaction
   * @param items Array of {productId, quantity}
   * @param session MongoDB session (required for transaction)
   * @returns Array of updated products
   */
  static async reserveStock(
    items: Array<{ productId: string | mongoose.Types.ObjectId; quantity: number }>,
    session: mongoose.ClientSession
  ): Promise<Array<{ productId: mongoose.Types.ObjectId; quantity: number; newStock: number }>> {
    const results = [];

    for (const item of items) {
      const productId = typeof item.productId === 'string'
        ? new mongoose.Types.ObjectId(item.productId)
        : item.productId;

      // Use findOneAndUpdate with session for atomic operation
      const product = await Product.findOneAndUpdate(
        {
          _id: productId,
          inStock: true,
          stockQuantity: { $gte: item.quantity }, // Ensure sufficient stock
        },
        {
          $inc: { stockQuantity: -item.quantity },
        },
        {
          session,
          new: true,
          select: 'name stockQuantity',
        }
      );

      if (!product) {
        throw new Error(
          `Insufficient stock for product ${productId}. Stock may have been reserved by another transaction.`
        );
      }

      // If stock reaches 0, mark as out of stock
      if (product.stockQuantity <= 0) {
        await Product.updateOne(
          { _id: productId },
          { $set: { inStock: false, stockQuantity: 0 } },
          { session }
        );
        product.stockQuantity = 0;
      }

      results.push({
        productId,
        quantity: item.quantity,
        newStock: product.stockQuantity,
      });
    }

    return results;
  }

  /**
   * Release stock (increase stock quantity)
   * Used when order is cancelled or payment fails
   * @param items Array of {productId, quantity}
   * @param session Optional MongoDB session for transaction
   */
  static async releaseStock(
    items: Array<{ productId: string | mongoose.Types.ObjectId; quantity: number }>,
    session?: mongoose.ClientSession
  ): Promise<void> {
    for (const item of items) {
      const productId = typeof item.productId === 'string'
        ? new mongoose.Types.ObjectId(item.productId)
        : item.productId;

      const updateData: any = {
        $inc: { stockQuantity: item.quantity },
        $set: { inStock: true }, // Mark as in stock when releasing
      };

      await Product.updateOne(
        { _id: productId },
        updateData,
        { session: session || undefined }
      );
    }
  }

  /**
   * Get current stock for a product
   * @param productId Product ID
   * @param session Optional MongoDB session
   * @returns Stock information
   */
  static async getStock(
    productId: string | mongoose.Types.ObjectId,
    session?: mongoose.ClientSession
  ): Promise<{ inStock: boolean; stockQuantity: number } | null> {
    const id = typeof productId === 'string'
      ? new mongoose.Types.ObjectId(productId)
      : productId;

    const product = await Product.findById(id)
      .session(session || null)
      .select('inStock stockQuantity')
      .lean();

    if (!product) {
      return null;
    }

    return {
      inStock: product.inStock || false,
      stockQuantity: product.stockQuantity || 0,
    };
  }

  /**
   * Validate and reserve stock in a single atomic operation
   * This is the recommended method for order creation
   * @param items Array of {productId, quantity}
   * @param session MongoDB session (required)
   * @returns StockCheckResult and reserved items
   */
  static async validateAndReserveStock(
    items: Array<{ productId: string | mongoose.Types.ObjectId; quantity: number }>,
    session: mongoose.ClientSession
  ): Promise<{ checkResult: StockCheckResult; reservedItems: Array<{ productId: mongoose.Types.ObjectId; quantity: number; newStock: number }> }> {
    // First check stock
    const checkResult = await this.checkStock(items, session);

    if (!checkResult.valid) {
      return { checkResult, reservedItems: [] };
    }

    // If valid, reserve stock
    const reservedItems = await this.reserveStock(items, session);

    return { checkResult, reservedItems };
  }
}

