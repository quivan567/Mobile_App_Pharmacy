import { connectDB } from './src/config/database.js';
import { Product, Category } from './src/models/schema.js';

async function debugCategoryFilter() {
  await connectDB();
  
  console.log('🔍 Debugging category filter...');
  
  // Kiểm tra tất cả categories
  const allCategories = await Category.find({});
  console.log('All categories:', allCategories.map(c => ({
    name: c.name,
    slug: c.slug,
    _id: c._id
  })));
  
  // Tìm category thuốc
  const medicineCategory = await Category.findOne({ slug: 'thuoc' });
  console.log('Medicine category:', medicineCategory);
  
  if (medicineCategory) {
    // Test query với categoryId
    const medicines = await Product.find({ categoryId: medicineCategory._id }).limit(5);
    console.log('Medicines with ObjectId:', medicines.length);
    console.log('Sample:', medicines.map(m => ({
      name: m.name,
      imageUrl: m.imageUrl,
      categoryId: m.categoryId
    })));
    
    // Test query với string ID
    const medicinesString = await Product.find({ categoryId: medicineCategory._id.toString() }).limit(5);
    console.log('Medicines with string ID:', medicinesString.length);
  }
  
  process.exit(0);
}

debugCategoryFilter().catch(console.error);
