import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const ProductSchema = new mongoose.Schema({
  name: String,
  isHot: Boolean,
  isNew: Boolean,
  inStock: Boolean
});

const Product = mongoose.model('Product', ProductSchema);

async function fixProductFlags() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('🔍 Connected to MongoDB');
    
    // Get first 6 products and make them hot
    const products = await Product.find({}).limit(6);
    console.log(`📦 Found ${products.length} products`);
    
    // Set first 3 as hot
    for (let i = 0; i < Math.min(3, products.length); i++) {
      await Product.updateOne(
        { _id: products[i]._id },
        { isHot: true, inStock: true }
      );
      console.log(`🔥 Set ${products[i].name} as HOT`);
    }
    
    // Set next 3 as new
    for (let i = 3; i < Math.min(6, products.length); i++) {
      await Product.updateOne(
        { _id: products[i]._id },
        { isNew: true, inStock: true }
      );
      console.log(`🆕 Set ${products[i].name} as NEW`);
    }
    
    // Verify
    const hotCount = await Product.countDocuments({ isHot: true, inStock: true });
    const newCount = await Product.countDocuments({ isNew: true, inStock: true });
    
    console.log(`✅ Results: ${hotCount} hot products, ${newCount} new products`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

fixProductFlags();
