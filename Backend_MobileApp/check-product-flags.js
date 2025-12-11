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

async function checkProducts() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('🔍 Connected to MongoDB');
    
    // Check total products
    const totalProducts = await Product.countDocuments();
    console.log(`📦 Total products: ${totalProducts}`);
    
    // Check hot products
    const hotProducts = await Product.find({ isHot: true, inStock: true });
    console.log(`🔥 Hot products: ${hotProducts.length}`);
    hotProducts.forEach(p => console.log(`  - ${p.name}`));
    
    // Check new products
    const newProducts = await Product.find({ isNew: true, inStock: true });
    console.log(`🆕 New products: ${newProducts.length}`);
    newProducts.forEach(p => console.log(`  - ${p.name}`));
    
    // Check inStock products
    const inStockProducts = await Product.find({ inStock: true });
    console.log(`📦 In stock products: ${inStockProducts.length}`);
    
    // Sample products
    const sampleProducts = await Product.find({}).limit(5).select('name isHot isNew inStock');
    console.log('📋 Sample products:');
    sampleProducts.forEach(p => {
      console.log(`  - ${p.name}: hot=${p.isHot}, new=${p.isNew}, inStock=${p.inStock}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkProducts();
