import { Request, Response } from 'express';
import { Prescription, User, Product, Order, OrderItem } from '../models/schema.js';
import { NotificationController } from './notificationController.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import { extractTextFromImage, extractPrescriptionInfo, processPrescriptionImage } from '../services/ocrService.js';
import {
  uploadToSupabase,
  STORAGE_BUCKETS,
} from '../services/supabaseService.js';
import {
  findExactMatch,
  findSimilarMedicines,
  parseMedicineName,
  normalizeDosageForComparison,
} from '../services/medicineMatchingService.js';
// Gemini API disabled for prescription analysis
// import { generatePrescriptionAdviceWithGemini } from '../services/geminiService.js';
import { StockService } from '../services/stockService.js';
import { medicineMetadataService } from '../services/medicineMetadataService.js';

// Helper function to upload prescription image to Supabase
async function uploadPrescriptionImageToSupabase(
  filePath: string,
  originalName: string
): Promise<string> {
  try {
    const supabaseResult = await uploadToSupabase(
      STORAGE_BUCKETS.PRESCRIPTIONS,
      filePath,
      `prescription-${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(originalName)}`,
      {
        contentType: 'image/jpeg',
      }
    );
    if (supabaseResult) {
      console.log('✅ Prescription image uploaded to Supabase:', supabaseResult.url);
      return supabaseResult.url;
    }
  } catch (supabaseError: any) {
    console.warn('⚠️ Supabase upload failed, using local path:', supabaseError.message);
  }
  return filePath; // Fallback to local path
}

// Helpers ported from web consultation controller for richer matching/explanations
function normalizeForComparison(name: string): string {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function getMatchExplanation(matchReason: string, confidence: number): string {
  const explanations: { [key: string]: string } = {
    same_name_same_dosage: 'Cùng tên và cùng hàm lượng với thuốc trong đơn',
    same_name_different_dosage: 'Cùng tên nhưng khác hàm lượng',
    same_active_ingredient_same_dosage: 'Cùng hoạt chất và cùng hàm lượng',
    same_active_ingredient_different_dosage: 'Cùng hoạt chất nhưng khác hàm lượng',
    same_group_therapeutic: 'Cùng nhóm điều trị',
    same_indication_same_dosage: 'Cùng công dụng và cùng hàm lượng',
    same_indication_different_dosage: 'Cùng công dụng nhưng khác hàm lượng',
    similar_name: 'Tên thuốc tương tự',
    from_medicines_collection: 'Được đề xuất từ cơ sở dữ liệu thuốc',
    similar: 'Thuốc tương tự',
  };
  return explanations[matchReason] || `Đề xuất dựa trên độ tương tự ${Math.round(confidence * 100)}%`;
}

function isMedicineAlreadyInPrescription(medicine: any, foundMedicines: any[]): boolean {
  if (!medicine || foundMedicines.length === 0) return false;

  const medicineName = medicine.name || medicine.productName || '';
  const medicineActiveIngredient = (medicine.activeIngredient || medicine.genericName || '').toLowerCase();
  const normalizedMedicineName = normalizeForComparison(medicineName);

  return foundMedicines.some((found) => {
    const foundName = found.originalText || found.productName || '';
    const normalizedFoundName = normalizeForComparison(foundName);

    if (normalizedMedicineName === normalizedFoundName) {
      return true;
    }

    if (medicineActiveIngredient && medicineActiveIngredient.length > 3) {
      const foundActiveIngredient = (found.activeIngredient || '').toLowerCase();
      if (foundActiveIngredient && foundActiveIngredient.length > 3) {
        const mainMedicineActive = medicineActiveIngredient.split(/[,;]/)[0]?.trim();
        const mainFoundActive = foundActiveIngredient.split(/[,;]/)[0]?.trim();
        if (mainMedicineActive && mainFoundActive && mainMedicineActive === mainFoundActive) {
          return true;
        }
      }
    }

    return false;
  });
}

// Helper function to normalize medicine values for comparison
function normalizeMedicineValue(value: string | null | undefined): string {
  if (!value) return '';
  return value.trim().toLowerCase();
}

// Helper function to check if two dosage forms are equivalent
async function isDosageFormEquivalent(form1: string, form2: string): Promise<boolean> {
  const normalized1 = normalizeMedicineValue(form1);
  const normalized2 = normalizeMedicineValue(form2);
  
  if (normalized1 === normalized2) return true;
  
  // Bỏ qua nếu một trong hai là rỗng - database có thể thiếu dữ liệu
  if (!normalized1 || normalized1 === '') return true;
  if (!normalized2 || normalized2 === '') return true;
  
  // Kiểm tra nếu một chuỗi chứa từ khóa chính của chuỗi kia
  const keyWords1 = normalized1.split(/\s+/).filter(w => w.length > 2);
  const keyWords2 = normalized2.split(/\s+/).filter(w => w.length > 2);
  
  for (const keyword of keyWords1) {
    if (normalized2.includes(keyword) && keyword.length > 2) {
      return true;
    }
  }
  for (const keyword of keyWords2) {
    if (normalized1.includes(keyword) && keyword.length > 2) {
      return true;
    }
  }
  
  // Ưu tiên: Sử dụng service để tìm từ database
  try {
    const result = await medicineMetadataService.areDosageFormsEquivalent(form1, form2);
    if (result) return true;
  } catch (error) {
    console.warn('⚠️ Error using medicineMetadataService for dosage form comparison, falling back to hardcode:', error);
  }
  
  // Fallback: Mapping các giá trị tương đương
  const equivalentForms: { [key: string]: string[] } = {
    'tablet': ['viên nén', 'tablet', 'viên', 'viên nén bao phim', 'tablet film-coated'],
    'capsule': ['nang', 'capsule', 'viên nang', 'viên con nhộng'],
    'gel': ['gel', 'kem gel', 'emulgel', 'gel bôi', 'gelboi'],
    'cream': ['cream', 'kem', 'kem bôi', 'kemboi'],
    'ointment': ['ointment', 'mỡ', 'thuốc mỡ', 'thuocmo'],
    'solution': ['dung dịch', 'solution'],
    'syrup': ['siro', 'syrup'],
    'injection': ['tiêm', 'injection', 'chích'],
    'tube': ['tuýp', 'tuyp', 'tube']
  };
  
  for (const [key, group] of Object.entries(equivalentForms)) {
    if (group.some(f => normalizeMedicineValue(f) === normalized1) || normalized1.includes(key)) {
      return group.some(f => normalizeMedicineValue(f) === normalized2) || normalized2.includes(key);
    }
  }
  
  for (const [key, group] of Object.entries(equivalentForms)) {
    if (group.some(f => normalizeMedicineValue(f) === normalized2) || normalized2.includes(key)) {
      return group.some(f => normalizeMedicineValue(f) === normalized1) || normalized1.includes(key);
    }
  }
  
  return false;
}

// Helper function to check if two subcategories are equivalent
async function isSubcategoryEquivalent(sub1: string, sub2: string): Promise<boolean> {
  const normalized1 = normalizeMedicineValue(sub1);
  const normalized2 = normalizeMedicineValue(sub2);
  
  if (normalized1 === normalized2) return true;
  
  // Bỏ qua nếu một trong hai là "N/A" hoặc rỗng
  if (!normalized1 || normalized1 === 'n/a' || normalized1 === 'na' || normalized1 === '') return true;
  if (!normalized2 || normalized2 === 'n/a' || normalized2 === 'na' || normalized2 === '') return true;
  
  // Kiểm tra nếu một chuỗi chứa từ khóa của chuỗi kia
  const keyWords1 = normalized1.split(/\s+/).filter(w => w.length > 2);
  const keyWords2 = normalized2.split(/\s+/).filter(w => w.length > 2);
  
  for (const keyword of keyWords1) {
    if (normalized2.includes(keyword) && keyword.length > 3) {
      return true;
    }
  }
  for (const keyword of keyWords2) {
    if (normalized1.includes(keyword) && keyword.length > 3) {
      return true;
    }
  }
  
  // Ưu tiên: Sử dụng service để tìm từ database
  try {
    const result = await medicineMetadataService.areSubcategoriesEquivalent(sub1, sub2);
    if (result) return true;
  } catch (error) {
    console.warn('⚠️ Error using medicineMetadataService for subcategory comparison, falling back to hardcode:', error);
  }
  
  // Fallback: Mapping các giá trị tương đương
  const equivalentSubs: { [key: string]: string[] } = {
    'nsaid': ['nsaid', 'nsaids', 'kháng viêm', 'anti-inflammatory', 'non-steroidal anti-inflammatory', 'nonsteroidal anti-inflammatory', 'điều trị xương khớp'],
    'paracetamol': ['paracetamol', 'acetaminophen'],
    'corticosteroid': ['corticosteroid', 'cortico', 'steroid']
  };
  
  for (const [key, group] of Object.entries(equivalentSubs)) {
    if (group.some(s => normalizeMedicineValue(s) === normalized1) || normalized1.includes(key)) {
      return group.some(s => normalizeMedicineValue(s) === normalized2) || normalized2.includes(key);
    }
  }
  
  for (const [key, group] of Object.entries(equivalentSubs)) {
    if (group.some(s => normalizeMedicineValue(s) === normalized2) || normalized2.includes(key)) {
      return group.some(s => normalizeMedicineValue(s) === normalized1) || normalized1.includes(key);
    }
  }
  
  return false;
}

// Helper function to check if medicine matches all 4 conditions
async function matchesAll4Conditions(
  medicine: any,
  targetCategory: string,
  targetSubcategory: string,
  targetDosageForm: string,
  targetRoute: string
): Promise<{ matches: boolean; matchCount: number; details: { category: boolean; subcategory: boolean; dosageForm: boolean; route: boolean } }> {
  const hasCategory = targetCategory && medicine.category && 
    normalizeMedicineValue(targetCategory) === normalizeMedicineValue(medicine.category);
  
  const hasSubcategory = await isSubcategoryEquivalent(targetSubcategory, medicine.subcategory || '');
  const hasDosageForm = await isDosageFormEquivalent(targetDosageForm, medicine.dosageForm || '');
  
  const normalizedRoute1 = normalizeMedicineValue(targetRoute);
  const normalizedRoute2 = normalizeMedicineValue(medicine.route || '');
  
  let hasRoute = false;
  if (normalizedRoute1 && normalizedRoute2) {
    if (normalizedRoute1 === normalizedRoute2) {
      hasRoute = true;
    } else {
      const keyWords1 = normalizedRoute1.split(/\s+/).filter(w => w.length > 2);
      const keyWords2 = normalizedRoute2.split(/\s+/).filter(w => w.length > 2);
      
      for (const keyword of keyWords1) {
        if (normalizedRoute2.includes(keyword) && keyword.length > 2) {
          hasRoute = true;
          break;
        }
      }
      if (!hasRoute) {
        for (const keyword of keyWords2) {
          if (normalizedRoute1.includes(keyword) && keyword.length > 2) {
            hasRoute = true;
            break;
          }
        }
      }
      
      if (!hasRoute) {
        const equivalentRoutes: { [key: string]: string[] } = {
          'uống': ['uống', 'oral', 'đường uống', 'duong uong'],
          'ngoài': ['bôi ngoài', 'dùng ngoài', 'topical', 'boi ngoai', 'dung ngoai', 'ngoài'],
          'tiêm': ['tiêm', 'injection', 'chích', 'chich'],
          'nhỏ': ['nhỏ mắt', 'nhỏ mũi', 'eye drops', 'nasal drops']
        };
        
        for (const [key, routes] of Object.entries(equivalentRoutes)) {
          if (routes.some(r => normalizedRoute1.includes(normalizeMedicineValue(r))) || normalizedRoute1.includes(key)) {
            if (routes.some(r => normalizedRoute2.includes(normalizeMedicineValue(r))) || normalizedRoute2.includes(key)) {
              hasRoute = true;
              break;
            }
          }
        }
      }
    }
  }
  
  return {
    matches: hasCategory && hasSubcategory && hasDosageForm && hasRoute,
    matchCount: [hasCategory, hasSubcategory, hasDosageForm, hasRoute].filter(Boolean).length,
    details: { category: hasCategory, subcategory: hasSubcategory, dosageForm: hasDosageForm, route: hasRoute }
  };
}

// Function to analyze medicine with AI to get 4 conditions
async function analyzeMedicineWithAI(medicineName: string, dosage?: string): Promise<{
  category: string;
  subcategory: string;
  dosageForm: string;
  route: string;
  analysisText: string;
}> {
  let category = '';
  let subcategory = '';
  let dosageForm = '';
  let route = '';
  let analysisText = '';

  try {
    const { geminiGenerateContentText, buildGeminiCacheKey } = await import('../services/geminiRuntime.js');
    
    const prompt = `Bạn là chuyên gia dược học. Hãy phân tích tên thuốc sau và trả lời CHỈ bằng JSON format:

Tên thuốc: "${medicineName}"
${dosage ? `Hàm lượng: ${dosage}` : ''}

Yêu cầu: Phân tích và trả lời CHỈ bằng JSON với format sau (KHÔNG có text nào khác, CHỈ JSON):
{
  "category": "danh mục thuốc (ví dụ: Thuốc cơ xương khớp, Giảm đau hạ sốt, Thuốc da liễu)",
  "subcategory": "nhóm thuốc (ví dụ: NSAID, Paracetamol, Corticosteroid)",
  "dosageForm": "dạng bào chế (ví dụ: Viên nén, Gel, Cream, Ointment, Tablet, Capsule, Tube)",
  "route": "cách dùng (ví dụ: Uống, Dùng ngoài, Tiêm, Nhỏ mắt)",
  "analysis": "phân tích ngắn gọn về thuốc này"
}

Lưu ý quan trọng:
- Nếu tên thuốc có "1%/20g", "gel", "cream", "tuýp", "bôi" → route = "Dùng ngoài", dosageForm = "Gel" hoặc "Cream"
- Nếu tên thuốc có "viên", "tablet", "capsule" → route = "Uống", dosageForm = "Tablet" hoặc "Capsule"
- Phân tích dựa trên tên thuốc và hàm lượng để xác định chính xác 4 thông tin trên.`;

    console.log(`🤖 Calling Gemini AI for medicine: "${medicineName}"${dosage ? ` (${dosage})` : ''}`);
    // IMPORTANT:
    // Do NOT route this through the general chat Gemini system prompt (very long).
    // Keep it lightweight + cacheable to avoid rate-limit spikes when analyzing many medicines.
    const cacheKey = buildGeminiCacheKey('medicine-4conds', {
      medicineName,
      dosage: dosage || '',
      promptVersion: 'v1',
    });
    const aiResponse = await geminiGenerateContentText({
      parts: [{ text: prompt }],
      cacheKey,
      cacheTtlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
      maxRetries: 3,
      opName: 'analyzeMedicineWithAI',
    });

    if (aiResponse) {
      console.log(`🤖 Gemini AI response received (${aiResponse.length} chars) for "${medicineName}"`);
      try {
        let jsonText = aiResponse.trim();
        if (jsonText.startsWith('```json')) {
          jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        } else if (jsonText.startsWith('```')) {
          jsonText = jsonText.replace(/```\n?/g, '');
        }
        
        const parsed = JSON.parse(jsonText);
        category = parsed.category || '';
        subcategory = parsed.subcategory || '';
        dosageForm = parsed.dosageForm || '';
        route = parsed.route || '';
        analysisText = parsed.analysis || '';

        console.log(`🤖 AI Analysis for "${medicineName}":`, { category, subcategory, dosageForm, route });
      } catch (parseError: any) {
        console.error(`❌ Error parsing AI response for "${medicineName}":`, parseError?.message || parseError);
        console.error(`   Raw AI response (first 200 chars):`, aiResponse.substring(0, 200));
        // Fallback: thử extract từ text response
        const lowerResponse = aiResponse.toLowerCase();
        if (lowerResponse.includes('dùng ngoài') || lowerResponse.includes('bôi') || lowerResponse.includes('gel') || lowerResponse.includes('cream')) {
          route = 'Dùng ngoài';
          console.log(`   🔍 Fallback: Extracted route "Dùng ngoài" from AI text response`);
        } else if (lowerResponse.includes('uống') || lowerResponse.includes('oral') || lowerResponse.includes('viên')) {
          route = 'Uống';
          console.log(`   🔍 Fallback: Extracted route "Uống" from AI text response`);
        }
      }
    } else {
      console.warn(`⚠️ Gemini AI returned null/undefined for "${medicineName}" - will use DB fallback`);
    }
  } catch (error: any) {
    console.error(`❌ Error in AI analysis for "${medicineName}":`, error?.message || error);
    console.error(`   Error type:`, error?.constructor?.name);
    console.error(`   Will use DB fallback to get 4 conditions`);
  }

  return { category, subcategory, dosageForm, route, analysisText };
}

async function getContraindicationFromMedicines(
  medicineName: string,
  groupTherapeutic?: string,
  medicineInfo?: any
): Promise<string> {
  let contraindication = '';

  if (medicineInfo) {
    contraindication =
      medicineInfo.contraindication ||
      medicineInfo.chongChiDinh ||
      medicineInfo.contraindications ||
      '';
    if (contraindication && contraindication.trim()) {
      return contraindication.trim();
    }
  }

  const db = mongoose.connection.db;
  if (db && medicineName && typeof medicineName === 'string') {
    try {
      const medicinesCollection = db.collection('medicines');
      const searchName = medicineName.split('(')[0]?.trim();

      if (searchName) {
        const foundMedicine = await medicinesCollection.findOne({
          $or: [
            { name: { $regex: searchName, $options: 'i' } },
            { brand: { $regex: searchName, $options: 'i' } },
            { genericName: { $regex: searchName, $options: 'i' } },
            { activeIngredient: { $regex: searchName, $options: 'i' } },
          ],
        });

        if (foundMedicine) {
          contraindication =
            foundMedicine.contraindication ||
            foundMedicine.chongChiDinh ||
            foundMedicine.contraindications ||
            '';

          if (contraindication && contraindication.trim()) {
            return contraindication.trim();
          }

          if (!groupTherapeutic && foundMedicine.groupTherapeutic) {
            groupTherapeutic = foundMedicine.groupTherapeutic;
          }
        }
      }
    } catch (error) {
      console.error('Error fetching contraindication from medicines collection:', error);
    }
  }

  if (!contraindication && groupTherapeutic) {
    const groupLower = groupTherapeutic.toLowerCase();
    const medicineNameLower = (medicineName || '').toLowerCase();
    const combinedText = `${medicineNameLower}`;

    const isNSAID =
      groupLower.includes('nsaid') ||
      groupLower.includes('kháng viêm') ||
      combinedText.includes('diclofenac') ||
      combinedText.includes('nsaid') ||
      medicineNameLower.includes('voltaren') ||
      medicineNameLower.includes('ibuprofen') ||
      medicineNameLower.includes('meloxicam') ||
      medicineNameLower.includes('celecoxib') ||
      medicineNameLower.includes('aspirin');

    if (isNSAID) {
      const isTopical = /%\/\s*g|\bgel\b|\bemulgel\b|\bcream\b|\bkem\b|\btuýp\b|\btuyp\b|\bthuốc\s*bôi\b|\bthuoc\s*boi\b|\bointment\b|\bmỡ\b|\bmo\b/.test(
        combinedText
      );

      if (isTopical) {
        if (medicineNameLower.includes('diclofenac') || medicineNameLower.includes('voltaren')) {
          contraindication =
            'Quá mẫn với Diclofenac hoặc các thuốc NSAID khác, không bôi lên vùng da bị tổn thương, vết thương hở, hoặc niêm mạc';
        } else if (medicineNameLower.includes('ibuprofen')) {
          contraindication = 'Quá mẫn với Ibuprofen, không bôi lên vùng da bị tổn thương, vết thương hở';
        } else if (medicineNameLower.includes('meloxicam')) {
          contraindication = 'Quá mẫn với Meloxicam, không bôi lên vùng da bị tổn thương, vết thương hở';
        } else {
          contraindication =
            'Quá mẫn với thuốc NSAID, không bôi lên vùng da bị tổn thương, vết thương hở, hoặc niêm mạc';
        }
      } else {
        if (medicineNameLower.includes('celecoxib') || medicineNameLower.includes('coxib')) {
          contraindication =
            'Người có bệnh tim mạch, suy tim, phụ nữ mang thai 3 tháng cuối, quá mẫn với Celecoxib hoặc các thuốc NSAID khác';
        } else if (medicineNameLower.includes('ibuprofen')) {
          contraindication =
            'Người đau dạ dày, loét dạ dày, suy thận, phụ nữ mang thai 3 tháng cuối, quá mẫn với Ibuprofen';
        } else if (medicineNameLower.includes('meloxicam')) {
          contraindication =
            'Người đau dạ dày, loét dạ dày, suy thận, phụ nữ mang thai 3 tháng cuối, quá mẫn với Meloxicam';
        } else if (medicineNameLower.includes('aspirin')) {
          contraindication =
            'Người đau dạ dày, loét dạ dày, suy thận, phụ nữ mang thai 3 tháng cuối, quá mẫn với Aspirin';
        } else {
          contraindication =
            'Người đau dạ dày, loét dạ dày, suy thận, phụ nữ mang thai 3 tháng cuối, quá mẫn với thuốc NSAID';
        }
      }
    } else if (groupLower.includes('kháng sinh')) {
      contraindication = 'Quá mẫn với kháng sinh, phụ nữ mang thai và cho con bú cần thận trọng';
    } else if (groupLower.includes('corticosteroid') || groupLower.includes('cortico')) {
      contraindication =
        'Quá mẫn với corticosteroid, nhiễm trùng toàn thân chưa được điều trị, loét dạ dày tá tràng, phụ nữ mang thai cần thận trọng';
    } else if (
      medicineNameLower.includes('cetirizine') ||
      medicineNameLower.includes('loratadine') ||
      medicineNameLower.includes('fexofenadine')
    ) {
      contraindication = 'Quá mẫn với thuốc kháng histamine, phụ nữ mang thai và cho con bú cần thận trọng';
    }
  }

  return contraindication.trim();
}

async function formatSuggestionText(
  originalMedicineName: string,
  originalDosage: string | null,
  suggestedMedicines: any[],
  aiAnalysis?: { category: string; subcategory: string; dosageForm: string; route: string; analysisText: string }
): Promise<string> {
  if (!suggestedMedicines || suggestedMedicines.length === 0) {
    return `Không tìm thấy chính xác tên thuốc "${originalMedicineName}" trong hệ thống. Vui lòng liên hệ dược sĩ để được tư vấn.`;
  }

  const db = mongoose.connection.db;
  let suggestionText = `Không tìm thấy chính xác tên thuốc trong đơn.\n\n`;
  
  // Thêm phần AI phân tích nếu có (giống Web)
  if (aiAnalysis && (aiAnalysis.category || aiAnalysis.subcategory || aiAnalysis.dosageForm || aiAnalysis.route)) {
    suggestionText += `📋 Phân tích thuốc "${originalMedicineName}":\n`;
    if (aiAnalysis.category) {
      suggestionText += `   - Danh mục: ${aiAnalysis.category}\n`;
    }
    if (aiAnalysis.subcategory) {
      suggestionText += `   - Nhóm thuốc: ${aiAnalysis.subcategory}\n`;
    }
    if (aiAnalysis.dosageForm) {
      suggestionText += `   - Dạng bào chế: ${aiAnalysis.dosageForm}\n`;
    }
    if (aiAnalysis.route) {
      suggestionText += `   - Cách dùng: ${aiAnalysis.route}\n`;
    }
    if (aiAnalysis.analysisText) {
      suggestionText += `   - Phân tích: ${aiAnalysis.analysisText}\n`;
    }
    suggestionText += `\n`;
  }
  
  // Format tất cả suggestions - rõ ràng, chuẩn dược, không dài dòng
  // Tách từng thông tin: tên – công dụng – hàm lượng – lý do đề xuất

  if (suggestedMedicines.length === 1) {
    // Chỉ có 1 thuốc - format đơn giản
    const med = suggestedMedicines[0];
    let groupTherapeutic = med.groupTherapeutic || '';
    let indication = med.indication || '';
    
    // Try to get groupTherapeutic, indication, and contraindication from medicines collection
    let contraindication = med.contraindication || '';
    let medicineInfo: any = null; // Declare outside if block for use in helper function
    
    if (db) {
      try {
        const medicinesCollection = db.collection('medicines');
        const medicineName = med.productName || med.name || '';
        const searchName = medicineName.split('(')[0].trim();
        
        if (searchName) {
          medicineInfo = await medicinesCollection.findOne({
            $or: [
              { name: { $regex: searchName, $options: 'i' } },
              { brand: { $regex: searchName, $options: 'i' } },
              { genericName: { $regex: searchName, $options: 'i' } },
              { activeIngredient: { $regex: searchName, $options: 'i' } }
            ]
          });
          
          if (medicineInfo) {
            if (medicineInfo.groupTherapeutic && !groupTherapeutic) {
              groupTherapeutic = medicineInfo.groupTherapeutic;
            }
            // Ưu tiên indication, nếu không có thì dùng description, uses, hoặc congDung
            if (!indication) {
              indication = medicineInfo.indication || 
                          medicineInfo.description || 
                          medicineInfo.uses || 
                          medicineInfo.congDung || 
                          '';
            }
            // Lấy chống chỉ định nếu có
            if (!contraindication) {
              contraindication = medicineInfo.contraindication || 
                                medicineInfo.chongChiDinh || 
                                medicineInfo.contraindications || 
                                '';
            }
          }
        }
      } catch (error) {
        console.error('Error fetching medicine info for suggestion:', error);
      }
    }
    
    // Nếu không có chống chỉ định từ database, sử dụng helper function để lấy (có fallback)
    if (!contraindication) {
      const medicineName = med.productName || med.name || '';
      contraindication = await getContraindicationFromMedicines(medicineName, groupTherapeutic, medicineInfo);
    }
    
    // Lưu chống chỉ định vào med object để frontend có thể sử dụng
    med.contraindication = contraindication;
    
    const suggestedName = med.productName || med.name || '';
    const suggestedDosage = med.dosage || originalDosage || '';
    const matchReason = med.matchExplanation || getMatchExplanation(med.matchReason || 'similar', med.confidence || 0.6);
    
    // Format: tên – công dụng – hàm lượng – lý do (ngắn gọn, rõ ràng)
    suggestionText += `Dựa trên hoạt chất và công dụng điều trị, hệ thống đề xuất ${suggestedName}`;
    if (suggestedDosage) {
      suggestionText += ` (${suggestedDosage})`;
    }
    suggestionText += `.`;
    
    if (indication) {
      // Hiển thị công dụng đầy đủ, không cắt quá ngắn để người mua dễ biết
      const fullIndication = indication.trim();
      suggestionText += `\nCông dụng: ${fullIndication}`;
    } else {
      // Nếu không có indication, hiển thị công dụng mặc định dựa trên nhóm
      if (groupTherapeutic) {
        if (groupTherapeutic.toLowerCase().includes('nsaid') || groupTherapeutic.toLowerCase().includes('kháng viêm')) {
          suggestionText += `\nCông dụng: Giảm đau, kháng viêm`;
        } else if (groupTherapeutic.toLowerCase().includes('kháng sinh')) {
          suggestionText += `\nCông dụng: Điều trị nhiễm khuẩn`;
        } else {
          suggestionText += `\nCông dụng: Điều trị theo chỉ định của bác sĩ`;
        }
      }
    }
    
    if (groupTherapeutic) {
      suggestionText += `\nNhóm: ${groupTherapeutic}`;
    }
    
    if (suggestedDosage) {
      suggestionText += `\nHàm lượng ${suggestedDosage} tương ứng với liều điều trị tiêu chuẩn.`;
    }
    
    suggestionText += `\nLý do đề xuất: ${matchReason}`;
    
    // Thêm chống chỉ định nếu có
    if (contraindication && contraindication.trim()) {
      suggestionText += `\n\n⚠️ Chống chỉ định: ${contraindication.trim()}`;
    }
  } else {
    // Có nhiều thuốc - format danh sách ngắn gọn
    suggestionText += `Dựa trên hoạt chất và công dụng điều trị, hệ thống đề xuất ${suggestedMedicines.length} thuốc:\n\n`;
    
    for (let i = 0; i < suggestedMedicines.length; i++) {
      const med = suggestedMedicines[i];
      let groupTherapeutic = med.groupTherapeutic || '';
      let indication = med.indication || '';
      
      // Try to get groupTherapeutic, indication, and contraindication from medicines collection
      // Ưu tiên lấy từ med object trước (đã được lấy từ similarMedicines)
      let contraindication = med.contraindication || '';
      let medicineInfo: any = null; // Declare outside if block for use in helper function
      
      if (db) {
        try {
          const medicinesCollection = db.collection('medicines');
          const medicineName = med.productName || med.name || '';
          const searchName = medicineName.split('(')[0].trim();
          
          if (searchName) {
            medicineInfo = await medicinesCollection.findOne({
              $or: [
                { name: { $regex: searchName, $options: 'i' } },
                { brand: { $regex: searchName, $options: 'i' } },
                { genericName: { $regex: searchName, $options: 'i' } },
                { activeIngredient: { $regex: searchName, $options: 'i' } }
              ]
            });
            
            if (medicineInfo) {
              if (medicineInfo.groupTherapeutic && !groupTherapeutic) {
                groupTherapeutic = medicineInfo.groupTherapeutic;
              }
              // Ưu tiên indication, nếu không có thì dùng description, uses, hoặc congDung
              if (!indication) {
                indication = medicineInfo.indication || 
                            medicineInfo.description || 
                            medicineInfo.uses || 
                            medicineInfo.congDung || 
                            '';
              }
              // Lấy chống chỉ định nếu có và chưa có trong med object
              if (!contraindication) {
                contraindication = medicineInfo.contraindication || 
                                  medicineInfo.chongChiDinh || 
                                  medicineInfo.contraindications || 
                                  '';
              }
            }
          }
        } catch (error) {
          console.error('Error fetching medicine info for suggestion:', error);
        }
      }
      
      // Nếu không có chống chỉ định từ database, sử dụng helper function để lấy (có fallback)
      if (!contraindication) {
        const medicineName = med.productName || med.name || '';
        const finalGroupTherapeutic = groupTherapeutic || med.groupTherapeutic || '';
        contraindication = await getContraindicationFromMedicines(medicineName, finalGroupTherapeutic, medicineInfo);
      }
      
      // Lưu chống chỉ định vào med object để frontend có thể sử dụng
      med.contraindication = contraindication;
      
      const suggestedName = med.productName || med.name || '';
      const suggestedDosage = med.dosage || originalDosage || '';
      const matchReason = med.matchExplanation || getMatchExplanation(med.matchReason || 'similar', med.confidence || 0.6);
      
      // Format: tên – công dụng – hàm lượng – lý do (ngắn gọn, rõ ràng)
      suggestionText += `${i + 1}. ${suggestedName}`;
      if (suggestedDosage) {
        suggestionText += ` (${suggestedDosage})`;
      }
      suggestionText += `\n`;
      
      if (indication) {
        // Hiển thị công dụng đầy đủ để người mua dễ biết, không cắt quá ngắn
        const fullIndication = indication.trim();
        suggestionText += `   Công dụng: ${fullIndication}\n`;
      } else {
        // Nếu không có indication, hiển thị công dụng mặc định dựa trên nhóm
        if (groupTherapeutic) {
          if (groupTherapeutic.toLowerCase().includes('nsaid') || groupTherapeutic.toLowerCase().includes('kháng viêm')) {
            suggestionText += `   Công dụng: Giảm đau, kháng viêm\n`;
          } else if (groupTherapeutic.toLowerCase().includes('kháng sinh')) {
            suggestionText += `   Công dụng: Điều trị nhiễm khuẩn\n`;
          } else {
            suggestionText += `   Công dụng: Điều trị theo chỉ định của bác sĩ\n`;
          }
        }
      }
      
      if (groupTherapeutic) {
        suggestionText += `   Nhóm: ${groupTherapeutic}\n`;
      }
      
      suggestionText += `   Lý do: ${matchReason}`;
      
      // Thêm chống chỉ định nếu có
      if (contraindication && contraindication.trim()) {
        suggestionText += `\n   ⚠️ Chống chỉ định: ${contraindication.trim()}`;
      }
      
      suggestionText += `\n\n`;
    }
  }
  
  return suggestionText.trim();
}

// Helper function to get description from medicines collection if product doesn't have it
async function getProductDescription(product: any): Promise<string> {
  // If product already has a valid description (not empty and not just dosage), return it
  if (product.description && 
      product.description.trim().length > 0 && 
      !/^\s*\d+(?:\.\d+)?\s*(?:mg|g|ml|l|mcg|iu|ui|%)(?:\s*[+\/]\s*\d+(?:\.\d+)?\s*(?:mg|g|ml|l|mcg|iu|ui|%)?)?\s*$/i.test(product.description.trim())) {
    return product.description;
  }
  
  // Try to get description from medicines collection
  try {
    const db = mongoose.connection.db;
    if (!db) return product.description || product.strength || '';
    
    const medicinesCollection = db.collection('medicines');
    const productName = product.name || '';
    
    // Try exact match first
    let medicine = await medicinesCollection.findOne({ name: productName });
    
    // If not found, try case-insensitive regex
    if (!medicine) {
      const escapedName = productName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      medicine = await medicinesCollection.findOne({
        name: { $regex: `^${escapedName}$`, $options: 'i' }
      });
    }
    
    // If still not found, try normalized name (remove spaces, underscores, etc.)
    if (!medicine) {
      const normalizedName = productName.replace(/[\s_+\-]/g, '').toLowerCase();
      const allMedicines = await medicinesCollection.find({}).toArray();
      const foundMedicine = allMedicines.find(med => {
        const medName = (med.name || '').replace(/[\s_+\-]/g, '').toLowerCase();
        return medName === normalizedName;
      });
      medicine = foundMedicine || null;
    }
    
    if (medicine) {
      // Priority: description > indication > genericName > strength
      const description = medicine.description || 
                         medicine.indication || 
                         medicine.genericName || 
                         medicine.strength || 
                         '';
      
      // Only return if it's not just dosage
      if (description && 
          description.trim().length > 0 && 
          !/^\s*\d+(?:\.\d+)?\s*(?:mg|g|ml|l|mcg|iu|ui|%)(?:\s*[+\/]\s*\d+(?:\.\d+)?\s*(?:mg|g|ml|l|mcg|iu|ui|%)?)?\s*$/i.test(description.trim())) {
        return description.trim();
      }
    }
  } catch (error) {
    console.error('Error fetching description from medicines collection:', error);
  }
  
  // Fallback to product's description or strength
  return product.description || product.strength || '';
}

function isSameDosage(d1: string | null | undefined, d2: string | null | undefined): boolean {
  if (!d1 || !d2) return false;
  try {
    const n1 = normalizeDosageForComparison(d1);
    const n2 = normalizeDosageForComparison(d2);
    if (!n1?.length || !n2?.length || n1.length !== n2.length) return false;
    return n1.every((part: any, idx: number) => part.value === n2[idx]?.value && part.unit === n2[idx]?.unit);
  } catch {
    return false;
  }
}

async function fetchMedicineInfo(medicineName: string) {
  const db = mongoose.connection.db;
  if (!db || !medicineName) return null;
  try {
    const medicinesCollection = db.collection('medicines');
    const searchName = medicineName.split('(')[0].trim();
    if (!searchName) return null;
    const info = await medicinesCollection.findOne({
      $or: [
        { name: { $regex: searchName, $options: 'i' } },
        { brand: { $regex: searchName, $options: 'i' } },
        { genericName: { $regex: searchName, $options: 'i' } },
        { activeIngredient: { $regex: searchName, $options: 'i' } },
      ],
    });
    return info;
  } catch (err) {
    console.error('Error fetching medicine info:', err);
    return null;
  }
}

// Hàm enrichAnalysisResult đã được bỏ - trả về suggestions trực tiếp từ performAIAnalysis
// Suggestions đã có đầy đủ thông tin (category, subcategory, dosageForm, route, contraindication, etc.)
// ngay từ khi được tạo trong performAIAnalysis, giống như web backend

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/prescriptions';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Upload prescription image middleware
export const uploadPrescriptionImage = upload.single('prescriptionImage');

// Scan prescription image, run OCR, and create a basic prescription record
export const scanPrescription = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Prescription image is required',
      });
    }

    const imagePath = req.file.path;

    // Upload to Supabase Storage (if configured)
    let supabaseImageUrl = imagePath; // Fallback to local path
    try {
      const supabaseResult = await uploadToSupabase(
        STORAGE_BUCKETS.PRESCRIPTIONS,
        imagePath,
        `prescription-${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(req.file.originalname)}`,
        {
          contentType: req.file.mimetype,
        }
      );
      if (supabaseResult) {
        supabaseImageUrl = supabaseResult.url;
        console.log('✅ Prescription image uploaded to Supabase:', supabaseImageUrl);
      }
    } catch (supabaseError: any) {
      console.warn('⚠️ Supabase upload failed, using local path:', supabaseError.message);
    }

    // Use OCR service to extract info from image
    const extractedInfo = await processPrescriptionImage(imagePath);

    // Get user info to fill required fields
    const user = await User.findById(userId).select('firstName lastName phone').lean();
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const customerNameValue =
      extractedInfo.customerName ||
      `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
      'Khách hàng';
    const phoneNumberValue = extractedInfo.phoneNumber || user.phone || '';

    // Generate unique prescriptionNumber to avoid duplicate key error
    // Format: PRE-{timestamp}-{random}
    const prescriptionNumber = `PRE-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    // Create a minimal prescription record using extracted info
    const prescription = new Prescription({
      userId,
      customerName: customerNameValue,
      phoneNumber: phoneNumberValue,
      doctorName: extractedInfo.doctorName || 'Không xác định',
      hospitalName: extractedInfo.hospitalName || 'Không xác định',
      prescriptionImage: supabaseImageUrl, // Use Supabase URL if available, otherwise local path
      status: 'pending',
      notes: extractedInfo.notes || '',
      diagnosis: extractedInfo.diagnosis,
      examinationDate: extractedInfo.examinationDate,
      prescriptionNumber, // Add unique prescriptionNumber to avoid duplicate key error
    });

    console.log('Attempting to save prescription with data:', {
      userId,
      customerName: customerNameValue,
      phoneNumber: phoneNumberValue,
      doctorName: extractedInfo.doctorName || 'Không xác định',
      hospitalName: extractedInfo.hospitalName || 'Không xác định',
      prescriptionImage: imagePath,
      status: 'pending',
      notes: extractedInfo.notes || '',
      diagnosis: extractedInfo.diagnosis,
      examinationDate: extractedInfo.examinationDate,
      prescriptionNumber,
    });

    await prescription.save();

    console.log('Prescription saved after scan:', {
      prescriptionId: prescription._id,
      prescriptionIdString: String(prescription._id),
      userId: prescription.userId,
      userIdString: String(prescription.userId),
      requestUserId: userId,
      requestUserIdString: String(userId),
      userIdMatch: String(prescription.userId) === String(userId),
    });

    return res.status(201).json({
      success: true,
      message: 'Prescription scanned successfully',
      data: {
        ...prescription.toObject(),
        extractedInfo,
      },
    });
  } catch (error: any) {
    console.error('=== Error scanning prescription ===');
    console.error('Error type:', error?.constructor?.name);
    console.error('Error message:', error?.message);
    console.error('Error stack:', error?.stack);
    
    // Log validation errors in detail
    if (error?.name === 'ValidationError') {
      console.error('Validation errors:', error.errors);
      const validationMessages = Object.values(error.errors || {}).map((err: any) => err.message).join(', ');
      return res.status(400).json({
        success: false,
        message: `Validation error: ${validationMessages}`,
        errors: error.errors,
      });
    }
    
    // Log MongoDB errors
    if (error?.name === 'MongoError' || error?.code) {
      console.error('MongoDB error code:', error.code);
      console.error('MongoDB error details:', error);
    }
    
    return res.status(500).json({
      success: false,
      message: error?.message || 'Internal server error',
    });
  }
};

// Create prescription order
export const createPrescriptionOrder = async (req: Request, res: Response) => {
  try {
    const { 
      prescriptionName, 
      hospitalName, 
      doctorName, 
      examinationDate, 
      notes, 
      customerName, 
      phoneNumber 
    } = req.body;

    // Get user ID from auth middleware
    const userId = (req as any).user?.id;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }

    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'Prescription image is required' 
      });
    }

    // Upload to Supabase Storage (if configured)
    const imageUrl = await uploadPrescriptionImageToSupabase(req.file.path, req.file.originalname);

    // Create prescription record
    const prescription = new Prescription({
      userId,
      doctorName: doctorName || 'Không xác định',
      hospitalName: hospitalName || 'Không xác định',
      prescriptionImage: imageUrl,
      status: 'pending',
      notes: notes || '',
    });

    await prescription.save();

    res.status(201).json({
      success: true,
      message: 'Prescription order created successfully',
      data: {
        _id: prescription._id, // Add _id for consistency with frontend
        prescriptionId: prescription._id,
        status: prescription.status,
        imageUrl: req.file.path,
        doctorName: prescription.doctorName,
        hospitalName: prescription.hospitalName,
        notes: prescription.notes,
      }
    });

  } catch (error) {
    console.error('Error creating prescription order:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
};

// Save prescription
export const savePrescription = async (req: Request, res: Response) => {
  try {
    const { 
      prescriptionName, 
      hospitalName, 
      doctorName, 
      examinationDate, 
      notes, 
      customerName, 
      phoneNumber,
      suggestedMedicines // JSON string or array of suggested medicines
    } = req.body;

    // Get user ID from auth middleware
    const userId = (req as any).user?.id;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }

    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'Prescription image is required' 
      });
    }

    // Get user info to fill required fields
    const user = await User.findById(userId).select('firstName lastName phone').lean();
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const customerNameValue = customerName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Khách hàng';
    const phoneNumberValue = phoneNumber || user.phone || '';

    // Parse suggestedMedicines if it's a JSON string
    let parsedSuggestedMedicines = [];
    if (suggestedMedicines) {
      try {
        parsedSuggestedMedicines = typeof suggestedMedicines === 'string' 
          ? JSON.parse(suggestedMedicines) 
          : suggestedMedicines;
      } catch (parseError) {
        console.error('Error parsing suggestedMedicines:', parseError);
        // Continue without suggestions if parsing fails
      }
    }

    // Upload to Supabase Storage (if configured)
    const imageUrl = await uploadPrescriptionImageToSupabase(req.file.path, req.file.originalname);

    // Create prescription record for saving
    const prescription = new Prescription({
      userId,
      customerName: customerNameValue,
      phoneNumber: phoneNumberValue,
      doctorName: doctorName || 'Không xác định',
      hospitalName: hospitalName || 'Không xác định',
      prescriptionImage: imageUrl,
      status: 'saved', // Different status for saved prescriptions
      notes: notes || '',
      suggestedMedicines: parsedSuggestedMedicines.length > 0 ? parsedSuggestedMedicines : undefined,
    });

    await prescription.save();

    res.status(201).json({
      success: true,
      message: 'Prescription saved successfully',
      data: {
        _id: prescription._id, // Add _id for consistency with frontend
        prescriptionId: prescription._id,
        status: prescription.status,
        imageUrl: req.file.path,
        doctorName: prescription.doctorName,
        hospitalName: prescription.hospitalName,
        notes: prescription.notes,
      }
    });

  } catch (error) {
    console.error('Error saving prescription:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
};

// Get user's prescriptions
export const getUserPrescriptions = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }

    const prescriptions = await Prescription.find({ userId })
      .sort({ createdAt: -1 })
      .select('-prescriptionImage'); // Don't send image data in list

    res.status(200).json({
      success: true,
      data: prescriptions
    });

  } catch (error) {
    console.error('Error fetching prescriptions:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
};

// Get prescription by ID
export const getPrescriptionById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }

    const prescription = await Prescription.findOne({ 
      _id: id, 
      userId 
    });

    if (!prescription) {
      return res.status(404).json({ 
        success: false, 
        message: 'Prescription not found' 
      });
    }

    res.status(200).json({
      success: true,
      data: prescription
    });

  } catch (error) {
    console.error('Error fetching prescription:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
};

// Update prescription
export const updatePrescription = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;
    const updateData = req.body;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }

    const prescription = await Prescription.findOneAndUpdate(
      { _id: id, userId },
      updateData,
      { new: true }
    );

    if (!prescription) {
      return res.status(404).json({ 
        success: false, 
        message: 'Prescription not found' 
      });
    }

    res.status(200).json({
      success: true,
      message: 'Prescription updated successfully',
      data: prescription
    });

  } catch (error) {
    console.error('Error updating prescription:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
};

// Delete prescription
export const deletePrescription = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }

    const prescription = await Prescription.findOneAndDelete({ 
      _id: id, 
      userId 
    });

    if (!prescription) {
      return res.status(404).json({ 
        success: false, 
        message: 'Prescription not found' 
      });
    }

    // Delete the image file
    if (prescription.prescriptionImage && fs.existsSync(prescription.prescriptionImage)) {
      fs.unlinkSync(prescription.prescriptionImage);
    }

    res.status(200).json({
      success: true,
      message: 'Prescription deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting prescription:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
};

// Get prescription image
export const getPrescriptionImage = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }

    const prescription = await Prescription.findOne({ 
      _id: id, 
      userId 
    });

    if (!prescription) {
      return res.status(404).json({ 
        success: false, 
        message: 'Prescription not found' 
      });
    }

    if (!prescription.prescriptionImage || !fs.existsSync(prescription.prescriptionImage)) {
      return res.status(404).json({ 
        success: false, 
        message: 'Prescription image not found' 
      });
    }

    res.sendFile(path.resolve(prescription.prescriptionImage));

  } catch (error) {
    console.error('Error fetching prescription image:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
};

// Get consultation history
export const getConsultationHistory = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }

    // Get consultation requests (prescriptions with status 'pending' or 'approved')
    const consultations = await Prescription.find({ 
      userId,
      status: { $in: ['pending', 'approved'] }
    })
    .sort({ createdAt: -1 })
    .select('-prescriptionImage');

    res.status(200).json({
      success: true,
      data: consultations
    });

  } catch (error) {
    console.error('Error fetching consultation history:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
};

// AI-powered prescription analysis
export const analyzePrescription = async (req: Request, res: Response) => {
  try {
    // Log full request for debugging
    console.log('Analyze prescription - Full request:', {
      body: req.body,
      bodyType: typeof req.body,
      bodyKeys: Object.keys(req.body || {}),
      contentType: req.headers['content-type'],
      hasFile: !!req.file,
    });

    const { prescriptionText, prescriptionId, prescriptionImage, imageUrl } = req.body;
    const userId = (req as any).user?.id;
    const prescriptionImageFile = req.file; // File from multer if uploaded

    // Support both 'prescriptionImage' and 'imageUrl' from body (for compatibility)
    const imageUrlFromBody = prescriptionImage || imageUrl;

    console.log('Analyze prescription request:', {
      prescriptionId,
      prescriptionText: prescriptionText ? 'provided' : 'not provided',
      prescriptionImage: imageUrlFromBody ? 'provided (URL)' : 'not provided',
      imageUrl: imageUrl ? 'provided' : 'not provided',
      hasFile: !!prescriptionImageFile,
      userId,
    });

    // Priority: uploaded file > prescriptionId from database > prescriptionImage (URL) from body
    // This allows analyzing directly from uploaded file without saving first
    let prescription = null;
    let imagePath = null;
    let shouldSavePrescription = false;
    
    if (prescriptionImageFile) {
      // If file is uploaded directly, use it for analysis
      // This allows analyzing without saving to database first
      imagePath = prescriptionImageFile.path;
      console.log('Using uploaded file for analysis:', imagePath);
      
      // Upload to Supabase Storage (if configured) - will be saved after analysis if needed
      try {
        const supabaseResult = await uploadToSupabase(
          STORAGE_BUCKETS.PRESCRIPTIONS,
          imagePath,
          `prescription-${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(prescriptionImageFile.originalname)}`,
          {
            contentType: prescriptionImageFile.mimetype,
          }
        );
        if (supabaseResult) {
          imagePath = supabaseResult.url; // Use Supabase URL for saving
          console.log('✅ Prescription image uploaded to Supabase for analysis:', imagePath);
        }
      } catch (supabaseError: any) {
        console.warn('⚠️ Supabase upload failed, using local path:', supabaseError.message);
      }
      
      // Optionally save prescription after analysis if prescriptionId is not provided
      shouldSavePrescription = !prescriptionId;
    } else if (prescriptionId && userId) {
      // If no file uploaded, try to get from database
      console.log('Looking for prescription:', {
        prescriptionId,
        prescriptionIdType: typeof prescriptionId,
        userId,
        userIdType: typeof userId,
      });
      
      // Validate ObjectId format
      if (!mongoose.Types.ObjectId.isValid(prescriptionId)) {
        console.error('Invalid prescriptionId format:', prescriptionId);
        return res.status(400).json({
          success: false,
          message: 'Invalid prescription ID format',
        });
      }
      
      // Convert to ObjectId
      const prescriptionObjectId = new mongoose.Types.ObjectId(prescriptionId);
      const userObjectId = new mongoose.Types.ObjectId(userId);
      
      // Try to find prescription - first without userId check to see if it exists at all
      const prescriptionWithoutUserCheck = await Prescription.findById(prescriptionObjectId);
      console.log('Prescription found (without user check):', prescriptionWithoutUserCheck ? {
        id: prescriptionWithoutUserCheck._id,
        userId: prescriptionWithoutUserCheck.userId,
        requestUserId: userId,
        userIdMatch: String(prescriptionWithoutUserCheck.userId) === String(userId),
      } : 'NOT FOUND');
      
      prescription = await Prescription.findOne({ 
        _id: prescriptionObjectId, 
        userId: userObjectId 
      });
      
      if (!prescription) {
        console.error('Prescription not found with userId check:', {
          prescriptionId,
          prescriptionObjectId: String(prescriptionObjectId),
          userId,
          userObjectId: String(userObjectId),
          prescriptionExists: !!prescriptionWithoutUserCheck,
          prescriptionUserId: prescriptionWithoutUserCheck ? String(prescriptionWithoutUserCheck.userId) : null,
        });
        return res.status(404).json({
          success: false,
          message: 'Prescription not found',
        });
      }
      
      console.log('Prescription found in database:', {
        id: prescription._id,
        hasImage: !!prescription.prescriptionImage,
      });
      
      // Use the saved prescription image path from database (if it still exists)
      if (prescription.prescriptionImage) {
        imagePath = prescription.prescriptionImage;
        
        // Check if imagePath is a URL (Supabase or external) or local file path
        const isUrl = imagePath.startsWith('http://') || imagePath.startsWith('https://');
        
        if (isUrl) {
          // It's a URL (Supabase or external), no need to check file existence
          console.log('Using image URL from database (Supabase/external):', imagePath);
        } else {
          // It's a local file path, check if it exists
          const fileExists = fs.existsSync(imagePath);
          console.log('Using image from database (local path):', { imagePath, fileExists });
          if (!fileExists) {
            console.warn('Prescription image path not found on disk. Prompting re-upload.');
            // If no OCR text and file is missing, return a clear error instead of 500
            if (!prescriptionText && !imageUrlFromBody && !prescriptionImageFile) {
              return res.status(400).json({
                success: false,
                message: 'Ảnh đơn thuốc không còn tồn tại trên máy chủ. Vui lòng chụp/ tải lại ảnh để phân tích.',
              });
            }
          }
        }
      }
    } else if (imageUrlFromBody) {
      // Support prescriptionImage/imageUrl as URL string (from Backend_ReactSinglepage compatibility)
      // This allows analyzing from image URL without file upload
      // Note: file:// URIs from mobile devices are local paths and cannot be accessed by server
      // In this case, we'll treat it as a signal that analysis should be done, but we need the actual file
      if (imageUrlFromBody.startsWith('file://')) {
        console.warn('Received file:// URI from mobile device. This is a local path and cannot be accessed by server.');
        console.warn('Frontend should send the file via FormData (multipart/form-data) instead of JSON.');
        // For now, we'll proceed with mock analysis since we can't access the file
        // In production, frontend should always send files via FormData
        imagePath = null; // Cannot access local file:// URI from server
      } else {
        imagePath = imageUrlFromBody;
        console.log('Using image URL from request body:', imagePath);
      }
    }

    // If we have imageUrl but it's a file:// URI (local path), we can't access it from server
    // In this case, we'll still proceed with analysis using prescriptionText if available,
    // or use mock analysis if only imageUrl (file://) is provided
    if (!prescriptionText && !imagePath && !imageUrlFromBody) {
      console.error('No prescription data provided');
      return res.status(400).json({
        success: false,
        message: 'Prescription text, image URL, uploaded image, or prescription ID is required',
      });
    }

    // If only file:// URI is provided (cannot access from server), proceed with mock analysis
    if (imageUrlFromBody && imageUrlFromBody.startsWith('file://') && !prescriptionText && !imagePath) {
      console.log('Only file:// URI provided - proceeding with mock analysis (frontend should send file via FormData)');
      // imagePath will remain null, and performAIAnalysis will handle it
    }

    // Mock AI analysis - in real implementation, integrate with AI service
    // Pass imagePath (can be from uploaded file or database)
    let analysisResult;
    try {
      analysisResult = await performAIAnalysis(prescriptionText, imagePath);
      // Trả về trực tiếp như web, không enrich nữa vì suggestions đã có đầy đủ thông tin
    } catch (aiError: any) {
      console.error('performAIAnalysis error:', {
        message: aiError?.message,
        stack: aiError?.stack,
        name: aiError?.name,
        code: aiError?.code,
      });
      
      // Determine error type and return appropriate message
      let errorMessage = 'Không thể phân tích đơn thuốc. Vui lòng thử lại.';
      let statusCode = 500;
      
      if (aiError?.message?.includes('timeout') || aiError?.code === 'ECONNABORTED') {
        errorMessage = 'Quá trình phân tích mất quá nhiều thời gian. Vui lòng thử lại với ảnh rõ hơn.';
        statusCode = 408; // Request Timeout
      } else if (aiError?.message?.includes('network') || aiError?.code === 'ENOTFOUND' || aiError?.code === 'ECONNREFUSED') {
        errorMessage = 'Lỗi kết nối mạng. Vui lòng kiểm tra kết nối và thử lại.';
        statusCode = 503; // Service Unavailable
      } else if (aiError?.message?.includes('Image') || aiError?.message?.includes('image')) {
        errorMessage = 'Không thể xử lý ảnh. Vui lòng tải lại ảnh đơn thuốc với chất lượng tốt hơn.';
        statusCode = 400; // Bad Request
      } else if (aiError?.message?.includes('OCR') || aiError?.message?.includes('extract')) {
        errorMessage = 'Không thể đọc nội dung từ ảnh. Vui lòng chụp lại ảnh rõ hơn.';
        statusCode = 400; // Bad Request
      }
      
      return res.status(statusCode).json({
        success: false,
        message: errorMessage,
        error: process.env.NODE_ENV === 'development' ? aiError?.message : undefined,
      });
    }

    // Save prescription if file was uploaded but no prescriptionId was provided
    let savedPrescriptionId = prescriptionId;
    if (shouldSavePrescription && prescriptionImageFile && userId) {
      try {
        // Get user info to fill required fields
        const user = await User.findById(userId).select('firstName lastName phone').lean();
        if (!user) {
          console.error('User not found for auto-saving prescription');
        } else {
          const customerName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Khách hàng';
          const phoneNumber = user.phone || '';
          
          // Generate unique prescriptionNumber to avoid duplicate key error
          // Format: PRE-{timestamp}-{random}
          const prescriptionNumber = `PRE-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
          
          console.log('Auto-saving prescription with user info:', {
            customerName,
            phoneNumber,
            doctorName: req.body.doctorName || 'Không xác định',
            hospitalName: req.body.hospitalName || 'Không xác định',
            prescriptionNumber,
          });
          
          const newPrescription = new Prescription({
            userId,
            customerName,
            phoneNumber,
            doctorName: req.body.doctorName || 'Không xác định',
            hospitalName: req.body.hospitalName || 'Không xác định',
            prescriptionImage: prescriptionImageFile.path,
            status: 'saved',
            notes: req.body.notes || '',
            prescriptionNumber, // Add unique prescriptionNumber
          } as any); // Use 'as any' if prescriptionNumber is not in interface
          await newPrescription.save();
          savedPrescriptionId = newPrescription._id.toString();
          prescription = newPrescription;
          console.log('Prescription auto-saved after analysis:', savedPrescriptionId);
        }
      } catch (saveError) {
        console.error('Error auto-saving prescription:', saveError);
        // Don't fail the analysis if save fails
      }
    }

    // If prescription exists (from database or newly saved), save analysis result
    // Wrap in try-catch to avoid crashing the request if save fails
    if (prescription) {
      try {
        prescription.notes = prescription.notes || '';
        // Store analysis result in notes or create a separate field
        // For now, we'll add it to notes
        if (analysisResult.foundMedicines && analysisResult.foundMedicines.length > 0) {
          const medicinesList = analysisResult.foundMedicines
            .map((m: any) => `${m.productName} (x${m.quantity || 1})`)
            .join(', ');
          prescription.notes = `${prescription.notes}\n[AI Analysis] Tìm thấy: ${medicinesList}`.trim();
        }
        
        // Note: suggestedMedicines are only returned in response, not saved to database
        await prescription.save();
      } catch (saveError: any) {
        console.warn('⚠️ Error saving analysis result to prescription (continuing with response):', {
          message: saveError?.message,
          name: saveError?.name,
        });
        // Don't fail the request if save fails - analysis result is still valid
      }
    }

    // Format response for frontend - include items ready for order creation
    const orderItems = analysisResult.foundMedicines.map((medicine: any) => ({
      productId: medicine.productId,
      quantity: medicine.quantity || 1,
      productName: medicine.productName,
      price: medicine.price,
    }));

    // Response format compatible with both Backend_ReactSinglepage and Backend_MobileApp
    // analysisResult already contains: foundMedicines, notFoundMedicines, totalEstimatedPrice,
    // requiresConsultation, analysisNotes, confidence, analysisTimestamp, aiModel
    
    // Ensure prescriptionId is always returned if available
    const finalPrescriptionId = savedPrescriptionId || prescription?._id?.toString() || prescriptionId;
    
    console.log('=== Sending Analysis Response ===');
    console.log('Prescription ID in response:', finalPrescriptionId);
    console.log('savedPrescriptionId:', savedPrescriptionId);
    console.log('prescription?._id:', prescription?._id?.toString());
    console.log('prescriptionId from request:', prescriptionId);
    
    res.json({
      success: true,
      data: {
        ...analysisResult,
        prescriptionId: finalPrescriptionId,
        orderItems, // Items ready to create order (for Backend_MobileApp - additional feature)
      },
    });
  } catch (error: any) {
    console.error('Prescription analysis error:', {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
      code: error?.code,
    });
    
    // Determine error type and return appropriate message
    let errorMessage = 'Đã xảy ra lỗi khi phân tích đơn thuốc. Vui lòng thử lại.';
    let statusCode = 500;
    
    if (error?.message?.includes('timeout') || error?.code === 'ECONNABORTED') {
      errorMessage = 'Quá trình phân tích mất quá nhiều thời gian. Vui lòng thử lại.';
      statusCode = 408;
    } else if (error?.message?.includes('network') || error?.code === 'ENOTFOUND' || error?.code === 'ECONNREFUSED') {
      errorMessage = 'Lỗi kết nối mạng. Vui lòng kiểm tra kết nối và thử lại.';
      statusCode = 503;
    } else if (error?.message?.includes('Image') || error?.message?.includes('image') || error?.message?.includes('Ảnh')) {
      errorMessage = error?.message || 'Không thể xử lý ảnh. Vui lòng tải lại ảnh đơn thuốc.';
      statusCode = 400;
    } else if (error?.message?.includes('OCR') || error?.message?.includes('extract') || error?.message?.includes('đọc')) {
      errorMessage = error?.message || 'Không thể đọc nội dung từ ảnh. Vui lòng chụp lại ảnh rõ hơn.';
      statusCode = 400;
    }
    
    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error?.message : undefined,
    });
  }
};

// AI analysis function using OCR and medicine matching
async function performAIAnalysis(prescriptionText?: string, prescriptionImage?: string): Promise<any> {
  const foundMedicines = [];
  const notFoundMedicines = [];
  const prescriptionMedicines: any[] = []; // Raw medicines extracted from OCR/text
  const relatedMedicines: any[] = []; // Similar medicines for suggestions
  const analysisNotes = [];
  let totalEstimatedPrice = 0;
  let requiresConsultation = false;
  let confidence = 0.85;
  let extractedInfo: any = null;

  // Build search terms (brand/generic/dosage) to improve matching consistency with web
  const buildSearchTerms = (originalText: string, cleanText: string) => {
    const terms = new Set<string>();
    const sourceText = cleanText || originalText || '';
    const { baseName, dosage } = parseMedicineName(sourceText);

    // Extract brand name from the last parentheses group if available
    const parenMatches = sourceText.match(/\(([^)]+)\)/g) || [];
    let brandName: string | null = null;
    if (parenMatches.length > 0) {
      const lastParen = parenMatches[parenMatches.length - 1].replace(/[()]/g, '').trim();
      const brandMatch = lastParen.match(/^([A-Za-zÀ-ỹ]+(?:\s+[A-Za-zÀ-ỹ]+)?)/);
      if (brandMatch && brandMatch[1]) {
        brandName = brandMatch[1].trim();
      }
    }

    if (brandName && dosage) terms.add(`${brandName} ${dosage}`);
    if (brandName) terms.add(brandName);
    if (baseName && dosage) terms.add(`${baseName} ${dosage}`);
    if (baseName) terms.add(baseName);
    if (cleanText) terms.add(cleanText);
    if (originalText) terms.add(originalText);

    return Array.from(terms).filter(t => t && t.length > 1);
  };

  // Helper function to fix OCR errors in medicine names (ported from web)
  const fixOcrMedicineNames = (text: string): string => {
    let fixed = text;
    
    // Sửa các tên thuốc phổ biến bị thiếu chữ ở đầu
    const commonFixes: Array<{ pattern: RegExp; replacement: string }> = [
      // "oxicilin" -> "Amoxicilin" (thiếu "Am")
      { pattern: /\boxicilin\b/gi, replacement: 'Amoxicilin' },
      // "moxicilin" -> "Amoxicilin" (thiếu "A")
      { pattern: /\bmoxicilin\b/gi, replacement: 'Amoxicilin' },
      // "cetyl" -> "Acetyl" (thiếu "A")
      { pattern: /\bcetyl\s+leucin\b/gi, replacement: 'Acetyl leucin' },
      // "cetaminophen" -> "Acetaminophen" (thiếu "A")
      { pattern: /\bcetaminophen\b/gi, replacement: 'Acetaminophen' },
      // "aracetamol" -> "Paracetamol" (thiếu "P")
      { pattern: /\baracetamol\b/gi, replacement: 'Paracetamol' },
      // "racetamol" -> "Paracetamol" (thiếu "P")
      { pattern: /\bracetamol\b/gi, replacement: 'Paracetamol' },
    ];
    
    for (const fix of commonFixes) {
      fixed = fixed.replace(fix.pattern, fix.replacement);
    }
    
    return fixed;
  };
  
  // Helper function to clean OCR text (fix character errors, numbers, spaces) - ported from web
  const cleanOcrText = (text: string): string => {
    let cleaned = text;
    
    // Sửa lỗi OCR phổ biến:
    // 1. "l4" -> "14" (chữ "l" thường bị OCR nhầm với số "1")
    cleaned = cleaned.replace(/\bl(\d+)\b/gi, '1$1');
    // 2. "l" đứng trước số (không phải từ) -> "1"
    cleaned = cleaned.replace(/\bl(\d)/gi, '1$1');
    // 3. "I" (chữ I hoa) đứng trước số -> "1"
    cleaned = cleaned.replace(/\bI(\d)/g, '1$1');
    // 4. "|" (pipe) đứng trước số -> "1"
    cleaned = cleaned.replace(/\|(\d)/g, '1$1');
    // 5. Sửa "215g" -> "2,5g" (nếu có context Mezapulgit)
    if (/mezapulgit/i.test(cleaned) && /215g/i.test(cleaned)) {
      cleaned = cleaned.replace(/215g/gi, '2,5g');
    }
    // 6. Sửa format hàm lượng: "-2,5g" -> "- 2,5g" (thêm khoảng trắng sau dấu -)
    cleaned = cleaned.replace(/-(\d+[.,]?\d*\s*(?:mg|g|ml))/gi, '- $1');
    // 7. Sửa format hàm lượng: "+0,3g" -> "+ 0,3g" (thêm khoảng trắng sau dấu +)
    cleaned = cleaned.replace(/\+\s*(\d+[.,]?\d*\s*(?:mg|g|ml))/gi, '+ $1');
    // 8. Sửa "Viên)" -> "Viên" (nếu có dấu ngoặc đóng thừa)
    cleaned = cleaned.replace(/(\d+\s*(?:Viên|Gói|Vién))\)/gi, '$1');
    // 9. Loại bỏ khoảng trắng thừa
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    // 10. Sửa các pattern như "-215g +" -> "- 2,5g +" (nếu có context Mezapulgit)
    if (/mezapulgit/i.test(cleaned)) {
      cleaned = cleaned.replace(/-215g\s*\+/gi, '- 2,5g +');
      cleaned = cleaned.replace(/-2,5g\s*\+\s*0\.3g\s*\+\s*0\.2g/gi, '- 2,5g + 0,3g + 0,2g');
      cleaned = cleaned.replace(/-2,5g\s*\+\s*0,3g\s*\+\s*0,2g/gi, '- 2,5g + 0,3g + 0,2g');
    }
    // 11. Loại bỏ các ký tự lạ ở cuối (như "+" đơn độc không có gì sau, hoặc "-" đơn độc)
    // Nhưng chỉ loại bỏ nếu không có dấu ngoặc mở chưa đóng
    const openParens = (cleaned.match(/\(/g) || []).length;
    const closeParens = (cleaned.match(/\)/g) || []).length;
    if (openParens === closeParens) {
      cleaned = cleaned.replace(/\s*[+\-]\s*$/, '');
    }
    
    return cleaned;
  };

  // Helper function to validate medicine name (ported from web)
  const isValidMedicineName = (text: string): boolean => {
    if (!text || typeof text !== 'string') return false;
    
    // Remove common prefixes/suffixes and clean
    const cleaned = text.trim()
      .replace(/^[\.\s]+/, '') // Remove leading dots/spaces
      .replace(/[\.\s]+$/, '') // Remove trailing dots/spaces
      .trim();
    
    if (cleaned.length < 3) return false;
    
    // STRICT: Check if it's just numbers (like "38", "81467", "38;", "38.")
    if (/^\d+$/.test(cleaned)) return false;
    
    // Check if it's just numbers with separators (like "38;", "38.", "38,", "38 ")
    if (/^\d+[\.\s;,\-]*$/.test(cleaned)) return false;
    
    // Check if it's mostly numbers with only separators
    const numbersOnly = cleaned.replace(/[^\d]/g, '');
    const withoutSeparators = cleaned.replace(/[^\d\.\s;,\-]/g, '');
    if (numbersOnly.length >= 2 && numbersOnly.length === withoutSeparators.length) {
      return false; // It's just numbers with separators
    }
    
    // Check if it starts with dot and numbers (like ". 81467 82196 Bs")
    if (/^\.\s*\d+/.test(cleaned)) return false;
    
    // Check if it contains at least one letter (medicine names should have letters)
    if (!/[a-zA-ZÀ-ỹ]/.test(cleaned)) return false;
    
    // Check if it's too short after cleaning
    const lettersOnly = cleaned.replace(/[^a-zA-ZÀ-ỹ]/g, '');
    if (lettersOnly.length < 3) return false;
    
    // Exclude common non-medicine patterns
    const lowerText = cleaned.toLowerCase();
    if (lowerText.includes('bs') && /^\d/.test(cleaned)) return false; // "Bs" with numbers
    if (lowerText.match(/^\d+\s*(bs|bác\s*sĩ)/i)) return false; // "81467 Bs"
    
    // Additional check: if the text is mostly numbers (more than 70% digits), reject it
    const digitCount = (cleaned.match(/\d/g) || []).length;
    if (digitCount > 0 && (digitCount / cleaned.length) > 0.7 && lettersOnly.length < 5) {
      return false;
    }
    
    return true;
  };

  // Step 1: Extract text from image using OCR if image is provided
  if (prescriptionImage && !prescriptionText) {
    try {
      console.log('🔍 Starting OCR analysis for image:', prescriptionImage);
      
      // If imagePath is a URL (Supabase or external), download it first
      let imagePathForOCR = prescriptionImage;
      if (prescriptionImage.startsWith('http://') || prescriptionImage.startsWith('https://')) {
        console.log('📥 Downloading image from URL for OCR processing...');
        try {
          const axios = (await import('axios')).default;
          const response = await axios.get(prescriptionImage, { responseType: 'arraybuffer' });
          const tempDir = path.join(process.cwd(), 'uploads', 'temp');
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
          }
          const extension = prescriptionImage.includes('.png') ? 'png' : 'jpg';
          const tempFileName = `temp_prescription_${Date.now()}.${extension}`;
          imagePathForOCR = path.join(tempDir, tempFileName);
          fs.writeFileSync(imagePathForOCR, Buffer.from(response.data));
          console.log('✅ Image downloaded to:', imagePathForOCR);
        } catch (downloadError: any) {
          console.error('❌ Error downloading image from URL:', downloadError.message);
          throw new Error('Không thể tải ảnh từ URL để phân tích. Vui lòng thử lại.');
        }
      }
      
      // Check if file exists (for local paths) or use downloaded path
      const fileExists = fs.existsSync(imagePathForOCR);
      if (fileExists) {
        // Use processPrescriptionImage to get OCR + Gemini correction + extract info
        // This will automatically use Gemini if available
        extractedInfo = await processPrescriptionImage(imagePathForOCR);
        prescriptionText = extractedInfo.rawText;
        
        // Clean up temp file if downloaded from URL
        if (imagePathForOCR !== prescriptionImage && imagePathForOCR.includes('temp_prescription_')) {
          try {
            fs.unlinkSync(imagePathForOCR);
            console.log('✅ Cleaned up temp downloaded image');
          } catch (cleanupError) {
            console.warn('⚠️ Error cleaning up temp file:', cleanupError);
          }
        }
        
        // Only add note if OCR was successful - no need for technical details
        console.log('✅ OCR completed. Extracted text length:', prescriptionText.length);
      } else {
        console.warn('⚠️ Image file not found:', prescriptionImage);
        analysisNotes.push('⚠️ Không thể đọc được ảnh đơn thuốc');
      }
    } catch (error: any) {
      console.error('❌ OCR Error:', error.message);
      analysisNotes.push('⚠️ Không thể đọc được ảnh đơn thuốc');
      // Continue with basic analysis even if OCR fails
    }
  }

  // Step 2: Parse prescription text to extract medicine names (with line merging and OCR fixes)
  if (prescriptionText) {
    const lines = prescriptionText.split('\n').map(line => line.trim()).filter(line => line.length > 2);
    
    // Find medicine section start (from "Thuốc điều trị" or numbered list)
    let medicineSectionStartIndex = -1;
    const medicineSectionKeywords = [
      'thuốc điều trị', 'thuốc điều tri', 'thuoc dieu tri', 'thuoc dieu trị',
      'thuốc điều tri', 'thuoc điều trị'
    ];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const lowerLine = line.toLowerCase();
      if (medicineSectionKeywords.some(keyword => lowerLine.includes(keyword))) {
        medicineSectionStartIndex = i;
        console.log(`✅ Found "Thuốc điều trị" at line ${i + 1}: "${line}"`);
        break;
      }
    }
    
    // If not found, find numbered list pattern
    if (medicineSectionStartIndex === -1) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        if (/^\d+[\.\)]\s*[A-ZÀ-Ỹ]/.test(line) || 
            /^\d+[\.\)]\s*[a-zA-ZÀ-ỹ]+.*\d+\s*(mg|g|ml|l|mcg|iu|ui|%)/i.test(line)) {
          medicineSectionStartIndex = i;
          console.log(`✅ Found medicine section at line ${i + 1} (starts with number): "${line}"`);
          break;
        }
      }
    }
    
    if (medicineSectionStartIndex === -1) {
      medicineSectionStartIndex = 0;
      console.log(`⚠️ Could not find "Thuốc điều trị" section, starting from line 1`);
    }
    
    // Determine stop point (when encountering non-medicine sections)
    const stopKeywords = [
      'lời dặn', 'lời dan', 'loi dan', 'loi dặn',
      'bác sĩ', 'bác sy', 'bac si', 'bac sy',
      'y sĩ', 'y sỹ', 'y si', 'y sy',
      'khám bệnh lại', 'khám bệnh lai',
      'số điện thoại liên hệ', 'so dien thoai lien he',
      'họ và tên người đưa trẻ', 'ho va ten nguoi dua tre',
      'đã cấp thuốc', 'da cap thuoc',
      'cộng khoản', 'cong khoan'
    ];
    
    let medicineSectionEndIndex = lines.length;
    for (let i = medicineSectionStartIndex; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const lowerLine = line.toLowerCase();
      
      // Skip usage info (Sáng:, Chiều:, etc.)
      const isUsageInfo = /(sáng|chiều|chiêu|tối|trưa)\s*:\s*\d+\s*(viên|vién|gói|vi|ml|mg)/i.test(line) ||
                          /\d+\s*(viên|vién|gói)\s*\/\s*(ngày|ngdy)/i.test(line) ||
                          /\[.*(viên|vién|gói).*\]/i.test(line) ||
                          /(viên|vién|gói)\s*\/\s*(ngày|ngdy)/i.test(line) ||
                          /(sáng|chiều|chiêu|tối|trưa).*:\s*\d+/i.test(line);
      
      if (isUsageInfo) {
        console.log(`   ℹ️ Skipped usage info line (not a stop keyword): "${line}"`);
        continue;
      }
      
      // Check stop keywords
      if (stopKeywords.some(keyword => lowerLine.includes(keyword))) {
        const hasUsagePattern = /(sáng|chiều|chiêu|tối|trưa).*:\s*\d+.*(viên|vién|gói)/i.test(line) ||
                                /\d+\s*(viên|vién|gói).*\//i.test(line);
        
        if (!hasUsagePattern) {
          medicineSectionEndIndex = i;
          console.log(`✅ Found stop keyword at line ${i + 1}: "${line}"`);
          break;
        }
      }
    }
    
    console.log(`📋 Medicine section: lines ${medicineSectionStartIndex + 1} to ${medicineSectionEndIndex}`);
    
    // Merge lines (handle OCR line breaks) - ported from web
    const mergedLines: Array<{ text: string; lineIndex: number }> = [];
    let currentMedicineLine = '';
    let currentLineIndex = -1;
    
    for (let lineIndex = medicineSectionStartIndex; lineIndex < medicineSectionEndIndex; lineIndex++) {
      const line = lines[lineIndex];
      if (!line) continue;
      
      // Skip non-medicine lines
      if (line.includes('ĐƠN THUỐC') || 
          line.includes('Họ tên') || 
          line.includes('Tuổi') || 
          (line.includes('Chẩn đoán') && !line.match(/^\d+[\.\)]/))) {
        continue;
      }
      
      // If line starts with number, it's a new medicine
      if (/^\d+[\.\)]?\s*[A-ZÀ-Ỹ]/.test(line) || /^\d+\s+[A-ZÀ-Ỹ]/.test(line)) {
        // Save previous line
        if (currentMedicineLine && currentLineIndex >= 0) {
          mergedLines.push({ text: currentMedicineLine.trim(), lineIndex: currentLineIndex });
        }
        // Start new line
        currentMedicineLine = line;
        currentLineIndex = lineIndex;
      } else if (currentMedicineLine) {
        // Check if this line is continuation of current medicine
        const isUsageInfo = /^(sáng|chiều|tối|trưa|chiêu)\s*:/i.test(line.trim());
        
        const looksLikeMedicineContinuation = /[a-zA-ZÀ-ỹ]/.test(line) && 
          (!isUsageInfo) &&
          (
            /^[a-zà-ỹ]/.test(line.trim()) ||
            /^\s*\+/.test(line.trim()) ||
            /\d+[.,]?\d*\s*(mg|g|ml|viên|gói)/i.test(line) ||
            /\)/.test(line) ||
            /(mg|g|ml|viên|gói|acid|clavulanic|amoxicilin|paracetamol|acetyl|leucin|attapulgit|mezapulgit|hydroxyd|magnesi|carbonat)/i.test(line)
          );
        
        const hasUnclosedParenthesis = (currentMedicineLine.match(/\(/g) || []).length > (currentMedicineLine.match(/\)/g) || []).length;
        const endsWithPlusOrMinus = /[+\-]\s*$/.test(currentMedicineLine.trim());
        const definitelyContinuation = hasUnclosedParenthesis || endsWithPlusOrMinus;
        
        if (looksLikeMedicineContinuation || definitelyContinuation) {
          currentMedicineLine += ' ' + line;
        } else {
          // Save current and reset
          if (currentMedicineLine && currentLineIndex >= 0) {
            mergedLines.push({ text: currentMedicineLine.trim(), lineIndex: currentLineIndex });
          }
          currentMedicineLine = '';
          currentLineIndex = -1;
        }
      } else {
        // Check if line looks like medicine without number prefix
        const looksLikeMedicine = /[a-zA-ZÀ-ỹ]/.test(line) && 
          !/^(sáng|chiều|tối|trưa|chiêu)\s*:/i.test(line.trim()) &&
          (
            /(amoxicilin|paracetamol|acetyl|leucin|attapulgit|mezapulgit|acid|clavulanic|dopagan|gikanin)/i.test(line) ||
            /\d+\s*(mg|g|ml|viên|gói)/i.test(line) ||
            /\([A-Za-zÀ-ỹ]+/.test(line)
          );
        
        if (looksLikeMedicine) {
          // Check if continuation of last medicine
          let isContinuation = false;
          if (mergedLines.length > 0) {
            const lastMedicineEntry = mergedLines[mergedLines.length - 1];
            if (lastMedicineEntry && lastMedicineEntry.text) {
              const lastMedicine = lastMedicineEntry.text;
              const openParens = (lastMedicine.match(/\(/g) || []).length;
              const closeParens = (lastMedicine.match(/\)/g) || []).length;
              const trimmedLast = lastMedicine.trim();
              if (trimmedLast && (openParens > closeParens || trimmedLast.endsWith('+') || trimmedLast.endsWith('-'))) {
                lastMedicineEntry.text += ' ' + line;
                isContinuation = true;
                console.log(`   ℹ️ Merged continuation line to previous medicine: "${line}"`);
              }
            }
          }
          
          if (!isContinuation) {
            const nextNumber = mergedLines.length + 1;
            const medicineLineWithNumber = `${nextNumber} ${line}`;
            currentMedicineLine = medicineLineWithNumber;
            currentLineIndex = lineIndex;
            console.log(`   ℹ️ Auto-added number ${nextNumber} to medicine line: "${line}"`);
          }
        }
      }
    }
    
    // Save last line
    if (currentMedicineLine && currentLineIndex >= 0) {
      mergedLines.push({ text: currentMedicineLine.trim(), lineIndex: currentLineIndex });
    }
    
    // Apply OCR fixes to merged lines
    for (const lineEntry of mergedLines) {
      if (lineEntry && lineEntry.text) {
        const original = lineEntry.text;
        const fixed = fixOcrMedicineNames(original);
        if (fixed !== original) {
          console.log(`   🔧 Fixed OCR error: "${original.substring(0, 50)}..." -> "${fixed.substring(0, 50)}..."`);
          lineEntry.text = fixed;
        }
      }
    }
    
    console.log(`📋 Merged ${mergedLines.length} medicine lines from ${medicineSectionEndIndex - medicineSectionStartIndex} original lines`);
    
    // Extract medicine names from merged lines
    const allMedicineMatches: Array<{ text: string; lineIndex: number }> = [];
    
    for (const { text: line, lineIndex } of mergedLines) {
      // Find all medicine patterns in the line (support both "1." and "1)" formats)
      const medicinePattern = /\d+[\.\)]?\s*((?:(?!\s*\d+[\.\)]).)+?)(?=\s*\d+[\.\)]|$)/g;
      let match;
      let foundAny = false;
      
      medicinePattern.lastIndex = 0;
      
      while ((match = medicinePattern.exec(line)) !== null) {
        foundAny = true;
        const medicineText = match[1]?.trim();
        
        if (medicineText && medicineText.length > 2) {
          const cleaned = medicineText.replace(/^[\.\s]+/, '').replace(/[\.\s]+$/, '').trim();
          if (!/^\d+$/.test(cleaned) && /[a-zA-ZÀ-ỹ]/.test(cleaned)) {
            allMedicineMatches.push({
              text: medicineText,
              lineIndex
            });
            console.log(`   Found medicine pattern: "${medicineText}"`);
          } else {
            console.log(`   ⚠️ Skipped invalid pattern (numbers only): "${medicineText}"`);
          }
        }
      }
      
      // If no pattern match found, try simple pattern at start of line
      if (!foundAny) {
        const simpleMatch = line.match(/^\d+[\.\)]?\s*(.+)/);
        if (simpleMatch && simpleMatch[1]) {
          const medicineText = simpleMatch[1].trim();
          
          if (medicineText && medicineText.length > 2) {
            const cleaned = medicineText.replace(/^[\.\s]+/, '').replace(/[\.\s]+$/, '').trim();
            if (!/^\d+$/.test(cleaned) && /[a-zA-ZÀ-ỹ]/.test(cleaned)) {
              allMedicineMatches.push({
                text: medicineText,
                lineIndex
              });
              console.log(`   Found medicine at start of line: "${medicineText}"`);
            } else {
              console.log(`   ⚠️ Skipped invalid pattern (numbers only): "${medicineText}"`);
            }
          }
        }
      }
    }
    
    console.log(`🔍 Found ${allMedicineMatches.length} medicine patterns in text`);
    
    // Filter valid medicines using isValidMedicineName
    const validMedicines = allMedicineMatches.filter(({ text }) => {
      if (!isValidMedicineName(text)) return false;
      
      // Additional filtering: exclude non-medicine keywords
      const lowerText = text.toLowerCase().trim();
      const nonMedicineKeywords = [
        'thuốc điều trị', 'thuốc điều tri', 'cách dùng', 'cách dung',
        'uống', 'dùng ngoài', 'sáng', 'chiều', 'tối', 'trưa', 'sl:',
        'ghi chú', 'lời dặn', 'chẩn đoán', 'họ tên', 'tuổi', 'giới tính',
        'địa chỉ', 'điện thoại', 'mã số', 'bảo hiểm', 'nơi thường trú',
        'bác sĩ', 'bác sy', 'y sĩ', 'khám bệnh', 'tên đơn vị', 'cơ sở',
        'đơn thuốc', 'đơn vị', 'số định danh', 'căn cước', 'hộ chiếu',
        'người bệnh', 'nếu có', 'néu có', 'ton thương', 'tổn thương',
        'nông', 'ở cô', 'cổ', 'tay', 'bàn tay', 'thoái hóa', 'cột sống', 'viêm khớp'
      ];
      
      // Check if starts with non-medicine keyword
      const startsWithKeyword = nonMedicineKeywords.some(keyword => {
        if (lowerText.startsWith(keyword + ':') || lowerText.startsWith(keyword + ' ')) {
          const afterKeyword = text.substring(text.toLowerCase().indexOf(keyword) + keyword.length).trim();
          if (afterKeyword.length < 3 || 
              /^[\d\s:;,\-|\.x]+$/.test(afterKeyword) ||
              /^\.\s*x?$/.test(afterKeyword) ||
              /^[\d\s:;,\-|]+$/.test(afterKeyword) ||
              /^\d+$/.test(afterKeyword) ||
              (/^[A-Z\s,]+$/.test(afterKeyword) && afterKeyword.length > 20)) {
            return true;
          }
        }
        if (lowerText === keyword || lowerText === keyword + ':' || 
            /^thuốc\s+điều\s+trị\s*[:.]\s*\.?\s*x?$/i.test(lowerText)) {
          return true;
        }
        return false;
      });
      
      if (startsWithKeyword) {
        console.log(`   ⚠️ Skipped non-medicine text (starts with non-medicine keyword): "${text}"`);
        return false;
      }
      
      // Exclude doctor information
      if (lowerText.includes('bác sy') || lowerText.includes('bác sĩ') || 
          lowerText.includes('y sỹ') || lowerText.includes('y sĩ') ||
          (lowerText.includes('khám bệnh') && !/[a-zA-ZÀ-ỹ]{5,}/.test(text))) {
        console.log(`   ⚠️ Skipped non-medicine text (doctor information): "${text}"`);
        return false;
      }
      
      // Exclude phone numbers
      const isPhoneNumber = /^[\d\s\-\(\)]+$/.test(text.trim()) && 
                            text.trim().replace(/\D/g, '').length >= 7 &&
                            text.trim().replace(/\D/g, '').length <= 15;
      if (isPhoneNumber) {
        console.log(`   ⚠️ Skipped phone number: "${text}"`);
        return false;
      }
      
      // Exclude diagnosis codes
      if (/^[A-Z]\d+\.?\d*/.test(text.trim()) && !/[a-zA-ZÀ-ỹ]{5,}/.test(text)) {
        console.log(`   ⚠️ Skipped diagnosis code (not medicine): "${text}"`);
        return false;
      }
      
      return true;
    });
    
    console.log(`✅ Filtered to ${validMedicines.length} valid medicine names (removed ${allMedicineMatches.length - validMedicines.length} invalid patterns)`);
    
    // Process each valid medicine in parallel for better performance
    const processMedicine = async ({ text: medicineText, lineIndex }: { text: string; lineIndex: number }) => {
      console.log(`\n📋 Processing medicine from line ${lineIndex + 1}: "${medicineText}"`);
      
      const result: {
        prescriptionMedicine?: any;
        foundMedicine?: any;
        notFoundMedicine?: any;
        relatedMedicines?: any[];
        price?: number;
        notes?: string[];
        requiresConsultation?: boolean;
      } = {};
      
      if (medicineText && medicineText.length > 2) {
        // Remove usage instructions
        let medicineNameOnly = medicineText;
        const usagePatterns = [
          /\s*-\s*(?:Sáng|Tối|Trưa|Chiều|Ngày)/i,
          /\s*SL:\s*\d+/i,
          /\s*Ghi\s+chú:/i,
          /\s*Uống:/i,
          /\s*Cách\s+dùng:/i,
        ];
        
        for (const pattern of usagePatterns) {
          const match = medicineNameOnly.match(pattern);
          if (match && match.index !== undefined) {
            medicineNameOnly = medicineNameOnly.substring(0, match.index).trim();
            break;
          }
        }
        
        if (medicineNameOnly.length < 3 || !/[a-zA-ZÀ-ỹ]{3,}/.test(medicineNameOnly)) {
          console.log(`   ⚠️ Skipped invalid medicine name (too short or no letters): "${medicineNameOnly}"`);
          return result;
        }
        
        // Clean OCR text
        const cleanedText = cleanOcrText(medicineNameOnly);
        
        // Extract quantity
        const quantityMatch = medicineText.match(/SL\s*:\s*(\d+)|(\d+)\s*(viên|hộp|chai|gói|lọ|tuýp|tuyp)/i);
        const quantity = quantityMatch ? parseInt(quantityMatch[1] || quantityMatch[2]) || 1 : 1;
        
        // Remove quantity from medicine name for matching
        const cleanMedicineText = cleanedText
          .replace(/SL\s*:\s*\d+/gi, '')
          .replace(/x\s*\d+/gi, '')
          .replace(/\d+\s*(viên|hộp|chai|gói|lọ|tuýp|tuyp)/gi, '')
          .replace(/:\s*\d+\s*(viên|hộp|chai|gói|lọ|tuýp|tuyp)/gi, '')
          .trim();
        
        if (cleanMedicineText.length < 2) return result;
        
        // Add to prescriptionMedicines list
        result.prescriptionMedicine = {
          originalText: medicineText,
          cleanText: cleanMedicineText,
          quantity: quantity
        };
        
        // Step 3: Find exact match using medicine matching service (multi search terms)
        const searchTerms = buildSearchTerms(medicineText, cleanMedicineText);
        let exactMatch: any = null;
        let matchedSearchTerm: string | null = null;
        for (const term of searchTerms) {
          const match = await findExactMatch(term, medicineText);
          if (match && match.product) {
            exactMatch = match;
            matchedSearchTerm = term;
            break;
          }
        }
        
        if (exactMatch && exactMatch.product) {
          const product = exactMatch.product;

          const originalParsed = parseMedicineName(cleanMedicineText);
          const productParsed = parseMedicineName(product.name || '');
          const sameDosage = isSameDosage(originalParsed.dosage, productParsed.dosage);

          let matchReason = 'same_name';
          if (sameDosage) {
            matchReason = 'same_name_same_dosage';
          } else if (originalParsed.dosage || productParsed.dosage) {
            matchReason = 'same_name_different_dosage';
          }

          const activeIngredient = product.activeIngredient || product.genericName;
          const groupTherapeutic = product.groupTherapeutic;
          const medicineInfo = await fetchMedicineInfo(product.name || '');
          const contraindication =
            (medicineInfo &&
              (medicineInfo.contraindication ||
                medicineInfo.chongChiDinh ||
                medicineInfo.contraindications)) ||
            undefined;
          const indication =
            product.indication ||
            product.description ||
            (medicineInfo &&
              (medicineInfo.indication ||
                medicineInfo.description ||
                medicineInfo.uses ||
                medicineInfo.congDung)) ||
            undefined;
          const medicineKeyForCheck = normalizeForComparison(product.name || cleanMedicineText);

          result.foundMedicine = {
            productId: product._id,
            productName: product.name,
            price: product.price,
            unit: product.unit,
            inStock: product.inStock,
            stockQuantity: product.stockQuantity,
            requiresPrescription: product.isPrescription,
            confidence: exactMatch.confidence,
            originalText: medicineText,
            quantity: quantity,
            matchType: exactMatch.matchType,
            matchReason,
            activeIngredient,
            groupTherapeutic,
            contraindication: contraindication || undefined,
            indication,
            medicineKeyForCheck, // For duplicate checking
          };
          result.price = product.price * quantity;
          
          if (product.isPrescription) {
            result.notes = [`⚠️ Một số thuốc cần đơn bác sĩ`];
            result.requiresConsultation = true;
          }
          
          if (product.stockQuantity < 10) {
            if (!result.notes) result.notes = [];
            result.notes.push(`⚠️ Một số thuốc sắp hết hàng`);
          }
        } else {
          // Step 4: Use AI to analyze medicine and get 4 conditions (category, subcategory, dosageForm, route)
          console.log(`🤖 Using AI to analyze medicine: "${cleanMedicineText}"`);
          const originalParsed = parseMedicineName(cleanMedicineText);
          const extractedDosage = originalParsed.dosage;
          const aiAnalysis = await analyzeMedicineWithAI(cleanMedicineText, extractedDosage || undefined);
          console.log(`🤖 AI Analysis Result:`, aiAnalysis);
          
          // Extract 4 conditions from AI analysis (like Web - ưu tiên AI, sau đó sẽ bổ sung từ DB nếu thiếu)
          let targetCategory = aiAnalysis.category || '';
          let targetSubcategory = aiAnalysis.subcategory || '';
          let targetDosageForm = aiAnalysis.dosageForm || '';
          let targetRoute = aiAnalysis.route || '';
          
          // Parse route và dosageForm từ prescription text nếu AI không có (like Web)
          // QUAN TRỌNG: Sử dụng toàn bộ text (medicineText, cleanedText, medicineNameOnly) để có đầy đủ thông tin
          // Không chỉ dùng cleanMedicineText vì có thể đã bị clean quá nhiều, mất mất thông tin quan trọng
          const originalTextLower = (medicineNameOnly || medicineText || cleanedText || cleanMedicineText || '').toLowerCase();
          const isTopicalOriginal = /%\/\s*g|\bgel\b|\bemulgel\b|\bcream\b|\bkem\b|\bthuốc\s*bôi\b|\bthuoc\s*boi\b|\btuýp\b|\btuyp\b|\bointment\b|\bmỡ\b|\bmo\b/i.test(originalTextLower);
          // Sử dụng toàn bộ text để parse route và dosageForm (like Web)
          const fullTextForRoute = ((medicineText || '') + ' ' + (cleanedText || '') + ' ' + (medicineNameOnly || '') + ' ' + (cleanMedicineText || '')).toLowerCase();
          const fullTextForDosageForm = ((medicineText || '') + ' ' + (cleanedText || '') + ' ' + (medicineNameOnly || '') + ' ' + (cleanMedicineText || '')).toLowerCase();
          
          // Parse route từ prescription text nếu AI không có
          if (!targetRoute) {
            if (/dùng\s+ngoài|dung\s+ngoai|topical/i.test(fullTextForRoute) || isTopicalOriginal) {
              targetRoute = 'Dùng ngoài';
              console.log(`   🔍 Parsed route from prescription text: "Dùng ngoài"`);
            } else if (/uống|uong|oral/i.test(fullTextForRoute)) {
              targetRoute = 'Uống';
              console.log(`   🔍 Parsed route from prescription text: "Uống"`);
            }
          }
          
          // Parse dosageForm từ prescription text nếu AI không có
          if (!targetDosageForm) {
            if (/gel|emulgel/i.test(fullTextForDosageForm)) {
              targetDosageForm = 'Gel';
              console.log(`   🔍 Parsed dosageForm from prescription text: "Gel"`);
            } else if (/cream|kem/i.test(fullTextForDosageForm)) {
              targetDosageForm = 'Cream';
              console.log(`   🔍 Parsed dosageForm from prescription text: "Cream"`);
            } else if (/ointment|mỡ|mo/i.test(fullTextForDosageForm)) {
              targetDosageForm = 'Ointment';
              console.log(`   🔍 Parsed dosageForm from prescription text: "Ointment"`);
            } else if (/tuýp|tuyp|tube/i.test(fullTextForDosageForm)) {
              if (isTopicalOriginal || targetRoute === 'Dùng ngoài') {
                targetDosageForm = 'Gel';
              } else {
                targetDosageForm = 'Tube';
              }
              console.log(`   🔍 Parsed dosageForm from prescription text: "${targetDosageForm}"`);
            } else if (/viên|vien|tablet/i.test(fullTextForDosageForm)) {
              targetDosageForm = 'Tablet';
              console.log(`   🔍 Parsed dosageForm from prescription text: "Tablet"`);
            } else if (/capsule|nang/i.test(fullTextForDosageForm)) {
              targetDosageForm = 'Capsule';
              console.log(`   🔍 Parsed dosageForm from prescription text: "Capsule"`);
            }
          }
          
          // Nếu vẫn chưa có route/dosageForm và có dấu hiệu dạng bôi, set mặc định
          if (!targetRoute && isTopicalOriginal) {
            targetRoute = 'Dùng ngoài';
            console.log(`   🔍 Set route to "Dùng ngoài" based on topical indicators`);
          }
          if (!targetDosageForm && isTopicalOriginal) {
            targetDosageForm = 'Gel';
            console.log(`   🔍 Set dosageForm to "Gel" based on topical indicators`);
          }
          
          const hasAll4TargetConditions = !!(targetCategory && targetSubcategory && targetDosageForm && targetRoute);
          
          if (!hasAll4TargetConditions) {
            console.log(`⚠️  THIẾU 4 ĐIỀU KIỆN BẮT BUỘC - Không thể đề xuất thuốc`);
            console.log(`   Category: ${targetCategory || 'N/A'}`);
            console.log(`   Subcategory: ${targetSubcategory || 'N/A'}`);
            console.log(`   DosageForm: ${targetDosageForm || 'N/A'}`);
            console.log(`   Route: ${targetRoute || 'N/A'}`);
            // Vẫn tạo suggestions nhưng sẽ filter sau
          } else {
            console.log(`✅ ĐỦ 4 ĐIỀU KIỆN - Sẽ chỉ đề xuất thuốc khớp CẢ 4 điều kiện`);
            console.log(`   Category: ${targetCategory}`);
            console.log(`   Subcategory: ${targetSubcategory}`);
            console.log(`   DosageForm: ${targetDosageForm}`);
            console.log(`   Route: ${targetRoute}`);
          }
          
          // Find medicines from medicines collection based on 4 conditions (like Web)
          let similarMedicines: any[] = [];
          let suggestions: any[] = [];
          
          // LUÔN tìm targetMedicine từ DB để bổ sung 4 điều kiện nếu AI thiếu (like Web)
          console.log(`🔍 Searching medicines collection by indication/groupTherapeutic/activeIngredient...`);
          const db = mongoose.connection.db;
          if (db) {
            const medicinesCollection = db.collection('medicines');
            
            // Step 1: Find targetMedicine to get activeIngredient and other info (ALWAYS, not just when hasAll4TargetConditions)
            let targetMedicine: any = null;
            let targetGroupTherapeutic = '';
            let targetActiveIngredient = '';
            let activeIngredientToSearch = '';
            let targetIndication = '';
            
            // Parse medicine name to get genericName
            const parsedName = parseMedicineName(cleanMedicineText);
            const genericName = parsedName.baseName;
            
            // Try to find targetMedicine in medicines collection
            const searchTermsForTarget = [
              genericName,
              cleanMedicineText,
              ...(cleanMedicineText ? cleanMedicineText.split(/\s+/).filter(w => w.length > 3) : [])
            ].filter(Boolean);
            
            for (const searchTerm of searchTermsForTarget) {
              if (searchTerm && searchTerm.length > 2) {
                const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                targetMedicine = await medicinesCollection.findOne({
                  $or: [
                    { name: { $regex: `^${escapedSearchTerm}`, $options: 'i' } },
                    { genericName: { $regex: `^${escapedSearchTerm}`, $options: 'i' } },
                    { name: { $regex: escapedSearchTerm, $options: 'i' } },
                    { genericName: { $regex: escapedSearchTerm, $options: 'i' } },
                    { activeIngredient: { $regex: escapedSearchTerm, $options: 'i' } }
                  ]
                });
                
                if (targetMedicine) {
                  // Kiểm tra xem targetMedicine có đúng không (tên phải chứa searchTerm)
                  const targetNameLower = (targetMedicine.name || '').toLowerCase();
                  const targetGenericNameLower = (targetMedicine.genericName || '').toLowerCase();
                  const searchTermLower = searchTerm.toLowerCase();
                  
                  // Chỉ dùng targetMedicine nếu tên hoặc genericName chứa searchTerm (tránh match sai)
                  const isCorrectMatch = targetNameLower.includes(searchTermLower) || 
                                        targetGenericNameLower.includes(searchTermLower) ||
                                        (targetMedicine.activeIngredient || '').toLowerCase().includes(searchTermLower);
                  
                  if (isCorrectMatch) {
                    // CHỈ dùng dữ liệu từ medicines collection nếu AI chưa có hoặc không đầy đủ
                    // ƯU TIÊN: Dữ liệu từ AI analysis (đã được set ở trên)
                    if (!targetGroupTherapeutic) {
                      targetGroupTherapeutic = targetMedicine.groupTherapeutic || '';
                    }
                    if (!targetIndication) {
                      targetIndication = targetMedicine.indication || targetMedicine.description || targetMedicine.uses || targetMedicine.congDung || '';
                    }
                    if (!targetActiveIngredient) {
                      targetActiveIngredient = targetMedicine.activeIngredient || '';
                    }
                    // QUAN TRỌNG: Lấy 4 điều kiện từ medicines collection nếu AI chưa có (like Web)
                    if (!targetSubcategory && targetMedicine.subcategory) {
                      targetSubcategory = targetMedicine.subcategory;
                      console.log(`   ✅ Using subcategory from DB: "${targetSubcategory}"`);
                    }
                    if (!targetCategory && targetMedicine.category) {
                      targetCategory = targetMedicine.category;
                      console.log(`   ✅ Using category from DB: "${targetCategory}"`);
                    }
                    if (!targetDosageForm && targetMedicine.dosageForm) {
                      targetDosageForm = targetMedicine.dosageForm;
                      console.log(`   ✅ Using dosageForm from DB: "${targetDosageForm}"`);
                    }
                    if (!targetRoute && targetMedicine.route) {
                      targetRoute = targetMedicine.route;
                      console.log(`   ✅ Using route from DB: "${targetRoute}"`);
                    }
                    if (targetMedicine.activeIngredient) {
                      activeIngredientToSearch = targetMedicine.activeIngredient.toLowerCase();
                    } else if (genericName && genericName.length > 3) {
                      activeIngredientToSearch = genericName.toLowerCase();
                    }
                    // FALLBACK: Infer subcategory từ category, groupTherapeutic, hoặc medicine name nếu vẫn chưa có
                    if (!targetSubcategory) {
                      // Infer từ groupTherapeutic
                      if (targetGroupTherapeutic) {
                        const groupLower = targetGroupTherapeutic.toLowerCase();
                        if (groupLower.includes('corticosteroid') || groupLower.includes('cortico') || groupLower.includes('steroid')) {
                          targetSubcategory = 'Corticosteroid';
                          console.log(`   🔍 Inferred subcategory from groupTherapeutic: "Corticosteroid"`);
                        } else if (groupLower.includes('nsaid') || groupLower.includes('anti-inflammatory') || groupLower.includes('kháng viêm')) {
                          targetSubcategory = 'NSAID';
                          console.log(`   🔍 Inferred subcategory from groupTherapeutic: "NSAID"`);
                        } else if (groupLower.includes('paracetamol') || groupLower.includes('acetaminophen')) {
                          targetSubcategory = 'Paracetamol';
                          console.log(`   🔍 Inferred subcategory from groupTherapeutic: "Paracetamol"`);
                        }
                      }
                      
                      // Infer từ category nếu vẫn chưa có
                      if (!targetSubcategory && targetCategory) {
                        const categoryLower = targetCategory.toLowerCase();
                        if (categoryLower.includes('nội tiết') || categoryLower.includes('hormone')) {
                          // Có thể là Corticosteroid nếu tên thuốc có dấu hiệu
                          const medicineNameLower = (targetMedicine.name || '').toLowerCase();
                          if (medicineNameLower.includes('prednisolon') || medicineNameLower.includes('prednisone') || 
                              medicineNameLower.includes('dexamethason') || medicineNameLower.includes('hydrocortison')) {
                            targetSubcategory = 'Corticosteroid';
                            console.log(`   🔍 Inferred subcategory from category + medicine name: "Corticosteroid"`);
                          }
                        } else if (categoryLower.includes('cơ xương khớp') || categoryLower.includes('giảm đau')) {
                          // Có thể là NSAID
                          const medicineNameLower = (targetMedicine.name || '').toLowerCase();
                          if (medicineNameLower.includes('diclofenac') || medicineNameLower.includes('ibuprofen') || 
                              medicineNameLower.includes('meloxicam') || medicineNameLower.includes('celecoxib') ||
                              medicineNameLower.includes('etoricoxib') || medicineNameLower.includes('naproxen')) {
                            targetSubcategory = 'NSAID';
                            console.log(`   🔍 Inferred subcategory from category + medicine name: "NSAID"`);
                          }
                        }
                      }
                      
                      // Infer từ medicine name nếu vẫn chưa có
                      if (!targetSubcategory) {
                        const medicineNameLower = (targetMedicine.name || genericName || cleanMedicineText || '').toLowerCase();
                        if (medicineNameLower.includes('prednisolon') || medicineNameLower.includes('prednisone') || 
                            medicineNameLower.includes('dexamethason') || medicineNameLower.includes('hydrocortison') ||
                            medicineNameLower.includes('methylprednisolon') || medicineNameLower.includes('betamethason')) {
                          targetSubcategory = 'Corticosteroid';
                          console.log(`   🔍 Inferred subcategory from medicine name: "Corticosteroid"`);
                        } else if (medicineNameLower.includes('paracetamol') || medicineNameLower.includes('acetaminophen') ||
                                   medicineNameLower.includes('panadol') || medicineNameLower.includes('efferalgan')) {
                          targetSubcategory = 'Paracetamol';
                          console.log(`   🔍 Inferred subcategory from medicine name: "Paracetamol"`);
                        } else if (medicineNameLower.includes('diclofenac') || medicineNameLower.includes('ibuprofen') || 
                                   medicineNameLower.includes('meloxicam') || medicineNameLower.includes('celecoxib') ||
                                   medicineNameLower.includes('etoricoxib') || medicineNameLower.includes('naproxen') ||
                                   medicineNameLower.includes('voltaren')) {
                          targetSubcategory = 'NSAID';
                          console.log(`   🔍 Inferred subcategory from medicine name: "NSAID"`);
                        }
                      }
                    }
                    
                    console.log(`🔍 Found target medicine in medicines collection: ${targetMedicine.name}`);
                    console.log(`   Indication: ${targetIndication}`);
                    console.log(`   GroupTherapeutic: ${targetGroupTherapeutic}`);
                    console.log(`   ActiveIngredient: ${targetActiveIngredient}`);
                    console.log(`   Subcategory: ${targetSubcategory || 'N/A'} ${aiAnalysis?.subcategory ? '(from AI)' : (targetMedicine.subcategory ? '(from DB)' : '(inferred)')}`);
                    console.log(`   Category: ${targetCategory || 'N/A'} ${aiAnalysis?.category ? '(from AI)' : '(from DB)'}`);
                    console.log(`   DosageForm: ${targetDosageForm || 'N/A'} ${aiAnalysis?.dosageForm ? '(from AI)' : '(from DB)'}`);
                    console.log(`   Route: ${targetRoute || 'N/A'} ${aiAnalysis?.route ? '(from AI)' : '(from DB)'}`);
                    break;
                  }
                }
              }
            }
            
            // FALLBACK: Nếu vẫn thiếu subcategory sau khi tìm targetMedicine, thử infer từ các nguồn khác
            if (!targetSubcategory && targetMedicine) {
              // Infer từ groupTherapeutic
              if (targetGroupTherapeutic) {
                const groupLower = targetGroupTherapeutic.toLowerCase();
                if (groupLower.includes('corticosteroid') || groupLower.includes('cortico') || groupLower.includes('steroid')) {
                  targetSubcategory = 'Corticosteroid';
                  console.log(`   🔍 Inferred subcategory from groupTherapeutic (after DB lookup): "Corticosteroid"`);
                } else if (groupLower.includes('nsaid') || groupLower.includes('anti-inflammatory') || groupLower.includes('kháng viêm')) {
                  targetSubcategory = 'NSAID';
                  console.log(`   🔍 Inferred subcategory from groupTherapeutic (after DB lookup): "NSAID"`);
                } else if (groupLower.includes('paracetamol') || groupLower.includes('acetaminophen')) {
                  targetSubcategory = 'Paracetamol';
                  console.log(`   🔍 Inferred subcategory from groupTherapeutic (after DB lookup): "Paracetamol"`);
                }
              }
              
              // Infer từ category nếu vẫn chưa có
              if (!targetSubcategory && targetCategory) {
                const categoryLower = targetCategory.toLowerCase();
                const medicineNameLower = (targetMedicine.name || genericName || cleanMedicineText || '').toLowerCase();
                
                if (categoryLower.includes('nội tiết') || categoryLower.includes('hormone')) {
                  if (medicineNameLower.includes('prednisolon') || medicineNameLower.includes('prednisone') || 
                      medicineNameLower.includes('dexamethason') || medicineNameLower.includes('hydrocortison')) {
                    targetSubcategory = 'Corticosteroid';
                    console.log(`   🔍 Inferred subcategory from category + medicine name (after DB lookup): "Corticosteroid"`);
                  }
                } else if (categoryLower.includes('cơ xương khớp') || categoryLower.includes('giảm đau')) {
                  if (medicineNameLower.includes('diclofenac') || medicineNameLower.includes('ibuprofen') || 
                      medicineNameLower.includes('meloxicam') || medicineNameLower.includes('celecoxib') ||
                      medicineNameLower.includes('etoricoxib') || medicineNameLower.includes('naproxen')) {
                    targetSubcategory = 'NSAID';
                    console.log(`   🔍 Inferred subcategory from category + medicine name (after DB lookup): "NSAID"`);
                  }
                }
              }
              
              // Infer từ medicine name nếu vẫn chưa có
              if (!targetSubcategory) {
                const medicineNameLower = (targetMedicine.name || genericName || cleanMedicineText || '').toLowerCase();
                if (medicineNameLower.includes('prednisolon') || medicineNameLower.includes('prednisone') || 
                    medicineNameLower.includes('dexamethason') || medicineNameLower.includes('hydrocortison') ||
                    medicineNameLower.includes('methylprednisolon') || medicineNameLower.includes('betamethason')) {
                  targetSubcategory = 'Corticosteroid';
                  console.log(`   🔍 Inferred subcategory from medicine name (after DB lookup): "Corticosteroid"`);
                } else if (medicineNameLower.includes('paracetamol') || medicineNameLower.includes('acetaminophen') ||
                           medicineNameLower.includes('panadol') || medicineNameLower.includes('efferalgan')) {
                  targetSubcategory = 'Paracetamol';
                  console.log(`   🔍 Inferred subcategory from medicine name (after DB lookup): "Paracetamol"`);
                } else if (medicineNameLower.includes('diclofenac') || medicineNameLower.includes('ibuprofen') || 
                           medicineNameLower.includes('meloxicam') || medicineNameLower.includes('celecoxib') ||
                           medicineNameLower.includes('etoricoxib') || medicineNameLower.includes('naproxen') ||
                           medicineNameLower.includes('voltaren')) {
                  targetSubcategory = 'NSAID';
                  console.log(`   🔍 Inferred subcategory from medicine name (after DB lookup): "NSAID"`);
                }
              }
            }
            
            // Cập nhật lại hasAll4TargetConditions sau khi tìm targetMedicine và infer subcategory
            let finalHasAll4TargetConditions = !!(targetCategory && targetSubcategory && targetDosageForm && targetRoute);
            if (finalHasAll4TargetConditions !== hasAll4TargetConditions) {
              console.log(`   ✅ Updated hasAll4TargetConditions: ${hasAll4TargetConditions} -> ${finalHasAll4TargetConditions}`);
              console.log(`   ✅ Final 4 conditions: Category="${targetCategory}", Subcategory="${targetSubcategory}", DosageForm="${targetDosageForm}", Route="${targetRoute}"`);
            }
            
            // Chỉ tiếp tục tìm suggestions nếu có đủ 4 điều kiện (sau khi đã bổ sung từ DB)
            if (finalHasAll4TargetConditions) {
              
              // Step 2: Find medicines with same activeIngredient first (like Web)
              let medicinesWithSameActiveIngredient: any[] = [];
              if (activeIngredientToSearch) {
                const mainActiveIngredient = activeIngredientToSearch.split(/[,;]/)[0]?.trim();
                if (mainActiveIngredient && mainActiveIngredient.length > 3) {
                  console.log(`🔍 Priority: Searching medicines with same activeIngredient: "${mainActiveIngredient}"`);
                  const escapedMainActiveIngredient = mainActiveIngredient.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  const searchCriteria: any = {
                    $or: [
                      { activeIngredient: { $regex: escapedMainActiveIngredient, $options: 'i' } },
                      { genericName: { $regex: escapedMainActiveIngredient, $options: 'i' } },
                      { name: { $regex: escapedMainActiveIngredient, $options: 'i' } }
                    ]
                  };
                  
                  if (targetMedicine) {
                    searchCriteria._id = { $ne: targetMedicine._id };
                  }
                  
                  medicinesWithSameActiveIngredient = await medicinesCollection.find(searchCriteria)
                    .limit(15)
                    .toArray();
                  console.log(`📦 Found ${medicinesWithSameActiveIngredient.length} medicines with same activeIngredient`);
                }
              }
              
              // Step 3: Find medicinesWithSameIndication (like Web) - search with 4 conditions if available
              const medicineNameLower = cleanMedicineText.toLowerCase();
              const nsaidMedicinesList = ['celecoxib', 'etoricoxib', 'meloxicam', 'diclofenac', 'ibuprofen', 'naproxen', 'indomethacin', 'piroxicam', 'ketoprofen', 'rofecoxib', 'valdecoxib'];
              const isNSAIDMedicine = targetGroupTherapeutic?.toLowerCase().includes('nsaid') || 
                                     nsaidMedicinesList.some(name => medicineNameLower.includes(name));
              
              if (!targetGroupTherapeutic && isNSAIDMedicine) {
                targetGroupTherapeutic = 'NSAID';
              }
              
              // Build search criteria for medicinesWithSameIndication (like Web - with 4 conditions if available)
              const searchCriteriaForIndication: any = {};
              if (targetMedicine) {
                searchCriteriaForIndication._id = { $ne: targetMedicine._id };
              }
              
              // Tạo điều kiện AND cho 4 tiêu chí chính: category, subcategory, dosageForm, route (like Web)
              const andConditions: any[] = [];
              const orConditions: any[] = [];
              
              // ƯU TIÊN 1: Tìm thuốc có CẢ 4 điều kiện (category, subcategory, dosageForm, route) - độ chính xác cao nhất
              if (targetCategory && targetSubcategory && targetDosageForm && targetRoute) {
                andConditions.push({ category: targetCategory });
                andConditions.push({ subcategory: targetSubcategory });
                andConditions.push({ dosageForm: targetDosageForm });
                andConditions.push({ route: targetRoute });
                console.log(`   Priority 1: Searching by ALL 4 conditions: category="${targetCategory}", subcategory="${targetSubcategory}", dosageForm="${targetDosageForm}", route="${targetRoute}"`);
              } else {
                // Nếu không có đầy đủ 4 điều kiện, tìm theo từng điều kiện có sẵn
                if (targetCategory) {
                  andConditions.push({ category: targetCategory });
                  console.log(`   Priority 1a: Searching by category: "${targetCategory}"`);
                }
                if (targetSubcategory) {
                  andConditions.push({ subcategory: targetSubcategory });
                  console.log(`   Priority 1b: Searching by subcategory: "${targetSubcategory}"`);
                }
                if (targetDosageForm) {
                  andConditions.push({ dosageForm: targetDosageForm });
                  console.log(`   Priority 1c: Searching by dosageForm: "${targetDosageForm}"`);
                }
                if (targetRoute) {
                  andConditions.push({ route: targetRoute });
                  console.log(`   Priority 1d: Searching by route: "${targetRoute}"`);
                }
              }
              
              // ƯU TIÊN 2: Tìm cùng activeIngredient (nếu có) - thêm vào AND conditions
              if (targetActiveIngredient) {
                const mainActiveIngredient = targetActiveIngredient.split(/[,;]/)[0]?.trim();
                if (mainActiveIngredient && mainActiveIngredient.length > 3) {
                  const escapedMainActiveIngredient = mainActiveIngredient.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  andConditions.push({ 
                    $or: [
                      { activeIngredient: { $regex: escapedMainActiveIngredient, $options: 'i' } },
                      { genericName: { $regex: escapedMainActiveIngredient, $options: 'i' } }
                    ]
                  });
                  console.log(`   Priority 2: Searching by activeIngredient: "${mainActiveIngredient}"`);
                }
              }
              
              // Fallback: Nếu không tìm thấy với AND conditions, thử tìm với OR conditions
              // ƯU TIÊN 3: Tìm cùng groupTherapeutic (nếu có) - chỉ dùng khi không có đủ 4 điều kiện
              if (targetGroupTherapeutic && andConditions.length === 0) {
                orConditions.push({ groupTherapeutic: targetGroupTherapeutic });
                const escapedTargetGroupTherapeutic = targetGroupTherapeutic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                orConditions.push({ groupTherapeutic: { $regex: escapedTargetGroupTherapeutic, $options: 'i' } });
                const groupLower = targetGroupTherapeutic.toLowerCase();
                if (groupLower.includes('nsaid') || groupLower.includes('anti-inflammatory') || groupLower.includes('kháng viêm')) {
                  orConditions.push({ 
                    groupTherapeutic: { 
                      $regex: /nsaid|anti-inflammatory|kháng viêm|giảm đau/i 
                    } 
                  });
                } else if (groupLower.includes('corticosteroid') || groupLower.includes('cortico')) {
                  orConditions.push({ 
                    groupTherapeutic: { 
                      $regex: /corticosteroid|cortico|prednisolon|prednisone|dexamethasone/i 
                    } 
                  });
                } else if (groupLower.includes('kháng sinh') || groupLower.includes('antibiotic')) {
                  orConditions.push({ 
                    groupTherapeutic: { 
                      $regex: /kháng sinh|antibiotic|amoxicillin|penicillin/i 
                    } 
                  });
                }
                console.log(`   Priority 3 (fallback): Searching by groupTherapeutic: "${targetGroupTherapeutic}"`);
              }
              
              // ƯU TIÊN 4: Tìm cùng indication (nếu có) - chỉ dùng khi không có đủ 4 điều kiện
              if (targetIndication && andConditions.length === 0) {
                orConditions.push({ indication: targetIndication });
                const escapedTargetIndication = targetIndication.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                orConditions.push({ indication: { $regex: escapedTargetIndication, $options: 'i' } });
                
                const indicationKeywords = targetIndication
                  .toLowerCase()
                  .split(/[,\s;]+/)
                  .filter(word => word.length > 3 && !['điều', 'trị', 'các', 'bệnh', 'và', 'cho'].includes(word));
                
                for (const keyword of indicationKeywords.slice(0, 5)) {
                  const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  orConditions.push({ indication: { $regex: escapedKeyword, $options: 'i' } });
                  orConditions.push({ description: { $regex: escapedKeyword, $options: 'i' } });
                  orConditions.push({ uses: { $regex: escapedKeyword, $options: 'i' } });
                  orConditions.push({ congDung: { $regex: escapedKeyword, $options: 'i' } });
                }
                console.log(`   Priority 4 (fallback): Searching by indication: "${targetIndication}"`);
              }
              
              // Áp dụng điều kiện tìm kiếm: ưu tiên AND (4 điều kiện), sau đó mới đến OR (fallback)
              if (andConditions.length > 0) {
                searchCriteriaForIndication.$and = andConditions;
                console.log(`   ✅ Using AND conditions (${andConditions.length} conditions)`);
              } else if (orConditions.length > 0) {
                searchCriteriaForIndication.$or = orConditions;
                console.log(`   ⚠️ Using OR conditions (fallback, ${orConditions.length} conditions)`);
              }
              
              const medicinesWithSameIndication = await medicinesCollection.find(searchCriteriaForIndication)
                .limit(20) // Tăng limit để có nhiều kết quả hơn cho việc lọc
                .toArray();
              
              console.log(`📦 Found ${medicinesWithSameIndication.length} medicines with search criteria`);
              
              // Step 4: Search directly in medicines collection by ALL 4 conditions (category, subcategory, dosageForm, route)
              // This is the key difference - Web searches directly by 4 conditions, Mobile was missing this
              let medicinesWithAll4ConditionsFromDirectSearch: any[] = [];
              if (finalHasAll4TargetConditions) {
                console.log(`🔍 Searching directly in medicines collection by ALL 4 conditions (like Web)...`);
                const directSearchCriteria: any = {};
                
                if (targetMedicine) {
                  directSearchCriteria._id = { $ne: targetMedicine._id };
                }
                
                // Create AND conditions for all 4 criteria
                const andConditions: any[] = [];
                if (targetCategory) {
                  andConditions.push({ category: targetCategory });
                }
                if (targetSubcategory) {
                  andConditions.push({ subcategory: targetSubcategory });
                }
                if (targetDosageForm) {
                  andConditions.push({ dosageForm: targetDosageForm });
                }
                if (targetRoute) {
                  andConditions.push({ route: targetRoute });
                }
                
                if (andConditions.length === 4) {
                  directSearchCriteria.$and = andConditions;
                  console.log(`   Priority 1: Searching by ALL 4 conditions: category="${targetCategory}", subcategory="${targetSubcategory}", dosageForm="${targetDosageForm}", route="${targetRoute}"`);
                  
                  medicinesWithAll4ConditionsFromDirectSearch = await medicinesCollection.find(directSearchCriteria)
                    .limit(20)
                    .toArray();
                  
                  console.log(`📦 Found ${medicinesWithAll4ConditionsFromDirectSearch.length} medicines with ALL 4 conditions from direct search`);
                }
              }
              
              // Step 5: Find additional products from Products collection (like Web) for NSAID
              let additionalProductsFromDB: any[] = [];
              // LUÔN tìm trong Products collection nếu là NSAID (kể cả khi targetGroupTherapeutic chưa được set)
              if (isNSAIDMedicine) {
                console.log(`🔍 Searching directly in Products collection for NSAID medicines (including Etoricoxib)...`);
                // Đảm bảo targetGroupTherapeutic được set
                if (!targetGroupTherapeutic) {
                  targetGroupTherapeutic = 'NSAID';
                  console.log(`   Setting targetGroupTherapeutic = 'NSAID' for Products search`);
                }
                
                // Tìm các thuốc NSAID phổ biến trong Products collection
                // Ưu tiên các thuốc COX-2 inhibitors như Etoricoxib, Celecoxib vì chúng tương tự nhau
                const nsaidProductNames = ['etoricoxib', 'celecoxib', 'meloxicam', 'diclofenac', 'ibuprofen', 'naproxen', 'indomethacin', 'piroxicam', 'ketoprofen'];
                for (const nsaidName of nsaidProductNames) {
                  // Bỏ qua nếu đã tìm thấy trong medicines collection
                  const alreadyFound = medicinesWithSameIndication.some(m => 
                    (m.name || '').toLowerCase().includes(nsaidName) ||
                    (m.genericName || '').toLowerCase().includes(nsaidName)
                  );
                  
                  // Bỏ qua nếu đã có trong foundMedicines (đã match chính xác)
                  const alreadyInPrescription = foundMedicines.some(fm => 
                    (fm.productName || '').toLowerCase().includes(nsaidName)
                  );
                  
                  if (!alreadyFound && !alreadyInPrescription) {
                    const products = await Product.find({
                      name: { $regex: nsaidName, $options: 'i' },
                      inStock: true,
                      stockQuantity: { $gt: 0 }
                    }).limit(3);
                    
                    for (const product of products) {
                      // Kiểm tra xem đã có trong foundMedicines chưa
                      if (!isMedicineAlreadyInPrescription(product, foundMedicines)) {
                        additionalProductsFromDB.push({
                          product: product,
                          groupTherapeutic: 'NSAID',
                          indication: 'Giảm đau, kháng viêm',
                          isFromProducts: true // Đánh dấu là tìm từ Products collection
                        });
                      }
                    }
                  }
                }
                console.log(`📦 Found ${additionalProductsFromDB.length} additional NSAID products from Products collection`);
              }
              
              // Step 6: Filter medicinesWithAll4Conditions from medicinesWithSameIndication (like Web)
              const medicinesWithAll4Conditions: any[] = [];
              
              // First, add medicines from direct search (these already match all 4 conditions)
              for (const m of medicinesWithAll4ConditionsFromDirectSearch) {
                const alreadyIncluded = medicinesWithAll4Conditions.some(existing => String(existing._id) === String(m._id));
                if (!alreadyIncluded) {
                  medicinesWithAll4Conditions.push(m);
                  console.log(`   ✅ Added medicine from direct search matching all 4 conditions: ${m.name || m.productName}`);
                }
              }
              
              // Then, filter from medicinesWithSameIndication
              for (const m of medicinesWithSameIndication) {
                const alreadyIncluded = medicinesWithAll4Conditions.some(existing => String(existing._id) === String(m._id));
                if (!alreadyIncluded) {
                  const matchResult = await matchesAll4Conditions(m, targetCategory, targetSubcategory, targetDosageForm, targetRoute);
                  
                  if (matchResult.matches) {
                    medicinesWithAll4Conditions.push(m);
                    console.log(`   ✅ Added medicine matching all 4 conditions: ${m.name || m.productName}`);
                  } else {
                    console.log(`   ⚠️ Medicine does not match all 4 conditions: ${m.name || m.productName}`);
                  }
                }
              }
              
              // Step 7: Add medicines from medicinesWithSameActiveIngredient that match 4 conditions
              for (const ai of medicinesWithSameActiveIngredient) {
                const alreadyIncluded = medicinesWithAll4Conditions.some(m => String(m._id) === String(ai._id));
                
                if (!alreadyIncluded) {
                  const matchResult = await matchesAll4Conditions(ai, targetCategory, targetSubcategory, targetDosageForm, targetRoute);
                  
                  if (matchResult.matches) {
                    medicinesWithAll4Conditions.push(ai);
                    console.log(`   ✅ Added medicine from same activeIngredient matching all 4 conditions: ${ai.name || ai.productName}`);
                  }
                }
              }
              
              console.log(`📊 Filtered medicines by ALL 4 conditions: ${medicinesWithAll4Conditions.length} medicines found`);
              console.log(`   - From direct search: ${medicinesWithAll4ConditionsFromDirectSearch.length}`);
              console.log(`   - From indication search: ${medicinesWithAll4Conditions.length - medicinesWithAll4ConditionsFromDirectSearch.length}`);
              
              // Step 8: Create allMedicinesToCheck (like Web)
              const medicinesWithSameActiveIngredientAnd4Conditions = await Promise.all(
                medicinesWithSameActiveIngredient.map(async (ai) => {
                  const m = medicinesWithSameIndication.find(med => String(med._id) === String(ai._id));
                  if (!m) return null;
                  const matchResult = await matchesAll4Conditions(m, targetCategory, targetSubcategory, targetDosageForm, targetRoute);
                  return matchResult.matches ? ai : null;
                })
              );
              const filteredActiveIngredientMedicines = medicinesWithSameActiveIngredientAnd4Conditions.filter(m => m !== null) as any[];
              
              const allMedicinesFrom4Conditions = medicinesWithAll4Conditions.filter(m => 
                !filteredActiveIngredientMedicines.some(fm => String(fm._id) === String(m._id))
              );
              
              const allMedicinesToCheck = [
                ...filteredActiveIngredientMedicines,
                ...allMedicinesFrom4Conditions
              ];
              
              console.log(`📋 allMedicinesToCheck: ${allMedicinesToCheck.length} medicines`);
              console.log(`   - filteredActiveIngredientMedicines: ${filteredActiveIngredientMedicines.length}`);
              console.log(`   - allMedicinesFrom4Conditions: ${allMedicinesFrom4Conditions.length}`);
              
              // Step 8: Process allMedicinesToCheck and find products, classify by dosage (like Web)
              const medicinesWithSameDosage: any[] = [];
              const medicinesDifferentDosage: any[] = [];
              const normalizedInputDosage = extractedDosage ? normalizeDosageForComparison(extractedDosage) : null;
              
              // Check if original medicine is topical
              const originalTextLower = cleanMedicineText.toLowerCase();
              const isTopicalOriginal = /%\/\s*g|\bgel\b|\bemulgel\b|\bcream\b|\bkem\b|\bthuốc\s*bôi\b|\bthuoc\s*boi\b|\btuýp\b|\btuyp\b|\bointment\b|\bmỡ\b|\bmo\b/i.test(originalTextLower);
              
              // Process additionalProductsFromDB first (like Web)
              for (const additionalProductData of additionalProductsFromDB) {
                const product = additionalProductData.product;
                const alreadyAdded = similarMedicines.some(m => String(m._id) === String(product._id));
                
                if (!alreadyAdded) {
                  // Check 4 conditions for product
                  const productInfo = await fetchMedicineInfo(product.name || '');
                  const productCategory = product.category || productInfo?.category || '';
                  const productSubcategory = product.subcategory || productInfo?.subcategory || '';
                  const productDosageForm = product.dosageForm || productInfo?.dosageForm || '';
                  const productRoute = product.route || productInfo?.route || '';
                  
                  const matchResult = await matchesAll4Conditions(
                    { category: productCategory, subcategory: productSubcategory, dosageForm: productDosageForm, route: productRoute },
                    targetCategory, targetSubcategory, targetDosageForm, targetRoute
                  );
                  
                  if (matchResult.matches) {
                    const productParsed = parseMedicineName(product.name || '');
                    const normalizedProductDosage = productParsed.dosage ? normalizeDosageForComparison(productParsed.dosage) : null;
                    const sameDosage = normalizedInputDosage && normalizedProductDosage && normalizedInputDosage === normalizedProductDosage;
                    
                    const isSameCategory = normalizeMedicineValue(targetCategory) === normalizeMedicineValue(productCategory);
                    const isSameSubcategory = normalizeMedicineValue(targetSubcategory) === normalizeMedicineValue(productSubcategory);
                    const isSameDosageForm = normalizeMedicineValue(targetDosageForm) === normalizeMedicineValue(productDosageForm);
                    const isSameRoute = normalizeMedicineValue(targetRoute) === normalizeMedicineValue(productRoute);
                    const isSameActiveIngredient = false; // Products from DB may not have activeIngredient info
                    const isSameGroupTherapeutic = targetGroupTherapeutic && additionalProductData.groupTherapeutic && 
                      (targetGroupTherapeutic.toLowerCase() === additionalProductData.groupTherapeutic.toLowerCase() ||
                       (targetGroupTherapeutic.toLowerCase().includes('nsaid') && additionalProductData.groupTherapeutic.toLowerCase().includes('nsaid')));
                    
                    let matchReason = '';
                    let confidence = 0.70;
                    
                    if (isSameCategory && isSameSubcategory && isSameActiveIngredient && isSameDosageForm && isSameRoute && sameDosage) {
                      matchReason = 'same_category_same_subcategory_same_activeIngredient_same_dosageForm_same_route_same_dosage';
                      confidence = 0.99;
                    } else if (isSameCategory && isSameSubcategory && isSameActiveIngredient && isSameDosageForm && isSameRoute) {
                      matchReason = 'same_category_same_subcategory_same_activeIngredient_same_dosageForm_same_route';
                      confidence = 0.98;
                    } else if (isSameCategory && isSameSubcategory && isSameActiveIngredient && isSameDosageForm && sameDosage) {
                      matchReason = 'same_category_same_subcategory_same_activeIngredient_same_dosageForm_same_dosage';
                      confidence = 0.96;
                    } else if (isSameCategory && isSameSubcategory && isSameActiveIngredient && isSameDosageForm) {
                      matchReason = 'same_category_same_subcategory_same_activeIngredient_same_dosageForm';
                      confidence = 0.95;
                    } else if (isSameCategory && isSameSubcategory && isSameActiveIngredient && isSameRoute && sameDosage) {
                      matchReason = 'same_category_same_subcategory_same_activeIngredient_same_route_same_dosage';
                      confidence = 0.94;
                    } else if (isSameCategory && isSameSubcategory && isSameActiveIngredient && sameDosage) {
                      matchReason = 'same_category_same_subcategory_same_activeIngredient_same_dosage';
                      confidence = 0.93;
                    } else if (isSameSubcategory && isSameActiveIngredient && isSameDosageForm && isSameRoute && sameDosage) {
                      matchReason = 'same_subcategory_same_activeIngredient_same_dosageForm_same_route_same_dosage';
                      confidence = 0.92;
                    } else if (isSameSubcategory && isSameActiveIngredient && isSameDosageForm && sameDosage) {
                      matchReason = 'same_subcategory_same_activeIngredient_same_dosageForm_same_dosage';
                      confidence = 0.91;
                    } else if (isSameCategory && isSameSubcategory && isSameActiveIngredient) {
                      matchReason = 'same_category_same_subcategory_same_activeIngredient';
                      confidence = 0.90;
                    } else if (isSameSubcategory && isSameActiveIngredient && isSameDosageForm && isSameRoute) {
                      matchReason = 'same_subcategory_same_activeIngredient_same_dosageForm_same_route';
                      confidence = 0.89;
                    } else if (isSameSubcategory && isSameActiveIngredient && isSameDosageForm) {
                      matchReason = 'same_subcategory_same_activeIngredient_same_dosageForm';
                      confidence = 0.88;
                    } else if (isSameSubcategory && isSameActiveIngredient && isSameRoute && sameDosage) {
                      matchReason = 'same_subcategory_same_activeIngredient_same_route_same_dosage';
                      confidence = 0.87;
                    } else if (isSameSubcategory && isSameActiveIngredient && sameDosage) {
                      matchReason = 'same_subcategory_same_activeIngredient_same_dosage';
                      confidence = 0.86;
                    } else if (isSameCategory && isSameSubcategory) {
                      matchReason = 'same_category_same_subcategory';
                      confidence = 0.85;
                    } else if (isSameSubcategory && isSameDosageForm && isSameRoute) {
                      matchReason = 'same_subcategory_same_dosageForm_same_route';
                      confidence = 0.84;
                    } else if (isSameSubcategory && isSameDosageForm) {
                      matchReason = 'same_subcategory_same_dosageForm';
                      confidence = 0.83;
                    } else if (isSameActiveIngredient && isSameDosageForm && isSameRoute && sameDosage) {
                      matchReason = 'same_activeIngredient_same_dosageForm_same_route_same_dosage';
                      confidence = 0.82;
                    } else if (isSameActiveIngredient && isSameDosageForm && sameDosage) {
                      matchReason = 'same_activeIngredient_same_dosageForm_same_dosage';
                      confidence = 0.81;
                    } else if (isSameActiveIngredient && sameDosage) {
                      matchReason = 'same_active_ingredient_same_dosage';
                      confidence = 0.80;
                    } else if (isSameSubcategory) {
                      matchReason = 'same_subcategory';
                      confidence = 0.75;
                    } else if (isSameActiveIngredient && isSameDosageForm && isSameRoute) {
                      matchReason = 'same_activeIngredient_same_dosageForm_same_route';
                      confidence = 0.74;
                    } else if (isSameActiveIngredient && isSameDosageForm) {
                      matchReason = 'same_activeIngredient_same_dosageForm';
                      confidence = 0.73;
                    } else if (isSameActiveIngredient) {
                      matchReason = 'same_active_ingredient_different_dosage';
                      confidence = 0.70;
                    } else if (isSameDosageForm && isSameRoute && sameDosage) {
                      matchReason = 'same_dosageForm_same_route_same_dosage';
                      confidence = 0.69;
                    } else if (isSameDosageForm && sameDosage) {
                      matchReason = 'same_dosageForm_same_dosage';
                      confidence = 0.68;
                    } else if (isSameGroupTherapeutic && sameDosage) {
                      matchReason = 'same_group_therapeutic_same_dosage';
                      confidence = 0.75;
                    } else if (isSameGroupTherapeutic) {
                      matchReason = 'same_group_therapeutic';
                      confidence = 0.70;
                    } else {
                      console.log(`   ⚠️ Skipping product with different groupTherapeutic: ${product.name}`);
                      continue;
                    }
                    
                    const suggestionInfo = await fetchMedicineInfo(product.name || '');
                    const activeIngredient = product.activeIngredient || suggestionInfo?.activeIngredient || suggestionInfo?.genericName || '';
                    const groupTherapeutic = product.groupTherapeutic || suggestionInfo?.groupTherapeutic || additionalProductData.groupTherapeutic || '';
                    const contraindication = product.contraindication || suggestionInfo?.contraindication || suggestionInfo?.chongChiDinh || suggestionInfo?.contraindications || '';
                    
                    const fullIndication = additionalProductData.indication || suggestionInfo?.indication || suggestionInfo?.description || suggestionInfo?.uses || suggestionInfo?.congDung || '';
                    let finalIndication = fullIndication;
                    if (!finalIndication && groupTherapeutic) {
                      const groupLower = groupTherapeutic.toLowerCase();
                      if (groupLower.includes('nsaid') || groupLower.includes('kháng viêm')) {
                        finalIndication = 'Giảm đau, kháng viêm';
                      } else if (groupLower.includes('kháng sinh')) {
                        finalIndication = 'Điều trị nhiễm khuẩn';
                      } else {
                        finalIndication = 'Điều trị theo chỉ định của bác sĩ';
                      }
                    }
                    
                    let finalContraindication = contraindication;
                    if (!finalContraindication) {
                      const medicineName = product.name || '';
                      finalContraindication = await getContraindicationFromMedicines(medicineName, groupTherapeutic, null);
                    }
                    
                    const productDosage = productParsed.dosage || extractedDosage || '';
                    
                    const medicineData = {
                      ...product.toObject(),
                      indication: finalIndication,
                      contraindication: finalContraindication,
                      dosage: productDosage,
                      groupTherapeutic: groupTherapeutic,
                      activeIngredient: activeIngredient,
                      category: productCategory,
                      subcategory: productSubcategory,
                      dosageForm: productDosageForm,
                      route: productRoute,
                      matchReason: matchReason,
                      matchExplanation: getMatchExplanation(matchReason, confidence),
                      confidence: confidence
                    };
                    
                    if (sameDosage) {
                      medicinesWithSameDosage.push(medicineData);
                    } else {
                      medicinesDifferentDosage.push(medicineData);
                    }
                    
                    similarMedicines.push(product);
                    console.log(`✅ Added product from Products collection: ${product.name} (${Math.round(confidence * 100)}% match) - matches all 4 conditions`);
                  }
                }
              }
              
              // Process medicines from allMedicinesToCheck
              console.log(`📋 Processing ${allMedicinesToCheck.length} medicines from allMedicinesToCheck`);
              for (const medicine of allMedicinesToCheck) {
                const medicineNameForSearch = medicine.name?.split('(')[0].trim() || medicine.name || '';
                const product = await Product.findOne({
                  $or: [
                    { name: { $regex: medicineNameForSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
                    { description: { $regex: medicineNameForSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
                    { brand: { $regex: medicineNameForSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
                  ]
                });
                
                if (product) {
                  const matchResult = await matchesAll4Conditions(medicine, targetCategory, targetSubcategory, targetDosageForm, targetRoute);
                  
                  if (matchResult.matches) {
                    const productParsed = parseMedicineName(product.name || '');
                    const normalizedProductDosage = productParsed.dosage ? normalizeDosageForComparison(productParsed.dosage) : null;
                    const sameDosage = normalizedInputDosage && normalizedProductDosage && normalizedInputDosage === normalizedProductDosage;
                    
                    // Calculate detailed confidence and matchReason (like Web)
                    const isSameCategory = targetCategory && medicine.category && 
                      normalizeMedicineValue(targetCategory) === normalizeMedicineValue(medicine.category);
                    const isSameSubcategory = targetSubcategory && medicine.subcategory && 
                      normalizeMedicineValue(targetSubcategory) === normalizeMedicineValue(medicine.subcategory);
                    const isSameActiveIngredient = medicinesWithSameActiveIngredient.length > 0 && 
                      medicinesWithSameActiveIngredient.some(ai => String(ai._id) === String(medicine._id));
                    const isSameDosageForm = targetDosageForm && medicine.dosageForm && 
                      normalizeMedicineValue(targetDosageForm) === normalizeMedicineValue(medicine.dosageForm);
                    const isSameRoute = targetRoute && medicine.route && 
                      normalizeMedicineValue(targetRoute) === normalizeMedicineValue(medicine.route);
                    
                    let matchReason = '';
                    let confidence = 0.70;
                    
                    // Calculate matchReason and confidence (synchronized with Web)
                    // Ưu tiên theo thứ tự: category > subcategory > activeIngredient > dosageForm > route > dosage > groupTherapeutic
                    if (isSameCategory && isSameSubcategory && isSameActiveIngredient && isSameDosageForm && isSameRoute && sameDosage) {
                      matchReason = 'same_category_same_subcategory_same_activeIngredient_same_dosageForm_same_route_same_dosage';
                      confidence = 0.99; // Độ chính xác cao nhất
                    } else if (isSameCategory && isSameSubcategory && isSameActiveIngredient && isSameDosageForm && isSameRoute) {
                      matchReason = 'same_category_same_subcategory_same_activeIngredient_same_dosageForm_same_route';
                      confidence = 0.98;
                    } else if (isSameCategory && isSameSubcategory && isSameActiveIngredient && isSameDosageForm && sameDosage) {
                      matchReason = 'same_category_same_subcategory_same_activeIngredient_same_dosageForm_same_dosage';
                      confidence = 0.96;
                    } else if (isSameCategory && isSameSubcategory && isSameActiveIngredient && isSameDosageForm) {
                      matchReason = 'same_category_same_subcategory_same_activeIngredient_same_dosageForm';
                      confidence = 0.95;
                    } else if (isSameCategory && isSameSubcategory && isSameActiveIngredient && isSameRoute && sameDosage) {
                      matchReason = 'same_category_same_subcategory_same_activeIngredient_same_route_same_dosage';
                      confidence = 0.94;
                    } else if (isSameCategory && isSameSubcategory && isSameActiveIngredient && sameDosage) {
                      matchReason = 'same_category_same_subcategory_same_activeIngredient_same_dosage';
                      confidence = 0.93;
                    } else if (isSameSubcategory && isSameActiveIngredient && isSameDosageForm && isSameRoute && sameDosage) {
                      matchReason = 'same_subcategory_same_activeIngredient_same_dosageForm_same_route_same_dosage';
                      confidence = 0.92;
                    } else if (isSameSubcategory && isSameActiveIngredient && isSameDosageForm && sameDosage) {
                      matchReason = 'same_subcategory_same_activeIngredient_same_dosageForm_same_dosage';
                      confidence = 0.91;
                    } else if (isSameCategory && isSameSubcategory && isSameActiveIngredient) {
                      matchReason = 'same_category_same_subcategory_same_activeIngredient';
                      confidence = 0.90;
                    } else if (isSameSubcategory && isSameActiveIngredient && isSameDosageForm && isSameRoute) {
                      matchReason = 'same_subcategory_same_activeIngredient_same_dosageForm_same_route';
                      confidence = 0.89;
                    } else if (isSameSubcategory && isSameActiveIngredient && isSameDosageForm) {
                      matchReason = 'same_subcategory_same_activeIngredient_same_dosageForm';
                      confidence = 0.88;
                    } else if (isSameSubcategory && isSameActiveIngredient && isSameRoute && sameDosage) {
                      matchReason = 'same_subcategory_same_activeIngredient_same_route_same_dosage';
                      confidence = 0.87;
                    } else if (isSameSubcategory && isSameActiveIngredient && sameDosage) {
                      matchReason = 'same_subcategory_same_activeIngredient_same_dosage';
                      confidence = 0.86;
                    } else if (isSameCategory && isSameSubcategory) {
                      matchReason = 'same_category_same_subcategory';
                      confidence = 0.85;
                    } else if (isSameSubcategory && isSameDosageForm && isSameRoute) {
                      matchReason = 'same_subcategory_same_dosageForm_same_route';
                      confidence = 0.84;
                    } else if (isSameSubcategory && isSameDosageForm) {
                      matchReason = 'same_subcategory_same_dosageForm';
                      confidence = 0.83;
                    } else if (isSameActiveIngredient && isSameDosageForm && isSameRoute && sameDosage) {
                      matchReason = 'same_activeIngredient_same_dosageForm_same_route_same_dosage';
                      confidence = 0.82;
                    } else if (isSameActiveIngredient && isSameDosageForm && sameDosage) {
                      matchReason = 'same_activeIngredient_same_dosageForm_same_dosage';
                      confidence = 0.81;
                    } else if (isSameActiveIngredient && sameDosage) {
                      matchReason = 'same_active_ingredient_same_dosage';
                      confidence = 0.80;
                    } else if (isSameSubcategory) {
                      matchReason = 'same_subcategory';
                      confidence = 0.75;
                    } else if (isSameActiveIngredient && isSameDosageForm && isSameRoute) {
                      matchReason = 'same_activeIngredient_same_dosageForm_same_route';
                      confidence = 0.74;
                    } else if (isSameActiveIngredient && isSameDosageForm) {
                      matchReason = 'same_activeIngredient_same_dosageForm';
                      confidence = 0.73;
                    } else if (isSameActiveIngredient) {
                      matchReason = 'same_active_ingredient_different_dosage';
                      confidence = 0.70;
                    } else if (isSameDosageForm && isSameRoute && sameDosage) {
                      matchReason = 'same_dosageForm_same_route_same_dosage';
                      confidence = 0.69;
                    } else if (isSameDosageForm && sameDosage) {
                      matchReason = 'same_dosageForm_same_dosage';
                      confidence = 0.68;
                    } else {
                      matchReason = 'same_category_same_subcategory_same_dosageForm_same_route';
                      confidence = 0.90;
                    }
                    
                    const suggestionInfo = await fetchMedicineInfo(product.name || '');
                    const activeIngredient = product.activeIngredient || suggestionInfo?.activeIngredient || suggestionInfo?.genericName || medicine.activeIngredient || '';
                    const groupTherapeutic = product.groupTherapeutic || suggestionInfo?.groupTherapeutic || medicine.groupTherapeutic || '';
                    const contraindication = product.contraindication || suggestionInfo?.contraindication || suggestionInfo?.chongChiDinh || suggestionInfo?.contraindications || medicine.contraindication || '';
                    
                    const medicineData = {
                      productId: String(product._id),
                      productName: product.name,
                      price: product.price,
                      unit: product.unit,
                      confidence: confidence,
                      matchReason: matchReason,
                      activeIngredient: activeIngredient,
                      groupTherapeutic: groupTherapeutic,
                      contraindication: contraindication || undefined,
                      category: medicine.category || '',
                      subcategory: medicine.subcategory || '',
                      dosageForm: medicine.dosageForm || '',
                      route: medicine.route || '',
                      name: product.name, // For filtering
                      productName: product.name, // For filtering
                    };
                    
                    if (sameDosage) {
                      medicinesWithSameDosage.push(medicineData);
                    } else {
                      medicinesDifferentDosage.push(medicineData);
                    }
                    
                    similarMedicines.push(product);
                    console.log(`   ✅ Added medicine matching all 4 conditions: ${product.name} (${sameDosage ? 'same dosage' : 'different dosage'})`);
                  }
                }
              }
              
              // Step 9: Prioritize medicines (same dosage first, then different dosage) - like Web
              let prioritizedMedicines = [...medicinesWithSameDosage, ...medicinesDifferentDosage];
              
              console.log(`📊 Prioritized medicines before filtering: ${prioritizedMedicines.length} medicines`);
              if (prioritizedMedicines.length > 0) {
                console.log(`   Medicines:`, prioritizedMedicines.map(m => `${m.name || m.productName} (${Math.round((m.confidence || 0) * 100)}%)`));
              }
              
              // Step 10: (removed) Topical/non-topical filter to match Web behavior – keep full list
              
              // Step 11: Final filter by conditions and convert to suggestions, sort by confidence (like Web)
              // Prefer strict 4/4. If none found, relax to 3/4 (user-requested) to avoid empty suggestions.
              const conditionEvaluations: Array<{ med: any; matchCount: number; matchesAll: boolean }> = [];
              for (const med of prioritizedMedicines) {
                const matchResult = await matchesAll4Conditions(med, targetCategory, targetSubcategory, targetDosageForm, targetRoute);
                conditionEvaluations.push({
                  med,
                  matchCount: matchResult.matchCount,
                  matchesAll: matchResult.matches,
                });
              }

              let acceptedMedicines = conditionEvaluations
                .filter((x) => x.matchesAll)
                .map((x) => ({ ...x.med, __matchCount: 4 }));

              if (acceptedMedicines.length === 0) {
                const relaxed = conditionEvaluations
                  .filter((x) => x.matchCount >= 3)
                  .sort((a, b) => {
                    // Prefer higher matchCount then higher confidence
                    const mc = (b.matchCount || 0) - (a.matchCount || 0);
                    if (mc !== 0) return mc;
                    return Number(b.med?.confidence || 0) - Number(a.med?.confidence || 0);
                  })
                  .map((x) => ({ ...x.med, __matchCount: x.matchCount }));

                if (relaxed.length > 0) {
                  console.log(`⚠️ No medicines match 4/4. Relaxing to 3/4 and found ${relaxed.length} candidate(s).`);
                  acceptedMedicines = relaxed;
                } else {
                  console.log(`⚠️ No medicines match 4/4 or 3/4 conditions - suggestions may be empty.`);
                }
              } else {
                console.log(`✅ Found ${acceptedMedicines.length} medicine(s) matching 4/4 conditions.`);
              }

              for (const med of acceptedMedicines) {
                similarMedicines.push(med);
              }
              
              // Filter out medicines already in prescription (like Web)
              const filteredSimilarMedicines = similarMedicines.filter(med => {
                return !isMedicineAlreadyInPrescription(med, foundMedicines);
              });
              
              if (filteredSimilarMedicines.length === 0) {
                console.log(`⚠️ All similar medicines are already in prescription, skipping suggestions`);
              } else {
                console.log(`📋 Filtered similar medicines (removed ${similarMedicines.length - filteredSimilarMedicines.length} duplicates):`, filteredSimilarMedicines.map(m => ({ name: m.name || m.productName, confidence: m.confidence || 0 })));
              }
              
              // Convert to suggestions format (like Web)
              // Sort candidates: prefer 4/4 over 3/4, then by confidence
              filteredSimilarMedicines.sort((a: any, b: any) => {
                const mc = Number(b.__matchCount || 0) - Number(a.__matchCount || 0);
                if (mc !== 0) return mc;
                return Number(b.confidence || 0) - Number(a.confidence || 0);
              });

              const suggestionsArray = await Promise.all(filteredSimilarMedicines.map(async (med) => {
                // Normalize imageUrl
                let imageUrl = med.imageUrl || med.image || med.imagePath || '';
                if (imageUrl && !imageUrl.startsWith('http') && !imageUrl.startsWith('/') && !imageUrl.startsWith('data:')) {
                  imageUrl = `/medicine-images/${imageUrl}`;
                }
                if (!imageUrl || imageUrl === '') {
                  imageUrl = '/medicine-images/default-medicine.jpg';
                }
                
                // Get description from medicines collection if med doesn't have it
                const description = await getProductDescription(med);
                
                // Get indication/description, groupTherapeutic, category, subcategory, dosageForm, route from medicines collection
                let indication = med.indication || '';
                let groupTherapeutic = med.groupTherapeutic || '';
                let category = med.category || '';
                let subcategory = med.subcategory || '';
                let dosageForm = med.dosageForm || '';
                let route = med.route || '';
                let contraindication = med.contraindication || '';
                let medicineInfo: any = null;
                
                if (med.indication) {
                  indication = med.indication;
                } else if (med.description && med.description.length > 20) {
                  indication = med.description;
                }
                
                if (med.groupTherapeutic) {
                  groupTherapeutic = med.groupTherapeutic;
                }
                
                // Lấy từ med object trước (đã có từ similarMedicines) - ƯU TIÊN CAO NHẤT
                if (med.category) {
                  category = med.category;
                }
                if (med.subcategory) {
                  subcategory = med.subcategory;
                }
                if (med.dosageForm) {
                  dosageForm = med.dosageForm;
                }
                if (med.route) {
                  route = med.route;
                }
                
                // Try to get from medicines collection if not found
                const db = mongoose.connection.db;
                if (db) {
                  const medicinesCollection = db.collection('medicines');
                  const searchName = med.name?.split('(')[0].trim() || med.productName?.split('(')[0].trim() || '';
                  
                  if (searchName) {
                    medicineInfo = await medicinesCollection.findOne({
                      $or: [
                        { name: { $regex: searchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
                        { brand: { $regex: searchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
                        { genericName: { $regex: searchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
                        { activeIngredient: { $regex: searchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
                      ]
                    });
                    
                    // Nếu không tìm được, thử tìm với các từ khóa chính
                    if (!medicineInfo && searchName) {
                      const keywords = searchName.split(/\s+/).filter((k: string) => k.length > 3);
                      if (keywords.length > 0) {
                        const keywordConditions = keywords.map((kw: string) => {
                          const escapedKeyword = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                          return { name: { $regex: escapedKeyword, $options: 'i' } };
                        });
                        medicineInfo = await medicinesCollection.findOne({
                          $or: keywordConditions
                        });
                      }
                    }
                  }
                  
                  if (medicineInfo) {
                    if (medicineInfo.indication && !indication) {
                      indication = medicineInfo.indication;
                    }
                    if (medicineInfo.groupTherapeutic && !groupTherapeutic) {
                      groupTherapeutic = medicineInfo.groupTherapeutic;
                    }
                    if (medicineInfo.category && !category) {
                      category = medicineInfo.category;
                    }
                    if (medicineInfo.subcategory && !subcategory) {
                      subcategory = medicineInfo.subcategory;
                    }
                    if (medicineInfo.dosageForm && !dosageForm) {
                      dosageForm = medicineInfo.dosageForm;
                    }
                    if (medicineInfo.route && !route) {
                      route = medicineInfo.route;
                    }
                    if (!contraindication) {
                      contraindication = medicineInfo.contraindication || 
                                        medicineInfo.chongChiDinh || 
                                        medicineInfo.contraindications || 
                                        '';
                    }
                  }
                }
                
                // Nếu vẫn không có chống chỉ định, sử dụng helper function
                if (!contraindication) {
                  const medicineName = med.name || med.productName || '';
                  const finalGroupTherapeutic = groupTherapeutic || med.groupTherapeutic || '';
                  contraindication = await getContraindicationFromMedicines(medicineName, finalGroupTherapeutic, medicineInfo);
                }
                
                // QUAN TRỌNG: Đảm bảo tất cả 4 trường đều có giá trị (với fallback từ AI analysis nếu cần)
                if (!category && aiAnalysis?.category) {
                  category = aiAnalysis.category;
                }
                if (!subcategory && aiAnalysis?.subcategory) {
                  subcategory = aiAnalysis.subcategory;
                }
                if (!dosageForm && aiAnalysis?.dosageForm) {
                  dosageForm = aiAnalysis.dosageForm;
                }
                if (!route && aiAnalysis?.route) {
                  route = aiAnalysis.route;
                }
                
                const medName = med.name || med.productName || cleanMedicineText;
                const parsedName = parseMedicineName(medName);
                
                return {
                  productId: med._id ? String(med._id) : (med.productId ? String(med.productId) : 'unknown'),
                  productName: medName,
                  price: Number(med.price || 0),
                  originalPrice: Number(med.originalPrice || med.price || 0),
                  unit: med.unit || 'đơn vị',
                  inStock: med.inStock !== undefined ? med.inStock : (Number(med.stockQuantity || 0) > 0),
                  stockQuantity: Number(med.stockQuantity || 0),
                  requiresPrescription: med.isPrescription || false,
                  imageUrl: imageUrl,
                  description: description,
                  brand: med.brand || '',
                  confidence: Number(med.confidence || 0.6),
                  matchReason: med.matchReason || 'similar',
                  dosage: parsedName.dosage || med.dosage || '',
                  indication: indication,
                  groupTherapeutic: groupTherapeutic,
                  category: category || '',
                  subcategory: subcategory || '',
                  dosageForm: dosageForm || '',
                  route: route || '',
                  contraindication: contraindication,
                  matchExplanation: getMatchExplanation(med.matchReason || 'similar', med.confidence || 0.6)
                };
              }));
              
              // Sort by confidence (highest first), then by matchReason priority (like Web)
              suggestionsArray.sort((a, b) => {
                // First sort by confidence (descending)
                if (b.confidence !== a.confidence) {
                  return b.confidence - a.confidence;
                }
                // Then sort by matchReason priority
                const matchReasonPriority: { [key: string]: number } = {
                  'same_name_same_dosage': 1,
                  'same_name_different_dosage': 2,
                  'same_category_same_subcategory_same_activeIngredient_same_dosageForm_same_route_same_dosage': 3,
                  'same_category_same_subcategory_same_activeIngredient_same_dosageForm_same_route': 4,
                  'same_category_same_subcategory_same_activeIngredient_same_dosageForm_same_dosage': 5,
                  'same_category_same_subcategory_same_activeIngredient_same_dosageForm': 6,
                  'similar': 100
                };
                const priorityA = matchReasonPriority[a.matchReason] || 50;
                const priorityB = matchReasonPriority[b.matchReason] || 50;
                return priorityA - priorityB;
              });
              
              // Return all sorted suggestions (like Web)
              if (suggestionsArray.length > 0) {
                suggestions.push(...suggestionsArray);
                console.log(`   ✅ Added ${suggestionsArray.length} sorted suggestions (top: ${suggestionsArray[0].productName}, ${suggestionsArray[0].matchReason}, confidence: ${Math.round(suggestionsArray[0].confidence * 100)}%)`);
              }
            }
          }
          
          // Note: Removed fallback to findSimilarMedicines to match Web behavior
          // Only return suggestions from medicines collection that match all 4 conditions
          
          // Filter suggestions: only keep those matching all 4 conditions (if available)
          // Note: finalHasAll4TargetConditions is only available inside the if (db) block above
          // So we need to check again here
          const finalCheckHasAll4TargetConditions = !!(targetCategory && targetSubcategory && targetDosageForm && targetRoute);
          let filteredSuggestions = suggestions;
          if (finalCheckHasAll4TargetConditions) {
            const matched4of4: typeof suggestions = [];
            const matched3of4: typeof suggestions = [];
            for (const suggestion of suggestions) {
              const matchResult = await matchesAll4Conditions(
                suggestion,
                targetCategory,
                targetSubcategory,
                targetDosageForm,
                targetRoute
              );
              if (matchResult.matches) {
                matched4of4.push(suggestion);
                console.log(`   ✅ Suggestion matches all 4 conditions: ${suggestion.productName}`);
              } else if (matchResult.matchCount >= 3) {
                matched3of4.push(suggestion);
                console.log(`   ⚠️ Suggestion matches 3/4 conditions (relaxed): ${suggestion.productName}`);
              } else {
                console.log(`   ❌ Suggestion does NOT match >=3/4 conditions: ${suggestion.productName}`);
                console.log(`      Category: ${matchResult.details.category ? '✅' : '❌'} (${suggestion.category || 'N/A'} vs ${targetCategory})`);
                console.log(`      Subcategory: ${matchResult.details.subcategory ? '✅' : '❌'} (${suggestion.subcategory || 'N/A'} vs ${targetSubcategory})`);
                console.log(`      DosageForm: ${matchResult.details.dosageForm ? '✅' : '❌'} (${suggestion.dosageForm || 'N/A'} vs ${targetDosageForm})`);
                console.log(`      Route: ${matchResult.details.route ? '✅' : '❌'} (${suggestion.route || 'N/A'} vs ${targetRoute})`);
              }
            }
            // Prefer 4/4 if any; otherwise relax to 3/4 (user-requested)
            filteredSuggestions = matched4of4.length > 0 ? matched4of4 : matched3of4;
          }
          
          // Sort suggestions by confidence (highest first) and matchReason priority
          const sortedSuggestions = filteredSuggestions.sort((a, b) => {
            if (b.confidence !== a.confidence) {
              return b.confidence - a.confidence;
            }
            const reasonPriority: { [key: string]: number } = {
              'same_name_same_dosage': 4,
              'same_name_different_dosage': 3,
              'similar_name': 2,
              'partial_name_match': 1,
            };
            const aPriority = reasonPriority[a.matchReason] || 0;
            const bPriority = reasonPriority[b.matchReason] || 0;
            return bPriority - aPriority;
          });
          
          // Keep full sorted suggestions (match Web behavior of returning all suggestions)
          const finalSuggestions = sortedSuggestions;
          
          console.log(`📊 Filtered suggestions: ${suggestions.length} -> ${filteredSuggestions.length} -> ${finalSuggestions.length} (return all)`);
          
          // Always add to notFoundMedicine with suggestions
          result.notFoundMedicine = {
            originalText: medicineText,
            originalDosage: extractedDosage || parseMedicineName(cleanMedicineText).dosage,
            suggestions: finalSuggestions,
            aiAnalysis: aiAnalysis || null // Lưu kết quả AI analysis
          };
          
          // Add to relatedMedicines for overall suggestions
          result.relatedMedicines = similarMedicines;
          
          result.requiresConsultation = true;
        }
      }
      
      return result;
    };
    
    // Process all medicines in parallel
    console.log(`🚀 Processing ${validMedicines.length} medicines in parallel...`);
    const medicineResults = await Promise.all(
      validMedicines.map(processMedicine)
    );
    
    // Aggregate results
    const seenMedicineKeys = new Set<string>();
    for (const result of medicineResults) {
      if (result.prescriptionMedicine) {
        prescriptionMedicines.push(result.prescriptionMedicine);
      }
      
      if (result.foundMedicine) {
        // Check for duplicates
        if (!seenMedicineKeys.has(result.foundMedicine.medicineKeyForCheck)) {
          seenMedicineKeys.add(result.foundMedicine.medicineKeyForCheck);
          // Remove medicineKeyForCheck before adding
          const { medicineKeyForCheck, ...medicineToAdd } = result.foundMedicine;
          foundMedicines.push(medicineToAdd);
          totalEstimatedPrice += result.price || 0;
        }
      }
      
      if (result.notFoundMedicine) {
        notFoundMedicines.push(result.notFoundMedicine);
      }
      
      if (result.relatedMedicines) {
        relatedMedicines.push(...result.relatedMedicines);
      }
      
      if (result.notes) {
        for (const note of result.notes) {
          if (!analysisNotes.some(n => n === note)) {
            analysisNotes.push(note);
          }
        }
      }
      
      if (result.requiresConsultation) {
        requiresConsultation = true;
      }
    }
    
    console.log(`✅ Completed parallel processing of ${validMedicines.length} medicines`);
  }

  // Step 3: Gemini API disabled - removed to avoid dependency on external AI service
  // Analysis now relies solely on OCR + database matching for faster and more reliable results
  // If you want to re-enable Gemini, uncomment the code below and the import at the top
  /*
  try {
    const geminiPromise = generatePrescriptionAdviceWithGemini({
      prescriptionText,
      foundMedicines,
      notFoundMedicines,
      extractedInfo,
    });
    
    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 10000);
    });
    
    const geminiResult = await Promise.race([geminiPromise, timeoutPromise]);

    if (geminiResult) {
      if (geminiResult.summary) {
        const shortSummary = geminiResult.summary.length > 100 
          ? geminiResult.summary.substring(0, 100) + '...' 
          : geminiResult.summary;
        analysisNotes.push(`🤖 ${shortSummary}`);
      }
      if (Array.isArray(geminiResult.safetyNotes)) {
        geminiResult.safetyNotes.slice(0, 2).forEach((note) => {
          if (typeof note === 'string' && note.trim()) {
            const shortNote = note.trim().length > 80 
              ? note.trim().substring(0, 80) + '...' 
              : note.trim();
            analysisNotes.push(`⚠️ ${shortNote}`);
          }
        });
      }
      if (Array.isArray(geminiResult.recommendations)) {
        if (geminiResult.recommendations.length > 0) {
          const rec = geminiResult.recommendations[0];
          if (typeof rec === 'string' && rec.trim()) {
            const shortRec = rec.trim().length > 80 
              ? rec.trim().substring(0, 80) + '...' 
              : rec.trim();
            analysisNotes.push(`💡 ${shortRec}`);
          }
        }
      }
      confidence = Math.min(0.98, confidence + 0.05);
    }
  } catch (geminiError: any) {
    console.error('Gemini analysis error (non‑blocking):', geminiError?.message || geminiError);
  }
  */

  // Fallback: nếu không trích xuất được thuốc nào nhưng vẫn có rawText,
  // thử thêm một lượt đơn giản trên rawText để lấy các dòng có chứa liều lượng.
  if (prescriptionMedicines.length === 0 && extractedInfo?.rawText) {
    try {
      console.log('🔄 Using fallback: extracting medicines from rawText');
      const rawText = extractedInfo.rawText;
      
      // Try to extract medicines from the entire rawText (not just split by newlines)
      // Many OCR results have all medicines in one long line
      // Use the same pattern as web version for consistency
      const medicinePatterns = [
        // Pattern 1: Numbered list (1. Medicine ... 2. Medicine ...) - same as web
        /\d+[\.\)]\s*((?:(?!\s*\d+[\.\)]).)+?)(?=\s*\d+[\.\)]|$)/g,
        // Pattern 2: Medicine with SL: quantity
        /([A-Za-zÀ-ỹ][^0-9]+?)\s*SL\s*:\s*\d+/gi,
        // Pattern 3: Simple numbered list without strict requirements
        /\d+[\.\)]\s*([^0-9]+?)(?=\s*\d+[\.\)]\s*|SL\s*:|$)/gi,
      ];

      const extractedMedicines: string[] = [];
      
      for (const pattern of medicinePatterns) {
        const matches = [...rawText.matchAll(pattern)];
        for (const match of matches) {
          if (match[1]) {
            const medicineText = match[1].trim();
            // More flexible validation: similar to web version
            // Only require that it contains letters and is reasonable length
            if (medicineText.length >= 3 && medicineText.length < 200 && /[a-zA-ZÀ-ỹ]/.test(medicineText)) {
              // Prefer dosage or quantity indicator, but not strictly required
              const hasDosage = /\d+\s*(mg|g|ml|l|%|mcg|iu|ui)/i.test(medicineText);
              const hasQuantity = /SL\s*:|số lượng|so luong/i.test(medicineText);
              // Accept if it has dosage/quantity OR if it's longer (likely a medicine name)
              if (hasDosage || hasQuantity || medicineText.length >= 5) {
                // Avoid duplicates
                if (!extractedMedicines.some(m => m === medicineText)) {
                  extractedMedicines.push(medicineText);
                }
              }
            }
          }
        }
      }

      console.log(`📊 Fallback extracted ${extractedMedicines.length} medicines from rawText`);

      // Process each extracted medicine
      for (const medicineText of extractedMedicines) {
        // Extract quantity
        const quantityMatch = medicineText.match(/SL\s*:\s*(\d+)|(\d+)\s*(viên|hộp|chai|gói|lọ|tuýp|tuyp)/i);
        const quantity = quantityMatch ? parseInt(quantityMatch[1] || quantityMatch[2]) || 1 : 1;
        
        // Clean medicine name
        const cleanMedicineText = medicineText
          .replace(/SL\s*:\s*\d+/gi, '')
          .replace(/x\s*\d+/gi, '')
          .replace(/\d+\s*(viên|hộp|chai|gói|lọ|tuýp|tuyp)/gi, '')
          .replace(/:\s*\d+\s*(viên|hộp|chai|gói|lọ|tuýp|tuyp)/gi, '')
          .trim();
        
        if (cleanMedicineText.length < 2) continue;
        
        // Add to prescriptionMedicines
        prescriptionMedicines.push({
          originalText: medicineText,
          cleanText: cleanMedicineText,
          quantity: quantity
        });
        
        // Try to find exact match (multi search terms)
        const searchTerms = buildSearchTerms(medicineText, cleanMedicineText);
        let exactMatch: any = null;
        for (const term of searchTerms) {
          const match = await findExactMatch(term, medicineText);
          if (match && match.product) {
            exactMatch = match;
            break;
          }
        }
        
        if (exactMatch && exactMatch.product) {
          const product = exactMatch.product;
          foundMedicines.push({
            productId: product._id,
            productName: product.name,
            price: product.price,
            unit: product.unit,
            inStock: product.inStock,
            stockQuantity: product.stockQuantity,
            requiresPrescription: product.isPrescription,
            confidence: exactMatch.confidence,
            originalText: medicineText,
            quantity: quantity,
            matchType: exactMatch.matchType
          });
          totalEstimatedPrice += product.price * quantity;
          
          if (product.isPrescription) {
            // Only add note once if multiple prescription medicines
            if (!analysisNotes.some(note => note.includes('cần đơn bác sĩ'))) {
              analysisNotes.push(`⚠️ Một số thuốc cần đơn bác sĩ`);
            }
            requiresConsultation = true;
          }
          
          if (product.stockQuantity < 10) {
            // Only add note once if multiple low stock medicines
            if (!analysisNotes.some(note => note.includes('sắp hết hàng'))) {
              analysisNotes.push(`⚠️ Một số thuốc sắp hết hàng`);
            }
          }
        } else {
          // No exact match found - add to notFoundMedicines without suggestions (synchronized with Web)
          // Only return suggestions when we have all 4 conditions from AI analysis
          notFoundMedicines.push({
            originalText: medicineText,
            suggestions: []
          });
          requiresConsultation = true;
        }
      }
    } catch (fallbackErr) {
      console.error('Fallback prescription medicine parsing error:', fallbackErr);
    }
  }

  // Calculate confidence based on results - Tinh gọn messages
  if (foundMedicines.length === 0 && prescriptionMedicines.length === 0) {
    analysisNotes.push("Không tìm thấy thuốc nào. Vui lòng liên hệ tư vấn viên.");
    requiresConsultation = true;
    confidence = 0.3;
  } else if (foundMedicines.length === 0 && prescriptionMedicines.length > 0) {
    analysisNotes.push(`Tìm thấy ${prescriptionMedicines.length} thuốc nhưng chưa khớp với kho. Cần tư vấn thêm.`);
    requiresConsultation = true;
    confidence = 0.4;
  } else if (notFoundMedicines.length > 0) {
    // Tinh gọn: chỉ hiển thị tổng số, không cần chi tiết
    analysisNotes.push(`✅ Tìm thấy ${foundMedicines.length} thuốc. ${notFoundMedicines.length} thuốc cần tư vấn thêm.`);
    confidence = Math.min(0.7, 0.5 + (foundMedicines.length / prescriptionMedicines.length) * 0.2);
  } else {
    // Chỉ hiển thị khi thành công hoàn toàn
    analysisNotes.push(`✅ Tìm thấy tất cả ${foundMedicines.length} thuốc`);
    confidence = 0.95;
  }

  // Remove duplicates from relatedMedicines
  const uniqueRelatedMedicines = relatedMedicines.filter((medicine, index, self) =>
    index === self.findIndex((m) => String(m._id) === String(medicine._id))
  );

  // Collect all prescription medicines (from OCR) - for "Thuốc đề xuất" section
  // Format prescriptionMedicines similar to Web version with hasMatch and suggestionText
  const formattedPrescriptionMedicines: any[] = [];
  const prescriptionMedicinesKeys = new Set<string>(); // Track để tránh duplicate
  
  console.log('📋 Creating formattedPrescriptionMedicines...');
  console.log(`  Found medicines: ${foundMedicines.length}`);
  console.log(`  Not found medicines: ${notFoundMedicines.length}`);
  
  // Add found medicines with their original text from prescription
  foundMedicines.forEach(med => {
    const medKey = normalizeForComparison(med.originalText || med.productName || '');
    if (!prescriptionMedicinesKeys.has(medKey)) {
      prescriptionMedicinesKeys.add(medKey);
      formattedPrescriptionMedicines.push({
        originalText: med.originalText,
        originalDosage: med.dosage || med.originalDosage,
        matchedProduct: med, // The matched product
        hasMatch: true
      });
    }
  });
  
  console.log(`  Added ${formattedPrescriptionMedicines.length} found medicines to formattedPrescriptionMedicines`);
  
  // Add not found medicines - Thêm tất cả, kể cả khi không có suggestions
  // Add formatted suggestion text for each not-found medicine
  for (const med of notFoundMedicines) {
    // Bỏ qua những items không phải là thuốc (như số, địa chỉ, v.v.)
    if (!med.originalText || med.originalText.length < 3 || /^\d+$/.test(med.originalText.trim())) {
      continue;
    }

    // Nếu thuốc này đã có match chính xác trong foundMedicines thì KHÔNG tạo block "Thuốc đề xuất" nữa
    // Ví dụ: Paracetamol 500mg đã tìm thấy đúng thuốc trong kho thì chỉ hiển thị ở "Thuốc có trong đơn"
    // So sánh chính xác hơn: so sánh cả tên và hàm lượng
    const normalizedOriginal = normalizeForComparison(med.originalText);
    const originalDosageNormalized = med.originalDosage ? normalizeDosageForComparison(med.originalDosage) : null;
    
    const hasExactMatchInFound = foundMedicines.some(found => {
      const foundOriginal = found.originalText || found.productName || '';
      const foundDosageNormalized = found.dosage ? normalizeDosageForComparison(found.dosage) : null;
      
      // So sánh tên thuốc (normalized)
      const nameMatch = normalizeForComparison(foundOriginal) === normalizedOriginal;
      
      // Nếu có hàm lượng, so sánh cả hàm lượng
      if (originalDosageNormalized && foundDosageNormalized) {
        return nameMatch && originalDosageNormalized === foundDosageNormalized;
      }
      
      // Nếu không có hàm lượng, chỉ so sánh tên
      return nameMatch;
    });

    if (hasExactMatchInFound) {
      console.log(`ℹ️ Skipping suggestion block for medicine with exact match: "${med.originalText}" (${med.originalDosage || 'no dosage'})`);
      continue;
    }
    
    // Kiểm tra xem thuốc này đã được thêm vào prescriptionMedicines chưa (tránh duplicate)
    const medKey = normalizeForComparison(med.originalText || '');
    if (prescriptionMedicinesKeys.has(medKey)) {
      console.log(`ℹ️ Medicine already in prescriptionMedicines, skipping: "${med.originalText}"`);
      continue;
    }
    prescriptionMedicinesKeys.add(medKey);
    
    if (med.suggestions && med.suggestions.length > 0) {
      // Format professional suggestion text - truyền tất cả suggestions
      const suggestionText = await formatSuggestionText(
        med.originalText,
        med.originalDosage,
        med.suggestions,
        med.aiAnalysis || undefined // Truyền aiAnalysis nếu có
      );
      
      formattedPrescriptionMedicines.push({
        originalText: med.originalText,
        originalDosage: med.originalDosage,
        matchedProduct: null,
        suggestions: med.suggestions,
        hasMatch: false,
        suggestionText: suggestionText // Thêm formatted text cho "Thuốc đề xuất"
      });
      console.log(`  ✅ Added not-found medicine with suggestions: "${med.originalText}" (${med.suggestions.length} suggestions)`);
    } else {
      // Vẫn thêm vào prescriptionMedicines ngay cả khi không có suggestions
      // Để hiển thị thông báo "cần tư vấn thêm"
      formattedPrescriptionMedicines.push({
        originalText: med.originalText,
        originalDosage: med.originalDosage,
        matchedProduct: null,
        suggestions: [],
        hasMatch: false,
        suggestionText: `Không tìm thấy chính xác tên thuốc "${med.originalText}" trong hệ thống. Vui lòng liên hệ dược sĩ để được tư vấn về thuốc này.`
      });
      console.log(`  ✅ Added not-found medicine without suggestions: "${med.originalText}"`);
    }
  }

  console.log(`📊 Final formattedPrescriptionMedicines: ${formattedPrescriptionMedicines.length} items`);
  console.log(`  - hasMatch=true: ${formattedPrescriptionMedicines.filter(m => m.hasMatch).length}`);
  console.log(`  - hasMatch=false: ${formattedPrescriptionMedicines.filter(m => !m.hasMatch).length}`);

  // IMPORTANT: Align with Web behavior
  // If we couldn't build any formatted prescription medicines (often due to OCR noise / filtered notFound items),
  // provide a lightweight fallback so the UI can still show "Thuốc đề xuất".
  // Web backend does this by suggesting in-stock products based on keywords or popular medicines.
  if (foundMedicines.length === 0 && formattedPrescriptionMedicines.length === 0) {
    console.log('🔄 Fallback: building suggestion-only prescriptionMedicines (like Web)');
    try {
      const usableNotFound = (notFoundMedicines || []).filter((m: any) => {
        const t = String(m?.originalText || '').trim();
        // Keep only plausible medicine-ish strings
        return t.length > 3 && !/^\d+$/.test(t) && /[a-zA-ZÀ-ỹ]/.test(t);
      });

      const notFoundNames = usableNotFound
        .map((m: any) => String(m.originalText || '').trim())
        .filter((name: string) => name.length > 3);

      let relatedProducts: any[] = [];

      // Try keyword-based search from notFound names (first meaningful token)
      if (notFoundNames.length > 0) {
        const searchTerms = notFoundNames
          .map((name) => {
            const firstWord = name.split(/\s+/)[0];
            return firstWord && firstWord.length > 3 ? firstWord : null;
          })
          .filter((term): term is string => term !== null);

        if (searchTerms.length > 0) {
          relatedProducts = await Product.find({
            $or: searchTerms.map((term) => {
              const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              return { name: { $regex: escapedTerm, $options: 'i' } };
            }),
            inStock: true,
            stockQuantity: { $gt: 0 },
          })
            .limit(10)
            .sort({ isHot: -1, createdAt: -1 });
        }
      }

      // If nothing found, fallback to popular in-stock medicines
      if (relatedProducts.length === 0) {
        relatedProducts = await Product.find({
          inStock: true,
          stockQuantity: { $gt: 0 },
        })
          .limit(10)
          .sort({ isHot: -1, createdAt: -1 });
      }

      const seenRelatedIds = new Set<string>();
      const pairCount = Math.min(usableNotFound.length, relatedProducts.length);

      for (let i = 0; i < pairCount; i++) {
        const notFoundMed = usableNotFound[i];
        const product = relatedProducts[i];
        if (!notFoundMed || !product) continue;

        const productId = String(product._id);
        if (seenRelatedIds.has(productId)) continue;
        seenRelatedIds.add(productId);

        // Normalize imageUrl (same as other parts of this controller)
        let imageUrl = product.imageUrl || '';
        if (imageUrl && !imageUrl.startsWith('http') && !imageUrl.startsWith('/') && !imageUrl.startsWith('data:')) {
          imageUrl = `/medicine-images/${imageUrl}`;
        }
        if (!imageUrl) {
          imageUrl = '/medicine-images/default-medicine.jpg';
        }

        const description = await getProductDescription(product);

        formattedPrescriptionMedicines.push({
          originalText: notFoundMed.originalText,
          originalDosage: notFoundMed.originalDosage,
          matchedProduct: null,
          suggestions: [
            {
              productId,
              productName: product.name || '',
              price: Number(product.price || 0),
              originalPrice: Number(product.originalPrice || product.price || 0),
              unit: product.unit || 'đơn vị',
              inStock: product.inStock !== undefined ? product.inStock : Number(product.stockQuantity || 0) > 0,
              stockQuantity: Number(product.stockQuantity || 0),
              requiresPrescription: product.isPrescription || false,
              imageUrl,
              description,
              brand: product.brand || '',
              dosage: parseMedicineName(product.name || '').dosage,
              confidence: 0.5,
              matchReason: 'related',
              matchExplanation: 'Gợi ý thay thế khi không xác định được thuốc trong đơn từ OCR',
            },
          ],
          hasMatch: false,
          suggestionText: `Không tìm thấy chính xác tên thuốc "${String(notFoundMed.originalText || '').trim()}" trong hệ thống. Dưới đây là một số thuốc có thể liên quan để bạn tham khảo (vui lòng hỏi dược sĩ trước khi dùng).`,
        });
      }

      console.log(`✅ Fallback added ${formattedPrescriptionMedicines.length} formattedPrescriptionMedicines item(s)`);
    } catch (fallbackErr: any) {
      console.error('❌ Fallback suggestion build error (non-blocking):', fallbackErr?.message || fallbackErr);
    }
  }

  return {
    foundMedicines,
    notFoundMedicines,
    prescriptionMedicines: formattedPrescriptionMedicines, // Formatted medicines with hasMatch and suggestionText (for "Thuốc đề xuất" section)
    relatedMedicines: uniqueRelatedMedicines.slice(0, 10), // Similar medicines for suggestions - limit to 10
    totalEstimatedPrice,
    requiresConsultation,
    analysisNotes,
    confidence,
    analysisTimestamp: new Date(),
    aiModel: 'pharmacy-v2.0-ocr' // Gemini disabled - using OCR + database matching only
  };
}

// Create order from prescription with AI analysis result
export const createOrderFromPrescription = async (req: Request, res: Response) => {
  try {
    console.log('=== Backend: Creating Order from Prescription ===');
    console.log('Request body:', req.body);
    
    const { 
      prescriptionId,
      items, // Array of { productId, quantity } from AI analysis
      shippingAddress,
      shippingPhone,
      paymentMethod = 'cash',
      notes,
      couponCode
    } = req.body;
    
    console.log('Parsed data:', {
      prescriptionId,
      itemsCount: items?.length,
      items,
      shippingAddress,
      shippingPhone,
      paymentMethod,
      notes,
      couponCode,
    });

    const userId = (req as any).user?.id;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }

    if (!prescriptionId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Prescription ID is required' 
      });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Order items are required' 
      });
    }

    // Verify prescription belongs to user
    const prescription = await Prescription.findOne({ 
      _id: prescriptionId, 
      userId 
    });

    if (!prescription) {
      return res.status(404).json({ 
        success: false, 
        message: 'Prescription not found' 
      });
    }

    // Validate and enrich items with product data
    const enrichedItems: any[] = [];
    const validItemsForOrder: any[] = [];
    const stockItems: Array<{ productId: string | mongoose.Types.ObjectId; quantity: number }> = [];
    
    console.log('Validating items:', items);
    
    for (const item of items) {
      // Validate item structure
      if (!item.productId || !item.quantity) {
        console.error('Invalid item structure:', item);
        return res.status(400).json({ 
          success: false, 
          message: `Item structure invalid: ${JSON.stringify(item)}` 
        });
      }
      
      const product = await Product.findById(item.productId);
      if (!product) {
        console.error('Product not found:', item.productId);
        return res.status(400).json({ 
          success: false, 
          message: `Product ${item.productId} not found` 
        });
      }
      
      console.log('Item validated:', {
        productId: item.productId,
        productName: product.name,
        quantity: item.quantity,
        price: product.price,
      });

      enrichedItems.push({
        productId: String(product._id),
        quantity: item.quantity,
        price: product.price,
        categoryId: String(product.categoryId)
      });

      validItemsForOrder.push({
        productId: product._id,
        quantity: item.quantity,
        price: product.price
      });
      
      // Prepare stock items for validation and reservation
      stockItems.push({
        productId: product._id,
        quantity: item.quantity
      });
    }
    
    // Check stock availability using StockService
    const stockCheck = await StockService.checkStock(stockItems);
    if (!stockCheck.valid) {
      const insufficientProduct = stockCheck.insufficientProducts[0];
      return res.status(400).json({
        success: false,
        message: insufficientProduct.available === 0
          ? `Sản phẩm ${insufficientProduct.productName} đã hết hàng`
          : `Sản phẩm ${insufficientProduct.productName} không đủ hàng (yêu cầu: ${insufficientProduct.requested}, có sẵn: ${insufficientProduct.available})`,
      });
    }

    // Calculate pricing with promotions
    const { evaluatePromotions } = await import('../services/pricingService.js');
    const pricing = await evaluatePromotions(enrichedItems);

    // Validate and apply coupon code if provided
    let codeDiscountAmount = 0;
    if (couponCode) {
      const { Promotion } = await import('../models/schema.js');
      // Normalize coupon code (same logic as validateCode to ensure consistency)
      const raw = String(couponCode).trim();
      const norm = raw.toUpperCase();
      const now = new Date();
      
      // Use same query logic as validateCode to ensure consistency
      const promo = await Promotion.findOne({
        startDate: { $lte: now },
        endDate: { $gte: now },
        $or: [
          { code: norm },
          { code: { $regex: new RegExp(`^${raw.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i') } }
        ],
        $and: [
          { $or: [ { isActive: true }, { status: 'active' } ] }
        ]
      }).lean();
      
      if (promo) {
        // Validate min order value (check against finalTotal after automatic promotions, same as validateCode)
        if (promo.type === 'order_threshold' && promo.minOrderValue) {
          // Use pricing.finalTotal (after automatic promotions) for validation, same as validateCode
          if (pricing.finalTotal < promo.minOrderValue) {
            return res.status(400).json({
              success: false,
              message: `Đơn tối thiểu ${promo.minOrderValue.toLocaleString('vi-VN')}đ để dùng mã này`,
            });
          }
        }
        
        // Calculate discount from code (same logic as validateCode)
        // validateCode calculates discount based on orderAmount (effectiveSubtotal = pricing.finalTotal)
        // IMPORTANT: Use same logic as validateCode: discountPercent ?? value ?? 0
        const percent = (promo as any).discountPercent ?? (promo as any).value ?? 0;
        if (percent > 0) {
          // Use pricing.finalTotal (after automatic promotions) for discount calculation
          // This matches validateCode which uses orderAmount (effectiveSubtotal)
          codeDiscountAmount = Math.floor((pricing.finalTotal * percent) / 100);
          if (promo.maxDiscountAmount) {
            codeDiscountAmount = Math.min(codeDiscountAmount, promo.maxDiscountAmount);
          }
        }
      } else {
        return res.status(400).json({
          success: false,
          message: 'Mã khuyến mãi không tồn tại hoặc không hoạt động',
        });
      }
    }

    // Combine automatic promotions discount and code discount
    // Note: codeDiscountAmount is calculated from pricing.finalTotal (after automatic promotions)
    // Final amount = pricing.finalTotal - codeDiscountAmount
    const finalDiscountAmount = pricing.discountAmount + codeDiscountAmount;
    // Ensure discount doesn't exceed original subtotal
    const maxDiscount = Math.min(finalDiscountAmount, pricing.subtotal);
    
    // Calculate final amount: start from finalTotal (after automatic promotions), then subtract code discount
    let finalAmount = pricing.finalTotal - codeDiscountAmount;
    // Ensure finalAmount doesn't go negative
    finalAmount = Math.max(0, finalAmount);

    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

    // Use MongoDB transaction to ensure atomicity
    const session = await mongoose.startSession();
    session.startTransaction();
    
    let order: any;
    let orderItems: any[];
    
    try {
      // Reserve stock within transaction (atomic operation)
      const { reservedItems } = await StockService.validateAndReserveStock(stockItems, session);
      
      if (reservedItems.length !== stockItems.length) {
        throw new Error('Failed to reserve stock for all items');
      }
      
      console.log('createOrderFromPrescription - Stock reserved successfully:', reservedItems);
      
      // Create order with prescriptionId link within transaction
      const [createdOrder] = await Order.create([{
        userId,
        orderNumber,
        totalAmount: finalAmount,
        discountAmount: finalDiscountAmount,
        couponCode: couponCode || undefined,
        shippingAddress,
        shippingPhone,
        paymentMethod: paymentMethod || 'cash',
        paymentStatus: 'pending',
        status: 'pending',
        notes: notes || `Đơn hàng từ đơn thuốc - BS. ${prescription.doctorName}`,
        prescriptionId: prescription._id, // Link to prescription
      }], { session });
      
      order = createdOrder;

      // Create order items within transaction
      orderItems = await OrderItem.insertMany(
        validItemsForOrder.map((item: any) => ({
          orderId: order._id,
          productId: item.productId,
          quantity: item.quantity,
          price: item.price,
        })),
        { session }
      );

      // Update prescription status to 'approved' (consultation completed) within transaction
      prescription.status = 'approved';
      await prescription.save({ session });
      
      // Commit transaction
      await session.commitTransaction();
      console.log('createOrderFromPrescription - Transaction committed successfully');
    } catch (error: any) {
      // Rollback transaction on error
      await session.abortTransaction();
      console.error('createOrderFromPrescription - Transaction aborted due to error:', error);
      throw error;
    } finally {
      session.endSession();
    }

    // Get order with items (populated)
    const orderItemsWithProducts = await OrderItem.find({ orderId: order._id })
      .populate({
        path: 'productId',
        select: 'name imageUrl price unit'
      });

    // Create notification for user
    try {
      await NotificationController.createNotification(
        userId.toString(),
        'order',
        'Đơn hàng đã được tạo từ đơn thuốc',
        `Đơn hàng ${order.orderNumber} đã được tạo từ đơn thuốc của BS. ${prescription.doctorName}`,
        `/account/chi-tiet-don-hang/${order._id}`,
        {
          orderId: order._id.toString(),
          prescriptionId: prescription._id.toString(),
        }
      );
    } catch (notifError: any) {
      console.error('Error creating notification:', {
        error: notifError?.message || notifError,
        stack: notifError?.stack,
        userId,
        orderId: order._id,
        prescriptionId: prescription._id,
      });
      // Don't fail the request if notification fails
    }

    console.log('=== Backend: Order Created Successfully ===');
    console.log('Order ID:', order._id);
    console.log('Order Number:', order.orderNumber);
    console.log('Total Amount:', order.totalAmount);
    console.log('Items Count:', orderItemsWithProducts.length);
    
    res.status(201).json({
      success: true,
      message: 'Order created successfully from prescription',
      data: {
        ...order.toObject(),
        items: orderItemsWithProducts
      }
    });

  } catch (error) {
    console.error('=== Backend: Error Creating Order ===');
    console.error('Error:', error);
    console.error('Error message:', (error as any)?.message);
    console.error('Error stack:', (error as any)?.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
};
