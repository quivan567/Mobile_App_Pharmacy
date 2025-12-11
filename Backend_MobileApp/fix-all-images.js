import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

async function fixAllImages() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const Product = mongoose.model('Product', new mongoose.Schema({
      name: String,
      imageUrl: String
    }));
    
    // Lấy danh sách file hình ảnh
    const imagesDir = path.join(process.cwd(), 'medicine-images');
    const imageFiles = fs.readdirSync(imagesDir).filter(file => 
      /\.(jpg|jpeg|png|webp)$/i.test(file)
    );
    
    console.log(`Found ${imageFiles.length} image files`);
    
    let updated = 0;
    let notFound = 0;
    
    // Cập nhật hình ảnh cho từng thuốc
    for (const imageFile of imageFiles) {
      try {
        // Tạo tên thuốc từ tên file
        const medicineName = imageFile
          .replace(/\.(jpg|jpeg|png|webp)$/i, '')
          .replace(/_/g, ' ');

        // Tìm thuốc theo tên (fuzzy match)
        const product = await Product.findOne({
          name: { $regex: medicineName, $options: 'i' }
        });

        if (product) {
          // Cập nhật đường dẫn hình ảnh
          const newImageUrl = `/medicine-images/${imageFile}`;
          
          await Product.updateOne(
            { _id: product._id },
            { imageUrl: newImageUrl }
          );
          
          console.log(`✅ Updated: ${product.name} -> ${imageFile}`);
          updated++;
        } else {
          console.log(`❌ Not found: ${medicineName} (from ${imageFile})`);
          notFound++;
        }
      } catch (error) {
        console.error(`❌ Error updating ${imageFile}:`, error.message);
      }
    }
    
    console.log(`\n🎉 Summary:`);
    console.log(`- Updated: ${updated} products`);
    console.log(`- Not found: ${notFound} products`);
    
    // Kiểm tra kết quả
    console.log('\n📋 Sample updated products:');
    const sampleProducts = await Product.find({
      imageUrl: { $regex: /^\/medicine-images\// }
    }).limit(5).select('name imageUrl');
    
    sampleProducts.forEach(p => {
      console.log(`- ${p.name}: ${p.imageUrl}`);
    });
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

fixAllImages();
