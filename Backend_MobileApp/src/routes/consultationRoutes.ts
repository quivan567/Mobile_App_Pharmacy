import { Router } from 'express';
import { 
  createPrescriptionOrder, 
  savePrescription, 
  getUserPrescriptions, 
  getPrescriptionById, 
  updatePrescription, 
  deletePrescription, 
  getPrescriptionImage,
  getConsultationHistory,
  uploadPrescriptionImage,
  analyzePrescription,
  createOrderFromPrescription,
  scanPrescription,
} from '../controllers/consultationController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Create prescription order
router.post('/order', uploadPrescriptionImage, createPrescriptionOrder);

// Save prescription
router.post('/save', uploadPrescriptionImage, savePrescription);

// Scan & create basic prescription from image (OCR only, no AI matching yet)
router.post('/scan', uploadPrescriptionImage, scanPrescription);

// Get user's prescriptions
router.get('/prescriptions', getUserPrescriptions);

// Get consultation history
router.get('/history', getConsultationHistory);

// Get prescription by ID
router.get('/prescriptions/:id', getPrescriptionById);

// Update prescription
router.put('/prescriptions/:id', updatePrescription);

// Delete prescription
router.delete('/prescriptions/:id', deletePrescription);

// Get prescription image
router.get('/prescriptions/:id/image', getPrescriptionImage);

// AI-powered prescription analysis (can accept file upload or just prescriptionId)
// File is optional - if prescriptionId is provided, we'll use the saved image
router.post('/analyze', (req, res, next) => {
  // Check if request is multipart/form-data (has file) or JSON (has prescriptionId)
  const contentType = req.headers['content-type'] || '';
  
  console.log('Analyze route - Content-Type:', contentType);
  console.log('Analyze route - Request body before middleware:', req.body);
  
  if (contentType.includes('multipart/form-data')) {
    // If multipart, use multer to handle file upload
    uploadPrescriptionImage(req, res, (err) => {
      if (err) {
        // Only fail if it's a real error, not just "no file"
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'File quá lớn. Kích thước tối đa 5MB',
          });
        }
        if (err.message && !err.message.includes('Unexpected')) {
          return res.status(400).json({
            success: false,
            message: err.message || 'File upload error',
          });
        }
      }
      console.log('After multer - Request body:', req.body);
      next();
    });
  } else {
    // If JSON, skip multer and go directly to controller
    // Body parser should have already parsed JSON
    console.log('Skipping multer for JSON request');
    console.log('Request body (JSON):', req.body);
    next();
  }
}, analyzePrescription);

// Create order from prescription (with items from AI analysis)
router.post('/create-order', createOrderFromPrescription);

export default router;
