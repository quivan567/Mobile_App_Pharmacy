import { connectDB } from '../config/database.js';
import { Category, Product } from '../models/schema.js';

// Helper to generate future expiration/manufacturing dates
function generateDates(monthsUntilExpire: number) {
  const now = new Date();
  const manufacturingDate = new Date(now);
  manufacturingDate.setMonth(manufacturingDate.getMonth() - 6 - Math.floor(Math.random() * 6));

  const expirationDate = new Date(now);
  expirationDate.setMonth(expirationDate.getMonth() + monthsUntilExpire);

  return { manufacturingDate, expirationDate };
}

// A curated list of 50 common medicines in VN with rough, realistic data
// Image URLs use reputable ecommerce/CDN links to look real in UI
// Note: Prices are in VND; units are common retail packages
const MEDICINES: Array<{
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  brand: string;
  unit: string;
  isPrescription: boolean;
  imageUrl: string;
}> = [
  { name: 'Paracetamol 500mg', description: 'Giảm đau, hạ sốt', price: 25000, originalPrice: 30000, brand: 'Traphaco', unit: 'Hộp 10 viên', isPrescription: false, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20220701101020-0-P01863_1.jpg' },
  { name: 'Panadol Extra', description: 'Giảm đau, hạ sốt nhanh', price: 35000, originalPrice: 42000, brand: 'GSK', unit: 'Hộp 12 viên', isPrescription: false, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20240105090719-0-P00147_1.jpg' },
  { name: 'Efferalgan 500mg', description: 'Sủi hạ sốt', price: 65000, originalPrice: 72000, brand: 'UPSA', unit: 'Hộp 16 viên sủi', isPrescription: false, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20240105090622-0-P00408_1.jpg' },
  { name: 'Aspirin 81mg', description: 'Kháng kết tập tiểu cầu', price: 45000, originalPrice: 52000, brand: 'Bayer', unit: 'Hộp 28 viên', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/ecommerce/20240225084646-0-P00762_1.png' },
  { name: 'Ibuprofen 400mg', description: 'Giảm đau, kháng viêm', price: 48000, originalPrice: 56000, brand: 'Sanofi', unit: 'Hộp 20 viên', isPrescription: false, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/ecommerce/20240426032329-0-P11828_1.png' },
  { name: 'Nurofen for Children', description: 'Giảm đau, hạ sốt cho trẻ em', price: 125000, originalPrice: 145000, brand: 'Reckitt', unit: 'Chai 100ml', isPrescription: false, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20230110153050-0-P22017_1.jpg' },
  { name: 'Amoxicillin 500mg', description: 'Kháng sinh penicillin', price: 39000, originalPrice: 45000, brand: 'DHG', unit: 'Hộp 20 viên', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/ecommerce/20240318113244-0-P31948_1.png' },
  { name: 'Augmentin 625mg', description: 'Amoxicillin + Clavulanate', price: 145000, originalPrice: 165000, brand: 'GSK', unit: 'Hộp 14 viên', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20240105090425-0-P00031_1.jpg' },
  { name: 'Cefuroxime 500mg', description: 'Kháng sinh cephalosporin thế hệ 2', price: 165000, originalPrice: 185000, brand: 'Pymepharco', unit: 'Hộp 10 viên', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/ecommerce/20230926102246-0-P32675_1.png' },
  { name: 'Azithromycin 500mg', description: 'Kháng sinh macrolide', price: 68000, originalPrice: 79000, brand: 'Sandoz', unit: 'Hộp 3 viên', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/ecommerce/20240325150139-0-P32929_1.png' },
  { name: 'Clarithromycin 500mg', description: 'Kháng sinh macrolide', price: 98000, originalPrice: 115000, brand: 'Stada', unit: 'Hộp 10 viên', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/ecommerce/20240523045721-0-P30174_1.png' },
  { name: 'Metronidazole 250mg', description: 'Kháng khuẩn, ký sinh trùng', price: 32000, originalPrice: 39000, brand: 'Mekophar', unit: 'Hộp 20 viên', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/ecommerce/20240228022817-0-P27687_1.png' },
  { name: 'Ciprofloxacin 500mg', description: 'Kháng sinh quinolon', price: 42000, originalPrice: 52000, brand: 'Stada', unit: 'Hộp 10 viên', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/ecommerce/20240523045525-0-P30305_1.png' },
  { name: 'Loperamide 2mg', description: 'Chống tiêu chảy', price: 28000, originalPrice: 34000, brand: 'OPV', unit: 'Hộp 10 viên', isPrescription: false, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20230524103415-0-P27363_2.jpg' },
  { name: 'Domperidone 10mg', description: 'Chống nôn, khó tiêu', price: 36000, originalPrice: 42000, brand: 'Domesco', unit: 'Hộp 20 viên', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20230307165459-0-P20308_1.jpg' },
  { name: 'Esomeprazole 40mg', description: 'Giảm tiết acid dạ dày', price: 125000, originalPrice: 145000, brand: 'AstraZeneca', unit: 'Hộp 14 viên', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/ecommerce/20240727042603-0-P33605_1.png' },
  { name: 'Omeprazole 20mg', description: 'Giảm acid dạ dày', price: 45000, originalPrice: 52000, brand: 'Stada', unit: 'Hộp 14 viên', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/ecommerce/20240523045237-0-P30170_1.png' },
  { name: 'Rabeprazole 20mg', description: 'Giảm acid dạ dày', price: 98000, originalPrice: 115000, brand: 'Eisai', unit: 'Hộp 14 viên', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/ecommerce/20240225090741-0-P30935_1.png' },
  { name: 'Cetirizine 10mg', description: 'Chống dị ứng', price: 38000, originalPrice: 45000, brand: 'Stada', unit: 'Hộp 10 viên', isPrescription: false, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20230307170345-0-P00697_1.jpg' },
  { name: 'Loratadine 10mg', description: 'Chống dị ứng', price: 32000, originalPrice: 39000, brand: 'Domesco', unit: 'Hộp 10 viên', isPrescription: false, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20230418094017-0-P27400_1.jpg' },
  { name: 'Fexofenadine 180mg', description: 'Chống dị ứng thế hệ mới', price: 69000, originalPrice: 82000, brand: 'Sanofi', unit: 'Hộp 10 viên', isPrescription: false, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20230404092923-0-P27407_1.jpg' },
  { name: 'Salbutamol Inhaler', description: 'Xịt giãn phế quản', price: 89000, originalPrice: 109000, brand: 'GSK', unit: 'Bình xịt 200 liều', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20210721090155-0-P11659_1.jpg' },
  { name: 'Budesonide Inhaler', description: 'Corticoid dạng hít', price: 165000, originalPrice: 185000, brand: 'AstraZeneca', unit: 'Bình xịt 200 liều', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20210225110242-0-P04787_1.jpg' },
  { name: 'Metformin 500mg', description: 'Điều trị đái tháo đường type 2', price: 45000, originalPrice: 52000, brand: 'Merck', unit: 'Hộp 30 viên', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/ecommerce/20230920113930-0-P32355_1.png' },
  { name: 'Gliclazide MR 30mg', description: 'Hạ đường huyết', price: 52000, originalPrice: 62000, brand: 'Servier', unit: 'Hộp 30 viên', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20240403101020-0-P25037_1.jpg' },
  { name: 'Insulin Glargine', description: 'Insulin nền', price: 320000, originalPrice: 360000, brand: 'Sanofi', unit: 'Bút tiêm 3ml', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20210225110446-0-P04793_1.jpg' },
  { name: 'Losartan 50mg', description: 'Hạ huyết áp (ARB)', price: 52000, originalPrice: 62000, brand: 'Stada', unit: 'Hộp 30 viên', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/ecommerce/20240523051429-0-P30588_1.png' },
  { name: 'Amlodipine 5mg', description: 'Hạ huyết áp (CCB)', price: 39000, originalPrice: 46000, brand: 'Pfizer', unit: 'Hộp 30 viên', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20240105091536-0-P00304_1.jpg' },
  { name: 'Perindopril 5mg', description: 'Hạ huyết áp (ACEi)', price: 69000, originalPrice: 82000, brand: 'Servier', unit: 'Hộp 30 viên', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20220701101526-0-P08841_1.jpg' },
  { name: 'Atorvastatin 20mg', description: 'Giảm mỡ máu', price: 98000, originalPrice: 115000, brand: 'Pfizer', unit: 'Hộp 30 viên', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20220421112454-0-P23259_1.jpg' },
  { name: 'Rosuvastatin 10mg', description: 'Giảm mỡ máu', price: 115000, originalPrice: 135000, brand: 'AstraZeneca', unit: 'Hộp 28 viên', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/ecommerce/20240225091914-0-P30761_1.png' },
  { name: 'Clopidogrel 75mg', description: 'Kháng kết tập tiểu cầu', price: 150000, originalPrice: 175000, brand: 'Sanofi', unit: 'Hộp 14 viên', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20240105090835-0-P00159_1.jpg' },
  { name: 'Warfarin 5mg', description: 'Chống đông', price: 79000, originalPrice: 95000, brand: 'Taro', unit: 'Hộp 100 viên', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/ecommerce/20240225090644-0-P30928_1.png' },
  { name: 'Apixaban 5mg', description: 'Thuốc chống đông thế hệ mới', price: 560000, originalPrice: 620000, brand: 'BMS', unit: 'Hộp 28 viên', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20230509143622-0-P30293_1.jpg' },
  { name: 'Levocetirizine 5mg', description: 'Chống dị ứng', price: 45000, originalPrice: 52000, brand: 'Actavis', unit: 'Hộp 10 viên', isPrescription: false, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20221005112801-0-P26359_1.jpg' },
  { name: 'Montelukast 10mg', description: 'Hen phế quản, viêm mũi dị ứng', price: 98000, originalPrice: 115000, brand: 'MSD', unit: 'Hộp 14 viên', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/ecommerce/20230606103712-0-P30967_1.png' },
  { name: 'Prednisolone 5mg', description: 'Corticoid', price: 28000, originalPrice: 34000, brand: 'Stada', unit: 'Hộp 10 viên', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20220817155151-0-P06784_1.jpg' },
  { name: 'Dexamethasone 0.5mg', description: 'Corticoid', price: 25000, originalPrice: 30000, brand: 'Mekophar', unit: 'Hộp 10 viên', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20230307170345-0-P00697_1.jpg' },
  { name: 'Hydroxyzine 25mg', description: 'Giảm ngứa, an thần nhẹ', price: 52000, originalPrice: 62000, brand: 'UCB', unit: 'Hộp 25 viên', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20210622091947-0-P10245_1.jpg' },
  { name: 'Diazepam 5mg', description: 'An thần, chống co giật', price: 39000, originalPrice: 46000, brand: 'Roche', unit: 'Hộp 10 viên', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/ecommerce/20240225084646-0-P00762_1.png' },
  { name: 'Zinc Gluconate 10mg', description: 'Bổ sung kẽm', price: 55000, originalPrice: 65000, brand: 'Nature Made', unit: 'Hộp 100 viên', isPrescription: false, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20240105092233-0-P00443_1.jpg' },
  { name: 'Vitamin B Complex', description: 'Bổ sung vitamin nhóm B', price: 89000, originalPrice: 109000, brand: 'DHG', unit: 'Hộp 100 viên', isPrescription: false, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20230417110222-0-P26556_1.jpg' },
  { name: 'Vitamin D3 1000 IU', description: 'Hỗ trợ xương khớp', price: 129000, originalPrice: 149000, brand: 'Blackmores', unit: 'Lọ 100 viên', isPrescription: false, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20210204140248-0-P01972_1.jpg' },
  { name: 'Calcium + D3', description: 'Bổ sung canxi và vitamin D', price: 165000, originalPrice: 189000, brand: 'Morioka', unit: 'Lọ 100 viên', isPrescription: false, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20240206094830-0-P29506_1.jpg' },
  { name: 'ORS Oresol', description: 'Bù nước, điện giải', price: 25000, originalPrice: 30000, brand: 'OPV', unit: 'Hộp 10 gói', isPrescription: false, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20210810111621-0-P12380_1.jpg' },
  { name: 'Smecta 3g', description: 'Tiêu chảy cấp/mạn', price: 79000, originalPrice: 95000, brand: 'IPSEN', unit: 'Hộp 12 gói', isPrescription: false, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20240105091641-0-P00321_1.jpg' },
  { name: 'Buscopan 10mg', description: 'Chống co thắt', price: 59000, originalPrice: 72000, brand: 'Boehringer', unit: 'Hộp 20 viên', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20240105090653-0-P00413_1.jpg' },
  { name: 'Nystatin 500,000 IU', description: 'Kháng nấm', price: 45000, originalPrice: 52000, brand: 'Stada', unit: 'Hộp 20 viên', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20221121083643-0-P26181_1.jpg' },
  { name: 'Fluconazole 150mg', description: 'Kháng nấm', price: 65000, originalPrice: 78000, brand: 'Pfizer', unit: 'Hộp 1 viên', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/ecommerce/20240523050533-0-P30494_1.png' },
  { name: 'Telfast 180mg', description: 'Fexofenadine chống dị ứng', price: 129000, originalPrice: 149000, brand: 'Sanofi', unit: 'Hộp 10 viên', isPrescription: false, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20240105091659-0-P00328_1.jpg' },
  { name: 'Mucinex 600mg', description: 'Long đờm (guaifenesin)', price: 189000, originalPrice: 215000, brand: 'RB', unit: 'Hộp 20 viên', isPrescription: false, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/ecommerce/20240225091513-0-P31950_1.png' },
  { name: 'Acetylcysteine 200mg', description: 'Tiêu nhầy', price: 69000, originalPrice: 82000, brand: 'Zambon', unit: 'Hộp 30 gói', isPrescription: false, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20240105091833-0-P00376_1.jpg' },
  { name: 'Tetracycline 500mg', description: 'Kháng sinh', price: 32000, originalPrice: 38000, brand: 'Mekophar', unit: 'Hộp 20 viên', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/ecommerce/20240523050221-0-P30304_1.png' },
  { name: 'Rifampicin 300mg', description: 'Kháng lao (kê đơn)', price: 165000, originalPrice: 185000, brand: 'DongKook', unit: 'Hộp 10 viên', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/ecommerce/20240731062805-0-P34020_1.png' },
  { name: 'Isoniazid 300mg', description: 'Kháng lao (kê đơn)', price: 65000, originalPrice: 78000, brand: 'Mekophar', unit: 'Hộp 10 viên', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/ecommerce/20240523045918-0-P30606_1.png' },
  { name: 'Folic Acid 5mg', description: 'Bổ sung folate', price: 29000, originalPrice: 35000, brand: 'OPV', unit: 'Hộp 20 viên', isPrescription: false, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20230322142629-0-P27008_1.jpg' },
  { name: 'Ferrous Fumarate + B9 + B12', description: 'Bổ máu', price: 69000, originalPrice: 82000, brand: 'DHG', unit: 'Hộp 100 viên', isPrescription: false, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20240105091816-0-P00373_1.jpg' },
  { name: 'Mecobalamin 500mcg', description: 'Bổ thần kinh', price: 89000, originalPrice: 109000, brand: 'Eisai', unit: 'Hộp 30 viên', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20220701102654-0-P08926_1.jpg' },
  { name: 'Ginkgo Biloba 120mg', description: 'Tăng cường tuần hoàn não', price: 129000, originalPrice: 149000, brand: 'DHG', unit: 'Hộp 60 viên', isPrescription: false, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20211028105355-0-P15230_1.jpg' },
  { name: 'Betahistine 16mg', description: 'Rối loạn tiền đình', price: 79000, originalPrice: 95000, brand: 'Stada', unit: 'Hộp 20 viên', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20221011110142-0-P26180_1.jpg' },
  { name: 'Melatonin 3mg', description: 'Hỗ trợ ngủ ngon', price: 159000, originalPrice: 179000, brand: 'Natrol', unit: 'Lọ 60 viên', isPrescription: false, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20230330135559-0-P26482_1.jpg' },
  { name: 'Probiotic Lactobacillus', description: 'Hỗ trợ tiêu hóa', price: 139000, originalPrice: 159000, brand: 'Biogaia', unit: 'Hộp 30 viên', isPrescription: false, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20240105091547-0-P00309_1.jpg' },
  { name: 'ORS viên sủi', description: 'Bù điện giải dạng sủi', price: 45000, originalPrice: 52000, brand: 'OPV', unit: 'Ống 10 viên sủi', isPrescription: false, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/ecommerce/20240225085729-0-P31113_1.png' },
  { name: 'Dicyclomine 10mg', description: 'Giảm co thắt tiêu hóa', price: 32000, originalPrice: 38000, brand: 'Domesco', unit: 'Hộp 20 viên', isPrescription: true, imageUrl: 'https://production-cdn.pharmacity.io/digital/256x256/plain/e-com/images/product/20210622091947-0-P10245_1.jpg' }
];

async function main() {
  await connectDB();

  // Ensure category 'Thuốc' exists and get its id
  let drugCategory = await Category.findOne({ slug: 'thuoc' });
  if (!drugCategory) {
    drugCategory = await Category.create({
      name: 'Thuốc',
      icon: 'Pill',
      slug: 'thuoc',
      description: 'Các loại thuốc kê đơn và không kê đơn',
    });
  }

  // Prepare 50 items with stock and expiration/batch info
  const docs = MEDICINES.slice(0, 50).map((m, idx) => {
    const stockQuantity = 20 + Math.floor(Math.random() * 180); // 20-199
    const months = 8 + Math.floor(Math.random() * 28); // expire 8-35 months
    const { manufacturingDate, expirationDate } = generateDates(months);
    const batchNumber = `BN${manufacturingDate.getFullYear().toString().slice(-2)}${(manufacturingDate.getMonth()+1)
      .toString()
      .padStart(2, '0')}-${(1000 + idx).toString()}`;

    return {
      name: m.name,
      description: m.description,
      price: m.price,
      originalPrice: m.originalPrice ?? Math.round(m.price * 1.15),
      discountPercentage: Math.max(0, Math.min(50, Math.round(((m.originalPrice ?? Math.round(m.price * 1.15)) - m.price) / (m.originalPrice ?? (m.price*1.15)) * 100))),
      imageUrl: m.imageUrl,
      categoryId: drugCategory!._id,
      brand: m.brand,
      unit: m.unit,
      inStock: stockQuantity > 0,
      stockQuantity,
      isHot: idx % 9 === 0,
      isNew: idx % 7 === 0,
      isPrescription: m.isPrescription,
      expirationDate,
      manufacturingDate,
      batchNumber,
    };
  });

  // Upsert by name to avoid duplicates on re-run
  let created = 0;
  for (const d of docs) {
    const existing = await Product.findOne({ name: d.name });
    if (existing) {
      await Product.updateOne({ _id: existing._id }, d);
    } else {
      await Product.create(d as any);
      created += 1;
    }
  }

  console.log(`✅ Seeded medicines completed. Inserted new: ${created}, updated: ${docs.length - created}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Seed medicines failed:', err);
  process.exit(1);
});


