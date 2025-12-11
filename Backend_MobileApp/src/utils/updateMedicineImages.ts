import { connectDB } from '../config/database.js';
import { Product } from '../models/schema.js';
import fs from 'fs';
import path from 'path';

// Script để cập nhật hình ảnh thuốc từ thư mục local
async function updateMedicineImages() {
  await connectDB();

  // Đường dẫn thư mục chứa hình ảnh thuốc
  const imagesDir = path.join(process.cwd(), 'medicine-images');
  
  // Tạo thư mục nếu chưa có
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
    console.log(`📁 Created directory: ${imagesDir}`);
    console.log('📝 Please place your medicine images in this directory with naming format:');
    console.log('   - Paracetamol_500mg.jpg');
    console.log('   - Panadol_Extra.jpg');
    console.log('   - Efferalgan_500mg.jpg');
    console.log('   - etc...');
    return;
  }

  // Lấy danh sách file hình ảnh
  const imageFiles = fs.readdirSync(imagesDir).filter(file => 
    /\.(jpg|jpeg|png|webp)$/i.test(file)
  );

  if (imageFiles.length === 0) {
    console.log('❌ No image files found in medicine-images directory');
    return;
  }

  console.log(`📸 Found ${imageFiles.length} image files`);

  // Cập nhật hình ảnh cho từng thuốc
  let updated = 0;
  for (const imageFile of imageFiles) {
    try {
      // Tạo tên thuốc từ tên file (loại bỏ extension và thay _ bằng space)
      const medicineName = imageFile
        .replace(/\.(jpg|jpeg|png|webp)$/i, '')
        .replace(/_/g, ' ');

      // Tìm thuốc theo tên (fuzzy match)
      const product = await Product.findOne({
        name: { $regex: medicineName, $options: 'i' }
      });

      if (product) {
        // Đường dẫn hình ảnh mới (có thể là URL server hoặc đường dẫn local)
        const newImageUrl = `/medicine-images/${imageFile}`;
        
        await Product.updateOne(
          { _id: product._id },
          { imageUrl: newImageUrl }
        );
        
        console.log(`✅ Updated: ${product.name} -> ${imageFile}`);
        updated++;
      } else {
        console.log(`❌ Not found: ${medicineName} (from ${imageFile})`);
      }
    } catch (error) {
      console.error(`❌ Error updating ${imageFile}:`, error.message);
    }
  }

  console.log(`\n🎉 Updated ${updated} medicine images`);
}

// Script để cập nhật hình ảnh từ URL thực
async function updateMedicineImagesFromUrls() {
  await connectDB();

  // Mapping thuốc với URL hình ảnh thực (bạn có thể thay đổi)
  const medicineImageMap: Record<string, string> = {
    'Paracetamol 500mg': 'https://example.com/paracetamol-500mg.jpg',
    'Panadol Extra': 'https://example.com/panadol-extra.jpg',
    'Efferalgan 500mg': 'https://example.com/efferalgan-500mg.jpg',
    'Aspirin 81mg': 'https://example.com/aspirin-81mg.jpg',
    'Ibuprofen 400mg': 'https://example.com/ibuprofen-400mg.jpg',
    // Thêm các thuốc khác...
  };

  let updated = 0;
  for (const [medicineName, imageUrl] of Object.entries(medicineImageMap)) {
    try {
      const product = await Product.findOne({
        name: { $regex: medicineName, $options: 'i' }
      });

      if (product) {
        await Product.updateOne(
          { _id: product._id },
          { imageUrl }
        );
        
        console.log(`✅ Updated: ${product.name} -> ${imageUrl}`);
        updated++;
      } else {
        console.log(`❌ Not found: ${medicineName}`);
      }
    } catch (error) {
      console.error(`❌ Error updating ${medicineName}:`, error.message);
    }
  }

  console.log(`\n🎉 Updated ${updated} medicine images from URLs`);
}

// Chạy script
const mode = process.argv[2] || 'urls';

if (mode === 'files') {
  updateMedicineImages().catch(console.error);
} else {
  updateMedicineImagesFromUrls().catch(console.error);
}
