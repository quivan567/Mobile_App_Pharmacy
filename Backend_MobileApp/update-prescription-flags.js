import mongoose from 'mongoose';
import { connectDB } from './src/config/database.ts';

const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  price: { type: Number, required: true, min: 0 },
  originalPrice: { type: Number, min: 0 },
  discountPercentage: { type: Number, default: 0, min: 0, max: 100 },
  imageUrl: { type: String, trim: true },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  brand: { type: String, trim: true },
  unit: { type: String, trim: true },
  inStock: { type: Boolean, default: true },
  stockQuantity: { type: Number, default: 0, min: 0 },
  isHot: { type: Boolean, default: false },
  isNew: { type: Boolean, default: false },
  isPrescription: { type: Boolean, default: false },
  expirationDate: { type: Date },
  manufacturingDate: { type: Date },
  batchNumber: { type: String, trim: true },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { collection: 'products' });

const Product = mongoose.models.Product || mongoose.model('Product', ProductSchema);

async function updatePrescriptionFlags() {
  try {
    await connectDB();
    console.log('🔗 Connected to database');

    const products = await Product.find({ categoryId: { $exists: true } });
    console.log(`📦 Found ${products.length} products to update`);

    let updatedCount = 0;

    for (const product of products) {
      let isPrescription = false;
      
      // Check if product name or description contains prescription indicators
      const nameLower = product.name.toLowerCase();
      const descLower = (product.description || '').toLowerCase();
      
      if (nameLower.includes('prescription') || 
          descLower.includes('prescription') ||
          nameLower.includes('kê đơn') ||
          descLower.includes('kê đơn')) {
        isPrescription = true;
      }

      // Update if different
      if (product.isPrescription !== isPrescription) {
        await Product.findByIdAndUpdate(product._id, { 
          isPrescription,
          updatedAt: new Date()
        });
        console.log(`🔄 Updated ${product.name}: isPrescription = ${isPrescription}`);
        updatedCount++;
      }
    }

    console.log(`\n🎉 Update completed!`);
    console.log(`🔄 Updated: ${updatedCount} products`);

  } catch (error) {
    console.error('❌ Update failed:', error);
  } finally {
    mongoose.connection.close();
    console.log('Disconnected from database.');
  }
}

updatePrescriptionFlags();
