import { connectDB } from '../config/database.js';
import { Product } from '../models/schema.js';
import fs from 'fs';
import path from 'path';

// Mapping tên file với tên thuốc trong database
const FILE_TO_DB_NAME_MAP: Record<string, string> = {
  'Calcium_D3.jpg': 'Calcium + D3',
  'Ferrous_Fumarate_B9_B12.jpg': 'Ferrous Fumarate + B9 + B12',
  'Nystatin_500000_IU.jpg': 'Nystatin 500,000 IU'
};

async function updateMedicineNamesToMatchFiles() {
  await connectDB();

  // Đường dẫn thư mục chứa hình ảnh thuốc
  const imagesDir = path.join(process.cwd(), 'medicine-images');
  
  if (!fs.existsSync(imagesDir)) {
    console.log('❌ Medicine images directory not found');
    return;
  }

  // Lấy danh sách file hình ảnh
  const imageFiles = fs.readdirSync(imagesDir).filter(file => 
    /\.(jpg|jpeg|png|webp)$/i.test(file)
  );

  console.log(`📸 Found ${imageFiles.length} image files`);

  let updated = 0;
  let notFound = 0;

  for (const imageFile of imageFiles) {
    try {
      // Tạo tên thuốc từ tên file (loại bỏ extension và thay _ bằng space)
      const medicineNameFromFile = imageFile
        .replace(/\.(jpg|jpeg|png|webp)$/i, '')
        .replace(/_/g, ' ');

      // Kiểm tra xem có mapping đặc biệt không
      const dbName = FILE_TO_DB_NAME_MAP[imageFile] || medicineNameFromFile;

      // Tìm thuốc theo tên (fuzzy match)
      const product = await Product.findOne({
        name: { $regex: medicineNameFromFile, $options: 'i' }
      });

      if (product) {
        // Cập nhật tên thuốc để khớp với tên file
        if (product.name !== dbName) {
          await Product.updateOne(
            { _id: product._id },
            { 
              name: dbName,
              imageUrl: `/medicine-images/${imageFile}`
            }
          );
          
          console.log(`✅ Updated: "${product.name}" -> "${dbName}" (${imageFile})`);
          updated++;
        } else {
          // Chỉ cập nhật imageUrl nếu tên đã đúng
          await Product.updateOne(
            { _id: product._id },
            { imageUrl: `/medicine-images/${imageFile}` }
          );
          
          console.log(`🔄 Updated image: ${product.name} -> ${imageFile}`);
        }
      } else {
        console.log(`❌ Not found: ${medicineNameFromFile} (from ${imageFile})`);
        notFound++;
      }
    } catch (error) {
      console.error(`❌ Error updating ${imageFile}:`, error.message);
    }
  }

  console.log(`\n🎉 Summary: Updated ${updated} medicines, Not found ${notFound} medicines`);
}

// Script để tạo thuốc mới từ file hình ảnh chưa có trong DB
async function createMissingMedicinesFromFiles() {
  await connectDB();

  const imagesDir = path.join(process.cwd(), 'medicine-images');
  const imageFiles = fs.readdirSync(imagesDir).filter(file => 
    /\.(jpg|jpeg|png|webp)$/i.test(file)
  );

  console.log(`📸 Processing ${imageFiles.length} image files`);

  let created = 0;

  for (const imageFile of imageFiles) {
    try {
      const medicineNameFromFile = imageFile
        .replace(/\.(jpg|jpeg|png|webp)$/i, '')
        .replace(/_/g, ' ');

      const dbName = FILE_TO_DB_NAME_MAP[imageFile] || medicineNameFromFile;

      // Kiểm tra xem thuốc đã tồn tại chưa
      const existing = await Product.findOne({
        name: { $regex: medicineNameFromFile, $options: 'i' }
      });

      if (!existing) {
        // Tạo thuốc mới
        const newMedicine = await Product.create({
          name: dbName,
          description: `Thuốc ${dbName}`,
          price: 50000 + Math.floor(Math.random() * 200000), // 50k-250k
          originalPrice: 60000 + Math.floor(Math.random() * 250000), // 60k-310k
          discountPercentage: Math.floor(Math.random() * 20), // 0-20%
          imageUrl: `/medicine-images/${imageFile}`,
          categoryId: (await Product.findOne({})).categoryId, // Lấy categoryId từ thuốc đầu tiên
          brand: 'Generic',
          unit: 'Hộp',
          inStock: true,
          stockQuantity: 20 + Math.floor(Math.random() * 180),
          isHot: false,
          isNew: true,
          isPrescription: false,
          expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          manufacturingDate: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
          batchNumber: `BN${new Date().getFullYear().toString().slice(-2)}${(new Date().getMonth()+1).toString().padStart(2, '0')}-${(1000 + created).toString()}`
        });

        console.log(`✅ Created: ${newMedicine.name} (${imageFile})`);
        created++;
      }
    } catch (error) {
      console.error(`❌ Error creating ${imageFile}:`, error.message);
    }
  }

  console.log(`\n🎉 Created ${created} new medicines from image files`);
}

// Chạy script
const mode = process.argv[2] || 'update';

if (mode === 'create') {
  createMissingMedicinesFromFiles().catch(console.error);
} else {
  updateMedicineNamesToMatchFiles().catch(console.error);
}
