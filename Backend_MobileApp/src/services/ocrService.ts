import Tesseract from 'tesseract.js';
import fs from 'fs';
import path from 'path';

export interface MedicationInfo {
  name: string; // Tên thuốc
  dosage?: string; // Liều lượng (ví dụ: "200mg", "500mg")
  quantity?: string; // Số lượng (ví dụ: "10 viên", "20 viên", "02 tuýp")
  unit?: string; // Đơn vị (ví dụ: "viên", "tuýp", "chai")
  instructions?: string; // Cách dùng (ví dụ: "Uống: SÁNG 1 Viên", "Dùng ngoài")
  frequency?: string; // Tần suất (ví dụ: "Sáng 1 viên, Chiều 1 viên")
}

export interface ExtractedPrescriptionInfo {
  customerName?: string;
  phoneNumber?: string;
  doctorName?: string;
  hospitalName?: string;
  examinationDate?: string;
  dateOfBirth?: string; // Ngày tháng năm sinh
  yearOfBirth?: string; // Năm sinh (chỉ năm)
  age?: string; // Tuổi
  diagnosis?: string;
  notes?: string;
  medications?: MedicationInfo[]; // Danh sách thuốc
  insuranceNumber?: string; // Mã số bảo hiểm y tế
  address?: string; // Địa chỉ
  rawText: string;
}

/**
 * Extract text from prescription image using OCR
 */
export async function extractTextFromImage(imagePath: string): Promise<string> {
  try {
    console.log('🔍 Starting OCR for image:', imagePath);
    
    // Add timeout wrapper for OCR process (max 120 seconds - increased for production)
    const OCR_TIMEOUT = 120000;
    
    // Suppress console warnings from Tesseract about image size (they're non-fatal)
    const originalConsoleWarn = console.warn;
    const suppressedWarnings: string[] = [];
    console.warn = (...args: any[]) => {
      const message = args.join(' ');
      // Suppress "Image too small to scale" warnings - they're non-fatal
      if (message.includes('Image too small') || message.includes('too small to scale')) {
        suppressedWarnings.push(message);
        return; // Don't log these warnings
      }
      originalConsoleWarn.apply(console, args);
    };
    
    try {
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
      
      // Restore original console.warn
      console.warn = originalConsoleWarn;
      
      // Log suppressed warnings if any (for debugging, but don't fail)
      if (suppressedWarnings.length > 0) {
        console.log('ℹ️ OCR warnings suppressed (non-fatal):', suppressedWarnings.length, 'warnings');
      }
      
      console.log(`✅ OCR completed. Confidence: ${confidence?.toFixed(2)}%`);
      console.log(`📝 Extracted text length: ${text.length} characters`);
      
      return text;
    } catch (ocrError: any) {
      // Restore original console.warn in case of error
      console.warn = originalConsoleWarn;
      throw ocrError;
    }
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

// Track Gemini quota status to avoid multiple failed calls
let geminiQuotaExceeded = false;
let geminiQuotaResetTime: number | null = null;
let lastGeminiApiKey: string | null = null; // Track API key to detect changes

/**
 * Check if Gemini quota is exceeded
 */
function isGeminiQuotaExceeded(): boolean {
  // Check if API key has changed - if so, reset quota status
  const currentApiKey = process.env.GEMINI_API_KEY;
  
  if (currentApiKey && currentApiKey !== lastGeminiApiKey) {
    // API key changed - reset quota status
    const wasExceeded = geminiQuotaExceeded;
    geminiQuotaExceeded = false;
    geminiQuotaResetTime = null;
    lastGeminiApiKey = currentApiKey;
    console.log(`🔄 Gemini API key changed - resetting quota status (was exceeded: ${wasExceeded})`);
    console.log(`   New API key: ${currentApiKey.substring(0, 10)}...${currentApiKey.substring(currentApiKey.length - 4)}`);
    return false; // Allow using new API key
  }
  
  // Update last API key if not set
  if (currentApiKey && !lastGeminiApiKey) {
    lastGeminiApiKey = currentApiKey;
    console.log(`✅ Gemini API key initialized: ${currentApiKey.substring(0, 10)}...${currentApiKey.substring(currentApiKey.length - 4)}`);
  }
  
  if (!geminiQuotaExceeded) {
    return false; // Quota not exceeded
  }
  
  // Reset flag after 1 hour (quota usually resets daily, but we check hourly)
  if (geminiQuotaResetTime && Date.now() > geminiQuotaResetTime) {
    geminiQuotaExceeded = false;
    geminiQuotaResetTime = null;
    console.log('🔄 Gemini quota check reset - will try again');
    return false;
  }
  
  // Still exceeded
  const remainingTime = geminiQuotaResetTime ? Math.round((geminiQuotaResetTime - Date.now()) / 1000 / 60) : 0;
  console.log(`⏸️ Gemini quota still exceeded (will retry in ${remainingTime} minutes)`);
  return true;
}

/**
 * Mark Gemini quota as exceeded
 */
function markGeminiQuotaExceeded() {
  geminiQuotaExceeded = true;
  // Reset after 1 hour
  geminiQuotaResetTime = Date.now() + (60 * 60 * 1000);
  // Store current API key when marking as exceeded
  lastGeminiApiKey = process.env.GEMINI_API_KEY || null;
  console.log('⚠️ Gemini quota exceeded - skipping Gemini calls for 1 hour');
}

/**
 * Check if error is a quota/rate limit error
 */
function isQuotaError(error: any): boolean {
  const errorMessage = error?.message || '';
  const errorStatus = error?.status || error?.response?.status;
  
  return (
    errorStatus === 429 ||
    errorMessage.includes('429') ||
    errorMessage.includes('quota') ||
    errorMessage.includes('Quota exceeded') ||
    errorMessage.includes('rate limit') ||
    errorMessage.includes('Rate limit') ||
    errorMessage.includes('Too Many Requests')
  );
}

/**
 * Use Gemini AI to correct OCR text and extract structured information
 */
async function correctOCRWithGemini(ocrText: string): Promise<string | null> {
  try {
    // Check if Gemini is available
    if (!process.env.GEMINI_API_KEY) {
      console.log('⚠️ Gemini API key not set');
      return null;
    }

    // Check quota status (this will auto-reset if API key changed)
    if (isGeminiQuotaExceeded()) {
      console.log('⏭️ Skipping Gemini OCR correction - quota exceeded');
      return null;
    }
    
    console.log('🔄 Attempting Gemini OCR correction...');
    const { geminiGenerateContentText, buildGeminiCacheKey } = await import('./geminiRuntime.js');

    const prompt = `Bạn là chuyên gia xử lý văn bản tiếng Việt từ OCR. Nhiệm vụ của bạn là sửa lỗi OCR và trả về văn bản chính xác.

Văn bản OCR gốc (có thể có lỗi):
${ocrText}

Yêu cầu:
1. Sửa các lỗi OCR phổ biến (ví dụ: "HUYNH" -> "HUỲNH", "Nguyễn Tha" -> "Nguyễn Thanh Hải")
2. Khôi phục dấu tiếng Việt chính xác
3. Giữ nguyên cấu trúc và định dạng của văn bản
4. Đảm bảo tên người, tên bệnh viện, chẩn đoán được viết đúng
5. Không thêm hoặc bớt thông tin, chỉ sửa lỗi

Trả về văn bản đã được sửa chữa:`;

    const cacheKey = buildGeminiCacheKey('ocr-correct', {
      text: ocrText,
      promptVersion: 'v1',
    });
    const correctedText = await geminiGenerateContentText({
      parts: [{ text: prompt }],
      cacheKey,
      cacheTtlMs: 24 * 60 * 60 * 1000, // 24h
      maxRetries: 3,
      opName: 'correctOCRWithGemini',
    });

    if (correctedText && correctedText.trim().length > 0) {
      console.log('✅ Gemini OCR correction completed');
      return correctedText.trim();
    }

    return null;
  } catch (error: any) {
    // Check if it's a quota error
    if (isQuotaError(error)) {
      const currentApiKey = process.env.GEMINI_API_KEY;
      const apiKeyPreview = currentApiKey ? `${currentApiKey.substring(0, 10)}...${currentApiKey.substring(currentApiKey.length - 4)}` : 'N/A';
      const errorDetails = error?.message || error?.toString() || 'Unknown error';
      markGeminiQuotaExceeded();
      console.error(`❌ Gemini OCR correction - Quota exceeded`);
      console.error(`   API Key: ${apiKeyPreview}`);
      console.error(`   Error: ${errorDetails.substring(0, 200)}`);
      console.error('   ⚠️ If this is a NEW API key, it may also be out of quota (20 requests/day for free tier)');
      console.error('   💡 Solution: Check quota at https://aistudio.google.com/apikey or wait for daily reset');
    } else {
      console.error('❌ Gemini OCR correction error:', error.message);
    }
    return null;
  }
}

/**
 * Use Gemini AI to extract structured prescription information
 */
async function extractInfoWithGemini(ocrText: string, imagePath?: string): Promise<Partial<ExtractedPrescriptionInfo> | null> {
  try {
    // Check if Gemini is available
    if (!process.env.GEMINI_API_KEY) {
      console.log('⚠️ Gemini API key not set');
      return null;
    }

    // Check quota status (this will auto-reset if API key changed)
    if (isGeminiQuotaExceeded()) {
      console.log('⏭️ Skipping Gemini extraction - quota exceeded');
      return null;
    }
    
    console.log('🔄 Attempting Gemini extraction...');
    const { geminiGenerateContentText, buildGeminiCacheKey } = await import('./geminiRuntime.js');

    let prompt = '';
    let parts: any[] = [];

    // If imagePath is provided, use vision API to "see" the image directly
    if (imagePath && fs.existsSync(imagePath)) {
      const imageData = fs.readFileSync(imagePath);
      const base64Image = imageData.toString('base64');
      const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
      
      prompt = `Bạn là chuyên gia trích xuất thông tin từ đơn thuốc tiếng Việt. Hãy "nhìn" vào ảnh đơn thuốc và trích xuất thông tin sau:

Hãy trích xuất và trả về JSON với các trường sau (chỉ trả về JSON, không có text khác):
{
  "customerName": "Tên đầy đủ của bệnh nhân (viết hoa, có dấu đầy đủ)",
  "phoneNumber": "Số điện thoại (nếu có, ví dụ: 0365887517)",
  "doctorName": "Tên đầy đủ của bác sĩ (có dấu đầy đủ)",
  "hospitalName": "Tên đầy đủ của bệnh viện/phòng khám (viết hoa, có dấu đầy đủ)",
  "examinationDate": "Ngày khám (format: YYYY-MM-DD)",
  "dateOfBirth": "Ngày sinh đầy đủ (format: YYYY-MM-DD, ví dụ: 1980-01-01)",
  "yearOfBirth": "Năm sinh (chỉ năm, ví dụ: 1980)",
  "diagnosis": "Chẩn đoán đầy đủ (có dấu đầy đủ, bao gồm tất cả ICD codes và mô tả)",
  "insuranceNumber": "Mã số bảo hiểm y tế (nếu có, ví dụ: DN4828222085030)",
  "address": "Địa chỉ thường trú/tạm trú (nếu có)",
  "medications": [
    {
      "name": "Tên thuốc (có dấu đầy đủ, ví dụ: Celecoxib)",
      "dosage": "Liều lượng (ví dụ: 200mg, 500mg, 1%/20g)",
      "quantity": "Số lượng (ví dụ: 10 viên, 20 viên, 02 tuýp)",
      "unit": "Đơn vị (ví dụ: viên, tuýp, chai)",
      "instructions": "Cách dùng đầy đủ (ví dụ: Uống: SÁNG 1 Viên, Dùng ngoài: Lời dan)",
      "frequency": "Tần suất (ví dụ: Sáng 1 viên, Chiều 1 viên)"
    }
  ]
}

Lưu ý CỰC KỲ QUAN TRỌNG:
1. Tên (customerName, doctorName, hospitalName):
   - PHẢI lấy ĐẦY ĐỦ tên, KHÔNG được cắt ngắn
   - customerName: Ví dụ "HUỲNH THỊ PHƯỢNG" - phải lấy cả 3 từ, không chỉ "HUỲNH"
   - doctorName: Ví dụ "Nguyễn Thanh Danh" - phải lấy cả 3 từ, không chỉ "Nguyễn Thanh"
   - hospitalName: Ví dụ "BV ĐKKV CAI LẬY" - phải lấy đầy đủ, không chỉ "BV ĐKKV CAI"
   - Tất cả tên PHẢI có dấu tiếng Việt đầy đủ và chính xác

2. Ngày sinh/Năm sinh:
   - Tìm kiếm KỸ LƯỠNG phần "Ngày sinh:" hoặc "Năm sinh:" trong ảnh
   - Ngày sinh có thể ở dạng: "01/01/1980", "01-01-1980", "01.01.1980", hoặc chỉ "1980"
   - Nếu chỉ có năm sinh (ví dụ: "1980"), đặt dateOfBirth = "1980-01-01" và yearOfBirth = "1980"
   - Nếu có đầy đủ ngày tháng năm (ví dụ: "01/01/1980"), đặt dateOfBirth = "1980-01-01" và yearOfBirth = "1980"
   - PHẢI TÌM KỸ - ngày sinh có thể bị OCR miss nhưng vẫn có thể thấy trong ảnh

3. Thuốc (medications):
   - Tìm kiếm phần "Thuốc điều trị:" hoặc "Thuốc:" trong ảnh
   - Mỗi thuốc thường có format: "1) Tên thuốc (tên gốc) Liều lượng SL: Số lượng Đơn vị Cách dùng: Hướng dẫn"
   - Trích xuất TẤT CẢ thuốc trong đơn, không bỏ sót
   - Tên thuốc: lấy cả tên thương mại và tên gốc nếu có (ví dụ: "Celecoxib (Celecoxib)")
   - Liều lượng: lấy đầy đủ (ví dụ: "200mg", "500mg", "1%/20g")
   - Số lượng: lấy cả số và đơn vị (ví dụ: "10 viên", "20 viên", "02 tuýp")
   - Cách dùng: lấy đầy đủ hướng dẫn (ví dụ: "Uống: SÁNG 1 Viên", "Dùng ngoài: Lời dan")
   - Tần suất: rút gọn từ cách dùng (ví dụ: "Sáng 1 viên, Chiều 1 viên")

4. Thông tin khác:
   - Tên phải có dấu tiếng Việt đầy đủ và chính xác
   - Chẩn đoán phải đầy đủ, không bị cắt ngắn, bao gồm tất cả ICD codes trong ngoặc đơn
   - Ngày tháng phải đúng format YYYY-MM-DD
   - Nếu không tìm thấy thông tin nào, để null hoặc mảng rỗng []`;

      parts = [
        {
          inlineData: {
            data: base64Image,
            mimeType: mimeType
          }
        },
        { text: prompt }
      ];
      
      console.log('🔍 Using Gemini Vision API to extract info directly from image...');
    } else {
      // Fallback to text-only extraction
      prompt = `Bạn là chuyên gia trích xuất thông tin từ đơn thuốc tiếng Việt. Hãy trích xuất thông tin sau từ văn bản OCR:

Văn bản OCR:
${ocrText}

Hãy trích xuất và trả về JSON với các trường sau (chỉ trả về JSON, không có text khác):
{
  "customerName": "Tên đầy đủ của bệnh nhân (viết hoa, có dấu đầy đủ)",
  "phoneNumber": "Số điện thoại (nếu có, ví dụ: 0365887517)",
  "doctorName": "Tên đầy đủ của bác sĩ (có dấu đầy đủ)",
  "hospitalName": "Tên đầy đủ của bệnh viện/phòng khám (viết hoa, có dấu đầy đủ)",
  "examinationDate": "Ngày khám (format: YYYY-MM-DD)",
  "dateOfBirth": "Ngày sinh đầy đủ (format: YYYY-MM-DD, ví dụ: 1980-01-01)",
  "yearOfBirth": "Năm sinh (chỉ năm, ví dụ: 1980)",
  "diagnosis": "Chẩn đoán đầy đủ (có dấu đầy đủ, bao gồm tất cả ICD codes và mô tả)",
  "insuranceNumber": "Mã số bảo hiểm y tế (nếu có, ví dụ: DN4828222085030)",
  "address": "Địa chỉ thường trú/tạm trú (nếu có)",
  "medications": [
    {
      "name": "Tên thuốc (có dấu đầy đủ, ví dụ: Celecoxib)",
      "dosage": "Liều lượng (ví dụ: 200mg, 500mg, 1%/20g)",
      "quantity": "Số lượng (ví dụ: 10 viên, 20 viên, 02 tuýp)",
      "unit": "Đơn vị (ví dụ: viên, tuýp, chai)",
      "instructions": "Cách dùng đầy đủ (ví dụ: Uống: SÁNG 1 Viên, Dùng ngoài: Lời dan)",
      "frequency": "Tần suất (ví dụ: Sáng 1 viên, Chiều 1 viên)"
    }
  ]
}

Lưu ý QUAN TRỌNG:
1. Tên (customerName, doctorName, hospitalName):
   - PHẢI lấy ĐẦY ĐỦ tên, KHÔNG được cắt ngắn
   - customerName: Ví dụ "HUỲNH THỊ PHƯỢNG" - phải lấy cả 3 từ, không chỉ "HUỲNH"
   - doctorName: Ví dụ "Nguyễn Thanh Danh" - phải lấy cả 3 từ, không chỉ "Nguyễn Thanh"
   - hospitalName: Ví dụ "BV ĐKKV CAI LẬY" - phải lấy đầy đủ, không chỉ "BV ĐKKV CAI"
   - Tất cả tên PHẢI có dấu tiếng Việt đầy đủ và chính xác

2. Ngày sinh/Năm sinh:
   - Tìm kiếm kỹ lưỡng phần "Ngày sinh:" hoặc "Năm sinh:" trong văn bản
   - Ngày sinh có thể ở dạng: "01/01/1980", "01-01-1980", "01.01.1980", hoặc chỉ "1980"
   - Nếu chỉ có năm sinh (ví dụ: "1980"), đặt dateOfBirth = "1980-01-01" và yearOfBirth = "1980"
   - Nếu có đầy đủ ngày tháng năm (ví dụ: "01/01/1980"), đặt dateOfBirth = "1980-01-01" và yearOfBirth = "1980"

3. Thuốc (medications):
   - Tìm kiếm phần "Thuốc điều trị:" hoặc "Thuốc:" trong văn bản OCR
   - Mỗi thuốc thường có format: "1) Tên thuốc (tên gốc) Liều lượng SL: Số lượng Đơn vị Cách dùng: Hướng dẫn"
   - Trích xuất TẤT CẢ thuốc trong đơn, không bỏ sót
   - Tên thuốc: lấy cả tên thương mại và tên gốc nếu có (ví dụ: "Celecoxib (Celecoxib)")
   - Liều lượng: lấy đầy đủ (ví dụ: "200mg", "500mg", "1%/20g")
   - Số lượng: lấy cả số và đơn vị (ví dụ: "10 viên", "20 viên", "02 tuýp")
   - Cách dùng: lấy đầy đủ hướng dẫn (ví dụ: "Uống: SÁNG 1 Viên", "Dùng ngoài: Lời dan")
   - Tần suất: rút gọn từ cách dùng (ví dụ: "Sáng 1 viên, Chiều 1 viên")

4. Thông tin khác:
   - Tên phải có dấu tiếng Việt đầy đủ và chính xác
   - Chẩn đoán phải đầy đủ, không bị cắt ngắn, bao gồm tất cả ICD codes trong ngoặc đơn
   - Ngày tháng phải đúng format YYYY-MM-DD
   - Nếu không tìm thấy thông tin nào, để null hoặc mảng rỗng []`;

      parts = [{ text: prompt }];
    }

    const cacheKey = (() => {
      // Prefer caching by image file fingerprint when available; fallback to OCR text hash.
      try {
        if (imagePath && fs.existsSync(imagePath)) {
          const stat = fs.statSync(imagePath);
          return buildGeminiCacheKey('ocr-extract-vision', {
            imagePath: path.basename(imagePath),
            mtimeMs: stat.mtimeMs,
            size: stat.size,
            promptVersion: 'v1',
          });
        }
      } catch {}
      return buildGeminiCacheKey('ocr-extract-text', { text: ocrText, promptVersion: 'v1' });
    })();

    const responseText = await geminiGenerateContentText({
      parts,
      cacheKey,
      cacheTtlMs: 24 * 60 * 60 * 1000, // 24h
      maxRetries: 3,
      opName: 'extractInfoWithGemini',
    });
    
    if (!responseText) {
      console.warn('⚠️ Gemini extraction timeout or failed');
      return null;
    }

    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const extractedInfo = JSON.parse(jsonMatch[0]);
      console.log('✅ Gemini extracted structured info');
      if (imagePath) {
        console.log('   📸 Extracted from image using Vision API');
      }
      return extractedInfo;
    }

    return null;
  } catch (error: any) {
    // Check if it's a quota error
    if (isQuotaError(error)) {
      const currentApiKey = process.env.GEMINI_API_KEY;
      const apiKeyPreview = currentApiKey ? `${currentApiKey.substring(0, 10)}...${currentApiKey.substring(currentApiKey.length - 4)}` : 'N/A';
      const errorDetails = error?.message || error?.toString() || 'Unknown error';
      markGeminiQuotaExceeded();
      console.error(`❌ Gemini extraction - Quota exceeded`);
      console.error(`   API Key: ${apiKeyPreview}`);
      console.error(`   Error: ${errorDetails.substring(0, 200)}`);
      console.error('   ⚠️ If this is a NEW API key, it may also be out of quota (20 requests/day for free tier)');
      console.error('   💡 Solution: Check quota at https://aistudio.google.com/apikey or wait for daily reset');
    } else {
      console.error('❌ Gemini extraction error:', error.message);
    }
    return null;
  }
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
      let ocrText = await extractTextFromImage(imagePath);
      
      // Try to correct OCR with Gemini AI
      const correctedText = await correctOCRWithGemini(ocrText);
      if (correctedText) {
        console.log('✅ Using Gemini-corrected OCR text');
        ocrText = correctedText;
      }
      
      // Try to extract structured info with Gemini (pass imagePath for Vision API)
      const geminiInfo = await extractInfoWithGemini(ocrText, imagePath);
      
      // Clean up temp file
      try {
        fs.unlinkSync(imagePath);
      } catch (error) {
        console.error('Error deleting temp file:', error);
      }
      
      // Extract info using pattern matching
      const extractedInfo = extractPrescriptionInfo(ocrText);
      
      // Merge Gemini results (PRIORITIZE Gemini AI - it's more accurate)
      if (geminiInfo) {
        console.log('🔄 Merging Gemini AI results with pattern matching results...');
        // QUAN TRỌNG: Ưu tiên Gemini AI vì nó chính xác hơn, đặc biệt với tiếng Việt có dấu
        // Chỉ dùng pattern matching làm fallback nếu Gemini không có giá trị
        if (geminiInfo.customerName && geminiInfo.customerName.trim().length > 0) {
          extractedInfo.customerName = geminiInfo.customerName.trim();
          console.log('✅ Using Gemini-extracted customer name:', extractedInfo.customerName);
        } else if (extractedInfo.customerName) {
          console.log('ℹ️ Using pattern-matching customer name (Gemini did not provide):', extractedInfo.customerName);
        }
        
        if (geminiInfo.doctorName && geminiInfo.doctorName.trim().length > 0) {
          extractedInfo.doctorName = geminiInfo.doctorName.trim();
          console.log('✅ Using Gemini-extracted doctor name:', extractedInfo.doctorName);
        } else if (extractedInfo.doctorName) {
          console.log('ℹ️ Using pattern-matching doctor name (Gemini did not provide):', extractedInfo.doctorName);
        }
        
        if (geminiInfo.hospitalName && geminiInfo.hospitalName.trim().length > 0) {
          extractedInfo.hospitalName = geminiInfo.hospitalName.trim();
          console.log('✅ Using Gemini-extracted hospital name:', extractedInfo.hospitalName);
        } else if (extractedInfo.hospitalName) {
          console.log('ℹ️ Using pattern-matching hospital name (Gemini did not provide):', extractedInfo.hospitalName);
        }
        
        // Merge additional personal info (Gemini is more accurate for these)
        if (geminiInfo.phoneNumber) {
          extractedInfo.phoneNumber = geminiInfo.phoneNumber;
          console.log('✅ Using Gemini-extracted phone number:', extractedInfo.phoneNumber);
        }
        if (geminiInfo.insuranceNumber) {
          extractedInfo.insuranceNumber = geminiInfo.insuranceNumber;
          console.log('✅ Using Gemini-extracted insurance number:', extractedInfo.insuranceNumber);
        }
        if (geminiInfo.address) {
          extractedInfo.address = geminiInfo.address;
          console.log('✅ Using Gemini-extracted address:', extractedInfo.address);
        }
        
        // Merge medications (Gemini is much better at extracting structured medication data)
        if (geminiInfo.medications && Array.isArray(geminiInfo.medications) && geminiInfo.medications.length > 0) {
          extractedInfo.medications = geminiInfo.medications;
          console.log(`✅ Using Gemini-extracted medications (${geminiInfo.medications.length} medications)`);
          geminiInfo.medications.forEach((med: MedicationInfo, index: number) => {
            console.log(`   ${index + 1}. ${med.name}${med.dosage ? ` - ${med.dosage}` : ''}${med.quantity ? ` (${med.quantity})` : ''}`);
          });
        }
        
        if (geminiInfo.diagnosis && geminiInfo.diagnosis.length > (extractedInfo.diagnosis?.length || 0)) {
          extractedInfo.diagnosis = geminiInfo.diagnosis;
          console.log('✅ Using Gemini-extracted diagnosis:', extractedInfo.diagnosis);
        }
        if (geminiInfo.examinationDate) {
          extractedInfo.examinationDate = geminiInfo.examinationDate;
          console.log('✅ Using Gemini-extracted examination date:', extractedInfo.examinationDate);
        }
        if (geminiInfo.dateOfBirth) {
          extractedInfo.dateOfBirth = geminiInfo.dateOfBirth;
          console.log('✅ Using Gemini-extracted date of birth:', extractedInfo.dateOfBirth);
        }
        if (geminiInfo.yearOfBirth) {
          extractedInfo.yearOfBirth = geminiInfo.yearOfBirth;
          console.log('✅ Using Gemini-extracted year of birth:', extractedInfo.yearOfBirth);
        }
      }
      
      return extractedInfo;
    }
  }
  
  // Handle file path
  if (!fs.existsSync(imagePath)) {
    throw new Error('Image file not found');
  }
  
  let ocrText = await extractTextFromImage(imagePath);
  
  // Try to correct OCR with Gemini AI
  const correctedText = await correctOCRWithGemini(ocrText);
  if (correctedText) {
    console.log('✅ Using Gemini-corrected OCR text');
    ocrText = correctedText;
  }
  
  // Try to extract structured info with Gemini (pass imagePath for Vision API)
  const geminiInfo = await extractInfoWithGemini(ocrText, imagePath);
  
  // Extract info using pattern matching (always works, even without Gemini)
  const extractedInfo = extractPrescriptionInfo(ocrText);
  console.log('✅ Extracted prescription info using pattern matching');
  
  // Merge Gemini results (PRIORITIZE Gemini AI - it's more accurate)
  if (geminiInfo) {
    console.log('🔄 Merging Gemini AI results with pattern matching results...');
    // QUAN TRỌNG: Ưu tiên Gemini AI vì nó chính xác hơn, đặc biệt với tiếng Việt có dấu
    // Chỉ dùng pattern matching làm fallback nếu Gemini không có giá trị
    if (geminiInfo.customerName && geminiInfo.customerName.trim().length > 0) {
      extractedInfo.customerName = geminiInfo.customerName.trim();
      console.log('✅ Using Gemini-extracted customer name:', extractedInfo.customerName);
    } else if (extractedInfo.customerName) {
      console.log('ℹ️ Using pattern-matching customer name (Gemini did not provide):', extractedInfo.customerName);
    }
    
    if (geminiInfo.doctorName && geminiInfo.doctorName.trim().length > 0) {
      extractedInfo.doctorName = geminiInfo.doctorName.trim();
      console.log('✅ Using Gemini-extracted doctor name:', extractedInfo.doctorName);
    } else if (extractedInfo.doctorName) {
      console.log('ℹ️ Using pattern-matching doctor name (Gemini did not provide):', extractedInfo.doctorName);
    }
    
    if (geminiInfo.hospitalName && geminiInfo.hospitalName.trim().length > 0) {
      extractedInfo.hospitalName = geminiInfo.hospitalName.trim();
      console.log('✅ Using Gemini-extracted hospital name:', extractedInfo.hospitalName);
    } else if (extractedInfo.hospitalName) {
      console.log('ℹ️ Using pattern-matching hospital name (Gemini did not provide):', extractedInfo.hospitalName);
    }
    
    // Merge additional personal info (Gemini is more accurate for these)
    if (geminiInfo.phoneNumber) {
      extractedInfo.phoneNumber = geminiInfo.phoneNumber;
      console.log('✅ Using Gemini-extracted phone number:', extractedInfo.phoneNumber);
    }
    if (geminiInfo.insuranceNumber) {
      extractedInfo.insuranceNumber = geminiInfo.insuranceNumber;
      console.log('✅ Using Gemini-extracted insurance number:', extractedInfo.insuranceNumber);
    }
    if (geminiInfo.address) {
      extractedInfo.address = geminiInfo.address;
      console.log('✅ Using Gemini-extracted address:', extractedInfo.address);
    }
    
    // Merge medications (Gemini is much better at extracting structured medication data)
    if (geminiInfo.medications && Array.isArray(geminiInfo.medications) && geminiInfo.medications.length > 0) {
      extractedInfo.medications = geminiInfo.medications;
      console.log(`✅ Using Gemini-extracted medications (${geminiInfo.medications.length} medications)`);
      geminiInfo.medications.forEach((med: MedicationInfo, index: number) => {
        console.log(`   ${index + 1}. ${med.name}${med.dosage ? ` - ${med.dosage}` : ''}${med.quantity ? ` (${med.quantity})` : ''}`);
      });
    }
    
    if (geminiInfo.diagnosis && geminiInfo.diagnosis.length > (extractedInfo.diagnosis?.length || 0)) {
      extractedInfo.diagnosis = geminiInfo.diagnosis;
      console.log('✅ Using Gemini-extracted diagnosis:', extractedInfo.diagnosis);
    }
    if (geminiInfo.examinationDate) {
      extractedInfo.examinationDate = geminiInfo.examinationDate;
      console.log('✅ Using Gemini-extracted examination date:', extractedInfo.examinationDate);
    }
    if (geminiInfo.dateOfBirth) {
      extractedInfo.dateOfBirth = geminiInfo.dateOfBirth;
      console.log('✅ Using Gemini-extracted date of birth:', extractedInfo.dateOfBirth);
    }
    if (geminiInfo.yearOfBirth) {
      extractedInfo.yearOfBirth = geminiInfo.yearOfBirth;
      console.log('✅ Using Gemini-extracted year of birth:', extractedInfo.yearOfBirth);
    }
  }
  
  return extractedInfo;
}

