import { connectDB } from './src/config/database.js';
import { Product, Category } from './src/models/schema.js';

async function testMedicineQuery() {
  await connectDB();
  
  console.log('🔍 Testing medicine query...');
  
  // Tìm category thuốc
  const medicineCategory = await Category.findOne({ slug: 'thuoc' });
  console.log('Medicine category ID:', medicineCategory?._id);
  
  if (medicineCategory) {
    // Test query với categoryId
    const medicines = await Product.find({ categoryId: medicineCategory._id }).limit(5);
    console.log('Found medicines:', medicines.length);
    console.log('Sample:', medicines.map(m => ({
      name: m.name,
      imageUrl: m.imageUrl,
      categoryId: m.categoryId
    })));
    
    // Test query với string ID
    const medicinesString = await Product.find({ categoryId: medicineCategory._id.toString() }).limit(5);
    console.log('Found medicines (string ID):', medicinesString.length);
  }
  
  process.exit(0);
}

testMedicineQuery().catch(console.error);
