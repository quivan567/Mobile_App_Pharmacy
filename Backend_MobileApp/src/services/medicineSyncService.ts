import mongoose from 'mongoose';
import { Product, Category } from '../models/schema.js';
import fs from 'fs';
import path from 'path';
import { SupabaseStorageService } from './supabaseService.js';

/**
 * Service để đồng bộ dữ liệu từ collection medicines sang collection products
 * Admin project lưu vào collection medicines, client project query từ collection products
 */
export class MedicineSyncService {
  /**
   * Chọn URL ảnh tốt nhất từ các field trong bản ghi medicine.
   * Ưu tiên:
   * 1. Ảnh Supabase có tiền tố "medicine-" (file đã được upload chuẩn)
   * 2. Ảnh Supabase bất kỳ
   * 3. Base64 để được upload lại
   * 4. Các giá trị còn lại
   */
  private static getPreferredImageUrl(medicine: any): string {
    const candidates = [
      medicine?.image,
      medicine?.imageUrl,
      medicine?.imagePath,
    ].filter((v): v is string => typeof v === 'string' && v.trim() !== '');

    // Ưu tiên file Supabase đã chuẩn hóa (tên file bắt đầu bằng medicine-)
    const supabaseMedicineFile = candidates.find(
      (url) =>
        url.includes('supabase.co') &&
        url.includes('medicine-images') &&
        url.includes('medicine-')
    );
    if (supabaseMedicineFile) return supabaseMedicineFile;

    // Tiếp theo là bất kỳ Supabase URL nào
    const supabaseUrl = candidates.find(
      (url) => url.includes('supabase.co') && url.includes('medicine-images')
    );
    if (supabaseUrl) return supabaseUrl;

    // Base64 sẽ được upload lại ở bước dưới
    const base64Image = candidates.find((url) => url.startsWith('data:image/'));
    if (base64Image) return base64Image;

    // Fallback: trả về giá trị đầu tiên nếu có
    return candidates[0] || '';
  }

  /**
   * Sync tất cả medicines từ collection medicines sang products
   */
  static async syncAllMedicines() {
    try {
      const db = mongoose.connection.db;
      if (!db) {
        throw new Error('Database connection not available');
      }

      // Lấy collection medicines trực tiếp
      const medicinesCollection = db.collection('medicines');
      const medicines = await medicinesCollection.find({}).toArray();
      
      // Chỉ log khi có medicines mới (lần đầu sync)
      // console.log(`🔄 Found ${medicines.length} medicines to sync`);

      if (medicines.length === 0) {
        return { synced: 0, created: 0, updated: 0, deleted: 0 };
      }

      // Tìm hoặc tạo category "Thuốc"
      let categoryDoc = await Category.findOne({ slug: 'thuoc' });
      if (!categoryDoc) {
        categoryDoc = await Category.create({
          name: 'Thuốc',
          icon: 'Pill',
          slug: 'thuoc',
          description: 'Các loại thuốc kê đơn và không kê đơn',
        });
        console.log('📁 Created category: Thuốc');
      }

      let created = 0;
      let updated = 0;

      // Sync từng medicine
      for (const medicine of medicines) {
        try {
          // Lấy ID từ medicine (có thể là _id hoặc id)
          const medicineId = medicine._id ? String(medicine._id) : String(medicine.id);

          // Xử lý imageUrl - normalize để đảm bảo format đúng
          let imageUrl = this.getPreferredImageUrl(medicine);
          
          // Nếu imageUrl là empty hoặc null, dùng default
          if (!imageUrl || imageUrl.trim() === '') {
            imageUrl = '/medicine-images/default-medicine.jpg';
            // console.log(`📷 Using default image for ${medicine.name}`);
          } 
          // Nếu là base64 data (data:image/...), upload lên Supabase và cập nhật database
          else if (imageUrl.startsWith('data:image/')) {
            try {
              // Extract base64 data và mime type
              const matches = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
              if (matches) {
                const mimeType = matches[1]; // jpeg, png, etc.
                const base64Data = matches[2];
                
                // Tạo tên file từ medicine name
                const safeName = medicine.name
                  .replace(/[^a-zA-Z0-9]/g, '_')
                  .toLowerCase();
                const extension = mimeType === 'jpeg' ? 'jpg' : mimeType;
                const filename = `${safeName}_${medicineId}.${extension}`;
                const supabasePath = `medicines/${filename}`;
                
                // Kiểm tra xem file đã tồn tại trên Supabase chưa
                const fileExists = await SupabaseStorageService.fileExists('medicine-images', supabasePath);
                
                // Upload lên Supabase nếu chưa tồn tại
                if (!fileExists) {
                  try {
                    const { url } = await SupabaseStorageService.uploadBase64Image(
                      'medicine-images',
                      supabasePath,
                      imageUrl
                    );
                    imageUrl = url;
                    console.log(`📷 Uploaded base64 image to Supabase for ${medicine.name} -> ${url}`);
                    
                    // CẬP NHẬT DATABASE: Thay thế base64 bằng URL
                    await medicinesCollection.updateOne(
                      { _id: medicine._id },
                      { $set: { imageUrl: url, image: url, imagePath: url } }
                    );
                    console.log(`✅ Updated database with Supabase URL for ${medicine.name}`);
                  } catch (supabaseError: any) {
                    console.error(`❌ Error uploading to Supabase:`, supabaseError.message);
                    // Không fallback, chỉ log lỗi và dùng default
                    imageUrl = '/medicine-images/default-medicine.jpg';
                  }
                } else {
                  // File đã tồn tại, lấy public URL
                  imageUrl = SupabaseStorageService.getPublicUrl('medicine-images', supabasePath);
                  console.log(`📷 Using existing Supabase image for ${medicine.name} -> ${imageUrl}`);
                  
                  // CẬP NHẬT DATABASE: Đảm bảo database có URL đúng
                  await medicinesCollection.updateOne(
                    { _id: medicine._id },
                    { $set: { imageUrl: imageUrl, image: imageUrl, imagePath: imageUrl } }
                  );
                }
              } else {
                console.log(`⚠️ Invalid base64 format for ${medicine.name}, using default`);
                imageUrl = '/medicine-images/default-medicine.jpg';
              }
            } catch (error: any) {
              console.error(`❌ Error processing base64 image for ${medicine.name}:`, error.message);
              imageUrl = '/medicine-images/default-medicine.jpg';
            }
          }
          // Nếu là full URL (http/https), giữ nguyên
          else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
            // console.log(`📷 Using full URL for ${medicine.name}: ${imageUrl}`);
            // Giữ nguyên full URL
          } 
          // Nếu là relative path nhưng không bắt đầu bằng /, thêm /medicine-images/
          else if (!imageUrl.startsWith('/')) {
            const originalUrl = imageUrl;
            imageUrl = `/medicine-images/${imageUrl}`;
            // console.log(`📷 Normalized image path for ${medicine.name}: ${originalUrl} -> ${imageUrl}`);
          }
          // Nếu đã là relative path bắt đầu bằng /, giữ nguyên
          else {
            // console.log(`📷 Using relative path for ${medicine.name}: ${imageUrl}`);
          }

          // Map dữ liệu từ medicine sang product format
          const productData: any = {
            name: medicine.name || '',
            // Ưu tiên description (công dụng) thay vì strength (hàm lượng)
            // Chỉ dùng strength nếu description không có
            description: medicine.description || medicine.strength || '',
            price: medicine.salePrice || medicine.price || 0,
            originalPrice: medicine.originalPrice || Math.round((medicine.salePrice || medicine.price || 0) * 1.15),
            discountPercentage: 0,
            imageUrl: imageUrl,
            categoryId: categoryDoc._id,
            // Ưu tiên brand (tên) thay vì manufacturerId (ID)
            // Chỉ dùng manufacturerId nếu brand không có và manufacturerId không phải là ObjectId
            brand: medicine.brand || (medicine.manufacturerId && typeof medicine.manufacturerId === 'string' && !/^[0-9a-fA-F]{24}$/.test(medicine.manufacturerId) ? medicine.manufacturerId : ''),
            unit: medicine.unit || 'Hộp',
            inStock: (medicine.stock || medicine.stockQuantity || 0) > 0,
            stockQuantity: medicine.stock || medicine.stockQuantity || 0,
            isHot: false,
            isNewProduct: medicine.isNew || false,
            isPrescription: medicine.isPrescription || false,
            // Copy createdAt từ medicine để sort đúng
            createdAt: medicine.createdAt ? new Date(medicine.createdAt) : new Date(),
            updatedAt: medicine.updatedAt ? new Date(medicine.updatedAt) : new Date(),
          };

          // Xử lý expiration date
          if (medicine.expiryDate || medicine.expirationDate) {
            productData.expirationDate = medicine.expiryDate 
              ? new Date(medicine.expiryDate) 
              : new Date(medicine.expirationDate);
          }

          // Xử lý manufacturing date
          if (medicine.manufacturingDate) {
            productData.manufacturingDate = new Date(medicine.manufacturingDate);
          }

          // Xử lý batch number
          if (medicine.batchNumber) {
            productData.batchNumber = medicine.batchNumber;
          }

          // Tìm product theo name hoặc ID
          let existingProduct = await Product.findOne({ 
            $or: [
              { name: productData.name },
              { _id: medicineId }
            ]
          });

          if (existingProduct) {
            // Update existing product
            await Product.findByIdAndUpdate(existingProduct._id, productData, { new: true });
            updated++;
          } else {
            // Create new product
            await Product.create(productData);
            created++;
          }
        } catch (error: any) {
          console.error(`❌ Error syncing medicine ${medicine.name}:`, error);
          // Tiếp tục với medicine tiếp theo
        }
      }

      // Xóa products không còn trong medicines collection
      // Chỉ xóa những products thuộc category thuốc và không có trong danh sách medicines
      const allMedicineProducts = await Product.find({ categoryId: categoryDoc._id });
      let deleted = 0;
      
      // Tạo set các medicine names để check nhanh hơn
      const medicineNames = new Set(medicines.map(m => m.name?.toLowerCase().trim()).filter(Boolean));
      const medicineIds = new Set(medicines.map(m => {
        const id = m._id ? String(m._id) : String(m.id);
        return id;
      }));
      
      for (const product of allMedicineProducts) {
        try {
          // Kiểm tra xem product này có tương ứng với medicine nào không
          const productName = product.name?.toLowerCase().trim();
          const productId = String(product._id);
          
          const hasCorrespondingMedicine = 
            medicineIds.has(productId) || 
            (productName && medicineNames.has(productName));

          // Nếu không có medicine tương ứng, xóa product
          // Chỉ xóa nếu product name khớp với pattern của medicines (để tránh xóa nhầm products khác)
          if (!hasCorrespondingMedicine) {
            // Kiểm tra thêm: chỉ xóa nếu product có tên giống với medicine pattern
            // hoặc nếu product được tạo từ medicines (có thể check qua một số field đặc biệt)
            // Để an toàn, chỉ xóa nếu tên product có thể match với medicine name
            const shouldDelete = true; // Có thể thêm logic phức tạp hơn ở đây nếu cần
            
            if (shouldDelete) {
              await Product.findByIdAndDelete(product._id);
              deleted++;
              console.log(`🗑️ Deleted product: ${product.name} (no corresponding medicine found)`);
            }
          }
        } catch (error: any) {
          console.error(`❌ Error checking product ${product.name} for deletion:`, error);
          // Tiếp tục với product tiếp theo
        }
      }

      // Chỉ log khi có thay đổi thực sự
      if (created > 0 || updated > 0 || deleted > 0) {
        console.log(`✅ Sync completed: ${created} created, ${updated} updated, ${deleted} deleted`);
      }
      
      return { 
        synced: medicines.length, 
        created, 
        updated, 
        deleted 
      };
    } catch (error: any) {
      console.error('❌ Error syncing medicines:', error);
      throw error;
    }
  }

  /**
   * Sync một medicine cụ thể từ collection medicines sang products
   */
  static async syncSingleMedicine(medicineId: string) {
    try {
      const db = mongoose.connection.db;
      if (!db) {
        throw new Error('Database connection not available');
      }

      const medicinesCollection = db.collection('medicines');
      const medicine = await medicinesCollection.findOne({ 
        $or: [
          { _id: new mongoose.Types.ObjectId(medicineId) },
          { id: medicineId }
        ]
      });

      if (!medicine) {
        throw new Error(`Medicine with ID ${medicineId} not found`);
      }

      // Tìm hoặc tạo category
      let categoryDoc = await Category.findOne({ slug: 'thuoc' });
      if (!categoryDoc) {
        categoryDoc = await Category.create({
          name: 'Thuốc',
          icon: 'Pill',
          slug: 'thuoc',
          description: 'Các loại thuốc kê đơn và không kê đơn',
        });
      }

      // Xử lý imageUrl - normalize để đảm bảo format đúng
      let imageUrl = this.getPreferredImageUrl(medicine);
      
      // Nếu imageUrl là empty hoặc null, dùng default
      if (!imageUrl || imageUrl.trim() === '') {
        imageUrl = '/medicine-images/default-medicine.jpg';
      } 
      // Nếu là base64 data (data:image/...), upload lên Supabase và cập nhật database
      else if (imageUrl.startsWith('data:image/')) {
        try {
          // Extract base64 data và mime type
          const matches = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
          if (matches) {
            const mimeType = matches[1]; // jpeg, png, etc.
            const base64Data = matches[2];
            
            // Tạo tên file từ medicine name
            const medId = medicine._id ? String(medicine._id) : String(medicine.id);
            const safeName = medicine.name
              .replace(/[^a-zA-Z0-9]/g, '_')
              .toLowerCase();
            const extension = mimeType === 'jpeg' ? 'jpg' : mimeType;
            const filename = `${safeName}_${medId}.${extension}`;
            const supabasePath = `medicines/${filename}`;
            
            // Kiểm tra xem file đã tồn tại trên Supabase chưa
            const fileExists = await SupabaseStorageService.fileExists('medicine-images', supabasePath);
            
            // Upload lên Supabase nếu chưa tồn tại
            if (!fileExists) {
              try {
                const { url } = await SupabaseStorageService.uploadBase64Image(
                  'medicine-images',
                  supabasePath,
                  imageUrl
                );
                imageUrl = url;
                console.log(`📷 Uploaded base64 image to Supabase for ${medicine.name} -> ${url}`);
                
                // CẬP NHẬT DATABASE: Thay thế base64 bằng URL
                await medicinesCollection.updateOne(
                  { _id: medicine._id },
                  { $set: { imageUrl: url, image: url, imagePath: url } }
                );
                console.log(`✅ Updated database with Supabase URL for ${medicine.name}`);
              } catch (supabaseError: any) {
                console.error(`❌ Error uploading to Supabase:`, supabaseError.message);
                // Không fallback, chỉ log lỗi và dùng default
                imageUrl = '/medicine-images/default-medicine.jpg';
              }
            } else {
              // File đã tồn tại, lấy public URL
              imageUrl = SupabaseStorageService.getPublicUrl('medicine-images', supabasePath);
              console.log(`📷 Using existing Supabase image for ${medicine.name} -> ${imageUrl}`);
              
              // CẬP NHẬT DATABASE: Đảm bảo database có URL đúng
              await medicinesCollection.updateOne(
                { _id: medicine._id },
                { $set: { imageUrl: imageUrl, image: imageUrl, imagePath: imageUrl } }
              );
            }
          } else {
            console.log(`⚠️ Invalid base64 format for ${medicine.name}, using default`);
            imageUrl = '/medicine-images/default-medicine.jpg';
          }
        } catch (error: any) {
          console.error(`❌ Error processing base64 image for ${medicine.name}:`, error.message);
          imageUrl = '/medicine-images/default-medicine.jpg';
        }
      }
      // Nếu là full URL (http/https), giữ nguyên
      else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        // Giữ nguyên full URL
      } 
      // Nếu là relative path nhưng không bắt đầu bằng /, thêm /medicine-images/
      else if (!imageUrl.startsWith('/')) {
        imageUrl = `/medicine-images/${imageUrl}`;
      }
      // Nếu đã là relative path bắt đầu bằng /, giữ nguyên

      // Map dữ liệu
      const productData: any = {
        name: medicine.name || '',
        // Ưu tiên description (công dụng) thay vì strength (hàm lượng)
        // Chỉ dùng strength nếu description không có
        description: medicine.description || medicine.strength || '',
        price: medicine.salePrice || medicine.price || 0,
        originalPrice: medicine.originalPrice || Math.round((medicine.salePrice || medicine.price || 0) * 1.15),
        discountPercentage: 0,
        imageUrl: imageUrl,
        categoryId: categoryDoc._id,
        // Ưu tiên brand (tên) thay vì manufacturerId (ID)
        // Chỉ dùng manufacturerId nếu brand không có và manufacturerId không phải là ObjectId
        brand: medicine.brand || (medicine.manufacturerId && typeof medicine.manufacturerId === 'string' && !/^[0-9a-fA-F]{24}$/.test(medicine.manufacturerId) ? medicine.manufacturerId : ''),
        unit: medicine.unit || 'Hộp',
        inStock: (medicine.stock || medicine.stockQuantity || 0) > 0,
        stockQuantity: medicine.stock || medicine.stockQuantity || 0,
        isHot: false,
        isNewProduct: medicine.isNew || false,
        isPrescription: medicine.isPrescription || false,
      };

      if (medicine.expiryDate || medicine.expirationDate) {
        productData.expirationDate = medicine.expiryDate 
          ? new Date(medicine.expiryDate) 
          : new Date(medicine.expirationDate);
      }

      if (medicine.manufacturingDate) {
        productData.manufacturingDate = new Date(medicine.manufacturingDate);
      }

      if (medicine.batchNumber) {
        productData.batchNumber = medicine.batchNumber;
      }

      // Copy createdAt từ medicine để sort đúng (nếu có)
      if (medicine.createdAt) {
        productData.createdAt = new Date(medicine.createdAt);
      }
      if (medicine.updatedAt) {
        productData.updatedAt = new Date(medicine.updatedAt);
      }

      // Tìm hoặc tạo product
      const medId = medicine._id ? String(medicine._id) : String(medicine.id);
      let existingProduct = await Product.findOne({ 
        $or: [
          { name: productData.name },
          { _id: medId }
        ]
      });

      if (existingProduct) {
        const updated = await Product.findByIdAndUpdate(existingProduct._id, productData, { new: true });
        return { action: 'updated', product: updated };
      } else {
        const created = await Product.create(productData);
        return { action: 'created', product: created };
      }
    } catch (error: any) {
      console.error(`❌ Error syncing medicine ${medicineId}:`, error);
      throw error;
    }
  }

  /**
   * Xóa product tương ứng với medicine đã bị xóa
   */
  static async deleteMedicine(medicineId: string) {
    try {
      // Tìm product theo ID hoặc name
      const product = await Product.findById(medicineId);
      
      if (product) {
        await Product.findByIdAndDelete(medicineId);
        return { deleted: true, productId: medicineId };
      }

      // Nếu không tìm thấy bằng ID, có thể tìm bằng name từ medicines collection
      const db = mongoose.connection.db;
      if (db) {
        const medicinesCollection = db.collection('medicines');
        const medicine = await medicinesCollection.findOne({ 
          $or: [
            { _id: new mongoose.Types.ObjectId(medicineId) },
            { id: medicineId }
          ]
        });

        if (medicine && medicine.name) {
          const productByName = await Product.findOne({ name: medicine.name });
          if (productByName) {
            await Product.findByIdAndDelete(productByName._id);
            return { deleted: true, productId: String(productByName._id) };
          }
        }
      }

      return { deleted: false, message: 'Product not found' };
    } catch (error: any) {
      console.error(`❌ Error deleting medicine ${medicineId}:`, error);
      throw error;
    }
  }
}

