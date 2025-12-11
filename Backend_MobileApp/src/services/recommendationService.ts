import mongoose from 'mongoose';
import { Product, OrderItem, ViewHistory, SearchHistory } from '../models/schema.js';

/**
 * Service để đề xuất sản phẩm dựa trên lịch sử mua hàng
 */
export class RecommendationService {
  /**
   * Đề xuất sản phẩm dựa trên lịch sử mua hàng của user
   */
  static async getRecommendationsByHistory(userId: string, limit: number = 10) {
    try {
      // Lấy danh sách sản phẩm user đã mua (từ OrderItem)
      const userOrders = await mongoose.connection.db
        .collection('orders')
        .find({ userId: new mongoose.Types.ObjectId(userId) })
        .toArray();

      const orderIds = userOrders.map(order => order._id);

      if (orderIds.length === 0) {
        // Nếu user chưa mua gì, trả về sản phẩm phổ biến
        return await this.getPopularProducts(limit);
      }

      // Lấy các sản phẩm đã mua
      const purchasedProducts = await mongoose.connection.db
        .collection('orderitems')
        .aggregate([
          { $match: { orderId: { $in: orderIds } } },
          {
            $group: {
              _id: '$productId',
              totalQuantity: { $sum: '$quantity' },
              purchaseCount: { $sum: 1 },
            },
          },
          { $sort: { totalQuantity: -1, purchaseCount: -1 } },
          { $limit: 20 }, // Lấy top 20 sản phẩm hay mua
        ])
        .toArray();

      const productIds = purchasedProducts.map(p => p._id);

      if (productIds.length === 0) {
        return await this.getPopularProducts(limit);
      }

      // Lấy thông tin sản phẩm
      const products = await Product.find({
        _id: { $in: productIds },
        inStock: true,
      })
        .limit(limit)
        .lean();

      return products;
    } catch (error) {
      console.error('Error in getRecommendationsByHistory:', error);
      return await this.getPopularProducts(limit);
    }
  }

  /**
   * Đề xuất sản phẩm dựa trên category của sản phẩm đã mua/xem
   */
  static async getRecommendationsByCategory(
    userId: string,
    categoryName: string,
    limit: number = 10
  ) {
    try {
      // Lấy các sản phẩm trong cùng category
      const db = mongoose.connection.db;
      const medicinesCollection = db?.collection('medicines');

      if (!medicinesCollection) {
        return await this.getPopularProducts(limit);
      }

      // Tìm medicines có category này
      const medicinesWithCategory = await medicinesCollection
        .find({
          $or: [
            { category: { $regex: categoryName, $options: 'i' } },
            { mainCategory: { $regex: categoryName, $options: 'i' } },
          ],
        })
        .limit(100)
        .toArray();

      const medicineNames = medicinesWithCategory
        .map(m => m.name?.trim())
        .filter(name => name && name.length > 0);

      if (medicineNames.length === 0) {
        return await this.getPopularProducts(limit);
      }

      // Tạo regex patterns để match products
      const namePatterns = medicineNames.map(name => {
        const cleanName = name.split('(')[0].trim();
        return {
          exact: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
          clean: cleanName !== name
            ? new RegExp(`^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i')
            : null,
        };
      });

      const nameConditions = namePatterns.map(pattern => {
        if (pattern.clean) {
          return {
            $or: [{ name: { $regex: pattern.exact } }, { name: { $regex: pattern.clean } }],
          };
        }
        return { name: { $regex: pattern.exact } };
      });

      // Lấy products trong category này, ưu tiên những sản phẩm user đã xem/mua
      const viewedProducts = await ViewHistory.find({ userId: new mongoose.Types.ObjectId(userId) })
        .distinct('productId')
        .limit(50);

      const products = await Product.find({
        $or: nameConditions,
        inStock: true,
        _id: { $nin: viewedProducts }, // Loại bỏ sản phẩm đã xem
      })
        .limit(limit)
        .lean();

      return products;
    } catch (error) {
      console.error('Error in getRecommendationsByCategory:', error);
      return await this.getPopularProducts(limit);
    }
  }

  /**
   * Đề xuất sản phẩm thay thế cho sản phẩm hiện tại
   * Dựa trên cùng activeIngredient, groupTherapeutic, hoặc manufacturer
   */
  static async getAlternativeProducts(medicineId: string, limit: number = 5) {
    try {
      const product = await Product.findById(medicineId).lean();

      if (!product) {
        return [];
      }

      // Tìm trong medicines collection để lấy thông tin về activeIngredient, groupTherapeutic
      const db = mongoose.connection.db;
      const medicinesCollection = db?.collection('medicines');

      if (!medicinesCollection) {
        // Fallback: Tìm sản phẩm cùng brand hoặc category
        const alternatives = await Product.find({
          _id: { $ne: medicineId },
          $or: [{ brand: product.brand }, { categoryId: product.categoryId }],
          inStock: true,
        })
          .limit(limit)
          .lean();

        return alternatives;
      }

      // Tìm medicine tương ứng với product
      const medicine = await medicinesCollection.findOne({
        name: { $regex: product.name.split('(')[0].trim(), $options: 'i' },
      });

      if (!medicine) {
        // Fallback: Tìm sản phẩm cùng brand
        const alternatives = await Product.find({
          _id: { $ne: medicineId },
          brand: product.brand,
          inStock: true,
        })
          .limit(limit)
          .lean();

        return alternatives;
      }

      // Tìm medicines có cùng activeIngredient hoặc groupTherapeutic
      const alternativeMedicines = await medicinesCollection
        .find({
          _id: { $ne: medicine._id },
          $or: [
            medicine.activeIngredient
              ? { activeIngredient: medicine.activeIngredient }
              : {},
            medicine.groupTherapeutic
              ? { groupTherapeutic: medicine.groupTherapeutic }
              : {},
            medicine.manufacturerId
              ? { manufacturerId: medicine.manufacturerId }
              : {},
          ],
        })
        .limit(20)
        .toArray();

      if (alternativeMedicines.length === 0) {
        // Fallback: Tìm sản phẩm cùng brand
        const alternatives = await Product.find({
          _id: { $ne: medicineId },
          brand: product.brand,
          inStock: true,
        })
          .limit(limit)
          .lean();

        return alternatives;
      }

      // Tìm products tương ứng với alternative medicines
      const medicineNames = alternativeMedicines
        .map(m => m.name?.trim())
        .filter(name => name && name.length > 0);

      const namePatterns = medicineNames.map(name => {
        const cleanName = name.split('(')[0].trim();
        return {
          exact: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
          clean: cleanName !== name
            ? new RegExp(`^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i')
            : null,
        };
      });

      const nameConditions = namePatterns.map(pattern => {
        if (pattern.clean) {
          return {
            $or: [{ name: { $regex: pattern.exact } }, { name: { $regex: pattern.clean } }],
          };
        }
        return { name: { $regex: pattern.exact } };
      });

      const alternatives = await Product.find({
        $or: nameConditions,
        _id: { $ne: medicineId },
        inStock: true,
      })
        .limit(limit)
        .lean();

      return alternatives;
    } catch (error) {
      console.error('Error in getAlternativeProducts:', error);
      return [];
    }
  }

  /**
   * Lấy sản phẩm phổ biến (bán chạy)
   */
  static async getPopularProducts(limit: number = 10) {
    try {
      // Lấy sản phẩm bán chạy nhất từ OrderItem
      const popularProducts = await mongoose.connection.db
        .collection('orderitems')
        .aggregate([
          {
            $group: {
              _id: '$productId',
              totalQuantity: { $sum: '$quantity' },
              orderCount: { $sum: 1 },
            },
          },
          { $sort: { totalQuantity: -1, orderCount: -1 } },
          { $limit: limit },
        ])
        .toArray();

      const productIds = popularProducts.map(p => p._id);

      if (productIds.length === 0) {
        // Nếu không có order nào, trả về sản phẩm mới nhất
        return await Product.find({ inStock: true })
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean();
      }

      const products = await Product.find({
        _id: { $in: productIds },
        inStock: true,
      }).lean();

      // Sắp xếp lại theo thứ tự popularity
      const productMap = new Map(products.map(p => [String(p._id), p]));
      const sortedProducts = productIds
        .map(id => productMap.get(String(id)))
        .filter(p => p !== undefined);

      return sortedProducts;
    } catch (error) {
      console.error('Error in getPopularProducts:', error);
      // Fallback: Trả về sản phẩm mới nhất
      return await Product.find({ inStock: true })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
    }
  }

  /**
   * Tìm kiếm thông minh với ranking dựa trên lịch sử
   */
  static async smartSearch(
    keyword: string,
    userId?: string,
    limit: number = 20
  ) {
    try {
      const searchTerm = keyword.trim().toLowerCase();

      // Tìm products match với keyword
      const products = await Product.find({
        $or: [
          { name: { $regex: searchTerm, $options: 'i' } },
          { description: { $regex: searchTerm, $options: 'i' } },
          { brand: { $regex: searchTerm, $options: 'i' } },
        ],
        inStock: true,
      })
        .limit(limit * 2) // Lấy nhiều hơn để rank
        .lean();

      if (products.length === 0) {
        return [];
      }

      // Nếu không có userId, trả về kết quả đơn giản
      if (!userId) {
        return products.slice(0, limit);
      }

      // Tính điểm ranking cho mỗi product
      const userIdObj = new mongoose.Types.ObjectId(userId);

      // Lấy lịch sử mua hàng
      const userOrders = await mongoose.connection.db
        .collection('orders')
        .find({ userId: userIdObj })
        .toArray();

      const orderIds = userOrders.map(order => order._id);
      const purchasedProducts = await mongoose.connection.db
        .collection('orderitems')
        .find({ orderId: { $in: orderIds } })
        .distinct('productId');

      // Lấy lịch sử xem
      const viewedProducts = await ViewHistory.find({ userId: userIdObj })
        .distinct('productId');

      // Tính điểm cho mỗi product
      const scoredProducts = products.map(product => {
        let score = 0;
        const productIdStr = String(product._id);

        // +5 điểm nếu đã từng mua
        if (purchasedProducts.some(id => String(id) === productIdStr)) {
          score += 5;
        }

        // +3 điểm nếu đã từng xem
        if (viewedProducts.some(id => String(id) === productIdStr)) {
          score += 3;
        }

        // +4 điểm nếu keyword match với name (exact match)
        if (product.name.toLowerCase().includes(searchTerm)) {
          score += 4;
        }

        // +2 điểm nếu là sản phẩm bán chạy (isHot)
        if (product.isHot) {
          score += 2;
        }

        // +1 điểm nếu là sản phẩm mới
        if (product.isNewProduct) {
          score += 1;
        }

        return { ...product, _score: score };
      });

      // Sắp xếp theo điểm
      scoredProducts.sort((a, b) => b._score - a._score);

      // Trả về top results
      return scoredProducts.slice(0, limit).map(({ _score, ...product }) => product);
    } catch (error) {
      console.error('Error in smartSearch:', error);
      // Fallback: Tìm kiếm đơn giản
      return await Product.find({
        $or: [
          { name: { $regex: keyword, $options: 'i' } },
          { description: { $regex: keyword, $options: 'i' } },
        ],
        inStock: true,
      })
        .limit(limit)
        .lean();
    }
  }
}

