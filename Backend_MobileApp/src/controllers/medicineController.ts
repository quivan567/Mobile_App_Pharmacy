import { Request, Response } from 'express';
import { Product, Category } from '../models/schema.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

export class MedicineController {
  // Get all medicines (mapped from products)
  static async getMedicines(req: Request, res: Response) {
    try {
      const {
        page = 1,
        limit = 20,
        search,
        category,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        inStock,
        isHot,
        isNewProduct,
        minPrice,
        maxPrice,
        fuzzy = 'true', // Enable fuzzy search by default
      } = req.query;

      // Validate pagination
      const pageNum = Math.max(1, Number(page));
      const limitNum = Math.min(100, Math.max(1, Number(limit)));
      const offset = (pageNum - 1) * limitNum;

      const conditions: any = {};
      let textSearchScore: any = null;
      let useFuzzySearch = fuzzy === 'true' || fuzzy === true;

      // Use MongoDB text search for better performance and relevance scoring
      // Text search requires at least 2 characters (MongoDB limitation)
      if (search) {
        const searchTerm = String(search).trim();
        
        // Minimum 2 characters for text search (MongoDB requirement)
        if (searchTerm.length >= 2) {
          // Use text search with relevance scoring
          conditions.$text = { $search: searchTerm };
          textSearchScore = { score: { $meta: 'textScore' } };
          
          // If fuzzy search is enabled and no results found, we'll add regex fallback
          // This will be handled after the initial query
          console.log('Using text search for query:', searchTerm, 'Fuzzy:', useFuzzySearch);
        } else if (searchTerm.length === 1) {
          // Fallback to regex for single character (less common case)
          // This is less efficient but provides better UX
          conditions.$or = [
            { name: { $regex: searchTerm, $options: 'i' } },
            { description: { $regex: searchTerm, $options: 'i' } },
            { brand: { $regex: searchTerm, $options: 'i' } },
          ];
          
          console.log('Using regex search for single character:', searchTerm);
        }
      }

      // Filter by price range
      if (minPrice || maxPrice) {
        conditions.price = {} as any;
        if (minPrice) {
          (conditions.price as any).$gte = Number(minPrice);
        }
        if (maxPrice) {
          (conditions.price as any).$lte = Number(maxPrice);
        }
      }

      // Filter by category
      if (category) {
        try {
          conditions.categoryId = category;
        } catch (error) {
          // Invalid category ID format
        }
      }

      // Filter by stock status
      if (inStock !== undefined) {
        conditions.inStock = inStock === 'true' || inStock === true;
      }

      // Filter by hot flag
      if (isHot !== undefined) {
        conditions.isHot = isHot === 'true' || isHot === true;
      }

      // Filter by new flag
      if (isNewProduct !== undefined) {
        conditions.isNewProduct = isNewProduct === 'true' || isNewProduct === true;
      }

      // Validate sortBy
      const allowedSortFields = ['createdAt', 'name', 'price', 'stockQuantity'];
      const sortField = allowedSortFields.includes(String(sortBy)) ? String(sortBy) : 'createdAt';
      
      // Build sort object - prioritize text search score if available
      const sort: Record<string, 1 | -1 | any> = {};
      if (textSearchScore && conditions.$text) {
        // Sort by relevance score first (descending), then by specified field
        sort.score = -1; // Higher score = more relevant
        sort[sortField] = sortOrder === 'asc' ? 1 : -1;
      } else {
        sort[sortField] = sortOrder === 'asc' ? 1 : -1;
      }

      let query = Product.find(conditions)
        .populate('categoryId', 'name')
        .sort(sort)
        .skip(offset)
        .limit(limitNum);

      // Add text search score projection if using text search
      if (textSearchScore && conditions.$text) {
        query = query.select({ ...textSearchScore });
      }

      let products = await query.lean();

      // Fuzzy search fallback: if no results and fuzzy is enabled, try regex search
      if (useFuzzySearch && search && products.length === 0 && conditions.$text) {
        const searchTerm = String(search).trim();
        if (searchTerm.length >= 2) {
          console.log('No results from text search, trying fuzzy search with regex');
          
          // Remove text search condition and use regex instead for fuzzy matching
          const fuzzyConditions = { ...conditions };
          delete fuzzyConditions.$text;
          
          // Create regex pattern that allows for character variations (fuzzy matching)
          // This helps with typos and variations
          const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          fuzzyConditions.$or = [
            { name: { $regex: escapedTerm, $options: 'i' } },
            { description: { $regex: escapedTerm, $options: 'i' } },
            { brand: { $regex: escapedTerm, $options: 'i' } },
          ];

          // Remove text search score from sort
          const fuzzySort: Record<string, 1 | -1> = {};
          fuzzySort[sortField] = sortOrder === 'asc' ? 1 : -1;

          products = await Product.find(fuzzyConditions)
            .populate('categoryId', 'name')
            .sort(fuzzySort)
            .skip(offset)
            .limit(limitNum)
            .lean();
          
          console.log('Fuzzy search found', products.length, 'results');
        }
      }

      // Transform products to medicine format
      const medicines = products.map(product => ({
        _id: product._id,
        name: product.name,
        genericName: product.name,
        manufacturerId: product.brand || '',
        category: product.categoryId?.name || '',
        categoryId: product.categoryId?._id || null,
        strength: product.description || '',
        unit: product.unit,
        purchasePrice: Math.round(product.price * 0.7),
        salePrice: product.price,
        price: product.price,
        originalPrice: product.originalPrice || product.price,
        imageUrl: product.imageUrl || '/medicine-images/default-medicine.jpg',
        image: product.imageUrl || '/medicine-images/default-medicine.jpg',
        stock: product.stockQuantity || 0,
        minStock: 10,
        expiryDate: product.expirationDate,
        isHot: product.isHot || false,
        isNewProduct: product.isNewProduct || false,
        inStock: product.inStock || false,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      }));

      const totalCount = await Product.countDocuments(conditions);

      console.log('Search results:', {
        searchTerm: search,
        found: medicines.length,
        total: totalCount,
        conditions: JSON.stringify(conditions),
      });

      res.json({
        success: true,
        data: medicines,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalCount,
          pages: Math.ceil(totalCount / limitNum),
        },
      });
    } catch (error: any) {
      console.error('Get medicines error:', {
        message: error.message,
        stack: error.stack,
        query: req.query,
      });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch medicines',
        ...(process.env.NODE_ENV === 'development' && { error: error.message }),
      });
    }
  }

  // Get single medicine by ID
  static async getMedicineById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      // Validate ID format
      if (!id || id.length < 1) {
        return res.status(400).json({
          success: false,
          message: 'Invalid medicine ID',
        });
      }

      let product;
      try {
        product = await Product.findById(id)
          .populate('categoryId', 'name')
          .lean();
      } catch (error: any) {
        if (error.name === 'CastError') {
          return res.status(400).json({
            success: false,
            message: 'Invalid medicine ID format',
          });
        }
        throw error;
      }

      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Medicine not found',
        });
      }

      // Transform product to medicine format
      const medicine = {
        _id: product._id,
        name: product.name,
        genericName: product.name,
        manufacturerId: product.brand || '',
        category: product.categoryId?.name || '',
        categoryId: product.categoryId?._id || null,
        strength: product.description || '',
        unit: product.unit,
        purchasePrice: Math.round(product.price * 0.7),
        salePrice: product.price,
        price: product.price,
        originalPrice: product.originalPrice || product.price,
        imageUrl: product.imageUrl || '/medicine-images/default-medicine.jpg',
        image: product.imageUrl || '/medicine-images/default-medicine.jpg',
        stock: product.stockQuantity || 0,
        minStock: 10,
        expiryDate: product.expirationDate,
        isHot: product.isHot || false,
        isNewProduct: product.isNewProduct || false,
        inStock: product.inStock || false,
        description: product.description || '',
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      };

      res.json({
        success: true,
        data: medicine,
      });
    } catch (error: any) {
      console.error('Get medicine by ID error:', {
        message: error.message,
        stack: error.stack,
        id: req.params.id,
      });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch medicine',
        ...(process.env.NODE_ENV === 'development' && { error: error.message }),
      });
    }
  }

  // Get hot medicines
  static async getHotMedicines(req: Request, res: Response) {
    try {
      const { limit = 10 } = req.query;

      const hotProducts = await Product.find({ isHot: true, inStock: true })
        .populate('categoryId', 'name')
        .sort({ createdAt: -1 })
        .limit(Number(limit))
        .lean();

      // Transform products to medicine format
      const medicines = hotProducts.map(product => ({
        _id: product._id,
        name: product.name,
        genericName: product.name,
        manufacturerId: product.brand || '',
        category: product.categoryId?.name || '',
        strength: product.description || '',
        unit: product.unit,
        purchasePrice: Math.round(product.price * 0.7),
        salePrice: product.price,
        price: product.price,
        originalPrice: product.originalPrice,
        imageUrl: product.imageUrl,
        image: product.imageUrl,
        stock: product.stockQuantity,
        minStock: 10,
        expiryDate: product.expirationDate,
        isHot: product.isHot || false,
        isNewProduct: product.isNewProduct || false,
        inStock: product.inStock || false,
        createdAt: product.createdAt,
      }));

      res.json({
        success: true,
        data: medicines,
      });
    } catch (error) {
      console.error('Get hot medicines error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Create new medicine (maps to product)
  static async createMedicine(req: AuthenticatedRequest, res: Response) {
    try {
      const {
        name,
        genericName,
        manufacturerId,
        category,
        strength,
        unit,
        purchasePrice,
        salePrice,
        stock,
        minStock,
        expiryDate,
      } = req.body;

      // Find or create category
      let categoryDoc = await Category.findOne({ name: category });
      if (!categoryDoc) {
        categoryDoc = await Category.create({
          name: category,
          icon: 'Pill',
          slug: category.toLowerCase().replace(/\s+/g, '-'),
          description: category,
        });
      }

      // Create product from medicine data
      const productData = {
        name: name,
        description: strength,
        price: salePrice,
        originalPrice: Math.round(salePrice * 1.15), // Add 15% markup
        discountPercentage: 0,
        imageUrl: '/medicine-images/default-medicine.jpg', // Default image
        categoryId: categoryDoc._id,
        brand: manufacturerId,
        unit: unit,
        inStock: stock > 0,
        stockQuantity: stock || 0,
        isHot: false,
        isNewProduct: true, // Mark as new when created
        isPrescription: name.toLowerCase().includes('prescription') || 
                       genericName.toLowerCase().includes('prescription') ||
                       category.toLowerCase().includes('kê đơn'),
        expirationDate: expiryDate ? new Date(expiryDate) : undefined,
      };

      const newProduct = await Product.create(productData);

      // Return medicine format
      const medicine = {
        _id: newProduct._id,
        name: newProduct.name,
        genericName: genericName || newProduct.name,
        manufacturerId: manufacturerId || '',
        category: categoryDoc.name,
        strength: newProduct.description,
        unit: newProduct.unit,
        purchasePrice: purchasePrice || Math.round(newProduct.price * 0.7),
        salePrice: newProduct.price,
        stock: newProduct.stockQuantity,
        minStock: minStock || 10,
        expiryDate: newProduct.expirationDate,
        createdAt: newProduct.createdAt,
      };

      res.status(201).json({
        success: true,
        message: 'Medicine created successfully',
        data: medicine,
      });
    } catch (error) {
      console.error('Create medicine error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Update medicine (maps to product)
  static async updateMedicine(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const {
        name,
        genericName,
        manufacturerId,
        category,
        strength,
        unit,
        purchasePrice,
        salePrice,
        stock,
        minStock,
        expiryDate,
      } = req.body;

      const existingProduct = await Product.findById(id);
      if (!existingProduct) {
        return res.status(404).json({
          success: false,
          message: 'Medicine not found',
        });
      }

      // Find or create category
      let categoryDoc = await Category.findOne({ name: category });
      if (!categoryDoc) {
        categoryDoc = await Category.create({
          name: category,
          icon: 'Pill',
          slug: category.toLowerCase().replace(/\s+/g, '-'),
          description: category,
        });
      }

      // Update product
      const updateData = {
        name: name,
        description: strength,
        price: salePrice,
        originalPrice: Math.round(salePrice * 1.15),
        categoryId: categoryDoc._id,
        brand: manufacturerId,
        unit: unit,
        inStock: stock > 0,
        stockQuantity: stock || 0,
        expirationDate: expiryDate ? new Date(expiryDate) : undefined,
      };

      const updatedProduct = await Product.findByIdAndUpdate(id, updateData, { new: true });

      // Return medicine format
      const medicine = {
        _id: updatedProduct!._id,
        name: updatedProduct!.name,
        genericName: genericName || updatedProduct!.name,
        manufacturerId: manufacturerId || '',
        category: categoryDoc.name,
        strength: updatedProduct!.description,
        unit: updatedProduct!.unit,
        purchasePrice: purchasePrice || Math.round(updatedProduct!.price * 0.7),
        salePrice: updatedProduct!.price,
        stock: updatedProduct!.stockQuantity,
        minStock: minStock || 10,
        expiryDate: updatedProduct!.expirationDate,
        createdAt: updatedProduct!.createdAt,
      };

      res.json({
        success: true,
        message: 'Medicine updated successfully',
        data: medicine,
      });
    } catch (error) {
      console.error('Update medicine error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Delete medicine (maps to product)
  static async deleteMedicine(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;

      const existingProduct = await Product.findById(id);
      if (!existingProduct) {
        return res.status(404).json({
          success: false,
          message: 'Medicine not found',
        });
      }

      await Product.findByIdAndDelete(id);

      res.json({
        success: true,
        message: 'Medicine deleted successfully',
      });
    } catch (error) {
      console.error('Delete medicine error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }
}
