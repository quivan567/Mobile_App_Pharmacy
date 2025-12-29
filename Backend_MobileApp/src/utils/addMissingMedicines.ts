import { connectDB } from '../config/database.js';
import { Category, Product } from '../models/schema.js';

// Danh sách thuốc còn thiếu cần thêm vào database
const MISSING_MEDICINES = [
  {
    name: 'Acetylcysteine 200mg',
    description: 'Tiêu nhầy',
    price: 69000,
    originalPrice: 82000,
    brand: 'Zambon',
    unit: 'Hộp 30 gói',
    isPrescription: false,
    imageUrl: '/medicine-images/Acetylcysteine_200mg.jpg'
  },
  {
    name: 'Betahistine 16mg',
    description: 'Rối loạn tiền đình',
    price: 79000,
    originalPrice: 95000,
    brand: 'Stada',
    unit: 'Hộp 20 viên',
    isPrescription: true,
    imageUrl: '/medicine-images/Betahistine_16mg.jpg'
  },
  {
    name: 'Calcium + D3',
    description: 'Bổ sung canxi và vitamin D',
    price: 165000,
    originalPrice: 189000,
    brand: 'Morioka',
    unit: 'Lọ 100 viên',
    isPrescription: false,
    imageUrl: '/medicine-images/Calcium_D3.jpg'
  },
  {
    name: 'Dicyclomine 10mg',
    description: 'Giảm co thắt tiêu hóa',
    price: 32000,
    originalPrice: 38000,
    brand: 'Domesco',
    unit: 'Hộp 20 viên',
    isPrescription: true,
    imageUrl: '/medicine-images/Dicyclomine_10mg.jpg'
  },
  {
    name: 'Ferrous Fumarate + B9 + B12',
    description: 'Bổ máu',
    price: 69000,
    originalPrice: 82000,
    brand: 'DHG',
    unit: 'Hộp 100 viên',
    isPrescription: false,
    imageUrl: '/medicine-images/Ferrous_Fumarate_B9_B12.jpg'
  },
  {
    name: 'Folic Acid 5mg',
    description: 'Bổ sung folate',
    price: 29000,
    originalPrice: 35000,
    brand: 'OPV',
    unit: 'Hộp 20 viên',
    isPrescription: false,
    imageUrl: '/medicine-images/Folic_Acid_5mg.jpg'
  },
  {
    name: 'Ginkgo Biloba 120mg',
    description: 'Tăng cường tuần hoàn não',
    price: 129000,
    originalPrice: 149000,
    brand: 'DHG',
    unit: 'Hộp 60 viên',
    isPrescription: false,
    imageUrl: '/medicine-images/Ginkgo_Biloba_120mg.jpg'
  },
  {
    name: 'Isoniazid 300mg',
    description: 'Kháng lao (kê đơn)',
    price: 65000,
    originalPrice: 78000,
    brand: 'Mekophar',
    unit: 'Hộp 10 viên',
    isPrescription: true,
    imageUrl: '/medicine-images/Isoniazid_300mg.jpg'
  },
  {
    name: 'Mecobalamin 500mcg',
    description: 'Bổ thần kinh',
    price: 89000,
    originalPrice: 109000,
    brand: 'Eisai',
    unit: 'Hộp 30 viên',
    isPrescription: true,
    imageUrl: '/medicine-images/Mecobalamin_500mcg.jpg'
  },
  {
    name: 'Melatonin 3mg',
    description: 'Hỗ trợ ngủ ngon',
    price: 159000,
    originalPrice: 179000,
    brand: 'Natrol',
    unit: 'Lọ 60 viên',
    isPrescription: false,
    imageUrl: '/medicine-images/Melatonin_3mg.jpg'
  },
  {
    name: 'Mucinex 600mg',
    description: 'Long đờm (guaifenesin)',
    price: 189000,
    originalPrice: 215000,
    brand: 'RB',
    unit: 'Hộp 20 viên',
    isPrescription: false,
    imageUrl: '/medicine-images/Mucinex_600mg.jpg'
  },
  {
    name: 'Nystatin 500,000 IU',
    description: 'Kháng nấm',
    price: 45000,
    originalPrice: 52000,
    brand: 'Stada',
    unit: 'Hộp 20 viên',
    isPrescription: true,
    imageUrl: '/medicine-images/Nystatin_500000_IU.jpg'
  },
  {
    name: 'ORS viên sủi',
    description: 'Bù điện giải dạng sủi',
    price: 45000,
    originalPrice: 52000,
    brand: 'OPV',
    unit: 'Ống 10 viên sủi',
    isPrescription: false,
    imageUrl: '/medicine-images/ORS_viên_sủi.jpg'
  },
  {
    name: 'Probiotic Lactobacillus',
    description: 'Hỗ trợ tiêu hóa',
    price: 139000,
    originalPrice: 159000,
    brand: 'Biogaia',
    unit: 'Hộp 30 viên',
    isPrescription: false,
    imageUrl: '/medicine-images/Probiotic_Lactobacillus.jpg'
  },
  {
    name: 'Rifampicin 300mg',
    description: 'Kháng lao (kê đơn)',
    price: 165000,
    originalPrice: 185000,
    brand: 'DongKook',
    unit: 'Hộp 10 viên',
    isPrescription: true,
    imageUrl: '/medicine-images/Rifampicin_300mg.jpg'
  },
  {
    name: 'Tetracycline 500mg',
    description: 'Kháng sinh',
    price: 32000,
    originalPrice: 38000,
    brand: 'Mekophar',
    unit: 'Hộp 20 viên',
    isPrescription: true,
    imageUrl: '/medicine-images/Tetracycline_500mg.jpg'
  }
];

async function addMissingMedicines() {
  await connectDB();

  // Tìm category 'Thuốc'
  const drugCategory = await Category.findOne({ slug: 'thuoc' });
  if (!drugCategory) {
    console.log('❌ Drug category not found');
    return;
  }

  console.log(`📂 Found drug category: ${drugCategory.name}`);

  let added = 0;
  let skipped = 0;

  for (const medicine of MISSING_MEDICINES) {
    try {
      // Kiểm tra xem thuốc đã tồn tại chưa
      const existing = await Product.findOne({ name: medicine.name });
      
      if (existing) {
        console.log(`⏭️ Skipped: ${medicine.name} (already exists)`);
        skipped++;
        continue;
      }

      // Tạo thuốc mới
      const newMedicine = await Product.create({
        name: medicine.name,
        description: medicine.description,
        price: medicine.price,
        originalPrice: medicine.originalPrice,
        discountPercentage: Math.round(((medicine.originalPrice - medicine.price) / medicine.originalPrice) * 100),
        imageUrl: medicine.imageUrl,
        categoryId: drugCategory._id,
        brand: medicine.brand,
        unit: medicine.unit,
        inStock: true,
        stockQuantity: 20 + Math.floor(Math.random() * 180), // 20-199
        isHot: false,
        isNewProduct: true,
        isPrescription: medicine.isPrescription,
        // Thêm thông tin hạn dùng
        expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 năm
        manufacturingDate: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000), // 6 tháng trước
        batchNumber: `BN${new Date().getFullYear().toString().slice(-2)}${(new Date().getMonth()+1).toString().padStart(2, '0')}-${(1000 + added).toString()}`
      });

      console.log(`✅ Added: ${newMedicine.name}`);
      added++;
    } catch (error) {
      console.error(`❌ Error adding ${medicine.name}:`, error.message);
    }
  }

  console.log(`\n🎉 Summary: Added ${added} medicines, Skipped ${skipped} medicines`);
}

addMissingMedicines().catch((err) => {
  console.error('❌ Add missing medicines failed:', err);
  process.exit(1);
});
