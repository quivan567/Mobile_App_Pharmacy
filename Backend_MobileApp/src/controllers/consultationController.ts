import { Request, Response } from 'express';
import { Prescription, User, Product, Order, OrderItem } from '../models/schema.js';
import { NotificationController } from './notificationController.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import { extractTextFromImage, extractPrescriptionInfo, processPrescriptionImage } from '../services/ocrService.js';
import { findExactMatch, findSimilarMedicines, parseMedicineName } from '../services/medicineMatchingService.js';
import { generatePrescriptionAdviceWithGemini } from '../services/geminiService.js';
import { StockService } from '../services/stockService.js';

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
      
      // Use the saved prescription image path from database
      if (prescription.prescriptionImage) {
        imagePath = prescription.prescriptionImage;
        console.log('Using image from database:', imagePath);
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
    const analysisResult = await performAIAnalysis(prescriptionText, imagePath);

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
    if (prescription) {
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
  } catch (error) {
    console.error('Prescription analysis error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
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

  // Step 1: Extract text from image using OCR if image is provided
  if (prescriptionImage && !prescriptionText) {
    try {
      console.log('🔍 Starting OCR analysis for image:', prescriptionImage);
      
      // Check if file exists
      if (fs.existsSync(prescriptionImage)) {
        // Extract text from image
        const ocrText = await extractTextFromImage(prescriptionImage);
        prescriptionText = ocrText;
        
        // Extract prescription info (customer name, doctor, hospital, etc.)
        extractedInfo = extractPrescriptionInfo(ocrText);
        
        // Only add note if OCR was successful - no need for technical details
        console.log('✅ OCR completed. Extracted text length:', ocrText.length);
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

  // Step 2: Parse prescription text to extract medicine names
  if (prescriptionText) {
    const lines = prescriptionText.split('\n').map(line => line.trim()).filter(line => line.length > 2);
    
    // List of keywords that indicate non-medicine lines (should be excluded)
    const nonMedicineKeywords = [
      'đơn thuốc', 'họ tên', 'tuổi', 'chẩn đoán', 'chân đoán', 'chan doan',
      'ngày', 'bác sĩ', 'bác sỹ', 'bệnh viện', 'phòng khám', 'số điện thoại',
      'địa chỉ', 'dia chi', 'cách dùng', 'cach dung', 'lời dặn', 'loi dan',
      'lời dan', 'thuốc điều trị', 'thuoc dieu tri', 'tên đơn vi', 'ten don vi',
      'pon thuoc', 'mã số', 'ma so', 'nơi thường trú', 'noi thuong tru',
      'giới tính', 'gioi tinh', 'cân nặng', 'can nang', 'khám bệnh', 'kham benh',
      'ký', 'ghi rõ', 'ghi ro', 'họ và tên', 'ho va ten', 'người đưa', 'nguoi dua'
    ];

    // Filter out non-medicine lines - More flexible like web version
    const medicineLines = lines.filter(line => {
      const lowerLine = line.toLowerCase();
      // Check if line contains any non-medicine keyword
      const hasNonMedicineKeyword = nonMedicineKeywords.some(keyword => lowerLine.includes(keyword));
      if (hasNonMedicineKeyword) return false;
      
      // A medicine line should have at least one of these indicators (more flexible):
      // 1. Contains dosage (mg, g, ml, %, mcg, iu)
      const hasDosage = /\d+\s*(mg|g|ml|l|%|mcg|iu|ui)/i.test(line);
      // 2. Contains quantity indicator (SL:, số + viên/hộp/chai/gói/lọ/tuýp)
      const hasQuantity = /(SL\s*:|số lượng|so luong|:\s*\d+\s*(viên|hộp|chai|gói|lọ|tuýp|tuyp))/i.test(line);
      // 3. Starts with numbered list (1) or 1.) - This is the most common pattern
      const isNumberedList = /^\d+[\.\)]\s*/.test(line);
      // 4. Contains medicine name pattern (more flexible - doesn't require capital letter)
      const hasMedicinePattern = /[A-Za-zÀ-ỹ]/.test(line);
      
      // More flexible: If it's a numbered list, accept it even without strict patterns
      // This matches the web version's simpler logic
      if (isNumberedList && hasMedicinePattern && !hasNonMedicineKeyword) {
        return true;
      }
      
      // Otherwise, must have at least one medicine indicator AND not have non-medicine keywords
      return (hasDosage || hasQuantity || isNumberedList) && hasMedicinePattern && !hasNonMedicineKeyword;
    });

    // Extract medicine names from lines
    for (const line of medicineLines) {
      // Try different patterns to extract medicine names
      // Pattern 1: Numbered list (1. Medicine name or 1) Medicine name)
      let medicineMatch = line.match(/^\d+[\.\)]\s*(.+)/);
      if (!medicineMatch) {
        // Pattern 2: Medicine name at start of line (common in prescriptions)
        // More flexible - doesn't require capital letter (OCR might miss it)
        // Use the same pattern as web version for consistency
        medicineMatch = line.match(/^([A-Za-zÀ-ỹ][A-Za-zÀ-ỹ0-9\s_+\-\.\/\(\)]+)/);
      }
      
      // Pattern 3: Try the web version's pattern for numbered lists (more flexible)
      if (!medicineMatch) {
        const webPattern = /\d+[\.\)]\s*((?:(?!\s*\d+[\.\)]).)+?)(?=\s*\d+[\.\)]|$)/g;
        const webMatch = webPattern.exec(line);
        if (webMatch && webMatch[1]) {
          medicineMatch = { 1: webMatch[1].trim() };
        }
      }
      
      if (medicineMatch && medicineMatch[1]) {
        const medicineText = medicineMatch[1].trim();
        
        // Skip if too short or looks like a header
        if (medicineText.length < 3 || medicineText.length > 150) continue;
        
        // More flexible validation: similar to web version
        // Only require that it contains letters (medicine names should have letters)
        if (!/[a-zA-ZÀ-ỹ]/.test(medicineText)) continue;
        
        // Additional validation: prefer dosage or quantity indicator, but not required
        // This makes it more flexible like the web version
        const hasDosageOrQuantity = /\d+\s*(mg|g|ml|l|%|mcg|iu|ui)|SL\s*:|số lượng|so luong|:\s*\d+\s*(viên|hộp|chai|gói|lọ|tuýp|tuyp)/i.test(medicineText);
        // If no dosage/quantity, still accept if it has numbers (could be dosage in different format)
        // This is more permissive than before
        if (!hasDosageOrQuantity && !/\d+/.test(medicineText) && medicineText.length < 5) {
          // Only skip very short text without numbers
          continue;
        }
        
        // Extract quantity from medicine text
        const quantityMatch = medicineText.match(/SL\s*:\s*(\d+)|(\d+)\s*(viên|hộp|chai|gói|lọ|tuýp|tuyp)/i);
        const quantity = quantityMatch ? parseInt(quantityMatch[1] || quantityMatch[2]) || 1 : 1;
        
        // Remove quantity from medicine name for matching
        const cleanMedicineText = medicineText
          .replace(/SL\s*:\s*\d+/gi, '')
          .replace(/x\s*\d+/gi, '')
          .replace(/\d+\s*(viên|hộp|chai|gói|lọ|tuýp|tuyp)/gi, '')
          .replace(/:\s*\d+\s*(viên|hộp|chai|gói|lọ|tuýp|tuyp)/gi, '')
          .trim();
        
        if (cleanMedicineText.length < 2) continue;
        
        // Add to prescriptionMedicines list
        prescriptionMedicines.push({
          originalText: medicineText,
          cleanText: cleanMedicineText,
          quantity: quantity
        });
        
        // Step 3: Find exact match using medicine matching service
        const exactMatch = await findExactMatch(cleanMedicineText, medicineText);
        
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
          // Step 4: Find similar medicines for suggestions (increased from 3 to 5)
          // Always ensure we have suggestions - the function will try multiple strategies
          console.log(`🔍 Searching for similar medicines for: "${cleanMedicineText}" (original: "${medicineText}")`);
          const similarMedicines = await findSimilarMedicines(cleanMedicineText, medicineText, 5);
          console.log(`📊 Found ${similarMedicines.length} similar medicines for "${cleanMedicineText}"`);
          
          // Always create suggestions array - findSimilarMedicines now guarantees at least some results
          const suggestions = similarMedicines.map((p: any) => {
            const suggestion = {
              productId: String(p._id || p.productId),
              productName: p.name,
              price: p.price,
              unit: p.unit,
              confidence: p.confidence || 0.3,
              matchReason: p.matchReason || 'general_suggestion'
            };
            console.log(`  ✅ Suggestion: ${suggestion.productName} (ID: ${suggestion.productId}, confidence: ${suggestion.confidence}, reason: ${suggestion.matchReason})`);
            return suggestion;
          });
          
          // Always add to notFoundMedicines with suggestions (guaranteed to have at least 1)
          notFoundMedicines.push({
            originalText: medicineText,
            suggestions
          });
          
          // Add to relatedMedicines for overall suggestions
          relatedMedicines.push(...similarMedicines);
          
          requiresConsultation = true;
        }
      }
    }
  }

  // Step 3: Optional Gemini call to generate higher–level advice
  try {
    const geminiResult = await generatePrescriptionAdviceWithGemini({
      prescriptionText,
      foundMedicines,
      notFoundMedicines,
      extractedInfo,
    });

    if (geminiResult) {
      if (geminiResult.summary) {
        // Tinh gọn: chỉ lấy phần tóm tắt ngắn gọn
        const shortSummary = geminiResult.summary.length > 100 
          ? geminiResult.summary.substring(0, 100) + '...' 
          : geminiResult.summary;
        analysisNotes.push(`🤖 ${shortSummary}`);
      }
      if (Array.isArray(geminiResult.safetyNotes)) {
        // Chỉ lấy 2 lưu ý quan trọng nhất
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
        // Chỉ lấy 1 gợi ý quan trọng nhất
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
      // Boost overall confidence slightly if Gemini ran successfully
      confidence = Math.min(0.98, confidence + 0.05);
    }
  } catch (geminiError: any) {
    console.error('Gemini analysis error (non‑blocking):', geminiError?.message || geminiError);
  }

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
        
        // Try to find exact match
        const exactMatch = await findExactMatch(cleanMedicineText, medicineText);
        
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
          console.log(`🔍 Fallback: Searching for similar medicines for: "${cleanMedicineText}"`);
          const similarMedicines = await findSimilarMedicines(cleanMedicineText, medicineText, 5);
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
    aiModel: process.env.GEMINI_MODEL
      ? `pharmacy-v2.0-ocr+${process.env.GEMINI_MODEL}`
      : 'pharmacy-v2.0-ocr',
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
