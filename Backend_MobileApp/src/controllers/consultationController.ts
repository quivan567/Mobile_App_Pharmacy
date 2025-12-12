import { Request, Response } from 'express';
import { Prescription, User, Product, Order, OrderItem } from '../models/schema.js';
import { NotificationController } from './notificationController.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import { extractTextFromImage, extractPrescriptionInfo, processPrescriptionImage } from '../services/ocrService.js';
import {
  findExactMatch,
  findSimilarMedicines,
  parseMedicineName,
  normalizeDosageForComparison,
} from '../services/medicineMatchingService.js';
// Gemini API disabled for prescription analysis
// import { generatePrescriptionAdviceWithGemini } from '../services/geminiService.js';
import { StockService } from '../services/stockService.js';

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
  suggestedMedicines: any[]
): Promise<string> {
  if (!suggestedMedicines || suggestedMedicines.length === 0) {
    return `Không tìm thấy chính xác tên thuốc "${originalMedicineName}" trong hệ thống. Vui lòng liên hệ dược sĩ để được tư vấn.`;
  }

  const db = mongoose.connection.db;
  let suggestionText = `Không tìm thấy chính xác tên thuốc trong đơn.\n\n`;

  if (suggestedMedicines.length === 1) {
    const med = suggestedMedicines[0];
    let groupTherapeutic = med.groupTherapeutic || '';
    let indication = med.indication || '';
    let contraindication = med.contraindication || '';
    let medicineInfo: any = null;

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
              { activeIngredient: { $regex: searchName, $options: 'i' } },
            ],
          });

          if (medicineInfo) {
            if (medicineInfo.groupTherapeutic && !groupTherapeutic) {
              groupTherapeutic = medicineInfo.groupTherapeutic;
            }
            if (!indication) {
              indication =
                medicineInfo.indication ||
                medicineInfo.description ||
                medicineInfo.uses ||
                medicineInfo.congDung ||
                '';
            }
            if (!contraindication) {
              contraindication =
                medicineInfo.contraindication ||
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

    const dosageText = originalDosage ? ` – Hàm lượng gốc: ${originalDosage}` : '';
    const indicationText = indication ? ` – Công dụng: ${indication}` : '';
    const contraindicationText = contraindication ? ` – Chống chỉ định: ${contraindication}` : '';
    const reasonText = med.matchReason ? ` – Lý do đề xuất: ${getMatchExplanation(med.matchReason, med.confidence || 0.3)}` : '';

    suggestionText += `Đề xuất: ${med.productName || med.name}${dosageText}${indicationText}${contraindicationText}${reasonText}`;
  } else {
    suggestionText += suggestedMedicines
      .map((med: any, idx: number) => {
        const reason = med.matchReason ? getMatchExplanation(med.matchReason, med.confidence || 0.3) : 'Thuốc tương tự';
        return `${idx + 1}. ${med.productName || med.name || 'Thuốc'} – Lý do: ${reason}`;
      })
      .join('\n');
  }

  return suggestionText.trim();
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

async function enrichAnalysisResult(analysisResult: any) {
  if (!analysisResult) return analysisResult;

  const foundMedicines = Array.isArray(analysisResult.foundMedicines)
    ? analysisResult.foundMedicines
    : [];
  const notFoundMedicines = Array.isArray(analysisResult.notFoundMedicines)
    ? analysisResult.notFoundMedicines
    : [];

  // Enrich found medicines with explanation + contraindication
  const enrichedFound = await Promise.all(
    foundMedicines.map(async (med: any) => {
      const name = med.productName || med.name || med.originalText || '';
      let contraindication = med.contraindication || '';
      if (!contraindication) {
        try {
          contraindication = await getContraindicationFromMedicines(
            name,
            med.groupTherapeutic,
            med.medicineInfo
          );
        } catch (err) {
          console.error('Error getting contraindication for found medicine:', err);
        }
      }
      return {
        ...med,
        matchExplanation: getMatchExplanation(med.matchReason, med.confidence || 0.3),
        contraindication: contraindication || undefined,
      };
    })
  );

  // Enrich notFound suggestions + suggestion text
  const enrichedNotFound = await Promise.all(
    notFoundMedicines.map(async (item: any) => {
      const suggestions = Array.isArray(item.suggestions) ? item.suggestions : [];
      const enrichedSuggestions = await Promise.all(
        suggestions.map(async (s: any) => {
          const name = s.productName || s.name || s.originalText || '';
          let contraindication = s.contraindication || '';
          if (!contraindication) {
            try {
              contraindication = await getContraindicationFromMedicines(
                name,
                s.groupTherapeutic,
                s.medicineInfo
              );
            } catch (err) {
              console.error('Error getting contraindication for suggestion:', err);
            }
          }
          return {
            ...s,
            matchExplanation: getMatchExplanation(s.matchReason, s.confidence || 0.3),
            contraindication: contraindication || undefined,
          };
        })
      );

      let suggestionText: string | undefined = undefined;
      try {
        suggestionText = await formatSuggestionText(
          item.originalText || 'Thuốc',
          null,
          enrichedSuggestions
        );
      } catch (err) {
        console.error('Error formatting suggestion text:', err);
      }

      return {
        ...item,
        suggestions: enrichedSuggestions,
        suggestionText,
      };
    })
  );

  return {
    ...analysisResult,
    foundMedicines: enrichedFound,
    notFoundMedicines: enrichedNotFound,
  };
}

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
      prescriptionImage: imagePath,
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

    // Create prescription record
    const prescription = new Prescription({
      userId,
      doctorName: doctorName || 'Không xác định',
      hospitalName: hospitalName || 'Không xác định',
      prescriptionImage: req.file.path,
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

    // Create prescription record for saving
    const prescription = new Prescription({
      userId,
      customerName: customerNameValue,
      phoneNumber: phoneNumberValue,
      doctorName: doctorName || 'Không xác định',
      hospitalName: hospitalName || 'Không xác định',
      prescriptionImage: req.file.path,
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
        const fileExists = fs.existsSync(imagePath);
        console.log('Using image from database:', { imagePath, fileExists });
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
      
      // Enrich analysis result separately to avoid crashing if enrichment fails
      try {
        analysisResult = await enrichAnalysisResult(analysisResult);
      } catch (enrichError: any) {
        console.warn('⚠️ Error enriching analysis result (continuing with basic result):', {
          message: enrichError?.message,
          name: enrichError?.name,
        });
        // Continue with basic analysis result if enrichment fails
        // This ensures the request still succeeds even if Gemini API fails
      }
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
        
        // Save suggested medicines from notFoundMedicines
        if (analysisResult.notFoundMedicines && analysisResult.notFoundMedicines.length > 0) {
          const allSuggestions: any[] = [];
          analysisResult.notFoundMedicines.forEach((notFound: any) => {
            if (notFound.suggestions && Array.isArray(notFound.suggestions)) {
              notFound.suggestions.forEach((suggestion: any) => {
                // Avoid duplicates by checking productId
                if (!allSuggestions.find(s => s.productId === String(suggestion.productId))) {
                  allSuggestions.push({
                    productId: String(suggestion.productId),
                    productName: suggestion.productName,
                    price: suggestion.price,
                    unit: suggestion.unit,
                    confidence: suggestion.confidence,
                    matchReason: suggestion.matchReason,
                    originalText: notFound.originalText,
                  });
                }
              });
            }
          });
          
          if (allSuggestions.length > 0) {
            prescription.suggestedMedicines = allSuggestions;
            console.log(`Saved ${allSuggestions.length} suggested medicines to prescription`);
          }
        }
        
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
      
      // Check if file exists
      if (fs.existsSync(prescriptionImage)) {
        // Use processPrescriptionImage to get OCR + Gemini correction + extract info
        // This will automatically use Gemini if available
        extractedInfo = await processPrescriptionImage(prescriptionImage);
        prescriptionText = extractedInfo.rawText;
        
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
          // Step 4: Find similar medicines for suggestions (increased from 3 to 5)
          // Always ensure we have suggestions - the function will try multiple strategies
          const similarInput = searchTerms[0] || cleanMedicineText;
          console.log(`🔍 Searching for similar medicines for: "${similarInput}" (original: "${medicineText}")`);
          const similarMedicines = await findSimilarMedicines(similarInput, medicineText, 5);
          console.log(`📊 Found ${similarMedicines.length} similar medicines for "${cleanMedicineText}"`);
          
          // Always create suggestions array - findSimilarMedicines now guarantees at least some results
          const suggestions = await Promise.all(
            similarMedicines.map(async (p: any) => {
              const suggestionName = p.name || '';
              const suggestionInfo = await fetchMedicineInfo(suggestionName);
              const activeIngredient =
                p.activeIngredient || suggestionInfo?.activeIngredient || suggestionInfo?.genericName;
              const groupTherapeutic = p.groupTherapeutic || suggestionInfo?.groupTherapeutic;
              const contraindication =
                p.contraindication ||
                suggestionInfo?.contraindication ||
                suggestionInfo?.chongChiDinh ||
                suggestionInfo?.contraindications;

              const originalParsed = parseMedicineName(cleanMedicineText);
              const suggestionParsed = parseMedicineName(suggestionName);
              const sameDosage = isSameDosage(originalParsed.dosage, suggestionParsed.dosage);

              let matchReason = p.matchReason || 'similar';
              if (sameDosage && matchReason === 'similar') {
                matchReason = 'same_name_same_dosage';
              } else if (
                !sameDosage &&
                matchReason === 'similar' &&
                (originalParsed.dosage || suggestionParsed.dosage)
              ) {
                matchReason = 'same_name_different_dosage';
              }

              const suggestion = {
                productId: String(p._id || p.productId),
                productName: suggestionName,
                price: p.price,
                unit: p.unit,
                confidence: p.confidence || 0.3,
                matchReason,
                activeIngredient,
                groupTherapeutic,
                contraindication: contraindication || undefined,
              };
              console.log(
                `  ✅ Suggestion: ${suggestion.productName} (ID: ${suggestion.productId}, confidence: ${suggestion.confidence}, reason: ${suggestion.matchReason})`
              );
              return suggestion;
            })
          );
          
          // Always add to notFoundMedicines with suggestions (guaranteed to have at least 1)
          result.notFoundMedicine = {
            originalText: medicineText,
            suggestions
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
          // Find similar medicines for suggestions
          const similarInput = searchTerms[0] || cleanMedicineText;
          console.log(`🔍 Fallback: Searching for similar medicines for: "${similarInput}"`);
          const similarMedicines = await findSimilarMedicines(similarInput, medicineText, 5);
          console.log(`📊 Fallback: Found ${similarMedicines.length} similar medicines`);
          
          const suggestions = similarMedicines.map((p: any) => {
            return {
              productId: String(p._id || p.productId),
              productName: p.name,
              price: p.price,
              unit: p.unit,
              confidence: p.confidence || 0.3,
              matchReason: p.matchReason || 'general_suggestion'
            };
          });
          
          notFoundMedicines.push({
            originalText: medicineText,
            suggestions
          });
          
          relatedMedicines.push(...similarMedicines);
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

  return {
    foundMedicines,
    notFoundMedicines,
    prescriptionMedicines, // Raw medicines from OCR/text
    relatedMedicines: uniqueRelatedMedicines.slice(0, 10), // Similar medicines for suggestions
    totalEstimatedPrice,
    requiresConsultation,
    analysisNotes,
    confidence,
    analysisTimestamp: new Date(),
    aiModel: 'pharmacy-v2.0-ocr', // Gemini disabled - using OCR + database matching only
    extractedInfo // Customer name, doctor, hospital, etc. from OCR
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
