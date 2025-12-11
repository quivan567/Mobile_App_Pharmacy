import { connectDB } from './src/config/database.ts';
import { Product, Category } from './src/models/schema.ts';
import mongoose from 'mongoose';

async function migrateMedicinesToProducts() {
  try {
    await connectDB();
    console.log('🔗 Connected to database');

    // Get medicines collection directly
    const db = mongoose.connection.db;
    const medicinesCollection = db.collection('medicines');
    
    // Get all medicines
    const medicines = await medicinesCollection.find({}).toArray();
    console.log(`📦 Found ${medicines.length} medicines to migrate`);

    if (medicines.length === 0) {
      console.log('✅ No medicines found to migrate');
      return;
    }

    // Find or create category
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

    let migrated = 0;
    let skipped = 0;

    for (const medicine of medicines) {
      try {
        // Check if product already exists
        const existingProduct = await Product.findOne({ name: medicine.name });
        if (existingProduct) {
          console.log(`⏭️  Skipped existing product: ${medicine.name}`);
          skipped++;
          continue;
        }

        // Create product from medicine
        const productData = {
          name: medicine.name,
          description: medicine.strength || medicine.genericName || '',
          price: medicine.salePrice,
          originalPrice: Math.round(medicine.salePrice * 1.15), // Add 15% markup
          discountPercentage: 0,
          imageUrl: '/medicine-images/default-medicine.jpg', // Default image
          categoryId: categoryDoc._id,
          brand: medicine.manufacturerId || '',
          unit: medicine.unit || 'Hộp',
          inStock: (medicine.stock || 0) > 0,
          stockQuantity: medicine.stock || 0,
          isHot: false,
          isNew: true, // Mark as new
          isPrescription: false,
          expirationDate: medicine.expiryDate ? new Date(medicine.expiryDate) : undefined,
          createdAt: medicine.createdAt ? new Date(medicine.createdAt) : new Date(),
        };

        await Product.create(productData);
        console.log(`✅ Migrated: ${medicine.name}`);
        migrated++;

      } catch (error) {
        console.error(`❌ Error migrating ${medicine.name}:`, error.message);
      }
    }

    console.log(`\n🎉 Migration completed!`);
    console.log(`✅ Migrated: ${migrated} medicines`);
    console.log(`⏭️  Skipped: ${skipped} existing products`);
    
    // Verify migration
    const totalProducts = await Product.countDocuments();
    console.log(`📊 Total products in database: ${totalProducts}`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    process.exit(0);
  }
}

migrateMedicinesToProducts();
