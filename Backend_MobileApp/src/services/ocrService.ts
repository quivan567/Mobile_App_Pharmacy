import Tesseract from 'tesseract.js';
import fs from 'fs';
import path from 'path';

export interface ExtractedPrescriptionInfo {
  customerName?: string;
  phoneNumber?: string;
  doctorName?: string;
  hospitalName?: string;
  examinationDate?: string;
  diagnosis?: string;
  notes?: string;
  rawText: string;
}

/**
 * Extract text from prescription image using OCR
 */
export async function extractTextFromImage(imagePath: string): Promise<string> {
  try {
    console.log('🔍 Starting OCR for image:', imagePath);
    
    // Add timeout wrapper for OCR process (max 60 seconds)
    const OCR_TIMEOUT = 60000;
    const ocrPromise = Tesseract.recognize(
      imagePath,
      'vie+eng', // Vietnamese and English
      {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            const progress = Math.round(m.progress * 100);
            if (progress % 25 === 0) { // Log every 25%
              console.log(`OCR Progress: ${progress}%`);
            }
          }
        }
      }
    );
    
    // Race between OCR and timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('OCR timeout: Quá trình nhận dạng văn bản mất quá nhiều thời gian'));
      }, OCR_TIMEOUT);
    });
    
    const { data: { text, confidence } } = await Promise.race([ocrPromise, timeoutPromise]);
    
    console.log(`✅ OCR completed. Confidence: ${confidence?.toFixed(2)}%`);
    console.log(`📝 Extracted text length: ${text.length} characters`);
    
    return text;
  } catch (error: any) {
    console.error('❌ OCR Error:', {
      message: error?.message,
      name: error?.name,
      stack: error?.stack,
    });
    
    // Handle specific OCR errors
    if (error?.message?.includes('timeout')) {
      throw new Error('Quá trình nhận dạng văn bản mất quá nhiều thời gian. Vui lòng thử lại với ảnh nhỏ hơn hoặc rõ hơn.');
    }
    
    if (error?.message?.includes('Image too small') || error?.message?.includes('scale')) {
      throw new Error('Ảnh quá nhỏ hoặc không đủ chất lượng để nhận dạng. Vui lòng chụp lại ảnh với độ phân giải cao hơn.');
    }
    
    if (error?.message?.includes('ENOENT') || error?.message?.includes('not found')) {
      throw new Error('Không tìm thấy file ảnh. Vui lòng tải lại ảnh.');
    }
    
    throw new Error(`Không thể đọc nội dung từ ảnh: ${error?.message || 'Lỗi không xác định'}`);
  }
}

/**
 * Restore Vietnamese diacritics for medical/diagnosis terms
 */
function restoreVietnameseDiacritics(text: string): string {
  let restored = text;
  
  // Common medical terms that OCR often misses diacritics
  // Disease names
  restored = restored.replace(/\bBénh\b/gi, 'Bệnh');
  restored = restored.replace(/\bBenh\b/gi, 'Bệnh');
  restored = restored.replace(/\bda dày\b/gi, 'dạ dày');
  restored = restored.replace(/\bda day\b/gi, 'dạ dày');
  restored = restored.replace(/\bDa dày\b/gi, 'Dạ dày');
  restored = restored.replace(/\bDa day\b/gi, 'Dạ dày');
  restored = restored.replace(/\bthực quan\b/gi, 'thực quản');
  restored = restored.replace(/\bthuc quan\b/gi, 'thực quản');
  restored = restored.replace(/\bThực quan\b/gi, 'Thực quản');
  restored = restored.replace(/\bThuc quan\b/gi, 'Thực quản');
  restored = restored.replace(/\btrào ngược\b/gi, 'trào ngược');
  restored = restored.replace(/\btrao nguoc\b/gi, 'trào ngược');
  restored = restored.replace(/\bTrao nguoc\b/gi, 'Trào ngược');
  
  // Common medical conditions
  restored = restored.replace(/\bviêm\b/gi, 'viêm');
  restored = restored.replace(/\bviem\b/gi, 'viêm');
  restored = restored.replace(/\bViêm\b/gi, 'Viêm');
  restored = restored.replace(/\bViem\b/gi, 'Viêm');
  restored = restored.replace(/\bđau\b/gi, 'đau');
  restored = restored.replace(/\bdau\b/gi, 'đau');
  restored = restored.replace(/\bĐau\b/gi, 'Đau');
  restored = restored.replace(/\bDau\b/gi, 'Đau');
  restored = restored.replace(/\bsốt\b/gi, 'sốt');
  restored = restored.replace(/\bsot\b/gi, 'sốt');
  restored = restored.replace(/\bSốt\b/gi, 'Sốt');
  restored = restored.replace(/\bSot\b/gi, 'Sốt');
  restored = restored.replace(/\bho\b/gi, 'ho');
  restored = restored.replace(/\bHo\b/gi, 'Ho');
  restored = restored.replace(/\bkhó thở\b/gi, 'khó thở');
  restored = restored.replace(/\bkho tho\b/gi, 'khó thở');
  restored = restored.replace(/\bKhó thở\b/gi, 'Khó thở');
  restored = restored.replace(/\bKho tho\b/gi, 'Khó thở');
  restored = restored.replace(/\bđau đầu\b/gi, 'đau đầu');
  restored = restored.replace(/\bdau dau\b/gi, 'đau đầu');
  restored = restored.replace(/\bĐau đầu\b/gi, 'Đau đầu');
  restored = restored.replace(/\bDau dau\b/gi, 'Đau đầu');
  restored = restored.replace(/\bđau bụng\b/gi, 'đau bụng');
  restored = restored.replace(/\bdau bung\b/gi, 'đau bụng');
  restored = restored.replace(/\bĐau bụng\b/gi, 'Đau bụng');
  restored = restored.replace(/\bDau bung\b/gi, 'Đau bụng');
  
  // Body parts
  restored = restored.replace(/\bphổi\b/gi, 'phổi');
  restored = restored.replace(/\bphoi\b/gi, 'phổi');
  restored = restored.replace(/\bPhổi\b/gi, 'Phổi');
  restored = restored.replace(/\bPhoi\b/gi, 'Phổi');
  restored = restored.replace(/\bgan\b/gi, 'gan');
  restored = restored.replace(/\bGan\b/gi, 'Gan');
  restored = restored.replace(/\bthận\b/gi, 'thận');
  restored = restored.replace(/\bthan\b/gi, 'thận');
  restored = restored.replace(/\bThận\b/gi, 'Thận');
  restored = restored.replace(/\bThan\b/gi, 'Thận');
  restored = restored.replace(/\btim\b/gi, 'tim');
  restored = restored.replace(/\bTim\b/gi, 'Tim');
  restored = restored.replace(/\bthần kinh\b/gi, 'thần kinh');
  restored = restored.replace(/\bthan kinh\b/gi, 'thần kinh');
  restored = restored.replace(/\bThần kinh\b/gi, 'Thần kinh');
  restored = restored.replace(/\bThan kinh\b/gi, 'Thần kinh');
  
  // Common prescription terms
  restored = restored.replace(/\bngày\b/gi, 'ngày');
  restored = restored.replace(/\bngay\b/gi, 'ngày');
  restored = restored.replace(/\bNgày\b/gi, 'Ngày');
  restored = restored.replace(/\bNgay\b/gi, 'Ngày');
  restored = restored.replace(/\btháng\b/gi, 'tháng');
  restored = restored.replace(/\bthang\b/gi, 'tháng');
  restored = restored.replace(/\bTháng\b/gi, 'Tháng');
  restored = restored.replace(/\bThang\b/gi, 'Tháng');
  
  return restored;
}

/**
 * Normalize and clean OCR text
 */
function normalizeText(text: string): string {
  // Replace common OCR errors
  let normalized = text
    .replace(/[|]/g, 'I') // Replace | with I
    .replace(/[Il1]/g, (match, offset, str) => {
      // Context-aware replacement: I in names, 1 in numbers
      const before = str.substring(Math.max(0, offset - 2), offset);
      const after = str.substring(offset + 1, Math.min(str.length, offset + 3));
      if (/[0-9]/.test(before) || /[0-9]/.test(after)) {
        return '1'; // Likely a number
      }
      return 'I'; // Likely a letter
    })
    .replace(/\s+/g, ' ') // Normalize whitespace first
    .trim();
  
  // Fix common OCR errors in Vietnamese text
  // Fix "vàtên" -> "và tên"
  normalized = normalized.replace(/vàtên/gi, 'và tên');
  normalized = normalized.replace(/Ho\s+vàtên/gi, 'Họ và tên');
  normalized = normalized.replace(/Ho\s+ten/gi, 'Họ tên');
  normalized = normalized.replace(/Ho\s+va\s+ten/gi, 'Họ và tên');
  
  // Fix common character errors (O/0 confusion)
  normalized = normalized.replace(/\bO([0-9])/g, '0$1'); // O before number -> 0
  normalized = normalized.replace(/([0-9])O\b/g, '$10'); // O after number -> 0
  normalized = normalized.replace(/O([O0]{2,})/g, '0$1'); // Multiple O -> 0
  // But preserve O in words
  normalized = normalized.replace(/\b0([a-z])/gi, 'O$1'); // 0 before letter -> O (in words)
  
  // Fix date format errors
  normalized = normalized.replace(/(\d{1,2})\s*[Oo]\s*(\d{1,2})\s*[Oo]\s*(\d{2,4})/g, '$1/0$2/$3');
  normalized = normalized.replace(/(\d{1,2})\s*\/\s*[Oo]\s*\/\s*(\d{2,4})/g, '$1/0/$2');
  
  // Fix "Ngày" errors
  normalized = normalized.replace(/\bNgay\b/gi, 'Ngày');
  normalized = normalized.replace(/\bngay\b/gi, 'ngày');
  
  // Fix "Bác sĩ" errors
  normalized = normalized.replace(/\bBac\s+si\b/gi, 'Bác sĩ');
  normalized = normalized.replace(/\bBacsi\b/gi, 'Bác sĩ');
  normalized = normalized.replace(/\bBS\./gi, 'BS.');
  normalized = normalized.replace(/\bBS\s/gi, 'BS ');
  
  // Fix hospital/clinic names
  normalized = normalized.replace(/\bBenh\s+vien\b/gi, 'Bệnh viện');
  normalized = normalized.replace(/\bPhong\s+kham\b/gi, 'Phòng khám');
  normalized = normalized.replace(/\bSo\s+Y\s+TE\b/gi, 'SỞ Y TẾ');
  normalized = normalized.replace(/\bSỞ\s+Y\s+TẾ\b/g, 'SỞ Y TẾ');
  
  // Fix "Chẩn đoán" errors
  normalized = normalized.replace(/\bChan\s+doan\b/gi, 'Chẩn đoán');
  normalized = normalized.replace(/\bChẩn\s+doan\b/gi, 'Chẩn đoán');
  
  // Fix common medical terms
  normalized = normalized.replace(/\bGhi\s+chu\b/gi, 'Ghi chú');
  normalized = normalized.replace(/\bLoi\s+dan\b/gi, 'Lời dặn');
  normalized = normalized.replace(/\bLời\s+dan\b/gi, 'Lời dặn');
  
  // Fix phone number format
  normalized = normalized.replace(/(\d{3,4})\s*[Oo]\s*(\d{3,4})/g, '$1 0$2'); // Fix O in phone numbers
  
  // Add spaces around colons and common separators
  normalized = normalized.replace(/([A-Za-zÀ-ỹ]):([A-Za-zÀ-ỹ0-9])/g, '$1: $2');
  normalized = normalized.replace(/([A-Za-zÀ-ỹ])\s*:\s*([A-Za-zÀ-ỹ0-9])/g, '$1: $2');
  
  // Fix missing spaces after colons
  normalized = normalized.replace(/:\s*([A-Za-zÀ-ỹ0-9])/g, ': $1');
  
  // Normalize whitespace again after fixes
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  return normalized;
}

/**
 * Extract prescription information from OCR text
 */
export function extractPrescriptionInfo(ocrText: string): ExtractedPrescriptionInfo {
  // Normalize text first
  const normalizedText = normalizeText(ocrText);
  const fullText = normalizedText;
  
  // Split by newlines, but also try to split by common separators if no newlines
  let lines = normalizedText.split('\n').map(line => line.trim()).filter(line => line.length > 2);
  
  // If only 1 line (common OCR issue), try to split by common patterns
  if (lines.length <= 1) {
    // Try to split by common prescription field separators
    const splitPatterns = [
      /(Họ\s*(?:và\s*)?tên|Tên|Năm\s+sinh|Tuổi|Giới|Địa\s+chỉ|Số\s+điện\s+thoại|ĐT|Mạch|Huyết\s+áp|Thân\s+nhiệt|Chẩn\s+đoán|Ngày|Bác\s+sĩ|BS|BỆNH\s+VIỆN|Phòng\s+khám|SỞ\s+Y\s+TẾ)/gi
    ];
    
    for (const pattern of splitPatterns) {
      const matches = [...fullText.matchAll(pattern)];
      if (matches.length > 1) {
        // Split text at these positions
        const splitPoints = matches
          .map(m => m.index)
          .filter((idx): idx is number => idx !== undefined);
        lines = [];
        let lastIndex = 0;
        for (const splitPoint of splitPoints) {
          if (splitPoint !== undefined && splitPoint > lastIndex) {
            lines.push(fullText.substring(lastIndex, splitPoint).trim());
            lastIndex = splitPoint;
          }
        }
        lines.push(fullText.substring(lastIndex).trim());
        lines = lines.filter(line => line.length > 2);
        break;
      }
    }
  }
  
  console.log('📄 ========== OCR TEXT ANALYSIS ==========');
  console.log('📄 Full OCR Text length:', fullText.length, 'characters');
  console.log('📄 First 1000 chars:', fullText.substring(0, 1000));
  console.log('📄 Total lines:', lines.length);
  console.log('📄 First 20 lines:');
  lines.slice(0, 20).forEach((line, idx) => {
    console.log(`   Line ${idx + 1}: "${line}"`);
  });
  console.log('📄 =======================================');
  
  const result: ExtractedPrescriptionInfo = {
    rawText: ocrText
  };

  // Extract customer name (Họ tên, Họ và tên) - Search in full text and lines
  const namePatterns = [
    /Họ\s+và\s+tên[:\s]+([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐa-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ\s]+?)(?:\s|$|Năm\s*sinh|Tuổi|Giới|Địa|Số|Mạch|Huyết|Nhiệt|Chẩn|Ngày)/i,
    /Ho\s+va\s+ten[:\s]+([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐa-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ\s]+?)(?:\s|$|Nam\s*sinh|Năm\s*sinh|Tuổi|Giới|Địa|Số|Mạch|Huyết|Nhiệt|Chẩn|Ngày)/i,
    /Họ\s+tên[:\s]+([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐa-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ\s]+?)(?:\s|$|Năm\s*sinh|Tuổi|Giới|Địa|Số|Mạch|Huyết|Nhiệt|Chẩn|Ngày)/i,
    /Tên[:\s]+([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐa-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ\s]+?)(?=\s*(?:Nam\s*sinh|Năm\s*sinh|Tuổi|Giới|Địa|Số|Mạch|Huyết|Nhiệt|Chẩn|Ngày)|$)/i,
    /(?:Họ\s*(?:và\s*)?tên|tên)\s+([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐa-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ\s]+?)(?=\s*(?:Nam\s*sinh|Năm\s*sinh|Tuổi|Giới|Địa|Số|Mạch|Huyết|Nhiệt|Chẩn|Ngày)|$)/i,
  ];
  
  // Search in full text first
  console.log('🔍 Searching for customer name...');
  for (let i = 0; i < namePatterns.length; i++) {
    const pattern = namePatterns[i];
    if (!pattern) continue;
    const match = fullText.match(pattern);
    if (match && match[1]) {
      let name = match[1].trim();
      name = name.replace(/\s+/g, ' ');
      const words = name.split(/\s+/);
      name = words.slice(0, 4).join(' ');
      name = name.replace(/[.,;:]+$/, '').trim();
      if (name.length >= 2 && name.length < 50) {
        result.customerName = name;
        console.log('✅ Extracted customer name:', result.customerName);
        break;
      }
    }
  }
  
  // If not found, search in lines
  if (!result.customerName) {
    for (const line of lines) {
      for (const pattern of namePatterns) {
        const match = line.match(pattern);
        if (match && match[1]) {
          let name = match[1].trim();
          name = name.replace(/\s+/g, ' ');
          name = name.split(/\s+/).slice(0, 4).join(' ');
          name = name.replace(/[.,;:]+$/, '').trim();
          if (name.length >= 2 && name.length < 50) {
            result.customerName = name;
            break;
          }
        }
      }
      if (result.customerName) break;
    }
  }

  // Extract phone number
  const phonePatterns = [
    /(?:Số\s*điện\s*thoại|ĐT|Phone|Tel|SDT|SĐT)[:\s]*([0-9\s\-\.Oo]{8,15})/i,
    /(?:0[3|5|7|8|9])\s*[0-9Oo]{1}\s*[0-9Oo]{3}\s*[0-9Oo]{3,4}/,
    /(?:0[3|5|7|8|9])[0-9Oo]{8,9}/,
    /\b(0[3|5|7|8|9][0-9Oo]{8,9})\b/,
  ];
  
  for (const pattern of phonePatterns) {
    const match = fullText.match(pattern);
    if (match && match[1]) {
      let phone = match[1].replace(/[\s\-\.Oo]/g, '').trim();
      // Replace O with 0 in phone numbers
      phone = phone.replace(/O/gi, '0');
      if (phone.length >= 8 && phone.length <= 11 && /^[0-9]+$/.test(phone)) {
        if (phone.startsWith('0') || (phone.length === 10 && /^[3-9]/.test(phone) && !/^50/.test(phone))) {
          result.phoneNumber = phone;
          console.log('✅ Extracted phone number:', result.phoneNumber);
          break;
        }
      }
    }
  }
  
  if (!result.phoneNumber) {
    for (const line of lines) {
      for (const pattern of phonePatterns) {
        const match = line.match(pattern);
        if (match && match[1]) {
          let phone = match[1].replace(/[\s\-\.Oo]/g, '').trim();
          phone = phone.replace(/O/gi, '0');
          if (phone.length >= 8 && phone.length <= 11 && /^[0-9]+$/.test(phone)) {
            if (phone.startsWith('0') || (phone.length === 10 && /^[3-9]/.test(phone) && !/^50/.test(phone))) {
              result.phoneNumber = phone;
              break;
            }
          }
        }
      }
      if (result.phoneNumber) break;
    }
  }

  // Extract doctor name
  const doctorPatterns = [
    /BS\.\s*([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐa-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ\s]+?)(?:\s*(?:i\s*;|:|ar|nh|gi|ï|\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})|$)/i,
    /(?:Bác\s*sĩ|BS|ThS\.BS|TS\.BS|BSCKI|BSCKII|Bac\s+si)[:\s]+([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐa-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ\s]+?)(?:\s|$|Ngày|Thời|in|lúc|Tái|Tai|\d{2}\/\d{2}\/\d{4})/i,
    /BS\s+([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐa-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ\s]+?)(?:\s|$|Ngày|Thời|in|lúc|Tái|Tai|\d{2}\/\d{2}\/\d{4})/i,
  ];
  
  for (const pattern of doctorPatterns) {
    const match = fullText.match(pattern);
    if (match && match[1]) {
      let doctorName = match[1].trim();
      doctorName = doctorName.replace(/^BS\.\s*/i, '');
      doctorName = doctorName.replace(/\s*(?:i\s*;|:|ar|nh|gi|ï).*$/, '');
      doctorName = doctorName.replace(/\s+/g, ' ');
      doctorName = doctorName.split(/\s+/).slice(0, 5).join(' ');
      doctorName = doctorName.replace(/[.,;:]+$/, '').trim();
      if (doctorName.length > 2 && doctorName.length < 60) {
        result.doctorName = doctorName;
        console.log('✅ Extracted doctor name:', result.doctorName);
        break;
      }
    }
  }
  
  if (!result.doctorName) {
    for (const line of lines) {
      for (const pattern of doctorPatterns) {
        const match = line.match(pattern);
        if (match && match[1]) {
          let doctorName = match[1].trim();
          doctorName = doctorName.replace(/^BS\.\s*/i, '');
          doctorName = doctorName.replace(/\s*(?:i\s*;|:|ar|nh|gi|ï).*$/, '');
          doctorName = doctorName.replace(/\s+/g, ' ');
          doctorName = doctorName.split(/\s+/).slice(0, 5).join(' ');
          doctorName = doctorName.replace(/[.,;:]+$/, '').trim();
          if (doctorName.length > 2 && doctorName.length < 60) {
            result.doctorName = doctorName;
            break;
          }
        }
      }
      if (result.doctorName) break;
    }
  }

  // Extract hospital name
  const hospitalPatterns = [
    /Phòng\s*khám\s*ĐK\s*TTYT\s+([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐa-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ\s]+?)(?:\s*(?:Phòng\s*khám\s*\d+|Ñ|p\.|mm|\d{7,})|$)/i,
    /SỞ\s*Y\s*TẾ\s+([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]+?)(?:\s|$|BỆNH|BV|Phòng|Mã|Số)/i,
    /(?:PHÒNG\s*KHÁM|Phòng\s*khám|PK|Phong\s+kham)[:\s]*([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐa-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ\s]+?)(?:\s|$|ĐT|Phone|SỞ|Phòng\s*khám\s*\d+|Mã|Số|BS|Bác)/i,
    /(?:BỆNH\s*VIỆN|Bệnh\s*viện|BV|Benh\s+vien)[:\s]*([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐa-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ\s]+?)(?:\s|$|PK|ĐT|Phone|SỞ|Mã|Số|BS|Bác)/i,
  ];
  
  for (const pattern of hospitalPatterns) {
    const match = fullText.match(pattern);
    if (match && match[1]) {
      let hospitalName = match[1].trim();
      hospitalName = hospitalName.replace(/\s*(?:Phòng\s*khám\s*\d+|Ñ|p\.|mm|\d{7,}).*$/i, '');
      hospitalName = hospitalName.replace(/[Ñp\.mm]+$/i, '').trim();
      hospitalName = hospitalName.split(/\s+/).slice(0, 10).join(' ');
      if (hospitalName.length >= 3 && hospitalName.length < 100) {
        result.hospitalName = hospitalName;
        console.log('✅ Extracted hospital name:', result.hospitalName);
        break;
      }
    }
  }
  
  if (!result.hospitalName) {
    for (const line of lines) {
      for (const pattern of hospitalPatterns) {
        const match = line.match(pattern);
        if (match && match[1]) {
          let hospitalName = match[1].trim();
          hospitalName = hospitalName.replace(/\s*(?:Phòng\s*khám\s*\d+|Ñ|p\.|mm|\d{7,}).*$/i, '');
          hospitalName = hospitalName.replace(/[Ñp\.mm]+$/i, '').trim();
          hospitalName = hospitalName.split(/\s+/).slice(0, 10).join(' ');
          if (hospitalName.length >= 3 && hospitalName.length < 100) {
            result.hospitalName = hospitalName;
            break;
          }
        }
      }
      if (result.hospitalName) break;
    }
  }

  // Extract examination date
  const datePatterns = [
    /Ngày\s+([0O\d]{1,2})\s*[\/\.]\s*([0O\d]{1,2})\s*[\/\.]\s*([0O\d]{2,4})/i,
    /Ngày\s*(?:khám)?[:\s]*([0O\d]{1,2})\s*[\/\.]\s*([0O\d]{1,2})\s*[\/\.]\s*([0O\d]{2,4})/i,
    /Ngày\s*([0O\d]{1,2})\s*tháng\s*([0O\d]{1,2})\s*năm\s*([0O\d]{4})/i,
    /([0O\d]{1,2})\s*[\/\.]\s*([0O\d]{1,2})\s*[\/\.]\s*([0O\d]{2,4})/,
  ];
  
  for (const pattern of datePatterns) {
    const match = fullText.match(pattern);
    if (match && match[1] && match[2] && match[3]) {
      let day = match[1].replace(/O/gi, '0');
      let month = match[2].replace(/O/gi, '0');
      let year = match[3].replace(/O/gi, '0');
      
      if (match[0].includes('tháng')) {
        day = day.padStart(2, '0');
        month = month.padStart(2, '0');
        if (parseInt(day) <= 31 && parseInt(month) <= 12 && parseInt(year) >= 2000 && parseInt(year) <= 2100) {
          result.examinationDate = `${year}-${month}-${day}`;
          console.log('✅ Extracted examination date:', result.examinationDate);
          break;
        }
      } else {
        day = day.padStart(2, '0');
        month = month.padStart(2, '0');
        if (year.length === 2) {
          year = '20' + year;
        }
        if (parseInt(day) <= 31 && parseInt(month) <= 12 && parseInt(year) >= 2000 && parseInt(year) <= 2100) {
          result.examinationDate = `${year}-${month}-${day}`;
          console.log('✅ Extracted examination date:', result.examinationDate);
          break;
        }
      }
    }
  }
  
  if (!result.examinationDate) {
    for (const line of lines) {
      for (const pattern of datePatterns) {
        const match = line.match(pattern);
        if (match && match[1] && match[2] && match[3]) {
          let day = match[1].replace(/O/gi, '0');
          let month = match[2].replace(/O/gi, '0');
          let year = match[3].replace(/O/gi, '0');
          
          if (match[0].includes('tháng')) {
            day = day.padStart(2, '0');
            month = month.padStart(2, '0');
            if (parseInt(day) <= 31 && parseInt(month) <= 12 && parseInt(year) >= 2000 && parseInt(year) <= 2100) {
              result.examinationDate = `${year}-${month}-${day}`;
              break;
            }
          } else {
            day = day.padStart(2, '0');
            month = month.padStart(2, '0');
            if (year.length === 2) {
              year = '20' + year;
            }
            if (parseInt(day) <= 31 && parseInt(month) <= 12 && parseInt(year) >= 2000 && parseInt(year) <= 2100) {
              result.examinationDate = `${year}-${month}-${day}`;
              break;
            }
          }
        }
      }
      if (result.examinationDate) break;
    }
  }

  // Extract diagnosis
  const diagnosisPatterns = [
    /(?:Chan\s*doan|Chẩn\s*đoán|Chẩn\s*doan)[:\s]+(.+?)(?:\s*(?:Cận\s*lâm\s*sàng|Can\s*lam\s*sang|Mạch|Mach|Huyết\s*áp|Huyet\s*ap|Thân\s*nhiệt|Than\s*nhiet|Ghi\s*chú|Ghi\s*chu|Lời|Loi|Ngày|Ngay|BS|Bac\s*si|Bác\s*sĩ|\d+\s*\)\s*[A-Z]|SIMETHICON|MALTAGIT|PARACETAMOL|CALCI|VITAMIN|Thuốc|Thuoc)|$)/i,
    /(?:Chẩn\s*đoán|Chan\s*doan)[:\s]*([A-Z]\d{2,3}(?:\s*[-–]\s*)?[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐa-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ\s\-–]+?)(?:\s*(?:Cận|Can|Mạch|Mach|Huyết|Huyet|Thân|Than|Ghi|Lời|Loi|Ngày|Ngay|BS|Bác|Bac|\d+\s*\)\s*[A-Z]|SIMETHICON|MALTAGIT|PARACETAMOL|CALCI|VITAMIN|Thuốc|Thuoc)|$)/i,
    /(?:Chẩn\s*đoán|Chan\s*doan)[:\s]*([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐa-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ\s\-–]+?)(?:\s*(?:Cận|Can|Mạch|Mach|Huyết|Huyet|Thân|Than|Ghi|Lời|Loi|Ngày|Ngay|BS|Bác|Bac|\d+\s*\)\s*[A-Z]|SIMETHICON|MALTAGIT|PARACETAMOL|CALCI|VITAMIN|Thuốc|Thuoc)|$)/i,
  ];
  
  for (const pattern of diagnosisPatterns) {
    const match = fullText.match(pattern);
    if (match && match[1]) {
      let diagnosis = match[1].trim();
      diagnosis = diagnosis.replace(/\s+/g, ' ');
      diagnosis = diagnosis.replace(/\s+\d+\s+[A-Z][a-z]?\s+[A-Z]\s+[a-z]\s+\d+\s*=\s*$/i, '');
      diagnosis = diagnosis.replace(/\s+\d+\s+[A-Z][a-z]?\s+[A-Z]\s+[a-z]?\s*$/i, '');
      diagnosis = diagnosis.replace(/\s+(?:\d+|[A-Z])\s*$/, '');
      diagnosis = diagnosis.replace(/\s*[=]+$/, '');
      diagnosis = diagnosis.replace(/[.,;:]+$/, '').trim();
      diagnosis = restoreVietnameseDiacritics(diagnosis);
      diagnosis = diagnosis.split(/\s+/).slice(0, 20).join(' ');
      if (diagnosis.length >= 2 && diagnosis.length < 200) {
        result.diagnosis = diagnosis;
        console.log('✅ Extracted diagnosis:', result.diagnosis);
        break;
      }
    }
  }
  
  if (!result.diagnosis) {
    for (const line of lines) {
      for (const pattern of diagnosisPatterns) {
        const match = line.match(pattern);
        if (match && match[1]) {
          let diagnosis = match[1].trim();
          diagnosis = diagnosis.replace(/\s+/g, ' ');
          diagnosis = diagnosis.replace(/\s+\d+\s+[A-Z][a-z]?\s+[A-Z]\s+[a-z]\s+\d+\s*=\s*$/i, '');
          diagnosis = diagnosis.replace(/\s+\d+\s+[A-Z][a-z]?\s+[A-Z]\s+[a-z]?\s*$/i, '');
          diagnosis = diagnosis.replace(/\s+(?:\d+|[A-Z])\s*$/, '');
          diagnosis = diagnosis.replace(/\s*[=]+$/, '');
          diagnosis = diagnosis.replace(/[.,;:]+$/, '').trim();
          diagnosis = restoreVietnameseDiacritics(diagnosis);
          diagnosis = diagnosis.split(/\s+/).slice(0, 20).join(' ');
          if (diagnosis.length >= 2 && diagnosis.length < 200) {
            result.diagnosis = diagnosis;
            break;
          }
        }
      }
      if (result.diagnosis) break;
    }
  }

  // Extract notes
  const notesPatterns = [
    /Ghi\s*chú[:\s]+(.+?)(?:\n\n|$|Ngày|Thời|in|lúc)/i,
    /Lời\s*dặn\s*bác\s*sĩ[:\s]+(.+?)(?:\n\n|$|Ngày|Thời|in|lúc)/i,
    /Toa\s*(\d+)\s*ngày/i,
  ];
  
  for (const pattern of notesPatterns) {
    const match = fullText.match(pattern);
    if (match && match[1]) {
      const notes = match[1].trim();
      if (notes.length > 0 && notes.length < 200) {
        result.notes = notes;
        console.log('✅ Extracted notes:', result.notes);
        break;
      }
    }
  }
  
  if (!result.notes) {
    for (const line of lines) {
      for (const pattern of notesPatterns) {
        const match = line.match(pattern);
        if (match && match[1]) {
          const notes = match[1].trim();
          if (notes.length > 0 && notes.length < 200) {
            result.notes = notes;
            break;
          }
        }
      }
      if (result.notes) break;
    }
  }

  console.log('📊 Final extracted info:', {
    customerName: result.customerName || 'NOT FOUND',
    phoneNumber: result.phoneNumber || 'NOT FOUND',
    doctorName: result.doctorName || 'NOT FOUND',
    hospitalName: result.hospitalName || 'NOT FOUND',
    examinationDate: result.examinationDate || 'NOT FOUND',
    diagnosis: result.diagnosis || 'NOT FOUND',
    notes: result.notes || 'NOT FOUND',
  });

  return result;
}

/**
 * Process prescription image: OCR + extract info
 */
export async function processPrescriptionImage(imagePathOrBase64: string): Promise<ExtractedPrescriptionInfo> {
  let imagePath = imagePathOrBase64;
  
  // Handle base64 image
  if (imagePathOrBase64.startsWith('data:image/')) {
    const matches = imagePathOrBase64.match(/^data:image\/(\w+);base64,(.+)$/);
    if (matches && matches[1] && matches[2]) {
      const mimeType = matches[1];
      const base64Data = matches[2];
      const extension = mimeType === 'jpeg' ? 'jpg' : mimeType;
      const timestamp = Date.now();
      const filename = `temp_prescription_${timestamp}.${extension}`;
      
      // Save to temp file
      const tempDir = path.join(process.cwd(), 'uploads', 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      imagePath = path.join(tempDir, filename);
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(imagePath, buffer);
      
      // Extract text
      const ocrText = await extractTextFromImage(imagePath);
      
      // Clean up temp file
      try {
        fs.unlinkSync(imagePath);
      } catch (error) {
        console.error('Error deleting temp file:', error);
      }
      
      // Extract info
      return extractPrescriptionInfo(ocrText);
    }
  }
  
  // Handle file path
  if (!fs.existsSync(imagePath)) {
    throw new Error('Image file not found');
  }
  
  const ocrText = await extractTextFromImage(imagePath);
  return extractPrescriptionInfo(ocrText);
}

