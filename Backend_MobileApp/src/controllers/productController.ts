import { Request, Response } from 'express';
import { Product, Category } from '../models/schema.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

export function toProductDto(p: any) {
  return {
    id: String(p._id),
    name: p.name,
    description: p.description,
    price: typeof p.price === 'number' ? p.price.toString() : p.price,
    originalPrice: p.originalPrice != null ? (typeof p.originalPrice === 'number' ? p.originalPrice.toString() : p.originalPrice) : undefined,
    discountPercentage: p.discountPercentage ?? 0,
    imageUrl: p.imageUrl,
    brand: p.brand,
    unit: p.unit ?? 'Hộp',
    inStock: !!p.inStock,
    stockQuantity: p.stockQuantity ?? 0,
    isHot: !!p.isHot,
    isNewProduct: !!p.isNewProduct,
    isPrescription: !!p.isPrescription,
    // Expiration tracking fields
    expirationDate: p.expirationDate,
    batchNumber: p.batchNumber,
    manufacturingDate: p.manufacturingDate,
    supplierId: p.supplierId ? String(p.supplierId) : undefined,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    categoryId: p.categoryId ? String(p.categoryId) : undefined,
  } as any;
}

export class ProductController {
  // Get all products with pagination and filters
  static async getProducts(req: Request, res: Response) {
    try {
      const {
        page = 1,
        limit = 20,
        search,
        category,
        brand,
        minPrice,
        maxPrice,
        inStock,
        isHot,
        isNewProduct,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = req.query;

      const offset = (Number(page) - 1) * Number(limit);
      const conditions: any = {};

      // Search by name or description
      if (search) {
        conditions.$text = { $search: String(search) };
      }

      // Filter by category
      if (category) {
        conditions.categoryId = category;
      }

      // Filter by category slug
      if (req.query.categorySlug) {
        const categoryDoc = await Category.findOne({ slug: req.query.categorySlug });
        if (categoryDoc) {
          conditions.categoryId = categoryDoc._id;
        }
      }

      // Filter by brand
      if (brand) {
        conditions.brand = { $regex: String(brand), $options: 'i' };
      }

      // Filter by price range
      if (minPrice || maxPrice) {
        conditions.price = {} as any;
        if (minPrice) (conditions.price as any).$gte = Number(minPrice);
        if (maxPrice) (conditions.price as any).$lte = Number(maxPrice);
      }

      // Filter by stock status
      if (inStock !== undefined) {
        conditions.inStock = inStock === 'true';
      }

      // Filter by hot products
      if (isHot !== undefined) {
        conditions.isHot = isHot === 'true';
      }

      // Filter by new products
      if (isNewProduct !== undefined) {
        conditions.isNewProduct = isNewProduct === 'true';
      }

      // Build query
      const sort: Record<string, 1 | -1> = { [String(sortBy)]: sortOrder === 'asc' ? 1 : -1 };

      // Get products with category info
      const productsDocs = await Product.find(conditions)
        .sort(sort)
        .skip(offset)
        .limit(Number(limit))
        .lean();
      const productsList = productsDocs.map(toProductDto);

      // Get total count
      const totalCount = await Product.countDocuments(conditions);

      res.json({
        success: true,
        data: {
          products: productsList,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total: totalCount,
            pages: Math.ceil(totalCount / Number(limit)),
          },
        },
      });
    } catch (error) {
      console.error('Get products error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Get single product by ID
  static async getProductById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const productDoc = await Product.findById(id).lean();

      if (!productDoc) {
        return res.status(404).json({
          success: false,
          message: 'Product not found',
        });
      }

      res.json({
        success: true,
        data: toProductDto(productDoc),
      });
    } catch (error) {
      console.error('Get product by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Create new product (Admin only)
  static async createProduct(req: AuthenticatedRequest, res: Response) {
    try {
      const productData = req.body;

      const newProduct = await Product.create(productData);

      res.status(201).json({
        success: true,
        message: 'Product created successfully',
        data: toProductDto(newProduct.toObject()),
      });
    } catch (error) {
      console.error('Create product error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Update product (Admin only)
  static async updateProduct(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const existingProduct = await Product.findById(id);

      if (!existingProduct) {
        return res.status(404).json({
          success: false,
          message: 'Product not found',
        });
      }

      const updatedProduct = await Product.findByIdAndUpdate(
        id,
        { ...updateData },
        { new: true }
      );

      res.json({
        success: true,
        message: 'Product updated successfully',
        data: updatedProduct ? toProductDto(updatedProduct.toObject()) : null,
      });
    } catch (error) {
      console.error('Update product error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Delete product (Admin only)
  static async deleteProduct(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;

      const existingProduct = await Product.findById(id);

      if (!existingProduct) {
        return res.status(404).json({
          success: false,
          message: 'Product not found',
        });
      }
      await Product.findByIdAndDelete(id);

      res.json({
        success: true,
        message: 'Product deleted successfully',
      });
    } catch (error) {
      console.error('Delete product error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Get hot products
  static async getHotProducts(req: Request, res: Response) {
    try {
      const { limit = 10 } = req.query;

      const hotProducts = await Product.find({ isHot: true, inStock: true })
        .sort({ createdAt: -1 })
        .limit(Number(limit))
        .lean();
      const mapped = hotProducts.map(toProductDto);

      res.json({
        success: true,
        data: mapped,
      });
    } catch (error) {
      console.error('Get hot products error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Get new products
  static async getNewProducts(req: Request, res: Response) {
    try {
      const { limit = 10 } = req.query;

      const newProducts = await Product.find({ isNewProduct: true, inStock: true })
        .sort({ createdAt: -1 })
        .limit(Number(limit))
        .lean();
      const mapped = newProducts.map(toProductDto);

      res.json({
        success: true,
        data: mapped,
      });
    } catch (error) {
      console.error('Get new products error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }
}

