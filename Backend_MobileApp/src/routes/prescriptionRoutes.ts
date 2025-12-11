import { Router } from 'express';
import { PrescriptionController } from '../controllers/prescriptionController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Prescription routes
router.post('/', PrescriptionController.createPrescription);
router.get('/', PrescriptionController.getUserPrescriptions);
router.get('/stats', PrescriptionController.getPrescriptionStats);
router.get('/:id', PrescriptionController.getPrescriptionById);
router.put('/:id/status', PrescriptionController.updatePrescriptionStatus);
router.delete('/:id', PrescriptionController.deletePrescription);

export default router;
