import { Request, Response } from 'express';
import { Product, Order, OrderItem } from '../models/schema.js';
import mongoose from 'mongoose';
import { extractTextFromImage } from '../services/ocrService.js';
import { findExactMatch, findSimilarMedicines, parseMedicineName } from '../services/medicineMatchingService.js';
import path from 'path';
import fs from 'fs';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Symptom to specific medicine mapping (Semantic Search) - Expanded
const symptomToMedicines: { [key: string]: { keywords: string[]; medicineNames: string[] } } = {
  'tiêu chảy': {
    keywords: ['tiêu chảy', 'đi ngoài', 'rối loạn tiêu hóa', 'đau bụng tiêu chảy'],
    medicineNames: ['Loperamide', 'Oresol', 'Smecta', 'Loperamid', 'Diosmectite', 'ORS', 'Diarstop']
  },
  'nổi mề đay': {
    keywords: ['nổi mề đay', 'mề đay', 'ngứa', 'dị ứng da', 'phát ban', 'mẩn đỏ'],
    medicineNames: ['Clorpheniramin', 'Cetirizine', 'Loratadine', 'Chlorpheniramine', 'Cetirizin', 'Loratadin', 'Fexofenadine']
  },
  'ngứa': {
    keywords: ['ngứa', 'dị ứng', 'mẩn ngứa'],
    medicineNames: ['Clorpheniramin', 'Cetirizine', 'Loratadine', 'Chlorpheniramine']
  },
  'cảm cúm': {
    keywords: ['cảm cúm', 'cảm', 'cúm', 'sốt', 'đau đầu', 'nhức đầu'],
    medicineNames: ['Paracetamol', 'Decolgen', 'Tiffy', 'Panadol', 'Efferalgan', 'Hapacol']
  },
  'cảm': {
    keywords: ['cảm', 'cảm lạnh', 'cảm thông thường'],
    medicineNames: ['Paracetamol', 'Decolgen', 'Tiffy', 'Panadol']
  },
  'sốt': {
    keywords: ['sốt', 'nóng sốt', 'sốt cao'],
    medicineNames: ['Paracetamol', 'Panadol', 'Efferalgan', 'Ibuprofen', 'Hapacol']
  },
  'nhức đầu': {
    keywords: ['nhức đầu', 'đau đầu', 'đau đầu không sốt'],
    medicineNames: ['Paracetamol', 'Panadol', 'Efferalgan', 'Ibuprofen']
  },
  'ho': {
    keywords: ['ho', 'ho khan', 'ho có đờm', 'ho nhẹ'],
    medicineNames: ['Terpin Codein', 'Bromhexin', 'Acetylcysteine', 'Ambroxol', 'Prospan', 'Eugica']
  },
  'ho có đờm': {
    keywords: ['ho có đờm', 'ho đờm', 'long đờm'],
    medicineNames: ['Bromhexin', 'Acetylcysteine', 'Ambroxol', 'Prospan', 'Mucosolvan']
  },
  'đau họng': {
    keywords: ['đau họng', 'viêm họng'],
    medicineNames: ['Strepsils', 'Betadine', 'Lysopaine', 'Prospan', 'Dorithricin']
  },
  'nghẹt mũi': {
    keywords: ['nghẹt mũi', 'tắc mũi'],
    medicineNames: ['Natri Clorid 0.9%', 'Xịt mũi muối biển', 'Otrivin', 'Naphazoline', 'Rhinocort']
  },
  'sổ mũi': {
    keywords: ['sổ mũi', 'chảy nước mũi'],
    medicineNames: ['Natri Clorid 0.9%', 'Xịt mũi muối biển', 'Otrivin']
  },
  'dạ dày': {
    keywords: ['dạ dày', 'đau dạ dày', 'viêm dạ dày', 'đau bao tử'],
    medicineNames: ['Omeprazole', 'Esomeprazole', 'Pantoprazole', 'Gaviscon', 'Gastropulgite']
  },
  'đau bụng': {
    keywords: ['đau bụng', 'co thắt dạ dày', 'đầy bụng', 'khó tiêu'],
    medicineNames: ['Buscopan', 'Spasmaverine', 'Duspatalin', 'Domperidone', 'Men tiêu hóa']
  },
  'đầy bụng': {
    keywords: ['đầy bụng', 'khó tiêu', 'men tiêu hóa'],
    medicineNames: ['Domperidone', 'Men tiêu hóa', 'Enzym', 'Pancreatin']
  },
  'táo bón': {
    keywords: ['táo bón', 'khó đi ngoài'],
    medicineNames: ['Duphalac', 'Forlax', 'Microlax']
  },
  'dị ứng': {
    keywords: ['dị ứng', 'mẩn đỏ', 'dị ứng nhẹ'],
    medicineNames: ['Clorpheniramin', 'Cetirizine', 'Loratadine', 'Fexofenadine']
  },
  'say nắng': {
    keywords: ['say nắng', 'say nóng'],
    medicineNames: ['Oresol', 'Natri Clorid 0.9%', 'Vitamin C', 'Paracetamol']
  },
  'thiếu canxi': {
    keywords: ['thiếu canxi', 'tụt canxi', 'mỏi chân', 'chuột rút'],
    medicineNames: ['Canxi', 'Calcium', 'Canxi D3', 'Osteocare']
  },
  'viêm mũi dị ứng': {
    keywords: ['viêm mũi dị ứng', 'dị ứng mũi'],
    medicineNames: ['Cetirizine', 'Loratadine', 'Fexofenadine', 'Rhinocort']
  },
  'đau nhức toàn thân': {
    keywords: ['đau nhức toàn thân', 'đau cơ', 'đau mỏi'],
    medicineNames: ['Ibuprofen', 'Diclofenac', 'Paracetamol', 'Meloxicam']
  },
  'thiếu máu': {
    keywords: ['thiếu máu', 'bổ sung sắt'],
    medicineNames: ['Sắt', 'Iron', 'Ferrovit', 'Tardyferon']
  },
  'viêm': {
    keywords: ['viêm', 'sưng viêm', 'kháng viêm'],
    medicineNames: ['Ibuprofen', 'Diclofenac', 'Meloxicam', 'Celecoxib']
  }
};

// Medicine recommendation mapping (based on purchase history)
const medicineRecommendations: { [key: string]: string[] } = {
  'Paracetamol': ['Natri Clorid 0.9%', 'Vitamin C', 'Xịt mũi muối biển', 'Oresol', 'Decolgen'],
  'Decolgen': ['Natri Clorid 0.9%', 'Vitamin C', 'Xịt mũi muối biển', 'Oresol', 'Paracetamol'],
  'Panadol': ['Natri Clorid 0.9%', 'Vitamin C', 'Xịt mũi muối biển'],
  'Efferalgan': ['Natri Clorid 0.9%', 'Vitamin C', 'Oresol'],
  'Loperamide': ['Oresol', 'Smecta', 'Men vi sinh'],
  'Oresol': ['Smecta', 'Men vi sinh', 'Loperamide'],
  'Smecta': ['Oresol', 'Men vi sinh', 'Loperamide'],
  'Clorpheniramin': ['Cetirizine', 'Loratadine', 'Kem bôi dị ứng'],
  'Cetirizine': ['Loratadine', 'Clorpheniramin', 'Kem bôi dị ứng'],
  'Loratadine': ['Cetirizine', 'Clorpheniramin', 'Kem bôi dị ứng'],
  'ho trẻ em': ['Prospan', 'Eugica', 'Xịt mũi muối biển', 'Natri Clorid 0.9%'],
  'vitamin': ['Vitamin C', 'Vitamin D3', 'Kẽm', 'Canxi', 'Multivitamin']
};

// Medicine dosage reference (safe reference only, not prescription)
const medicineDosageReference: { [key: string]: string } = {
  'Paracetamol': 'Liều tham khảo: Người lớn 500-1000mg mỗi 4-6 giờ, tối đa 4g/ngày. Trẻ em: 10-15mg/kg/lần, tối đa 4 lần/ngày. ⚠️ Chỉ là tham khảo, cần tư vấn dược sĩ.',
  'Clorpheniramin': 'Liều tham khảo: Người lớn 4mg x 2-3 lần/ngày. Trẻ em: 0.1mg/kg/ngày chia 2-3 lần. ⚠️ Có thể gây buồn ngủ. Chỉ là tham khảo, cần tư vấn dược sĩ.',
  'Vitamin C': 'Liều tham khảo: Người lớn 500-1000mg/ngày. Trẻ em: 50-100mg/ngày. ⚠️ Chỉ là tham khảo, cần tư vấn dược sĩ.',
  'Ibuprofen': 'Liều tham khảo: Người lớn 200-400mg x 3-4 lần/ngày. Trẻ em: 5-10mg/kg/lần, tối đa 4 lần/ngày. ⚠️ Chỉ là tham khảo, cần tư vấn dược sĩ.',
  'Oresol': 'Pha 1 gói với 200ml nước sôi để nguội, uống từng ngụm nhỏ. Trẻ em: 50-100ml/kg trong 4-6 giờ đầu. ⚠️ Chỉ là tham khảo, cần tư vấn dược sĩ.'
};

// Medicine contraindications and warnings
const medicineWarnings: { [key: string]: { contraindications: string; sideEffects: string; notes: string } } = {
  'Paracetamol': {
    contraindications: 'Người suy gan nặng, quá mẫn với Paracetamol',
    sideEffects: 'Hiếm gặp: phát ban, buồn nôn',
    notes: 'Không vượt quá 4g/ngày, tránh dùng với rượu'
  },
  'Ibuprofen': {
    contraindications: 'Người đau dạ dày, loét dạ dày, suy thận, phụ nữ mang thai 3 tháng cuối',
    sideEffects: 'Có thể gây đau dạ dày, buồn nôn, chóng mặt',
    notes: 'Nên uống sau ăn, không dùng quá 7 ngày'
  },
  'Aspirin': {
    contraindications: 'Người đau dạ dày, loét dạ dày, trẻ em dưới 16 tuổi, phụ nữ mang thai',
    sideEffects: 'Có thể gây đau dạ dày, xuất huyết',
    notes: 'Không dùng cho trẻ em, người đau dạ dày'
  },
  'Cefuroxime': {
    contraindications: 'Quá mẫn với Cephalosporin, phụ nữ mang thai cần thận trọng',
    sideEffects: 'Có thể gây tiêu chảy, buồn nôn, phát ban',
    notes: 'Cần có đơn bác sĩ, không tự ý sử dụng'
  },
  'Domperidone': {
    contraindications: 'Người có bệnh tim, rối loạn nhịp tim',
    sideEffects: 'Hiếm gặp: đau đầu, khô miệng',
    notes: 'Nên uống trước ăn 15-30 phút'
  }
};

// Safety warnings for dangerous queries
const safetyWarnings: { [key: string]: string } = {
  'sốt cao 40': '⚠️ Sốt cao 40°C là tình trạng nghiêm trọng. Bạn cần đi khám bác sĩ ngay lập tức hoặc đến cơ sở y tế gần nhất. Không tự ý điều trị tại nhà.',
  'đổi toa thuốc': '⚠️ Không được tự ý đổi toa thuốc bác sĩ đã kê. Vui lòng liên hệ với bác sĩ điều trị để được tư vấn. Tự ý đổi thuốc có thể gây nguy hiểm.',
  'covid': '⚠️ Nếu nghi ngờ COVID-19, bạn cần làm test nhanh hoặc đến cơ sở y tế để được xét nghiệm và điều trị đúng cách. Không có thuốc đặc trị COVID-19 không cần đơn.',
  'kháng sinh không toa': '⚠️ Kháng sinh là thuốc kê đơn, không được bán không cần đơn bác sĩ. Việc tự ý dùng kháng sinh có thể gây kháng thuốc và nguy hiểm. Vui lòng đến bác sĩ để được kê đơn.',
  'đau ngực tim': '⚠️ Đau ngực nghi là tim là tình trạng khẩn cấp. Bạn cần gọi cấp cứu 115 hoặc đến bệnh viện ngay lập tức. Không tự ý uống thuốc.',
  'đau ngực': '⚠️ Đau ngực có thể là dấu hiệu của bệnh tim. Bạn nên đi khám bác sĩ ngay để được chẩn đoán chính xác.'
};

// Common medicine information (fallback when not in database)
const commonMedicineInfo: { [key: string]: { indication: string; description: string } } = {
  'Paracetamol': {
    indication: 'Hạ sốt, giảm đau nhẹ đến vừa (đau đầu, đau răng, đau cơ, đau khớp, đau do kinh nguyệt)',
    description: 'Paracetamol (Acetaminophen) là thuốc giảm đau, hạ sốt phổ biến. Dùng để điều trị các cơn đau nhẹ đến vừa và hạ sốt.'
  },
  'Ibuprofen': {
    indication: 'Giảm đau, hạ sốt, chống viêm (đau đầu, đau răng, đau cơ, viêm khớp, đau bụng kinh)',
    description: 'Ibuprofen là thuốc kháng viêm không steroid (NSAID), dùng để giảm đau, hạ sốt và chống viêm.'
  },
  'Decolgen': {
    indication: 'Điều trị triệu chứng cảm cúm: hạ sốt, giảm đau, giảm nghẹt mũi, sổ mũi',
    description: 'Decolgen là thuốc kết hợp dùng để điều trị các triệu chứng cảm cúm như sốt, đau đầu, nghẹt mũi, sổ mũi.'
  },
  'Clorpheniramin': {
    indication: 'Điều trị các triệu chứng dị ứng: mề đay, ngứa, viêm mũi dị ứng, phát ban',
    description: 'Clorpheniramin là thuốc kháng histamin, dùng để điều trị các triệu chứng dị ứng như mề đay, ngứa, viêm mũi dị ứng.'
  },
  'Loperamide': {
    indication: 'Điều trị tiêu chảy cấp và mạn tính không do nhiễm khuẩn',
    description: 'Loperamide là thuốc chống tiêu chảy, làm giảm nhu động ruột và giảm tần suất đi ngoài.'
  },
  'Domperidone': {
    indication: 'Điều trị các triệu chứng rối loạn tiêu hóa: buồn nôn, nôn, đầy bụng, khó tiêu',
    description: 'Domperidone là thuốc chống nôn, kích thích nhu động dạ dày, dùng để điều trị buồn nôn, nôn và các rối loạn tiêu hóa.'
  },
  'Oresol': {
    indication: 'Bù nước và điện giải trong trường hợp mất nước do tiêu chảy, nôn, sốt',
    description: 'Oresol (ORS) là dung dịch bù nước và điện giải, dùng để bù nước khi bị mất nước do tiêu chảy, nôn hoặc sốt.'
  },
  'Metronidazole': {
    indication: 'Điều trị nhiễm khuẩn kỵ khí, nhiễm ký sinh trùng (amip, giardia), viêm âm đạo do vi khuẩn',
    description: 'Metronidazole là kháng sinh, dùng để điều trị các nhiễm khuẩn kỵ khí và nhiễm ký sinh trùng.'
  },
  'Augmentin': {
    indication: 'Điều trị nhiễm khuẩn đường hô hấp, đường tiết niệu, da và mô mềm do vi khuẩn nhạy cảm',
    description: 'Augmentin là kháng sinh phổ rộng, kết hợp Amoxicillin và Clavulanic acid, dùng để điều trị các nhiễm khuẩn do vi khuẩn.'
  },
  'Azithromycin': {
    indication: 'Điều trị nhiễm khuẩn đường hô hấp, đường sinh dục, da và mô mềm do vi khuẩn nhạy cảm',
    description: 'Azithromycin là kháng sinh nhóm macrolide, dùng để điều trị các nhiễm khuẩn đường hô hấp và các nhiễm khuẩn khác.'
  }
};

// Get detailed medicine information - prioritize generic information
async function getMedicineDetails(productName: string, isUsageQuery: boolean = false): Promise<any> {
  try {
    const db = mongoose.connection.db;
    if (!db) return null;
    
    // Clean product name - remove dosage info for better matching
    const cleanName = productName.replace(/\d+\s*(mg|g|ml|%|viên|hộp)/gi, '').trim();
    const baseName = cleanName.split(' ')[0]; // Get base name (e.g., "Paracetamol" from "Paracetamol 500mg")
    
    // For usage queries, prioritize medicines collection (generic info)
    if (isUsageQuery) {
      const medicinesCollection = db.collection('medicines');
      
      // Try exact match first
      let medicine = await medicinesCollection.findOne({
        $or: [
          { name: { $regex: `^${baseName}`, $options: 'i' } },
          { genericName: { $regex: `^${baseName}`, $options: 'i' } },
          { brand: { $regex: `^${baseName}`, $options: 'i' } }
        ]
      });
      
      // If not found, try partial match
      if (!medicine) {
        medicine = await medicinesCollection.findOne({
          $or: [
            { name: { $regex: baseName, $options: 'i' } },
            { genericName: { $regex: baseName, $options: 'i' } },
            { brand: { $regex: baseName, $options: 'i' } }
          ]
        });
      }
      
      if (medicine) {
        return {
          name: medicine.name || baseName,
          description: medicine.description || medicine.indication || commonMedicineInfo[baseName]?.description || '',
          brand: medicine.brand || '',
          price: medicine.price || 0,
          stockQuantity: medicine.stockQuantity || 0,
          unit: medicine.unit || 'đơn vị',
          indication: medicine.indication || commonMedicineInfo[baseName]?.indication || '',
          contraindication: medicine.contraindication || '',
          dosage: medicine.dosage || '',
          interaction: medicine.interaction || '',
          sideEffect: medicine.sideEffect || ''
        };
      }
      
      // Fallback to common medicine info
      if (commonMedicineInfo[baseName]) {
        return {
          name: baseName,
          description: commonMedicineInfo[baseName].description,
          indication: commonMedicineInfo[baseName].indication,
          brand: '',
          price: 0,
          stockQuantity: 0,
          unit: 'đơn vị'
        };
      }
    }
    
    // For non-usage queries or if not found in medicines, search in products
    const productsCollection = db.collection('products');
    let product = await productsCollection.findOne({
      $or: [
        { name: { $regex: `^${baseName}`, $options: 'i' } },
        { name: { $regex: baseName, $options: 'i' } }
      ]
    });
    
    // If not found, search in medicines collection
    if (!product) {
      const medicinesCollection = db.collection('medicines');
      const medicine = await medicinesCollection.findOne({
        $or: [
          { name: { $regex: baseName, $options: 'i' } },
          { brand: { $regex: baseName, $options: 'i' } },
          { genericName: { $regex: baseName, $options: 'i' } }
        ]
      });
      
      if (medicine) {
        product = {
          name: medicine.name || baseName,
          description: medicine.description || medicine.indication || commonMedicineInfo[baseName]?.description || '',
          brand: medicine.brand || '',
          price: medicine.price || 0,
          stockQuantity: medicine.stockQuantity || 0,
          unit: medicine.unit || 'đơn vị',
          indication: medicine.indication || commonMedicineInfo[baseName]?.indication || '',
          contraindication: medicine.contraindication || '',
          dosage: medicine.dosage || '',
          interaction: medicine.interaction || '',
          sideEffect: medicine.sideEffect || ''
        };
      } else if (commonMedicineInfo[baseName]) {
        // Fallback to common info
        product = {
          name: baseName,
          description: commonMedicineInfo[baseName].description,
          indication: commonMedicineInfo[baseName].indication,
          brand: '',
          price: 0,
          stockQuantity: 0,
          unit: 'đơn vị'
        };
      }
    }
    
    return product;
  } catch (error) {
    console.error('Error getting medicine details:', error);
    return null;
  }
}

// Get user's purchase history
async function getUserPurchaseHistory(userId: string): Promise<any[]> {
  try {
    if (!userId) return [];
    
    const userIdObj = mongoose.Types.ObjectId.isValid(userId) 
      ? new mongoose.Types.ObjectId(userId) 
      : userId;
    
    const orders = await Order.find({ 
      userId: userIdObj,
      status: { $in: ['delivered', 'confirmed', 'processing'] }
    })
    .sort({ createdAt: -1 })
    .limit(10);
    
    const purchaseHistory: any[] = [];
    
    for (const order of orders) {
      const items = await OrderItem.find({ orderId: order._id })
        .populate('productId');
      
      for (const item of items) {
        const product = item.productId as any;
        if (product) {
          purchaseHistory.push({
            productId: product._id,
            productName: product.name,
            brand: product.brand || '',
            categoryId: product.categoryId,
            lastPurchased: order.createdAt,
            quantity: item.quantity
          });
        }
      }
    }
    
    return purchaseHistory;
  } catch (error) {
    console.error('Error getting purchase history:', error);
    return [];
  }
}

// Semantic search - find medicines by meaning, not exact keywords
async function semanticSearch(query: string): Promise<any[]> {
  try {
    const lowerQuery = query.toLowerCase();
    const foundMedicines: string[] = [];
    const searchKeywords: string[] = [];
    
    // Check symptom mapping for specific medicines
    for (const [symptom, data] of Object.entries(symptomToMedicines)) {
      // Check if query contains any keyword
      const hasKeyword = data.keywords.some(keyword => lowerQuery.includes(keyword));
      
      if (hasKeyword || lowerQuery.includes(symptom)) {
        foundMedicines.push(...data.medicineNames);
        searchKeywords.push(...data.keywords);
      }
    }
    
    if (foundMedicines.length === 0) return [];
    
    const db = mongoose.connection.db;
    if (!db) return [];
    
    const productsCollection = db.collection('products');
    const medicinesCollection = db.collection('medicines');
    
    // Search for specific medicine names
    const medicineNameRegex = foundMedicines.map(name => ({
      $or: [
        { name: { $regex: name, $options: 'i' } },
        { brand: { $regex: name, $options: 'i' } },
        { description: { $regex: name, $options: 'i' } }
      ]
    }));
    
    // Also search by keywords for broader results
    const keywordRegex = searchKeywords.map(keyword => ({
      $or: [
        { name: { $regex: keyword, $options: 'i' } },
        { description: { $regex: keyword, $options: 'i' } }
      ]
    }));
    
    // Search in products collection
    let products = await productsCollection.find({
      $or: [...medicineNameRegex, ...keywordRegex],
      inStock: true,
      stockQuantity: { $gt: 0 }
    })
    .limit(10)
    .toArray();
    
    // If not enough results, search in medicines collection
    if (products.length < 3) {
      const medicines = await medicinesCollection.find({
        $or: [...medicineNameRegex, ...keywordRegex]
      })
      .limit(10 - products.length)
      .toArray();
      
      // Convert to product format
      const convertedMedicines = medicines.map(med => ({
        name: med.name,
        price: med.price || 0,
        description: med.description || med.indication || '',
        brand: med.brand || '',
        inStock: true,
        stockQuantity: med.stockQuantity || 0,
        unit: med.unit || 'đơn vị',
        imageUrl: med.imageUrl || ''
      }));
      
      products = [...products, ...convertedMedicines];
    }
    
    // Remove duplicates and prioritize exact matches
    const uniqueProducts = new Map();
    for (const product of products) {
      const key = product.name?.toLowerCase() || '';
      if (!uniqueProducts.has(key)) {
        uniqueProducts.set(key, product);
      }
    }
    
    return Array.from(uniqueProducts.values()).slice(0, 10);
  } catch (error) {
    console.error('Error in semantic search:', error);
    return [];
  }
}

// Suggest medicines based on symptoms (improved version)
async function suggestMedicinesBySymptom(symptoms: string[]): Promise<any[]> {
  try {
    // First try semantic search
    const query = symptoms.join(' ');
    const semanticResults = await semanticSearch(query);
    
    if (semanticResults.length > 0) {
      return semanticResults;
    }
    
    // Fallback to category-based search
    const categories: string[] = [];
    for (const symptom of symptoms) {
      const lowerSymptom = symptom.toLowerCase();
      if (symptomToMedicines[lowerSymptom]) {
        categories.push(...symptomToMedicines[lowerSymptom].keywords);
      }
    }
    
    if (categories.length === 0) return [];
    
    const db = mongoose.connection.db;
    if (!db) return [];
    
    const productsCollection = db.collection('products');
    const searchTerms = categories.join('|');
    
    const products = await productsCollection.find({
      $or: [
        { name: { $regex: searchTerms, $options: 'i' } },
        { description: { $regex: searchTerms, $options: 'i' } }
      ],
      inStock: true,
      stockQuantity: { $gt: 0 }
    })
    .limit(10)
    .toArray();
    
    return products;
  } catch (error) {
    console.error('Error suggesting medicines by symptom:', error);
    return [];
  }
}

// Normalize text (handle typos and common misspellings)
function normalizeText(text: string): string {
  let normalized = text.toLowerCase();
  
  // Common typos
  const typos: { [key: string]: string } = {
    'bi': 'bị',
    'thuoc': 'thuốc',
    'giam': 'giảm',
    'dau': 'đau',
    'bong': 'bụng',
    'di': 'đi',
    'ung': 'ứng',
    'ban': 'bán',
    'tro': 'tìm',
    'hok': 'không',
    'z': 'gì',
    'coi': 'xem',
    'vô': 'vào',
    'xíu': 'một chút'
  };
  
  for (const [typo, correct] of Object.entries(typos)) {
    normalized = normalized.replace(new RegExp(`\\b${typo}\\b`, 'gi'), correct);
  }
  
  return normalized;
}

// Check for safety warnings
function checkSafetyWarnings(message: string): string | null {
  const lowerMessage = normalizeText(message);
  
  for (const [key, warning] of Object.entries(safetyWarnings)) {
    if (lowerMessage.includes(key)) {
      return warning;
    }
  }
  
  return null;
}

// Extract medicine name from query
function extractMedicineNameFromQuery(query: string): string | null {
  const lowerQuery = normalizeText(query);
  
  // Common patterns
  const patterns = [
    /(?:thuốc|sản phẩm)\s+([a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+(?:\s+\d+[a-z]+)?)/i,
    /([A-Z][a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+(?:\s+\d+[a-z]+)?)/,
    /(?:giá|tồn kho|còn hàng|công dụng|liều dùng|chống chỉ định)\s+(?:của|thuốc)?\s*([a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+(?:\s+\d+[a-z]+)?)/i
  ];
  
  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return null;
}

// AI response function with hybrid approach: LLM + Rule-based
async function generateAIResponse(
  userMessage: string,
  conversationHistory: ChatMessage[],
  userId?: string
): Promise<string> {
  const lowerMessage = normalizeText(userMessage);
  
  // Try to use AI LLM first (if configured)
  try {
    // Import AI service dynamically to avoid errors if not installed
    const aiService = await import('../services/aiService.js').catch(() => null);
    
    if (aiService) {
      // Get context for AI (medicines, user history, etc.)
      const context: any = {};
      
      // Try to get relevant medicines for context
      const symptomKeywords = Object.keys(symptomToMedicines).filter(symptom => 
        lowerMessage.includes(symptom)
      );
      if (symptomKeywords.length > 0) {
        const suggestedMedicines = await semanticSearch(userMessage);
        if (suggestedMedicines.length > 0) {
          context.medicines = suggestedMedicines.slice(0, 5);
          context.symptoms = symptomKeywords;
        }
      }
      
      // Get user purchase history if available
      if (userId) {
        const purchaseHistory = await getUserPurchaseHistory(userId);
        if (purchaseHistory.length > 0) {
          context.userHistory = purchaseHistory.slice(0, 5);
        }
      }
      
      // Try Google Gemini first (free tier, good for Vietnamese)
      const geminiResponse = await aiService.generateAIResponseWithGemini({
        userMessage,
        conversationHistory,
        context
      });
      
      if (geminiResponse) {
        return geminiResponse;
      }
      
      // Try OpenAI as fallback (if configured)
      const aiResponse = await aiService.generateAIResponseWithLLM({
        userMessage,
        conversationHistory,
        context
      });
      
      if (aiResponse) {
        return aiResponse;
      }
      
      // Try Ollama (local LLM) as last fallback
      const ollamaResponse = await aiService.generateAIResponseWithOllama({
        userMessage,
        conversationHistory,
        context
      });
      
      if (ollamaResponse) {
        return ollamaResponse;
      }
    }
  } catch (error) {
    console.log('AI service not available, using rule-based system:', error);
    // Continue with rule-based system
  }
  
  // Fallback to rule-based system (current implementation)
  
  // 0. Check for safety warnings first (highest priority)
  const safetyWarning = checkSafetyWarnings(userMessage);
  if (safetyWarning) {
    return safetyWarning;
  }
  
  // 1. Check for dosage questions (liều dùng tham khảo)
  if (lowerMessage.includes('liều dùng') || lowerMessage.includes('uống mấy viên') || 
      lowerMessage.includes('uống như thế nào') || lowerMessage.includes('bao nhiêu viên') ||
      lowerMessage.includes('pha bao nhiêu')) {
    const medicineName = extractMedicineNameFromQuery(userMessage);
    if (medicineName) {
      const dosage = medicineDosageReference[medicineName] || 
                     medicineDosageReference[medicineName.split(' ')[0]];
      if (dosage) {
        return dosage;
      }
      // Try to get from database
      const medicineDetails = await getMedicineDetails(medicineName);
      if (medicineDetails && medicineDetails.dosage) {
        return `Liều dùng tham khảo: ${medicineDetails.dosage}\n\n⚠️ **Lưu ý quan trọng:** Đây chỉ là thông tin tham khảo. Liều dùng cụ thể cần được tư vấn bởi bác sĩ/dược sĩ. Không tự ý thay đổi liều lượng.`;
      }
      return `Tôi không có thông tin liều dùng cụ thể cho "${medicineName}". Vui lòng liên hệ dược sĩ để được tư vấn về liều dùng phù hợp với tình trạng của bạn. ⚠️ Lưu ý: Liều dùng cần được chỉ định bởi bác sĩ/dược sĩ.`;
    }
    return "Vui lòng cho tôi biết tên thuốc bạn muốn hỏi về liều dùng. ⚠️ Lưu ý: Tôi chỉ cung cấp thông tin tham khảo, không thay thế chỉ định của bác sĩ.";
  }
  
  // 2. Check for contraindications and side effects
  if (lowerMessage.includes('chống chỉ định') || lowerMessage.includes('ai không nên uống') ||
      lowerMessage.includes('được không') || lowerMessage.includes('có uống được không')) {
    const medicineName = extractMedicineNameFromQuery(userMessage);
    if (medicineName) {
      const warning = medicineWarnings[medicineName] || 
                     medicineWarnings[medicineName.split(' ')[0]];
      if (warning) {
        let response = `📋 **Thông tin về ${medicineName}:**\n\n`;
        response += `⚠️ **Chống chỉ định:**\n${warning.contraindications}\n\n`;
        if (warning.sideEffects) {
          response += `⚠️ **Tác dụng phụ:**\n${warning.sideEffects}\n\n`;
        }
        response += `📝 **Lưu ý:**\n${warning.notes}\n\n`;
        response += `⚠️ **Quan trọng:** Thông tin trên chỉ mang tính chất tham khảo. Vui lòng tham khảo ý kiến bác sĩ/dược sĩ trước khi sử dụng.`;
        return response;
      }
      // Try to get from database
      const medicineDetails = await getMedicineDetails(medicineName);
      if (medicineDetails) {
        return formatMedicineDetails(medicineDetails, lowerMessage);
      }
    }
  }
  
  // 3. Check for price and stock queries
  if (lowerMessage.includes('giá') && (lowerMessage.includes('bao nhiêu') || lowerMessage.includes('bao nhiêu tiền'))) {
    const medicineName = extractMedicineNameFromQuery(userMessage);
    if (medicineName) {
      const products = await searchProductsWithFilters([medicineName]);
      if (products.length > 0) {
        let response = `💰 **Thông tin giá của ${medicineName}:**\n\n`;
        products.slice(0, 3).forEach(product => {
          response += `- **${product.name}**\n`;
          if (product.brand) response += `  Thương hiệu: ${product.brand}\n`;
          response += `  Giá: ${product.price.toLocaleString('vi-VN')}đ\n`;
          if (product.stockQuantity !== undefined) {
            response += `  Tồn kho: ${product.stockQuantity} ${product.unit || 'sản phẩm'}\n`;
          }
          response += `\n`;
        });
        return response;
      }
      return `Tôi không tìm thấy sản phẩm "${medicineName}" trong hệ thống. Vui lòng kiểm tra lại tên sản phẩm.`;
    }
  }
  
  if (lowerMessage.includes('còn hàng') || lowerMessage.includes('tồn kho') || 
      lowerMessage.includes('còn bao nhiêu') || lowerMessage.includes('còn không')) {
    const medicineName = extractMedicineNameFromQuery(userMessage);
    if (medicineName) {
      const products = await searchProductsWithFilters([medicineName]);
      if (products.length > 0) {
        let response = `📦 **Tình trạng tồn kho:**\n\n`;
        products.slice(0, 3).forEach(product => {
          response += `- **${product.name}**\n`;
          if (product.stockQuantity !== undefined && product.stockQuantity > 0) {
            response += `  ✅ Còn hàng: ${product.stockQuantity} ${product.unit || 'sản phẩm'}\n`;
          } else {
            response += `  ❌ Hết hàng\n`;
          }
          response += `\n`;
        });
        return response;
      }
    }
  }
  
  // 4. Check for brand-specific queries
  if (lowerMessage.includes('của') && (lowerMessage.includes('sanofi') || lowerMessage.includes('dhg') || 
      lowerMessage.includes('dhc') || lowerMessage.includes('gsk') || lowerMessage.includes('abbott'))) {
    const { brand } = extractMedicineKeywords(userMessage);
    if (brand) {
      const products = await searchProductsWithFilters([], { brand });
      if (products.length > 0) {
        return formatProductResponse(products, userMessage);
      }
      return `Tôi không tìm thấy sản phẩm của ${brand} trong hệ thống.`;
    }
  }
  
  // 5. Check for dosage form queries (dạng bào chế)
  if (lowerMessage.includes('dạng') && (lowerMessage.includes('siro') || lowerMessage.includes('gói') || 
      lowerMessage.includes('viên') || lowerMessage.includes('nhỏ mắt') || lowerMessage.includes('xịt'))) {
    const formKeywords = ['siro', 'gói', 'viên', 'nhỏ mắt', 'xịt'].filter(f => lowerMessage.includes(f));
    if (formKeywords.length > 0) {
      const { keywords } = extractMedicineKeywords(userMessage);
      const allKeywords = [...keywords, ...formKeywords];
      const products = await searchProductsWithFilters(allKeywords);
      if (products.length > 0) {
        return formatProductResponse(products, userMessage);
      }
    }
  }
  
  // 6. Check for non-medicine products
  if (lowerMessage.includes('khẩu trang') || lowerMessage.includes('nhiệt kế') || 
      lowerMessage.includes('bông gòn') || lowerMessage.includes('gel rửa tay') ||
      lowerMessage.includes('chăm sóc da')) {
    const { keywords } = extractMedicineKeywords(userMessage);
    const products = await searchProductsWithFilters(keywords);
    if (products.length > 0) {
      return formatProductResponse(products, userMessage);
    }
  }
  
  // 7. Check for practical questions
  if (lowerMessage.includes('gây buồn ngủ') || lowerMessage.includes('buồn ngủ')) {
    if (lowerMessage.includes('không gây buồn ngủ') || lowerMessage.includes('không buồn ngủ')) {
      // Suggest non-drowsy allergy medicines
      const products = await searchProductsWithFilters(['Cetirizine', 'Loratadine', 'Fexofenadine']);
      if (products.length > 0) {
        return `💊 **Thuốc dị ứng không gây buồn ngủ:**\n\n${formatProductResponse(products, userMessage)}\n\n⚠️ Lưu ý: Một số người vẫn có thể cảm thấy buồn ngủ nhẹ. Vui lòng tham khảo ý kiến dược sĩ.`;
      }
    } else {
      return "Một số thuốc dị ứng như Clorpheniramin có thể gây buồn ngủ. Nếu bạn cần thuốc không gây buồn ngủ, tôi có thể gợi ý Cetirizine, Loratadine hoặc Fexofenadine.";
    }
  }
  
  if (lowerMessage.includes('uống sau ăn') || lowerMessage.includes('uống trước ăn') || 
      lowerMessage.includes('uống khi nào')) {
    return "Thông tin về thời điểm uống thuốc (trước/sau ăn) thường được ghi trên bao bì hoặc trong hướng dẫn sử dụng. Vui lòng đọc kỹ hướng dẫn hoặc hỏi dược sĩ để được tư vấn chính xác.";
  }
  
  if (lowerMessage.includes('uống chung với rượu') || lowerMessage.includes('rượu')) {
    return "⚠️ **Cảnh báo:** Không nên uống thuốc chung với rượu. Rượu có thể làm tăng tác dụng phụ của thuốc, gây nguy hiểm cho sức khỏe. Vui lòng tránh uống rượu khi đang dùng thuốc.";
  }
  
  if (lowerMessage.includes('uống buổi tối') || lowerMessage.includes('uống tối')) {
    return "Thời điểm uống thuốc phụ thuộc vào loại thuốc. Một số thuốc nên uống buổi sáng, một số uống buổi tối. Vui lòng đọc hướng dẫn sử dụng hoặc hỏi dược sĩ để được tư vấn chính xác.";
  }
  
  if (lowerMessage.includes('chưa khỏi') || lowerMessage.includes('uống thuốc nhưng')) {
    return "Nếu bạn đã uống thuốc đúng liều và đủ thời gian nhưng chưa khỏi, bạn nên:\n1. Đi khám bác sĩ để được chẩn đoán lại\n2. Không tự ý tăng liều hoặc đổi thuốc\n3. Liên hệ với dược sĩ để được tư vấn\n\n⚠️ Không tự ý điều trị kéo dài mà không có chỉ định của bác sĩ.";
  }
  
  // 1. Semantic Search - Check for symptom-based queries (e.g., "Tôi bị tiêu chảy nhẹ", "Nổi mề đay bị ngứa")
  // This handles natural language queries without exact keywords
  const symptomKeywords = Object.keys(symptomToMedicines).filter(symptom => 
    lowerMessage.includes(symptom)
  );
  
  // Also check for semantic matches (e.g., "nổi mề đay bị ngứa" should find allergy medicines)
  const semanticMatches = Object.entries(symptomToMedicines).filter(([symptom, data]) => 
    data.keywords.some(keyword => lowerMessage.includes(keyword))
  );
  
  if (symptomKeywords.length > 0 || semanticMatches.length > 0) {
    try {
      // Use semantic search for better results
      const suggestedMedicines = await semanticSearch(userMessage);
      if (suggestedMedicines.length > 0) {
        return await formatSymptomBasedResponse(suggestedMedicines, symptomKeywords.length > 0 ? symptomKeywords : semanticMatches.map(m => m[0]));
      }
    } catch (error) {
      console.error('Error suggesting medicines by symptom:', error);
    }
  }
  
  // 2. Check for detailed medicine information queries
  if (lowerMessage.includes('công dụng') || lowerMessage.includes('dùng để làm gì') || 
      lowerMessage.includes('dùng để trị') || lowerMessage.includes('trị bệnh gì') ||
      lowerMessage.includes('có tác dụng gì') || lowerMessage.includes('dùng vào mục đích gì') ||
      lowerMessage.includes('chữa bệnh gì') || lowerMessage.includes('trị những bệnh nào') ||
      lowerMessage.includes('thành phần') || lowerMessage.includes('chống chỉ định') ||
      lowerMessage.includes('tương tác') || lowerMessage.includes('tác dụng phụ')) {
    const medicineName = extractMedicineNameFromQuery(userMessage);
    if (medicineName) {
      // For usage queries, prioritize generic medicine information
      const isUsageQuery = lowerMessage.includes('công dụng') || lowerMessage.includes('dùng để') || 
                          lowerMessage.includes('tác dụng') || lowerMessage.includes('trị bệnh') ||
                          lowerMessage.includes('chữa bệnh');
      const medicineDetails = await getMedicineDetails(medicineName, isUsageQuery);
      if (medicineDetails) {
        return formatMedicineDetails(medicineDetails, lowerMessage);
      }
      // Try with base name (remove dosage)
      const baseName = medicineName.replace(/\d+\s*(mg|g|ml|%|viên|hộp)/gi, '').trim().split(' ')[0];
      if (baseName && baseName !== medicineName) {
        const medicineDetails2 = await getMedicineDetails(baseName, isUsageQuery);
        if (medicineDetails2) {
          return formatMedicineDetails(medicineDetails2, lowerMessage);
        }
      }
      // Try with keywords
      const { keywords } = extractMedicineKeywords(userMessage);
      if (keywords.length > 0) {
        const medicineDetails3 = await getMedicineDetails(keywords.join(' '), isUsageQuery);
        if (medicineDetails3) {
          return formatMedicineDetails(medicineDetails3, lowerMessage);
        }
      }
      return `Tôi không tìm thấy thông tin chi tiết về "${medicineName}". Vui lòng kiểm tra lại tên thuốc hoặc liên hệ dược sĩ để được tư vấn.`;
    }
    return "Vui lòng cho tôi biết tên thuốc bạn muốn tìm hiểu thông tin chi tiết.";
  }
  
  // 3. Check for purchase history suggestions with recommendations
  if ((lowerMessage.includes('đã mua') || lowerMessage.includes('mua trước') || 
       lowerMessage.includes('lịch sử') || lowerMessage.includes('gợi ý') ||
       lowerMessage.includes('recommendation') || lowerMessage.includes('đề xuất')) && userId) {
    const purchaseHistory = await getUserPurchaseHistory(userId);
    if (purchaseHistory.length > 0) {
      return await formatPurchaseHistorySuggestions(purchaseHistory);
    }
    return "Bạn chưa có lịch sử mua hàng. Hãy thử một số sản phẩm phổ biến của chúng tôi!";
  }
  
  // 4. Extract keywords for medicine/product search with natural language
  const { keywords, brand, category, ageGroup } = extractMedicineKeywords(userMessage);
  
  // Check if user is asking about a specific medicine/product
  if (keywords.length > 0) {
    try {
      const products = await searchProductsWithFilters(keywords, { brand, category, ageGroup });
      if (products.length > 0) {
        return formatProductResponse(products, userMessage);
      }
    } catch (error) {
      console.error('Error searching products:', error);
    }
  }
  
  // 5. Handle natural language queries (vague keywords)
  if (lowerMessage.includes('thuốc cảm thông thường') || lowerMessage.includes('thuốc cảm')) {
    const products = await searchProductsWithFilters(['cảm', 'paracetamol', 'decolgen']);
    if (products.length > 0) {
      return formatProductResponse(products, userMessage);
    }
  }
  
  if (lowerMessage.includes('thuốc trị') || lowerMessage.includes('thuốc chữa')) {
    const { keywords: treatmentKeywords } = extractMedicineKeywords(userMessage);
    if (treatmentKeywords.length > 0) {
      const products = await searchProductsWithFilters(treatmentKeywords);
      if (products.length > 0) {
        return formatProductResponse(products, userMessage);
      }
    }
  }
  
  // 6. Handle common questions
  if ((lowerMessage.includes('giá') || lowerMessage.includes('bao nhiêu')) && 
      !lowerMessage.includes('giá') || !lowerMessage.includes('bao nhiêu tiền')) {
    // Already handled above in section 3
  }
  
  if (lowerMessage.includes('còn hàng') || lowerMessage.includes('có hàng')) {
    // Already handled above in section 3
  }
  
  if (lowerMessage.includes('cách dùng') || lowerMessage.includes('liều lượng')) {
    return "Thông tin về cách dùng và liều lượng thuốc cần được tư vấn bởi dược sĩ. Vui lòng liên hệ với chúng tôi để được tư vấn chi tiết. ⚠️ Lưu ý: Tôi chỉ cung cấp thông tin tham khảo, không thay thế chỉ định của bác sĩ.";
  }
  
  if (lowerMessage.includes('đơn hàng') || lowerMessage.includes('theo dõi')) {
    return "Bạn có thể theo dõi đơn hàng của mình trong phần 'Theo dõi đơn hàng' trên website hoặc liên hệ hotline để được hỗ trợ.";
  }
  
  if (lowerMessage.includes('giao hàng') || lowerMessage.includes('ship')) {
    return "Chúng tôi cung cấp dịch vụ giao hàng tận nơi. Vui lòng cho tôi biết địa chỉ giao hàng để tôi có thể tư vấn phí ship phù hợp.";
  }
  
  if (lowerMessage.includes('giảm giá') || lowerMessage.includes('khuyến mãi') || lowerMessage.includes('deal')) {
    return "Bạn có thể xem các sản phẩm đang giảm giá trong phần 'Săn Deal' trên trang chủ. Chúng tôi thường xuyên có các chương trình khuyến mãi hấp dẫn!";
  }
  
  if (lowerMessage.includes('tư vấn') || lowerMessage.includes('hỏi')) {
    return "Tôi sẵn sàng tư vấn cho bạn! Bạn có thể hỏi tôi về:\n- Thông tin sản phẩm và giá cả\n- Tình trạng tồn kho\n- Công dụng và cách sử dụng\n- Gợi ý thuốc theo triệu chứng\n- Lịch sử mua hàng và gợi ý\n- Chương trình khuyến mãi\n- Theo dõi đơn hàng\n\nBạn muốn biết thông tin gì?";
  }
  
  // Default response
  return `Cảm ơn bạn đã liên hệ với Nhà Thuốc Thông Minh! Tôi có thể giúp bạn:
  
- 🔍 Tìm kiếm thông tin về thuốc và sản phẩm
- 💊 Tư vấn thông tin thuốc (công dụng, thành phần, chống chỉ định, tương tác)
- 🤒 Gợi ý thuốc theo triệu chứng nhẹ
- 📦 Kiểm tra giá và tình trạng tồn kho
- 📋 Gợi ý thuốc dựa trên lịch sử mua hàng
- 🎁 Thông tin về chương trình khuyến mãi
- 📦 Hỗ trợ theo dõi đơn hàng

Bạn có thể hỏi tôi bất kỳ câu hỏi nào về sản phẩm hoặc dịch vụ của chúng tôi. Ví dụ: 
- "Tôi bị cảm cúm, có thuốc nào không?"
- "Cho tôi thuốc đau họng dành cho trẻ em"
- "Tìm tất cả thuốc dạ dày của Sanofi"
- "Công dụng của Paracetamol là gì?"`;
}

// Extract medicine/product keywords from user message with natural language support
function extractMedicineKeywords(message: string): { keywords: string[]; brand?: string; category?: string; ageGroup?: string } {
  const lowerMessage = message.toLowerCase();
  const keywords: string[] = [];
  let brand: string | undefined;
  let category: string | undefined;
  let ageGroup: string | undefined;
  
  // Extract brand name (e.g., "của Sanofi", "thuốc Sanofi", "Sanofi")
  const brandPatterns = [
    /(?:của|thuốc|sản phẩm)\s+([A-ZÀ-Ỹ][a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+(?:\s+[A-ZÀ-Ỹ][a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+)*)/,
    /\b([A-ZÀ-Ỹ][a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+(?:\s+[A-ZÀ-Ỹ][a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+)*)\b/,
  ];
  
  // Known brands list (can be expanded)
  const knownBrands = ['sanofi', 'traphaco', 'domepharm', 'pharmedic', 'dược phẩm', 'pharma', 'glaxosmithkline', 'gsk', 'pfizer', 'novartis'];
  
  for (const pattern of brandPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      const potentialBrand = match[1].trim();
      // Check if it's a known brand or contains brand keywords
      if (knownBrands.some(b => potentialBrand.toLowerCase().includes(b.toLowerCase())) ||
          potentialBrand.length > 2 && /^[A-ZÀ-Ỹ]/.test(potentialBrand)) {
        brand = potentialBrand;
        break;
      }
    }
  }
  
  // Also check if message explicitly mentions brand
  for (const knownBrand of knownBrands) {
    if (lowerMessage.includes(knownBrand)) {
      // Try to extract the full brand name
      const brandMatch = message.match(new RegExp(`(${knownBrand}[^\\s]*|\\w+\\s+${knownBrand})`, 'i'));
      if (brandMatch) {
        brand = brandMatch[1];
        break;
      }
    }
  }
  
  // Extract age group (e.g., "trẻ em", "em bé", "bé", "người lớn")
  if (lowerMessage.includes('trẻ em') || lowerMessage.includes('em bé') || lowerMessage.includes('bé') || lowerMessage.includes('trẻ')) {
    ageGroup = 'trẻ em';
  } else if (lowerMessage.includes('người lớn') || lowerMessage.includes('người trưởng thành')) {
    ageGroup = 'người lớn';
  }
  
  // Extract category/condition keywords
  const categoryKeywords: { [key: string]: string } = {
    'đau họng': 'đau họng',
    'ho': 'ho',
    'cảm': 'cảm',
    'sốt': 'sốt',
    'đau đầu': 'đau đầu',
    'dạ dày': 'dạ dày',
    'tiêu hóa': 'tiêu hóa',
    'dị ứng': 'dị ứng',
    'viêm': 'viêm',
    'kháng sinh': 'kháng sinh',
    'vitamin': 'vitamin',
    'bổ sung': 'bổ sung',
  };
  
  for (const [key, value] of Object.entries(categoryKeywords)) {
    if (lowerMessage.includes(key)) {
      category = value;
      keywords.push(value);
      break;
    }
  }
  
  // Extract medicine name patterns
  const medicinePatterns = [
    /(?:tìm|mua|giá|thông tin|về|cho|thuốc)\s+([a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+(?:\s+[a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+)*)/i,
  ];
  
  for (const pattern of medicinePatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      const medicineName = match[1].trim();
      // Remove common words
      const cleaned = medicineName
        .replace(/\b(cho|dành cho|của|thuốc|sản phẩm)\b/gi, '')
        .trim();
      if (cleaned.length > 2) {
        keywords.push(cleaned);
      }
    }
  }
  
  // If no specific medicine found, use significant words
  if (keywords.length === 0) {
    const words = lowerMessage.split(/\s+/);
    const stopWords = ['tôi', 'muốn', 'cần', 'có', 'là', 'của', 'về', 'cho', 'với', 'và', 'hoặc', 'thuốc', 'sản phẩm', 'dành'];
    const filteredWords = words.filter(word => !stopWords.includes(word) && word.length > 2);
    
    filteredWords.forEach(word => {
      if (word.length > 3) {
        keywords.push(word);
      }
    });
  }
  
  return { keywords, brand, category, ageGroup };
}

// Search products in database with filters
async function searchProductsWithFilters(
  keywords: string[], 
  filters?: { brand?: string; category?: string; ageGroup?: string }
): Promise<any[]> {
  try {
    const db = mongoose.connection.db;
    if (!db) return [];
    
    const productsCollection = db.collection('products');
    const medicinesCollection = db.collection('medicines');
    
    // Build search query
    const searchConditions: any[] = [];
    
    // Keyword search
    if (keywords.length > 0) {
      searchConditions.push({
        $or: keywords.map(keyword => ({
          $or: [
            { name: { $regex: keyword, $options: 'i' } },
            { description: { $regex: keyword, $options: 'i' } },
            { brand: { $regex: keyword, $options: 'i' } },
          ]
        }))
      });
    }
    
    // Brand filter
    if (filters?.brand) {
      searchConditions.push({
        brand: { $regex: filters.brand, $options: 'i' }
      });
    }
    
    // Category/condition filter
    if (filters?.category) {
      searchConditions.push({
        $or: [
          { name: { $regex: filters.category, $options: 'i' } },
          { description: { $regex: filters.category, $options: 'i' } },
        ]
      });
    }
    
    // Age group filter (for children's medicines)
    if (filters?.ageGroup === 'trẻ em') {
      searchConditions.push({
        $or: [
          { name: { $regex: /trẻ em|trẻ|em bé|bé|pediatric|pediatric|children/i } },
          { description: { $regex: /trẻ em|trẻ|em bé|bé|pediatric|pediatric|children/i } },
        ]
      });
    }
    
    // Build final query
    const query: any = {
      inStock: true,
      stockQuantity: { $gt: 0 }
    };
    
    if (searchConditions.length > 0) {
      query.$and = searchConditions;
    }
    
    // Search in products collection
    let products = await productsCollection.find(query)
      .limit(10)
      .toArray();
    
    // If no products found, search in medicines collection
    if (products.length === 0) {
      const medicines = await medicinesCollection.find({
        $and: searchConditions.length > 0 ? searchConditions : [{}]
      })
      .limit(10)
      .toArray();
      
      // Convert medicines to product-like format
      products = medicines.map(med => ({
        name: med.name,
        price: med.price || 0,
        description: med.description || med.indication || '',
        brand: med.brand || '',
        inStock: true,
        stockQuantity: med.stockQuantity || 0,
        unit: med.unit || 'đơn vị',
        imageUrl: med.imageUrl || ''
      }));
    }
    
    return products;
  } catch (error) {
    console.error('Error searching products:', error);
    return [];
  }
}

// Legacy function for backward compatibility
async function searchProducts(keywords: string[]): Promise<any[]> {
  return searchProductsWithFilters(keywords);
}

// Format product search results as response
function formatProductResponse(products: any[], userMessage: string): string {
  if (products.length === 0) {
    return "Xin lỗi, tôi không tìm thấy sản phẩm nào phù hợp với yêu cầu của bạn. Vui lòng thử lại với tên sản phẩm khác hoặc liên hệ với chúng tôi để được tư vấn.";
  }
  
  let response = `Tôi tìm thấy ${products.length} sản phẩm phù hợp:\n\n`;
  
  products.forEach((product, index) => {
    response += `${index + 1}. **${product.name}**\n`;
    if (product.brand) {
      response += `   Thương hiệu: ${product.brand}\n`;
    }
    if (product.price) {
      response += `   Giá: ${product.price.toLocaleString('vi-VN')}đ\n`;
    }
    if (product.description) {
      const shortDesc = product.description.length > 100 
        ? product.description.substring(0, 100) + '...' 
        : product.description;
      response += `   ${shortDesc}\n`;
    }
    if (product.stockQuantity !== undefined) {
      response += `   Tồn kho: ${product.stockQuantity} ${product.unit || 'sản phẩm'}\n`;
    }
    response += '\n';
  });
  
  response += "Bạn có muốn xem thêm thông tin chi tiết về sản phẩm nào không?";
  
  return response;
}

// Get additional medicine information from database
async function enrichMedicineInfo(medicine: any): Promise<any> {
  try {
    const db = mongoose.connection.db;
    if (!db) return medicine;
    
    const medicinesCollection = db.collection('medicines');
    
    // Extract base name (remove dosage info)
    const baseName = medicine.name.replace(/\d+\s*(mg|g|ml|%|viên|hộp)/gi, '').trim().split('_')[0].split(' ')[0];
    
    // Try to find in medicines collection for more details
    const medicineInfo = await medicinesCollection.findOne({
      $or: [
        { name: { $regex: `^${baseName}`, $options: 'i' } },
        { genericName: { $regex: `^${baseName}`, $options: 'i' } },
        { brand: { $regex: `^${baseName}`, $options: 'i' } },
        { name: { $regex: baseName, $options: 'i' } }
      ]
    });
    
    if (medicineInfo) {
      return {
        ...medicine,
        indication: medicineInfo.indication || medicine.indication || medicine.description || '',
        contraindication: medicineInfo.contraindication || medicine.contraindication || '',
        strength: medicineInfo.strength || medicine.strength || extractStrengthFromName(medicine.name),
        unit: medicineInfo.unit || medicine.unit || 'đơn vị'
      };
    }
    
    // Extract strength from name if not found
    if (!medicine.strength) {
      medicine.strength = extractStrengthFromName(medicine.name);
    }
    
    return medicine;
  } catch (error) {
    console.error('Error enriching medicine info:', error);
    return medicine;
  }
}

// Extract strength/dosage from medicine name
function extractStrengthFromName(name: string): string {
  const strengthMatch = name.match(/(\d+(?:\.\d+)?\s*(?:mg|g|ml|%|mcg|iu|ui)(?:\s*[+\/]\s*\d+(?:\.\d+)?\s*(?:mg|g|ml|%|mcg|iu|ui)?)?)/i);
  return strengthMatch ? strengthMatch[1] : '';
}

// Format symptom-based medicine suggestions (improved with specific medicine names)
async function formatSymptomBasedResponse(medicines: any[], symptoms: string[]): Promise<string> {
  if (medicines.length === 0) {
    return "Tôi không tìm thấy thuốc phù hợp với triệu chứng của bạn. Vui lòng liên hệ dược sĩ để được tư vấn chi tiết.";
  }
  
  let response = `💊 **Dựa trên triệu chứng của bạn, tôi gợi ý các thuốc sau:**\n\n`;
  response += "⚠️ Lưu ý: Đây chỉ là gợi ý tham khảo. Vui lòng tham khảo ý kiến dược sĩ trước khi sử dụng.\n\n";
  
  // Enrich medicine information
  const enrichedMedicines = await Promise.all(
    medicines.slice(0, 8).map(med => enrichMedicineInfo(med))
  );
  
  enrichedMedicines.forEach((medicine, index) => {
    response += `${index + 1}. **${medicine.name}**\n`;
    
    // Giá
    if (medicine.price) {
      response += `   💰 Giá: ${medicine.price.toLocaleString('vi-VN')}đ\n`;
    }
    
    // Hàm lượng
    if (medicine.strength) {
      response += `   💊 Hàm lượng: ${medicine.strength}\n`;
    } else {
      // Try to extract from name
      const strength = extractStrengthFromName(medicine.name);
      if (strength) {
        response += `   💊 Hàm lượng: ${strength}\n`;
      }
    }
    
    // Đơn vị
    if (medicine.unit) {
      response += `   📦 Đơn vị: ${medicine.unit}\n`;
    }
    
    // Công dụng / Chỉ định
    if (medicine.indication) {
      const shortIndication = medicine.indication.length > 150 
        ? medicine.indication.substring(0, 150) + '...' 
        : medicine.indication;
      response += `   📋 Công dụng: ${shortIndication}\n`;
    } else if (medicine.description) {
      const shortDesc = medicine.description.length > 150 
        ? medicine.description.substring(0, 150) + '...' 
        : medicine.description;
      response += `   📋 Công dụng: ${shortDesc}\n`;
    }
    
    // Chỉ định (nếu có thông tin chi tiết hơn)
    if (medicine.indication && medicine.indication !== medicine.description) {
      // Already shown above
    }
    
    // Dị ứng thuốc / Chống chỉ định
    if (medicine.contraindication) {
      const shortContra = medicine.contraindication.length > 100 
        ? medicine.contraindication.substring(0, 100) + '...' 
        : medicine.contraindication;
      response += `   ⚠️ Chống chỉ định: ${shortContra}\n`;
    }
    
    response += '\n';
  });
  
  response += "Bạn có muốn biết thêm thông tin chi tiết về thuốc nào không? Hoặc tôi có thể tìm thêm các thuốc khác.";
  
  return response;
}

// Format detailed medicine information
function formatMedicineDetails(medicine: any, query: string): string {
  // For usage queries, use generic name instead of specific product name
  const displayName = query.includes('công dụng') || query.includes('dùng để') ? 
    (medicine.name.split('_')[0] || medicine.name.split(' ')[0] || medicine.name) : 
    medicine.name;
  
  let response = `📋 **Thông tin chi tiết về ${displayName}:**\n\n`;
  
  if (medicine.brand && !query.includes('công dụng') && !query.includes('dùng để')) {
    response += `🏷️ **Thương hiệu:** ${medicine.brand}\n\n`;
  }
  
  if (query.includes('công dụng') || query.includes('dùng để làm gì') || 
      query.includes('dùng để trị') || query.includes('trị bệnh gì') ||
      query.includes('có tác dụng gì') || query.includes('dùng vào mục đích gì') ||
      query.includes('chữa bệnh gì') || query.includes('trị những bệnh nào')) {
    if (medicine.indication) {
      response += `💊 **Công dụng:**\n${medicine.indication}\n\n`;
    } else if (medicine.description) {
      response += `💊 **Công dụng:**\n${medicine.description}\n\n`;
    } else {
      response += `💊 **Công dụng:** Thông tin đang được cập nhật. Vui lòng liên hệ dược sĩ để được tư vấn chi tiết.\n\n`;
    }
  }
  
  if (query.includes('thành phần')) {
    // Try to extract from description or use generic response
    response += `🧪 **Thành phần:** Thông tin chi tiết về thành phần vui lòng xem trên bao bì sản phẩm hoặc liên hệ dược sĩ.\n\n`;
  }
  
  if (query.includes('chống chỉ định')) {
    if (medicine.contraindication) {
      response += `⚠️ **Chống chỉ định:**\n${medicine.contraindication}\n\n`;
    } else {
      response += `⚠️ **Chống chỉ định:** Thông tin đang được cập nhật. Vui lòng tham khảo ý kiến bác sĩ/dược sĩ.\n\n`;
    }
  }
  
  if (query.includes('tương tác')) {
    if (medicine.interaction) {
      response += `🔗 **Tương tác thuốc:**\n${medicine.interaction}\n\n`;
    } else {
      response += `🔗 **Tương tác thuốc:** Vui lòng thông báo cho bác sĩ/dược sĩ về tất cả các thuốc bạn đang sử dụng để tránh tương tác.\n\n`;
    }
  }
  
  if (query.includes('tác dụng phụ')) {
    if (medicine.sideEffect) {
      response += `⚠️ **Tác dụng phụ:**\n${medicine.sideEffect}\n\n`;
    } else {
      response += `⚠️ **Tác dụng phụ:** Vui lòng đọc kỹ hướng dẫn sử dụng và tham khảo ý kiến bác sĩ nếu có bất kỳ phản ứng bất thường nào.\n\n`;
    }
  }
  
  // Only show price and stock for non-usage queries
  if (!query.includes('công dụng') && !query.includes('dùng để') && 
      !query.includes('tác dụng') && !query.includes('trị bệnh') &&
      !query.includes('chữa bệnh')) {
    if (medicine.price && medicine.price > 0) {
      response += `💰 **Giá:** ${medicine.price.toLocaleString('vi-VN')}đ\n`;
    }
    
    if (medicine.stockQuantity !== undefined) {
      response += `📦 **Tồn kho:** ${medicine.stockQuantity} ${medicine.unit || 'sản phẩm'}\n`;
    }
  }
  
  response += `\n⚠️ **Lưu ý quan trọng:** Thông tin trên chỉ mang tính chất tham khảo. Liều dùng cụ thể cần được tư vấn bởi bác sĩ/dược sĩ. Không tự ý thay đổi liều lượng hoặc ngừng thuốc mà không có chỉ định.`;
  
  return response;
}

// Get recommended medicines based on purchase history
async function getRecommendedMedicines(purchaseHistory: any[]): Promise<any[]> {
  try {
    const recommendedNames = new Set<string>();
    
    // Get recommendations for each purchased medicine
    for (const item of purchaseHistory) {
      const productName = item.productName;
      
      // Check if we have recommendations for this medicine
      for (const [medicine, recommendations] of Object.entries(medicineRecommendations)) {
        if (productName.toLowerCase().includes(medicine.toLowerCase()) || 
            medicine.toLowerCase().includes(productName.toLowerCase())) {
          recommendations.forEach(rec => recommendedNames.add(rec));
        }
      }
    }
    
    if (recommendedNames.size === 0) return [];
    
    // Search for recommended medicines in database
    const db = mongoose.connection.db;
    if (!db) return [];
    
    const productsCollection = db.collection('products');
    const medicinesCollection = db.collection('medicines');
    
    const recommendationArray = Array.from(recommendedNames);
    const searchQueries = recommendationArray.map(name => ({
      $or: [
        { name: { $regex: name, $options: 'i' } },
        { brand: { $regex: name, $options: 'i' } },
        { description: { $regex: name, $options: 'i' } }
      ]
    }));
    
    let products = await productsCollection.find({
      $or: searchQueries,
      inStock: true,
      stockQuantity: { $gt: 0 }
    })
    .limit(10)
    .toArray();
    
    // If not enough, search in medicines collection
    if (products.length < recommendationArray.length) {
      const medicines = await medicinesCollection.find({
        $or: searchQueries
      })
      .limit(10 - products.length)
      .toArray();
      
      const convertedMedicines = medicines.map(med => ({
        name: med.name,
        price: med.price || 0,
        description: med.description || med.indication || '',
        brand: med.brand || '',
        inStock: true,
        stockQuantity: med.stockQuantity || 0,
        unit: med.unit || 'đơn vị',
        imageUrl: med.imageUrl || ''
      }));
      
      products = [...products, ...convertedMedicines];
    }
    
    return products;
  } catch (error) {
    console.error('Error getting recommended medicines:', error);
    return [];
  }
}

// Format purchase history suggestions with recommendations
async function formatPurchaseHistorySuggestions(history: any[]): Promise<string> {
  // Group by product name and get most recent purchases
  const productMap = new Map();
  
  for (const item of history) {
    const key = item.productName;
    if (!productMap.has(key) || productMap.get(key).lastPurchased < item.lastPurchased) {
      productMap.set(key, item);
    }
  }
  
  const uniqueProducts = Array.from(productMap.values())
    .sort((a, b) => b.lastPurchased - a.lastPurchased)
    .slice(0, 5);
  
  if (uniqueProducts.length === 0) {
    return "Bạn chưa có lịch sử mua hàng. Hãy thử một số sản phẩm phổ biến của chúng tôi!";
  }
  
  let response = `📋 **Dựa trên lịch sử mua hàng của bạn:**\n\n`;
  
  uniqueProducts.forEach((item, index) => {
    const daysAgo = Math.floor((Date.now() - new Date(item.lastPurchased).getTime()) / (1000 * 60 * 60 * 24));
    response += `${index + 1}. **${item.productName}**\n`;
    if (item.brand) {
      response += `   Thương hiệu: ${item.brand}\n`;
    }
    response += `   Đã mua: ${daysAgo} ngày trước\n\n`;
  });
  
  // Get recommended medicines
  const recommendedMedicines = await getRecommendedMedicines(uniqueProducts);
  
  if (recommendedMedicines.length > 0) {
    response += `💡 **Gợi ý thuốc liên quan:**\n\n`;
    recommendedMedicines.slice(0, 5).forEach((med, index) => {
      response += `${index + 1}. **${med.name}**\n`;
      if (med.brand) {
        response += `   Thương hiệu: ${med.brand}\n`;
      }
      if (med.price) {
        response += `   Giá: ${med.price.toLocaleString('vi-VN')}đ\n`;
      }
      response += `\n`;
    });
  }
  
  response += "Bạn có muốn mua lại các sản phẩm này hoặc thử các gợi ý mới không?";
  
  return response;
}

// Analyze prescription image
async function analyzePrescriptionImage(imageBase64: string): Promise<string> {
  try {
    // Save base64 image to temp file
    const matches = imageBase64.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) {
      throw new Error('Invalid image format');
    }
    
    const mimeType = matches[1];
    const base64Data = matches[2];
    const extension = mimeType === 'jpeg' ? 'jpg' : mimeType;
    const timestamp = Date.now();
    const filename = `temp_prescription_${timestamp}.${extension}`;
    
    const tempDir = path.join(process.cwd(), 'uploads', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const imagePath = path.join(tempDir, filename);
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(imagePath, buffer);
    
    // Extract text from image using OCR
    console.log('📷 Extracting text from prescription image...');
    const prescriptionText = await extractTextFromImage(imagePath);
    
    // Clean up temp file
    try {
      fs.unlinkSync(imagePath);
    } catch (error) {
      console.error('Error deleting temp file:', error);
    }
    
    if (!prescriptionText || prescriptionText.trim().length === 0) {
      return "Xin lỗi, tôi không thể đọc được nội dung từ hình ảnh đơn thuốc. Vui lòng đảm bảo hình ảnh rõ ràng và thử lại.";
    }
    
    // Analyze prescription text to find medicines
    const analysisResult = await analyzePrescriptionText(prescriptionText);
    
    return formatPrescriptionAnalysis(analysisResult);
    
  } catch (error) {
    console.error('Error analyzing prescription image:', error);
    return "Xin lỗi, đã có lỗi xảy ra khi phân tích đơn thuốc. Vui lòng thử lại sau hoặc liên hệ với chúng tôi để được hỗ trợ.";
  }
}

// Analyze prescription text to find medicines
async function analyzePrescriptionText(prescriptionText: string): Promise<any> {
  const foundMedicines: any[] = [];
  const notFoundMedicines: any[] = [];
  
  const lines = prescriptionText.split('\n').map(line => line.trim()).filter(line => line);
  
  // Pattern to match medicine names (e.g., "1) MEDICINE", "1. MEDICINE")
  const medicinePattern = /\d+[\.\)]\s*((?:(?!\s*\d+[\.\)]).)+?)(?=\s*\d+[\.\)]|$)/g;
  
  for (const line of lines) {
    // Skip non-medicine lines
    if (line.includes('ĐƠN THUỐC') || 
        line.includes('Họ tên') || 
        line.includes('Tuổi') || 
        line.includes('Chẩn đoán') ||
        line.includes('Ngày')) {
      continue;
    }
    
    let match;
    medicinePattern.lastIndex = 0;
    
    while ((match = medicinePattern.exec(line)) !== null) {
      const medicineText = match[1].trim();
      
      if (medicineText && medicineText.length > 2 && /[a-zA-ZÀ-ỹ]/.test(medicineText)) {
        // Extract medicine name (remove usage instructions)
        let medicineNameOnly = medicineText;
        const usagePatterns = [
          /\s*-\s*(?:Sáng|Tối|Trưa|Chiều|Ngày)/i,
          /\s*SL:\s*\d+/i,
          /\s*Ghi\s+chú:/i,
          /\s*Uống:/i,
          /\s*Cách\s+dùng:/i,
          /\s*Hướng\s+dẫn:/i,
        ];
        
        for (const pattern of usagePatterns) {
          const usageMatch = medicineNameOnly.match(pattern);
          if (usageMatch && usageMatch.index !== undefined) {
            medicineNameOnly = medicineNameOnly.substring(0, usageMatch.index).trim();
            break;
          }
        }
        
        // Extract brand name from parentheses
        let brandNameFromParentheses: string | null = null;
        const parenthesesMatch = medicineNameOnly.match(/\(([^)]+)\)/);
        if (parenthesesMatch && parenthesesMatch[1]) {
          const contentInParentheses = parenthesesMatch[1].trim();
          const brandMatch = contentInParentheses.match(/^([A-Za-zÀ-ỹ]+(?:\s+[A-Za-zÀ-ỹ]+)?)/);
          if (brandMatch) {
            brandNameFromParentheses = brandMatch[1].trim();
          }
        }
        
        const withoutParentheses = medicineNameOnly.replace(/\([^)]+\)/g, '').trim();
        const primarySearchTerm = brandNameFromParentheses || withoutParentheses;
        
        // Try to find exact match
        let exactMatch = await findExactMatch(primarySearchTerm, medicineNameOnly);
        
        if (!exactMatch && brandNameFromParentheses && withoutParentheses) {
          exactMatch = await findExactMatch(withoutParentheses, medicineNameOnly);
        }
        
        if (exactMatch && exactMatch.product) {
          const product = exactMatch.product;
          foundMedicines.push({
            originalText: medicineNameOnly,
            product: {
              name: product.name || medicineNameOnly,
              price: product.price || 0,
              brand: product.brand || '',
              stockQuantity: product.stockQuantity || 0,
              unit: product.unit || 'đơn vị',
              imageUrl: product.imageUrl || ''
            }
          });
        } else {
          // Try to find similar medicines
          let similarMedicines = await findSimilarMedicines(primarySearchTerm, medicineNameOnly, 3);
          
          if (similarMedicines.length === 0 && brandNameFromParentheses && withoutParentheses) {
            similarMedicines = await findSimilarMedicines(withoutParentheses, medicineNameOnly, 3);
          }
          
          notFoundMedicines.push({
            originalText: medicineNameOnly,
            suggestions: similarMedicines.slice(0, 3).map(med => ({
              name: med.name,
              price: med.price || 0,
              brand: med.brand || ''
            }))
          });
        }
      }
    }
  }
  
  return {
    foundMedicines,
    notFoundMedicines,
    totalFound: foundMedicines.length,
    totalNotFound: notFoundMedicines.length
  };
}

// Format prescription analysis result
function formatPrescriptionAnalysis(analysis: any): string {
  let response = "📋 **Kết quả phân tích đơn thuốc:**\n\n";
  
  if (analysis.totalFound === 0 && analysis.totalNotFound === 0) {
    return "Tôi không tìm thấy thuốc nào trong đơn thuốc. Vui lòng đảm bảo hình ảnh rõ ràng và thử lại.";
  }
  
  if (analysis.totalFound > 0) {
    response += `✅ **Tìm thấy ${analysis.totalFound} thuốc:**\n\n`;
    
    analysis.foundMedicines.forEach((item: any, index: number) => {
      const product = item.product;
      response += `${index + 1}. **${product.name}**\n`;
      if (product.brand) {
        response += `   Thương hiệu: ${product.brand}\n`;
      }
      if (product.price) {
        response += `   Giá: ${product.price.toLocaleString('vi-VN')}đ\n`;
      }
      if (product.stockQuantity !== undefined) {
        response += `   Tồn kho: ${product.stockQuantity} ${product.unit || 'sản phẩm'}\n`;
      }
      response += `   Từ đơn: ${item.originalText}\n\n`;
    });
  }
  
  if (analysis.totalNotFound > 0) {
    response += `⚠️ **${analysis.totalNotFound} thuốc cần tư vấn thêm:**\n\n`;
    analysis.notFoundMedicines.forEach((item: any, index: number) => {
      response += `${index + 1}. ${item.originalText}\n`;
      if (item.suggestions && item.suggestions.length > 0) {
        response += `   Gợi ý: ${item.suggestions.map((s: any) => s.name).join(', ')}\n`;
      }
      response += `\n`;
    });
    response += `Vui lòng liên hệ với dược sĩ để được tư vấn về các thuốc này.\n`;
  }
  
  return response;
}

// Main chat controller
export const chatWithAI = async (req: Request, res: Response) => {
  try {
    const { message, image, conversationHistory = [] } = req.body;
    const userId = (req as any).user?.id;
    
    // Check if image is provided
    if (image && typeof image === 'string' && image.startsWith('data:image/')) {
      console.log('📷 Processing prescription image in chat...');
      const response = await analyzePrescriptionImage(image);
      
      return res.json({
        success: true,
        response: response,
        timestamp: new Date().toISOString(),
        type: 'prescription_analysis'
      });
    }
    
    // Handle text message
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Message or image is required',
      });
    }
    
    // Generate AI response
    const response = await generateAIResponse(
      message.trim(),
      conversationHistory,
      userId
    );
    
    res.json({
      success: true,
      response: response,
      timestamp: new Date().toISOString(),
      type: 'text'
    });
    
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

