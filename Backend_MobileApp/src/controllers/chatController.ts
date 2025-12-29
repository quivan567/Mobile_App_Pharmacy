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

// Check for safety warnings and handle difficult situations
function checkSafetyWarnings(message: string): string | null {
  const lowerMessage = normalizeText(message);

  // Critical symptoms - require immediate medical attention
  const criticalPatterns: { pattern: RegExp; warning: string }[] = [
    { pattern: /sốt\s*(cao|trên|>)\s*39/i, warning: safetyWarnings['sốt cao 40'] },
    { pattern: /(khó thở|thở dốc|ngạt thở|thở gấp)/i, warning: safetyWarnings['đau ngực tim'] },
    { pattern: /đau\s*ngực/i, warning: safetyWarnings['đau ngực'] },
    { pattern: /trẻ\s*(em|nhỏ|<|dưới)\s*[0-5]\s*(tháng|th)/i, warning: '⚠️ Trẻ dưới 6 tháng cần được khám bác sĩ ngay. Không tự ý dùng thuốc.' },
    { pattern: /mang\s*thai\s*(3|ba)\s*tháng\s*đầu/i, warning: '⚠️ Phụ nữ mang thai 3 tháng đầu cần khám bác sĩ trước khi dùng thuốc.' },
    { pattern: /(nôn\s*ra\s*máu|đi\s*ngoài\s*ra\s*máu|ho\s*ra\s*máu|phân\s*có\s*máu)/i, warning: '⚠️ Đây là triệu chứng nghiêm trọng. Bạn cần đi khám bác sĩ ngay lập tức hoặc đến cơ sở y tế gần nhất. Không tự ý điều trị tại nhà.' },
    { pattern: /(co giật|động kinh|hôn mê)/i, warning: '⚠️ Đây là tình trạng khẩn cấp. Bạn cần gọi cấp cứu 115 hoặc đến bệnh viện ngay lập tức.' },
    { pattern: /tiêu\s*chảy\s*(?:hơn|trên|>|quá)\s*2\s*ngày/i, warning: '⚠️ Tiêu chảy kéo dài hơn 2 ngày là dấu hiệu nghiêm trọng, đặc biệt với trẻ em. Bạn cần đi khám bác sĩ ngay. Không tự ý điều trị tại nhà.' },
    { pattern: /nôn\s*(?:nhiều|liên\s*tục|thường\s*xuyên)/i, warning: '⚠️ Nôn nhiều hoặc nôn liên tục là dấu hiệu nghiêm trọng, đặc biệt với trẻ em. Bạn cần đi khám bác sĩ ngay. Không tự ý điều trị tại nhà.' }
  ];

  for (const { pattern, warning } of criticalPatterns) {
    if (pattern.test(lowerMessage)) return warning;
  }

  // Check for prescription-only medicines requests
  const prescriptionMedicinePatterns = [
    /(kháng sinh|antibiotic|amoxicillin|azithromycin|cefuroxime|augmentin|metronidazole)/i,
    /(thuốc\s*kê\s*đơn|thuốc\s*theo\s*đơn|thuốc\s*phải\s*có\s*đơn)/i,
    /(corticoid|prednisolone|dexamethasone)/i
  ];
  
  for (const pattern of prescriptionMedicinePatterns) {
    if (pattern.test(lowerMessage)) {
      return '⚠️ Kháng sinh và một số thuốc khác là thuốc kê đơn, không được bán không cần đơn bác sĩ. Việc tự ý dùng thuốc kê đơn có thể gây nguy hiểm và kháng thuốc. Vui lòng đến bác sĩ để được kê đơn phù hợp.';
    }
  }

  // Check for diagnosis requests (AI should not diagnose)
  if (/(chẩn đoán|tôi\s*bị\s*bệnh\s*gì|bệnh\s*của\s*tôi\s*là|tôi\s*có\s*bị)/i.test(lowerMessage) && 
      !/(thuốc|tư vấn|gợi ý)/i.test(lowerMessage)) {
    return '⚠️ Tôi không thể chẩn đoán bệnh. Tôi chỉ có thể tư vấn về thuốc và triệu chứng nhẹ. Nếu bạn cần chẩn đoán, vui lòng đến bác sĩ để được khám và xét nghiệm.';
  }

  // Check existing safety warnings
  for (const [key, warning] of Object.entries(safetyWarnings)) {
    if (lowerMessage.includes(key)) {
      return warning;
    }
  }

  return null;
}

// ============================================
// PHÂN LOẠI INTENT VÀ EXTRACT TÊN SẢN PHẨM
// ============================================

/**
 * Phân loại intent của câu hỏi người dùng
 */
function classifyQuestionIntent(userMessage: string): {
  intent: 'medical_consultation' | 'stock_inquiry' | 'price_inquiry' | 'alternative_inquiry' | 'general';
  extractedProductName?: string;
} {
  const lowerMessage = normalizeText(userMessage);
  
  // Keywords cho câu hỏi về tồn kho
  const stockKeywords = [
    'còn lại', 'còn bao nhiêu', 'còn không', 'còn hàng', 'tồn kho', 
    'số lượng', 'có sẵn', 'còn không', 'còn lại bao nhiêu',
    'còn bao nhiêu chai', 'còn bao nhiêu viên', 'còn bao nhiêu hộp'
  ];
  
  // Keywords cho câu hỏi về giá
  const priceKeywords = [
    'giá', 'giá bao nhiêu', 'giá tiền', 'bao nhiêu tiền', 
    'giá bán', 'chi phí', 'phí', 'cost'
  ];
  
  // Keywords cho câu hỏi về thuốc thay thế
  const alternativeKeywords = [
    'thay thế', 'thay thế cho', 'thay cho', 'tương đương',
    'giống', 'tương tự', 'thay vì', 'thay được không',
    'có thuốc nào thay', 'thuốc nào thay', 'sản phẩm thay thế'
  ];
  
  // Keywords cho tư vấn y tế
  const medicalKeywords = [
    'tư vấn', 'tôi bị', 'bị', 'có thuốc', 'uống thuốc gì',
    'triệu chứng', 'đau', 'sốt', 'ho', 'cảm', 'cúm'
  ];
  
  // Kiểm tra câu hỏi về tồn kho
  const hasStockKeyword = stockKeywords.some(keyword => lowerMessage.includes(keyword));
  if (hasStockKeyword) {
    // Cố gắng extract tên sản phẩm
    const productName = extractProductNameFromMessage(userMessage);
    return { intent: 'stock_inquiry', extractedProductName: productName };
  }
  
  // Kiểm tra câu hỏi về giá
  const hasPriceKeyword = priceKeywords.some(keyword => lowerMessage.includes(keyword));
  if (hasPriceKeyword) {
    const productName = extractProductNameFromMessage(userMessage);
    return { intent: 'price_inquiry', extractedProductName: productName };
  }
  
  // Kiểm tra câu hỏi về thuốc thay thế
  const hasAlternativeKeyword = alternativeKeywords.some(keyword => lowerMessage.includes(keyword));
  if (hasAlternativeKeyword) {
    const productName = extractProductNameFromMessage(userMessage);
    return { intent: 'alternative_inquiry', extractedProductName: productName };
  }
  
  // Kiểm tra tư vấn y tế
  const hasMedicalKeyword = medicalKeywords.some(keyword => lowerMessage.includes(keyword));
  if (hasMedicalKeyword) {
    return { intent: 'medical_consultation' };
  }
  
  // Mặc định là general
  return { intent: 'general' };
}

/**
 * Extract tên sản phẩm từ câu hỏi
 * Cải thiện để xử lý các trường hợp như "ok biết rồi, muốn biết Siro Ích Nhi"
 */
function extractProductNameFromMessage(message: string): string | undefined {
  // Danh sách các từ/cụm từ cần loại bỏ (mở rộng)
  const removePatterns = [
    // Từ chào hỏi, xác nhận
    /^(ok|okay|được|biết rồi|hiểu rồi|tôi biết|tôi hiểu)[\s,]*/i,
    /(ok|okay|được|biết rồi|hiểu rồi)[\s,]*/gi,
    
    // Từ hỏi
    /cho tôi hỏi|hỏi|về|vậy|ạ|nhé|giúp|bạn|tôi|mình|thuốc/gi,
    
    // Từ về số lượng, giá
    /còn lại|còn bao nhiêu|còn không|còn hàng|tồn kho|số lượng|giá|giá bao nhiêu|bao nhiêu/gi,
    
    // Từ về thay thế
    /thay thế|thay cho|tương đương/gi,
    
    // Từ muốn, cần
    /muốn biết|muốn hỏi|muốn|tôi muốn|cần biết|cần hỏi/gi,
  ];
  
  let cleaned = message;
  
  // Loại bỏ các pattern
  for (const pattern of removePatterns) {
    cleaned = cleaned.replace(pattern, ' ');
  }
  
  // Loại bỏ nhiều khoảng trắng
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  // Loại bỏ các ký tự đặc biệt ở đầu/cuối
  cleaned = cleaned.replace(/^[?.,!\-:;,\s]+|[?.,!\-:;,\s]+$/g, '').trim();
  
  // Nếu còn lại ít hơn 100 ký tự và có ít nhất 2 ký tự, có thể là tên sản phẩm
  if (cleaned.length >= 2 && cleaned.length < 100) {
    // Kiểm tra xem có phải là tên sản phẩm hợp lệ không (có chữ cái)
    if (/[a-zA-ZÀ-ỹ]/.test(cleaned)) {
      return cleaned;
    }
  }
  
  // Nếu không extract được, thử các pattern khác
  const patterns = [
    // Pattern: "muốn biết [Tên sản phẩm]"
    /(?:muốn biết|muốn hỏi|muốn|tôi muốn|cần biết|cần hỏi)[\s,]+([A-ZÀ-ỹ][^?.,!]+?)(?:\s+còn|\s+giá|\s+thay|$)/i,
    
    // Pattern: "tên sản phẩm [Tên]"
    /(?:thuốc|sản phẩm)[\s,]+([A-ZÀ-ỹ][^?.,!]+?)(?:\s+còn|\s+giá|\s+thay|$)/i,
    
    // Pattern: tìm cụm từ có chữ cái viết hoa ở đầu (tên sản phẩm thường viết hoa chữ cái đầu)
    /([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][A-Za-zÀ-ỹ\s]{2,50})/,
    
    // Pattern: tìm sau từ "biết" hoặc "hỏi"
    /(?:biết|hỏi)[\s,]+([A-ZÀ-ỹ][^?.,!]+?)(?:\s+còn|\s+giá|\s+thay|$)/i,
  ];
  
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      let extracted = match[1].trim();
      // Loại bỏ các từ không cần thiết ở cuối
      extracted = extracted.replace(/\s+(còn|giá|thay|vậy|ạ|nhé|gì|nào)$/i, '').trim();
      
      if (extracted.length >= 2 && extracted.length < 100 && /[a-zA-ZÀ-ỹ]/.test(extracted)) {
        return extracted;
      }
    }
  }
  
  // Thử tìm cụm từ có vẻ là tên sản phẩm (có chữ cái viết hoa)
  const words = message.split(/\s+/);
  const productNameWords: string[] = [];
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    // Nếu từ bắt đầu bằng chữ cái viết hoa và không phải là từ khóa
    if (/^[A-ZÀ-ỹ]/.test(word) && 
        !/^(Tôi|Bạn|Mình|Cho|Hỏi|Về|Vậy|Còn|Bao|Nhiêu|Giá|Thay|Thế)$/i.test(word)) {
      productNameWords.push(word);
      // Tiếp tục lấy các từ sau nếu cũng viết hoa hoặc là từ thường (tên sản phẩm có thể có nhiều từ)
      let j = i + 1;
      while (j < words.length && 
             (/^[A-ZÀ-ỹ]/.test(words[j]) || 
              /^[a-zà-ỹ]/.test(words[j])) &&
             !/^(còn|giá|thay|vậy|ạ|nhé|gì|nào|bao|nhiêu)$/i.test(words[j])) {
        productNameWords.push(words[j]);
        j++;
      }
      break;
    }
  }
  
  if (productNameWords.length >= 2) {
    const extracted = productNameWords.join(' ').trim();
    if (extracted.length >= 2 && extracted.length < 100) {
      return extracted;
    }
  }
  
  return undefined;
}

// Extract medicine name from query
function extractMedicineNameFromQuery(query: string): string | null {
  // Keep original query for pattern matching (don't normalize yet)
  const originalQuery = query;
  const lowerQuery = normalizeText(query);
  
  // Pattern 1: Extract name before question words (còn bao nhiêu, còn hàng, giá bao nhiêu, etc.)
  // Example: "Siro Ích Nhi còn bao nhiêu?" -> "Siro Ích Nhi"
  const questionWords = ['còn bao nhiêu', 'còn hàng', 'còn không', 'giá bao nhiêu', 'giá', 'tồn kho', 
                         'công dụng', 'liều dùng', 'chống chỉ định', 'của', 'thuốc', 'sản phẩm'];
  for (const qWord of questionWords) {
    const index = lowerQuery.indexOf(qWord);
    if (index > 0) {
      const beforeQuestion = originalQuery.substring(0, index).trim();
      // Remove common prefixes
      const cleaned = beforeQuestion
        .replace(/^(thuốc|sản phẩm|cho|dành cho)\s+/i, '')
        .trim();
      if (cleaned.length > 2) {
        return cleaned;
      }
    }
  }
  
  // Pattern 2: Extract name after question words
  // Example: "Giá của Siro Ích Nhi" -> "Siro Ích Nhi"
  const patterns = [
    /(?:thuốc|sản phẩm)\s+([A-ZÀ-Ỹ][a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+(?:\s+[A-ZÀ-Ỹ][a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+)*)/,
    /(?:giá|tồn kho|còn hàng|công dụng|liều dùng|chống chỉ định)\s+(?:của|thuốc)?\s*([A-ZÀ-Ỹ][a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+(?:\s+[A-ZÀ-Ỹ][a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+)*)/,
    /([A-ZÀ-Ỹ][a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+(?:\s+[A-ZÀ-Ỹ][a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+)*)\s+(?:còn|giá|tồn kho)/,
  ];
  
  for (const pattern of patterns) {
    const match = originalQuery.match(pattern);
    if (match && match[1]) {
      const extracted = match[1].trim();
      // Remove common suffixes/prefixes
      const cleaned = extracted
        .replace(/\s+(còn|giá|tồn kho|công dụng|liều dùng|chống chỉ định).*$/i, '')
        .replace(/^(thuốc|sản phẩm|cho|dành cho)\s+/i, '')
        .trim();
      if (cleaned.length > 2) {
        return cleaned;
      }
    }
  }
  
  // Pattern 3: Extract capitalized words (medicine names usually start with capital)
  // Example: "Siro Ích Nhi còn bao nhiêu?" -> "Siro Ích Nhi"
  const capitalizedWords = originalQuery.match(/([A-ZÀ-Ỹ][a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+(?:\s+[A-ZÀ-Ỹ][a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+)*)/);
  if (capitalizedWords && capitalizedWords[0]) {
    const extracted = capitalizedWords[0].trim();
    // Skip if it's a common word or too short
    const commonWords = ['Tôi', 'Bạn', 'Còn', 'Giá', 'Tồn', 'Kho', 'Hàng', 'Bao', 'Nhiêu'];
    if (!commonWords.includes(extracted) && extracted.length > 3) {
      return extracted;
    }
  }
  
  return null;
}

// ============================================
// QUERY DATABASE CHO CÁC LOẠI CÂU HỎI
// ============================================

/**
 * Query database để lấy thông tin tồn kho của sản phẩm
 * Sử dụng nhiều cách tìm kiếm để tăng độ chính xác
 */
async function queryProductStock(productName: string): Promise<any | null> {
  try {
    const db = mongoose.connection.db;
    if (!db) return null;
    
    const productsCollection = db.collection('products');
    const medicinesCollection = db.collection('medicines');
    
    // Chuẩn hóa tên sản phẩm để tìm kiếm
    const normalizedName = productName.trim();
    const nameWords = normalizedName.split(/\s+/).filter(w => w.length > 1);
    
    // Tạo nhiều pattern tìm kiếm
    const searchPatterns: any[] = [
      // Tìm chính xác
      { name: { $regex: `^${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
      // Tìm chứa toàn bộ tên
      { name: { $regex: normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
      // Tìm chứa brand
      { brand: { $regex: normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
    ];
    
    // Nếu có nhiều từ, tìm các từ riêng lẻ
    if (nameWords.length > 1) {
      // Tìm sản phẩm chứa tất cả các từ
      searchPatterns.push({
        $and: nameWords.map(word => ({
          $or: [
            { name: { $regex: word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
            { brand: { $regex: word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
          ]
        }))
      });
      
      // Tìm sản phẩm chứa ít nhất 2 từ quan trọng (bỏ qua từ ngắn như "ho", "cho")
      const importantWords = nameWords.filter(w => w.length > 2);
      if (importantWords.length >= 2) {
        searchPatterns.push({
          $and: importantWords.slice(0, 2).map(word => ({
            $or: [
              { name: { $regex: word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
              { brand: { $regex: word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
            ]
          }))
        });
      }
    }
    
    // Tìm trong products collection
    let product = null;
    for (const pattern of searchPatterns) {
      product = await productsCollection.findOne({
        $or: Array.isArray(pattern.$or) ? pattern.$or : [pattern]
      });
      if (product) break;
    }
    
    // Nếu vẫn không tìm thấy, thử tìm với $and pattern
    if (!product && nameWords.length > 1) {
      product = await productsCollection.findOne({
        $and: nameWords.map(word => ({
          $or: [
            { name: { $regex: word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
            { brand: { $regex: word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
          ]
        }))
      });
    }
    
    if (product) {
      return {
        name: product.name,
        stockQuantity: product.stockQuantity || 0,
        unit: product.unit || 'sản phẩm',
        price: product.price || 0,
        inStock: product.inStock || false,
        source: 'products'
      };
    }
    
    // Nếu không tìm thấy trong products, tìm trong medicines collection
    let medicine = null;
    for (const pattern of searchPatterns) {
      medicine = await medicinesCollection.findOne({
        $or: Array.isArray(pattern.$or) ? pattern.$or : [pattern]
      });
      if (medicine) break;
    }
    
    // Nếu vẫn không tìm thấy, thử tìm với $and pattern
    if (!medicine && nameWords.length > 1) {
      medicine = await medicinesCollection.findOne({
        $and: nameWords.map(word => ({
          $or: [
            { name: { $regex: word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
            { brand: { $regex: word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
          ]
        }))
      });
    }
    
    if (medicine) {
      return {
        name: medicine.name,
        stockQuantity: medicine.stockQuantity || 0,
        unit: medicine.unit || 'sản phẩm',
        price: medicine.price || 0,
        inStock: (medicine.stockQuantity || 0) > 0,
        source: 'medicines'
      };
    }
    
    // Log để debug
    console.log(`[queryProductStock] Không tìm thấy sản phẩm với tên: "${productName}"`);
    
    // Thử tìm kiếm linh hoạt hơn: tìm sản phẩm có chứa tất cả các từ (không cần thứ tự)
    if (nameWords.length >= 2) {
      // Tạo query tìm sản phẩm có chứa tất cả các từ quan trọng
      const allWordsPattern = {
        $and: nameWords.map(word => ({
          $or: [
            { name: { $regex: word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
            { brand: { $regex: word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
          ]
        }))
      };
      
      // Tìm trong products
      const flexibleProduct = await productsCollection.findOne(allWordsPattern);
      if (flexibleProduct) {
        console.log(`[queryProductStock] Tìm thấy sản phẩm linh hoạt: "${flexibleProduct.name}"`);
        return {
          name: flexibleProduct.name,
          stockQuantity: flexibleProduct.stockQuantity || 0,
          unit: flexibleProduct.unit || 'sản phẩm',
          price: flexibleProduct.price || 0,
          inStock: flexibleProduct.inStock || false,
          source: 'products'
        };
      }
      
      // Tìm trong medicines
      const flexibleMedicine = await medicinesCollection.findOne(allWordsPattern);
      if (flexibleMedicine) {
        console.log(`[queryProductStock] Tìm thấy thuốc linh hoạt: "${flexibleMedicine.name}"`);
        return {
          name: flexibleMedicine.name,
          stockQuantity: flexibleMedicine.stockQuantity || 0,
          unit: flexibleMedicine.unit || 'sản phẩm',
          price: flexibleMedicine.price || 0,
          inStock: (flexibleMedicine.stockQuantity || 0) > 0,
          source: 'medicines'
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error querying product stock:', error);
    return null;
  }
}

/**
 * Query database để lấy thông tin giá của sản phẩm
 * Sử dụng logic tìm kiếm tương tự queryProductStock
 */
async function queryProductPrice(productName: string): Promise<any | null> {
  try {
    // Sử dụng lại logic từ queryProductStock
    const stockInfo = await queryProductStock(productName);
    if (!stockInfo) return null;
    
    const db = mongoose.connection.db;
    if (!db) return null;
    
    const productsCollection = db.collection('products');
    const medicinesCollection = db.collection('medicines');
    
    // Lấy thông tin đầy đủ về giá
    const product = await productsCollection.findOne({ name: stockInfo.name });
    if (product) {
      return {
        name: product.name,
        price: product.price || 0,
        originalPrice: product.originalPrice,
        discountPercentage: product.discountPercentage || 0,
        unit: product.unit || 'sản phẩm',
        inStock: product.inStock || false,
        source: 'products'
      };
    }
    
    const medicine = await medicinesCollection.findOne({ name: stockInfo.name });
    if (medicine) {
      return {
        name: medicine.name,
        price: medicine.price || 0,
        unit: medicine.unit || 'sản phẩm',
        inStock: (medicine.stockQuantity || 0) > 0,
        source: 'medicines'
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error querying product price:', error);
    return null;
  }
}

/**
 * Query database để tìm thuốc thay thế
 * Tìm các thuốc có cùng hoạt chất, cùng chỉ định, hoặc cùng nhóm điều trị
 */
async function queryAlternativeMedicines(productName: string, limit: number = 5): Promise<any[]> {
  try {
    const db = mongoose.connection.db;
    if (!db) return [];
    
    const productsCollection = db.collection('products');
    const medicinesCollection = db.collection('medicines');
    
    // Tìm sản phẩm gốc
    const originalProduct = await productsCollection.findOne({
      $or: [
        { name: { $regex: productName, $options: 'i' } },
        { brand: { $regex: productName, $options: 'i' } }
      ]
    }) || await medicinesCollection.findOne({
      $or: [
        { name: { $regex: productName, $options: 'i' } },
        { brand: { $regex: productName, $options: 'i' } }
      ]
    });
    
    if (!originalProduct) {
      return [];
    }
    
    // Lấy thông tin để tìm thuốc thay thế
    const originalName = (originalProduct.name || '').toLowerCase();
    const originalIndication = (originalProduct.indication || originalProduct.description || '').toLowerCase();
    const originalCategory = (originalProduct.categoryName || originalProduct.category || '').toLowerCase();
    
    // Tìm các thuốc tương tự:
    // 1. Cùng category/indication
    // 2. Có tên tương tự (nhưng không phải chính nó)
    // 3. Có trong kho
    
    const alternatives: any[] = [];
    
    // Tìm theo indication/description
    if (originalIndication) {
      const indicationKeywords = originalIndication.split(/\s+/).filter((w: string) => w.length > 3);
      if (indicationKeywords.length > 0) {
        const products = await productsCollection.find({
          $and: [
            {
              $or: [
                { indication: { $regex: indicationKeywords.join('|'), $options: 'i' } },
                { description: { $regex: indicationKeywords.join('|'), $options: 'i' } }
              ]
            },
            { name: { $not: { $regex: originalName, $options: 'i' } } },
            { inStock: true },
            { stockQuantity: { $gt: 0 } }
          ]
        })
        .limit(limit)
        .toArray();
        
        alternatives.push(...products);
      }
    }
    
    // Tìm theo category
    if (originalCategory) {
      const medicines = await medicinesCollection.find({
        $and: [
          { categoryName: { $regex: originalCategory, $options: 'i' } },
          { name: { $not: { $regex: originalName, $options: 'i' } } }
        ]
      })
      .limit(limit)
      .toArray();
      
      // Convert medicines to product format
      const convertedMedicines = medicines.map(med => ({
        _id: med._id,
        name: med.name,
        price: med.price || 0,
        description: med.description || med.indication || '',
        brand: med.brand || '',
        inStock: (med.stockQuantity || 0) > 0,
        stockQuantity: med.stockQuantity || 0,
        unit: med.unit || 'đơn vị',
        imageUrl: med.imageUrl || '',
        indication: med.indication || '',
        categoryName: med.categoryName || ''
      }));
      
      alternatives.push(...convertedMedicines);
    }
    
    // Loại bỏ trùng lặp
    const uniqueAlternatives = new Map<string, any>();
    for (const alt of alternatives) {
      const key = (alt.name || '').toLowerCase();
      if (!uniqueAlternatives.has(key) && key !== originalName) {
        uniqueAlternatives.set(key, alt);
      }
    }
    
    return Array.from(uniqueAlternatives.values()).slice(0, limit);
  } catch (error) {
    console.error('Error querying alternative medicines:', error);
    return [];
  }
}

// ============================================
// PARSE THÔNG TIN BỆNH NHÂN
// ============================================

// Parse patient info from a message or entire conversation history
function parsePatientInfo(message: string, conversationHistory?: ChatMessage[]) {
  // Combine current message with all previous user messages to check for already provided info
  let combinedText = normalizeText(message);
  if (conversationHistory && conversationHistory.length > 0) {
    const allUserMessages = conversationHistory
      .filter(m => m.role === 'user')
      .map(m => m.content)
      .join(' ');
    combinedText = normalizeText(allUserMessages + ' ' + message);
  }
  
  const lower = combinedText;
  const hasSymptom = ['cảm', 'cúm', 'sốt', 'ho', 'sổ mũi', 'nghẹt mũi', 'đau họng', 'nhức đầu', 'tiêu hóa', 'khó tiêu', 'đầy bụng', 'đau bụng']
    .some(sym => lower.includes(sym));

  // Extract age
  let age: number | null = null;
  let ageGroup: 'infant' | 'toddler' | 'child' | 'adolescent' | 'adult' | null = null;
  
  const ageMatch = lower.match(/(\d{1,3})\s*tuổi/i) || lower.match(/tôi\s+(\d{1,3})/i) || lower.match(/(\d{1,3})\s*yo/i);
  if (ageMatch) {
    age = parseInt(ageMatch[1]);
    if (age >= 0 && age < 1) ageGroup = 'infant';
    else if (age >= 1 && age < 6) ageGroup = 'toddler';
    else if (age >= 6 && age < 12) ageGroup = 'child';
    else if (age >= 12) ageGroup = 'adult'; // Từ 12 tuổi trở lên được coi là người lớn
  } else if (lower.includes('trẻ sơ sinh') || lower.includes('trẻ dưới 1 tuổi')) {
    ageGroup = 'infant';
  } else if (lower.includes('trẻ nhỏ') || lower.includes('trẻ em dưới 6')) {
    ageGroup = 'toddler';
  } else if (lower.includes('trẻ em') && !lower.includes('dưới')) {
    ageGroup = 'child';
  } else if (lower.includes('người lớn') || lower.includes('vị thành niên')) {
    ageGroup = 'adult';
  }

  const hasAge = age !== null || ageGroup !== null || /\d{1,2}\s*tuổi/.test(lower) || lower.includes('trẻ em') || lower.includes('người lớn');

  // Extract pregnancy/breastfeeding info
  const isPregnant = /(mang\s*thai|có\s*thai|bầu|đang\s*thai)/i.test(lower) && !/(không\s*mang\s*thai|không\s*có\s*thai|không\s*bầu)/i.test(lower);
  const isBreastfeeding = /(cho\s*con\s*bú|đang\s*cho\s*con\s*bú)/i.test(lower) && !/(không\s*cho\s*con\s*bú)/i.test(lower);
  const isMale = /(nam|đàn\s*ông|con\s*trai)/i.test(lower);
  const hasPregnancyInfo = isPregnant || isBreastfeeding || /(không\s*mang\s*thai|không\s*bầu|không\s*có\s*thai|không\s*cho\s*con\s*bú)/i.test(lower) || isMale;

  // Extract drug allergy info
  const hasDrugAllergy = /(dị\s*ứng|dị\s*thuốc|tiền\s*sử\s*dị\s*ứng)/i.test(lower) && !/(không\s*dị\s*ứng|không\s*dị\s*thuốc)/i.test(lower);
  const allergyDrugs: string[] = [];
  if (hasDrugAllergy) {
    // Try to extract drug names from allergy info
    const allergyMatch = lower.match(/dị\s*ứng\s*(?:với|thuốc)?\s*([^,.\n]+)/i);
    if (allergyMatch) {
      allergyDrugs.push(allergyMatch[1].trim());
    }
  }
  const hasDrugAllergyInfo = hasDrugAllergy || /(không\s*dị\s*ứng|không\s*dị\s*thuốc)/i.test(lower);

  // Extract chronic disease info
  const hasChronicDisease = /(bệnh\s*nền|có\s*bệnh)/i.test(lower) && !/(không\s*bệnh\s*nền|không\s*có\s*bệnh)/i.test(lower);
  const chronicDiseases: string[] = [];
  if (hasChronicDisease) {
    const diseases = ['gan', 'thận', 'tim', 'dạ dày', 'huyết áp', 'tiểu đường', 'đái tháo đường', 'cao huyết áp'];
    diseases.forEach(disease => {
      if (lower.includes(disease)) {
        chronicDiseases.push(disease);
      }
    });
  }
  const hasChronicInfo = hasChronicDisease || /(không\s*bệnh\s*nền|không\s*có\s*bệnh)/i.test(lower);

  return {
    hasSymptom,
    hasAge,
    age,
    ageGroup,
    hasPregnancyInfo,
    isPregnant,
    isBreastfeeding,
    isMale,
    hasDrugAllergyInfo,
    hasDrugAllergy,
    allergyDrugs,
    hasChronicInfo,
    hasChronicDisease,
    chronicDiseases
  };
}

function buildMissingInfoQuestions(info: ReturnType<typeof parsePatientInfo>): string | null {
  const missing: string[] = [];
  if (!info.hasAge) missing.push('Tuổi (người lớn/trẻ em)');
  if (!info.hasPregnancyInfo) missing.push('Có đang mang thai/cho con bú không?');
  if (!info.hasDrugAllergyInfo) missing.push('Có dị ứng thuốc không?');
  if (!info.hasChronicInfo) missing.push('Có bệnh nền (gan, thận, tim, dạ dày, huyết áp...) không?');

  if (missing.length === 0) return null;
  
  // Format với xuống dòng để dễ đọc
  let response = 'Để tư vấn an toàn, bạn vui lòng cho biết thêm:\n\n';
  missing.forEach((item, index) => {
    response += `${index + 1}. ${item}\n`;
  });
  response += '\nCảm ơn bạn!';
  
  return response;
}

/**
 * Filter thuốc theo thông tin bệnh nhân (độ tuổi, mang thai, bệnh nền, dị ứng)
 */
function filterMedicinesByPatientInfo(medicines: any[], patientInfo: ReturnType<typeof parsePatientInfo>): any[] {
  if (!medicines || medicines.length === 0) return medicines;
  
  return medicines.filter(med => {
    const medName = (med.name || '').toLowerCase();
    const medIndication = (med.indication || med.description || '').toLowerCase();
    
    // 1. Filter theo độ tuổi
    if (patientInfo.ageGroup) {
      // Trẻ sơ sinh (0-1 tuổi): chỉ men vi sinh dạng giọt
      if (patientInfo.ageGroup === 'infant') {
        if (!medName.includes('men vi sinh') && !medName.includes('probiotic') && !medIndication.includes('men vi sinh')) {
          return false; // Loại bỏ thuốc không phải men vi sinh cho trẻ sơ sinh
        }
        // Chỉ giữ men vi sinh dạng giọt
        if (!medName.includes('giọt') && !medName.includes('drop')) {
          return false;
        }
      }
      
      // Trẻ nhỏ (1-6 tuổi): tránh thuốc người lớn
      if (patientInfo.ageGroup === 'toddler') {
        // Loại bỏ thuốc có "người lớn" trong tên hoặc indication
        if (medName.includes('người lớn') || medIndication.includes('người lớn')) {
          return false;
        }
      }
      
      // Người lớn (12+): loại bỏ thuốc trẻ em
      if (patientInfo.ageGroup === 'adult' && patientInfo.age && patientInfo.age >= 12) {
        // Loại bỏ thuốc có "trẻ em" hoặc "trẻ nhỏ" trong tên (trừ khi là thuốc dùng chung)
        if ((medName.includes('trẻ em') || medName.includes('trẻ nhỏ') || medName.includes('kids') || medName.includes('pediatric')) &&
            !medIndication.includes('người lớn') && !medIndication.includes('cả trẻ em và người lớn')) {
          return false;
        }
      }
    }
    
    // 2. Filter theo mang thai/cho con bú
    if (patientInfo.isPregnant || patientInfo.isBreastfeeding) {
      // Loại bỏ thuốc có chống chỉ định cho phụ nữ mang thai
      const contraindicatedForPregnancy = ['ibuprofen', 'aspirin', 'nsaid', 'corticoid', 'prednisolone', 'dexamethasone'];
      if (contraindicatedForPregnancy.some(drug => medName.includes(drug) || medIndication.includes(drug))) {
        return false;
      }
    }
    
    // 3. Filter theo dị ứng thuốc
    if (patientInfo.hasDrugAllergy && patientInfo.allergyDrugs.length > 0) {
      for (const allergyDrug of patientInfo.allergyDrugs) {
        const allergyLower = allergyDrug.toLowerCase();
        // Loại bỏ thuốc dị ứng hoặc thuốc cùng nhóm
        if (medName.includes(allergyLower) || medIndication.includes(allergyLower)) {
          return false;
        }
        
        // Loại bỏ thuốc cùng nhóm (ví dụ: dị ứng Paracetamol thì tránh tất cả Paracetamol)
        const drugGroups: { [key: string]: string[] } = {
          'paracetamol': ['paracetamol', 'acetaminophen', 'panadol', 'efferalgan', 'hapacol'],
          'ibuprofen': ['ibuprofen', 'nsaid', 'diclofenac', 'meloxicam'],
          'aspirin': ['aspirin', 'acetylsalicylic'],
          'penicillin': ['penicillin', 'amoxicillin', 'ampicillin', 'augmentin'],
        };
        
        for (const [group, drugs] of Object.entries(drugGroups)) {
          if (drugs.some(d => allergyLower.includes(d) || d.includes(allergyLower))) {
            if (drugs.some(d => medName.includes(d) || medIndication.includes(d))) {
              return false;
            }
          }
        }
      }
    }
    
    // 4. Filter theo bệnh nền
    if (patientInfo.hasChronicDisease && patientInfo.chronicDiseases.length > 0) {
      for (const disease of patientInfo.chronicDiseases) {
        const diseaseLower = disease.toLowerCase();
        
        // Bệnh gan: tránh thuốc chuyển hóa qua gan
        if (diseaseLower.includes('gan')) {
          if (medIndication.includes('chuyển hóa qua gan') || medName.includes('paracetamol')) {
            // Paracetamol vẫn có thể dùng nhưng cần thận trọng - để AI quyết định
            // Chỉ loại bỏ nếu có chống chỉ định rõ ràng
          }
        }
        
        // Bệnh thận: tránh thuốc chuyển hóa qua thận
        if (diseaseLower.includes('thận')) {
          if (medIndication.includes('chống chỉ định suy thận') || medName.includes('ibuprofen')) {
            // Ibuprofen cần thận trọng với bệnh thận
          }
        }
        
        // Bệnh dạ dày: tránh thuốc kích ứng dạ dày
        if (diseaseLower.includes('dạ dày') || diseaseLower.includes('bao tử')) {
          if (medName.includes('ibuprofen') || medName.includes('aspirin') || medName.includes('nsaid') || 
              medIndication.includes('kích ứng dạ dày') || medIndication.includes('loét dạ dày')) {
            return false;
          }
        }
        
        // Bệnh tim/huyết áp: tránh thuốc ảnh hưởng tim mạch
        if (diseaseLower.includes('tim') || diseaseLower.includes('huyết áp')) {
          if (medIndication.includes('chống chỉ định bệnh tim') || medIndication.includes('tăng huyết áp')) {
            return false;
          }
        }
      }
    }
    
    return true;
  });
}

// Detect if current message is a follow-up answer to previous questions
function isFollowUpAnswer(message: string, conversationHistory: ChatMessage[]): boolean {
  const lower = normalizeText(message);
  const indicators = [
    /\b\d{1,2}\s*tuổi\b/,  // "22 tuổi", "30 tuổi"
    /\d{1,2}\s*yo\b/i,      // "22 yo"
    /không\s*dị\s*ứng/,     // "không dị ứng"
    /không\s*dị\s*thuốc/,   // "không dị thuốc"
    /không\s*bệnh\s*nền/,   // "không bệnh nền"
    /không\s*có\s*bệnh/,    // "không có bệnh"
    /mang\s*thai|cho\s*con\s*bú/,  // "mang thai", "cho con bú"
    /không\s*mang\s*thai/,  // "không mang thai"
    /người\s*lớn/,          // "người lớn"
    /trẻ\s*em/              // "trẻ em"
  ];
  const isAnswer = indicators.some(p => p.test(lower));
  if (!isAnswer) return false;

  // Check if last assistant message asked for info (has question mark or asks for info)
  const lastBot = [...conversationHistory].reverse().find(m => m.role === 'assistant');
  if (!lastBot) return false;
  
  const lastBotLower = normalizeText(lastBot.content);
  const isAskingForInfo = 
    lastBot.content.includes('?') ||
    lastBotLower.includes('vui lòng cho biết') ||
    lastBotLower.includes('cần bổ sung') ||
    lastBotLower.includes('bạn vui lòng') ||
    lastBotLower.includes('cho biết thêm');
  
  return isAskingForInfo;
}

// AI response function with hybrid approach: LLM + Rule-based
async function generateAIResponse(
  userMessage: string,
  conversationHistory: ChatMessage[],
  userId?: string
): Promise<string> {
  const lowerMessage = normalizeText(userMessage);

  // ============================================
  // KIỂM TRA NẾU LÀ MESSAGE ĐẦU TIÊN - HỎI THÔNG TIN CÁ NHÂN NGAY
  // ============================================
  // Nếu conversationHistory chỉ có 1 message (chào mừng) hoặc không có, đây là lần đầu tiên
  const isFirstMessage = conversationHistory.length <= 1 || 
    (conversationHistory.length === 1 && conversationHistory[0].role === 'assistant');
  
  // Parse thông tin từ message hiện tại và conversation history
  const patientInfo = parsePatientInfo(userMessage, conversationHistory);
  
  // Nếu là message đầu tiên và chưa có đủ thông tin cá nhân, hỏi ngay
  if (isFirstMessage) {
    const missingInfo = buildMissingInfoQuestions(patientInfo);
    if (missingInfo) {
      // Kiểm tra xem message có phải là chào hỏi không (không phải câu hỏi về thuốc)
      const isGreeting = /^(xin chào|chào|hi|hello|hey|tôi cần|tôi muốn|cho tôi|giúp tôi)/i.test(userMessage.trim());
      const hasMedicalQuery = /(tư vấn|thuốc|bị|đau|sốt|ho|cảm|cúm|tiêu hóa|khó tiêu|đầy bụng)/i.test(userMessage);
      
      // Nếu chỉ là chào hỏi hoặc chưa có câu hỏi y tế cụ thể, hỏi thông tin cá nhân ngay
      if (isGreeting || !hasMedicalQuery) {
        return `Xin chào! Tôi là trợ lý AI của Nhà Thuốc Thông Minh. Tôi có thể giúp bạn tìm thông tin về thuốc, tư vấn sức khỏe, và hỗ trợ mua sắm.\n\n${missingInfo}`;
      }
    }
  }

  // ============================================
  // PHÂN LOẠI INTENT CÂU HỎI
  // ============================================
  const { intent, extractedProductName } = classifyQuestionIntent(userMessage);
  
  // Xử lý các loại câu hỏi khác nhau
  if (intent === 'stock_inquiry') {
    // Câu hỏi về tồn kho
    // Nếu không extract được tên, thử extract lại từ message gốc
    let productName = extractedProductName;
    if (!productName) {
      // Thử extract lại với cách khác
      productName = extractProductNameFromMessage(userMessage);
    }
    
    // Nếu vẫn không extract được, thử tìm trong toàn bộ message
    if (!productName) {
      // Tìm các từ có chữ cái viết hoa (thường là tên sản phẩm)
      const words = userMessage.split(/\s+/);
      const potentialNames: string[] = [];
      
      for (let i = 0; i < words.length; i++) {
        const word = words[i].replace(/[?.,!\-:;,\s]/g, '');
        if (/^[A-ZÀ-ỹ]/.test(word) && word.length > 2) {
          // Lấy từ này và các từ tiếp theo (có thể là tên sản phẩm nhiều từ)
          let name = word;
          let j = i + 1;
          while (j < words.length && 
                 (words[j].match(/^[A-ZÀ-ỹ]/) || words[j].match(/^[a-zà-ỹ]/)) &&
                 !words[j].match(/^(còn|giá|thay|vậy|ạ|nhé|gì|nào|bao|nhiêu|biết|muốn|hỏi)$/i)) {
            name += ' ' + words[j].replace(/[?.,!\-:;,\s]/g, '');
            j++;
          }
          if (name.length >= 3 && name.length < 100) {
            potentialNames.push(name);
          }
        }
      }
      
      // Lấy tên dài nhất (thường là tên sản phẩm đầy đủ)
      if (potentialNames.length > 0) {
        productName = potentialNames.sort((a, b) => b.length - a.length)[0];
      }
    }
    
    if (!productName) {
      return `Để mình kiểm tra tồn kho, bạn vui lòng cho mình biết tên sản phẩm cụ thể nhé.\n\nVí dụ: "Siro ho Ích Nhi còn bao nhiêu?" hoặc "Siro Ích Nhi còn không?"`;
    }
    
    console.log(`[stock_inquiry] Đang tìm sản phẩm: "${productName}"`);
    const productInfo = await queryProductStock(productName);
    
    if (productInfo) {
      // Tạo prompt cho AI với thông tin tồn kho
      const aiService = await import('../services/aiService.js').catch(() => null);
      if (aiService) {
        const context: any = {
          queryType: 'stock_inquiry',
          productInfo: productInfo
        };
        const response = await aiService.generateAIResponseWithGemini({
          userMessage: userMessage,
          conversationHistory: conversationHistory,
          context: context
        });
        if (response) return response;
      }
      
      // Fallback: trả lời trực tiếp
      if (productInfo.inStock && productInfo.stockQuantity > 0) {
        return `Hiện tại nhà thuốc còn ${productInfo.stockQuantity} ${productInfo.unit} ${productInfo.name}.\n\nGiá bán: ${productInfo.price.toLocaleString('vi-VN')}đ/${productInfo.unit}\n\nBạn có muốn mình tư vấn thêm cách sử dụng hoặc sản phẩm thay thế không?`;
      } else {
        return `Hiện tại nhà thuốc đã hết ${productInfo.name}.\n\nMình có thể tìm sản phẩm thay thế phù hợp cho bạn. Bạn có muốn mình tư vấn không?`;
      }
    } else {
      // Thử tìm kiếm gần đúng hơn - tìm các sản phẩm có chứa một phần tên
      const nameWords = productName.split(/\s+/).filter(w => w.length > 2);
      if (nameWords.length > 0) {
        // Tìm sản phẩm có chứa ít nhất 1 từ quan trọng
        const db = mongoose.connection.db;
        if (db) {
          const productsCollection = db.collection('products');
          const medicinesCollection = db.collection('medicines');
          
          const similarProducts = await productsCollection.find({
            $or: nameWords.map(word => ({
              name: { $regex: word, $options: 'i' }
            }))
          }).limit(5).toArray();
          
          if (similarProducts.length > 0) {
            let response = `Mình không tìm thấy sản phẩm "${productName}" trong hệ thống.\n\n`;
            response += `Có thể bạn đang tìm một trong các sản phẩm sau:\n\n`;
            similarProducts.forEach((p, idx) => {
              response += `${idx + 1}. ${p.name}${p.stockQuantity ? ` (Còn ${p.stockQuantity} ${p.unit || 'sản phẩm'})` : ''}\n`;
            });
            response += `\nBạn có thể hỏi lại với tên chính xác hoặc liên hệ dược sĩ để được hỗ trợ.`;
            return response;
          }
        }
      }
      
      return `Xin lỗi, mình không tìm thấy thông tin về sản phẩm "${productName}" trong hệ thống.\n\nBạn có thể:\n- Kiểm tra lại tên sản phẩm\n- Liên hệ trực tiếp với dược sĩ tại quầy để được hỗ trợ tốt hơn`;
    }
  }
  
  if (intent === 'price_inquiry') {
    // Câu hỏi về giá
    let productName = extractedProductName;
    if (!productName) {
      productName = extractProductNameFromMessage(userMessage);
    }
    
    if (!productName) {
      return `Để mình kiểm tra giá, bạn vui lòng cho mình biết tên sản phẩm cụ thể nhé.`;
    }
    
    const productInfo = await queryProductPrice(productName);
    if (productInfo) {
      const aiService = await import('../services/aiService.js').catch(() => null);
      if (aiService) {
        const context: any = {
          queryType: 'price_inquiry',
          productInfo: productInfo
        };
        const response = await aiService.generateAIResponseWithGemini({
          userMessage: userMessage,
          conversationHistory: conversationHistory,
          context: context
        });
        if (response) return response;
      }
      
      // Fallback: trả lời trực tiếp
      let priceText = `Giá bán: ${productInfo.price.toLocaleString('vi-VN')}đ/${productInfo.unit}`;
      if (productInfo.originalPrice && productInfo.originalPrice > productInfo.price) {
        priceText += `\nGiá gốc: ${productInfo.originalPrice.toLocaleString('vi-VN')}đ`;
        if (productInfo.discountPercentage > 0) {
          priceText += `\nGiảm ${productInfo.discountPercentage}%`;
        }
      }
      if (!productInfo.inStock) {
        priceText += `\n\n⚠️ Hiện tại sản phẩm đã hết hàng.`;
      }
      return `${productInfo.name}:\n${priceText}`;
    } else {
      return `Xin lỗi, mình không tìm thấy thông tin giá của sản phẩm "${productName}" trong hệ thống.\n\nBạn có thể mô tả rõ hơn tên sản phẩm hoặc liên hệ trực tiếp với dược sĩ tại quầy.`;
    }
  }
  
  if (intent === 'alternative_inquiry') {
    // Câu hỏi về thuốc thay thế
    let productName = extractedProductName;
    if (!productName) {
      productName = extractProductNameFromMessage(userMessage);
    }
    
    if (!productName) {
      return `Để mình tìm thuốc thay thế, bạn vui lòng cho mình biết tên sản phẩm cụ thể nhé.`;
    }
    
    const alternatives = await queryAlternativeMedicines(productName, 5);
    if (alternatives.length > 0) {
      const aiService = await import('../services/aiService.js').catch(() => null);
      if (aiService) {
        const context: any = {
          queryType: 'alternative_inquiry',
          originalProductName: extractedProductName,
          alternatives: alternatives
        };
        const response = await aiService.generateAIResponseWithGemini({
          userMessage: userMessage,
          conversationHistory: conversationHistory,
          context: context
        });
        if (response) return response;
      }
      
      // Fallback: trả lời trực tiếp
      let response = `Nếu bạn đang tìm sản phẩm thay thế cho "${extractedProductName}", nhà thuốc hiện có các lựa chọn sau:\n\n`;
      alternatives.forEach((alt, idx) => {
        response += `${idx + 1}. **${alt.name}**\n`;
        if (alt.indication || alt.description) {
          response += `   - Tác dụng: ${(alt.indication || alt.description).substring(0, 100)}\n`;
        }
        if (alt.price) {
          response += `   - Giá: ${alt.price.toLocaleString('vi-VN')}đ/${alt.unit || 'sản phẩm'}\n`;
        }
        if (alt.stockQuantity) {
          response += `   - Tồn kho: ${alt.stockQuantity} ${alt.unit || 'sản phẩm'}\n`;
        }
        response += '\n';
      });
      response += `Tùy độ tuổi và tình trạng sức khỏe, mình có thể tư vấn kỹ hơn cho bạn nhé.`;
      return response;
    } else {
      return `Xin lỗi, mình không tìm thấy sản phẩm thay thế phù hợp cho "${productName}" trong kho hiện tại.\n\nBạn có thể liên hệ trực tiếp với dược sĩ tại quầy để được tư vấn cụ thể hơn.`;
    }
  }

  // Detect if this is a follow-up answer to previous safety questions
  const followUpAnswer = isFollowUpAnswer(userMessage, conversationHistory);
  const previousSymptomMessage = followUpAnswer
    ? [...conversationHistory].reverse().find(m =>
        m.role === 'user' &&
        /(cảm|cúm|sốt|ho|sổ mũi|nghẹt mũi|đau họng|nhức đầu|viêm|dị ứng|đau bụng|tiêu chảy)/i.test(m.content)
      )
    : null;

  // Use combined message to retain context when user is only providing follow-up info
  const combinedSymptomMessage = previousSymptomMessage
    ? `${previousSymptomMessage.content}\nThông tin bổ sung: ${userMessage}`
    : userMessage;
  const lowerCombinedMessage = normalizeText(combinedSymptomMessage);
  
  // Cache for products queried in AI context (to avoid duplicate queries in rule-based fallback)
  let cachedProduct: any = null;
  
  // Try to use AI LLM first (if configured)
  try {
    // Import AI service dynamically to avoid errors if not installed
    const aiService = await import('../services/aiService.js').catch(() => null);
    
    if (aiService) {
      // Get context for AI (medicines, user history, etc.)
      const context: any = {};
      
      // Add patient info to context
      context.patientInfo = patientInfo;
      context.isFollowUpAnswer = followUpAnswer;
      
      // Try to get relevant medicines for context
      const symptomKeywords = Object.keys(symptomToMedicines).filter(symptom => 
        lowerCombinedMessage.includes(symptom)
      );
      if (symptomKeywords.length > 0) {
        const suggestedMedicines = await semanticSearch(combinedSymptomMessage || userMessage);
        if (suggestedMedicines.length > 0) {
          // Filter medicines by patient info
          const filteredMedicines = filterMedicinesByPatientInfo(suggestedMedicines, patientInfo);
          context.medicines = filteredMedicines.slice(0, 5);
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
      
      // Add query type and instruction for AI
      if (intent === 'medical_consultation') {
        context.queryType = 'symptom_based';
        context.instruction = 'Tư vấn thuốc dựa trên triệu chứng, có xem xét thông tin bệnh nhân (tuổi, mang thai, dị ứng, bệnh nền)';
      }
      
      // Note: Stock and price inquiries are already handled above in intent classification
      
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
  } catch (error: any) {
    // Log error but don't spam console
    const errorMessage = error?.message || '';
    if (!errorMessage.includes('ECONNREFUSED') && !errorMessage.includes('fetch failed')) {
      console.log('AI service not available, using rule-based system:', errorMessage.substring(0, 100));
    }
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
      // Note: cachedProduct is set in AI context section above if AI service was called
      // If AI service failed or wasn't available, cachedProduct will be null and we query here
      let products: any[] = [];
      if (cachedProduct) {
        products = [cachedProduct];
        console.log('📦 Using cached product for stock inquiry (from AI context)');
      } else {
        products = await searchProductsWithFilters([medicineName]);
      }
      
      if (products.length > 0) {
        let response = `📦 **Tình trạng tồn kho:**\n\n`;
        products.slice(0, 3).forEach(product => {
          response += `- **${product.name}**\n`;
          if (product.stockQuantity !== undefined && product.stockQuantity > 0) {
            response += `  ✅ Còn hàng: ${product.stockQuantity} ${product.unit || 'sản phẩm'}\n`;
            if (product.price) {
              response += `  💰 Giá: ${product.price.toLocaleString('vi-VN')}đ/${product.unit || 'sản phẩm'}\n`;
            }
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
    
    // Keyword search - improved for Vietnamese text matching
    if (keywords.length > 0) {
      searchConditions.push({
        $or: keywords.map(keyword => {
          // Escape special regex characters
          const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          
          // Create multiple search patterns for better matching
          const patterns = [
            // Exact match (case-insensitive)
            { name: { $regex: `^${escapedKeyword}$`, $options: 'i' } },
            // Starts with keyword
            { name: { $regex: `^${escapedKeyword}`, $options: 'i' } },
            // Contains keyword
            { name: { $regex: escapedKeyword, $options: 'i' } },
            // Match in description
            { description: { $regex: escapedKeyword, $options: 'i' } },
            // Match in brand
            { brand: { $regex: escapedKeyword, $options: 'i' } },
          ];
          
          // For multi-word keywords, also try matching all words
          if (keyword.includes(' ')) {
            const words = keyword.split(/\s+/).filter(w => w.length > 2);
            if (words.length > 1) {
              // Match if all words are present (in any order)
              patterns.push({
                $and: words.map(word => ({
                  $or: [
                    { name: { $regex: word, $options: 'i' } },
                    { description: { $regex: word, $options: 'i' } },
                    { brand: { $regex: word, $options: 'i' } },
                  ]
                }))
              });
            }
          }
          
          return { $or: patterns };
        })
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
    
    // Build final query - first try with inStock filter
    let query: any = {};
    
    if (searchConditions.length > 0) {
      query.$and = searchConditions;
    }
    
    // First search: only in-stock products (for stock inquiry, we want to know current stock)
    const inStockQuery: any = {
      ...query,
      inStock: true,
      stockQuantity: { $gt: 0 }
    };
    
    // Search in products collection (in-stock first)
    let products = await productsCollection.find(inStockQuery)
      .limit(10)
      .toArray();
    
    // If no in-stock products found, search all products (including out-of-stock)
    // This allows us to tell user "hết hàng" instead of "không tìm thấy"
    if (products.length === 0 && searchConditions.length > 0) {
      console.log('No in-stock products found, searching all products...');
      products = await productsCollection.find(query)
        .limit(10)
        .toArray();
    }
    
    // If still no products found, search in medicines collection
    if (products.length === 0) {
      const medicinesQuery: any = searchConditions.length > 0 
        ? { $and: searchConditions } 
        : {};
      
      const medicines = await medicinesCollection.find(medicinesQuery)
        .limit(10)
        .toArray();
      
      // Convert medicines to product-like format
      products = medicines.map(med => ({
        name: med.name,
        price: med.price || 0,
        description: med.description || med.indication || '',
        brand: med.brand || '',
        inStock: (med.stockQuantity || 0) > 0,
        stockQuantity: med.stockQuantity || 0,
        unit: med.unit || 'đơn vị',
        imageUrl: med.imageUrl || ''
      }));
    }
    
    // Log search results for debugging
    if (products.length > 0) {
      console.log(`Found ${products.length} products for keywords:`, keywords);
      products.forEach((p, idx) => {
        console.log(`  ${idx + 1}. ${p.name} (stock: ${p.stockQuantity || 0}, inStock: ${p.inStock})`);
      });
    } else {
      console.log('No products found for keywords:', keywords);
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

