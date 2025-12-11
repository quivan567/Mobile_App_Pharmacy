import { connectDB } from '../config/database.js';
import { Product } from '../models/schema.js';

// Mapping cụ thể cho những thuốc còn thiếu
const MISSING_MEDICINE_MAPPINGS = [
  {
    fileName: 'Calcium_D3.jpg',
    medicineName: 'Calcium + D3',
    imageUrl: '/medicine-images/Calcium_D3.jpg'
  },
  {
    fileName: 'Ferrous_Fumarate_B9_B12.jpg',
    medicineName: 'Ferrous Fumarate + B9 + B12',
    imageUrl: '/medicine-images/Ferrous_Fumarate_B9_B12.jpg'
  },
  {
    fileName: 'Nystatin_500000_IU.jpg',
    medicineName: 'Nystatin 500,000 IU',
    imageUrl: '/medicine-images/Nystatin_500000_IU.jpg'
  }
];

async function updateMissingMedicineImages() {
  await connectDB();

  console.log('🔧 Updating missing medicine images...');

  let updated = 0;

  for (const mapping of MISSING_MEDICINE_MAPPINGS) {
    try {
      // Tìm thuốc theo tên chính xác
      const product = await Product.findOne({
        name: mapping.medicineName
      });

      if (product) {
        await Product.updateOne(
          { _id: product._id },
          { imageUrl: mapping.imageUrl }
        );
        
        console.log(`✅ Updated: ${product.name} -> ${mapping.fileName}`);
        updated++;
      } else {
        console.log(`❌ Not found: ${mapping.medicineName}`);
      }
    } catch (error) {
      console.error(`❌ Error updating ${mapping.medicineName}:`, error.message);
    }
  }

  console.log(`\n🎉 Updated ${updated} missing medicine images`);
}

updateMissingMedicineImages().catch(console.error);
