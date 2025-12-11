import { Router } from 'express';
import { SavedPrescriptionController } from '../controllers/savedPrescriptionController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// User saved prescription routes
router.get('/', SavedPrescriptionController.getUserSavedPrescriptions);
router.get('/stats', SavedPrescriptionController.getSavedPrescriptionStats);
router.get('/:id', SavedPrescriptionController.getSavedPrescriptionById);
router.post('/from-order', SavedPrescriptionController.savePrescriptionFromOrder);
router.post('/from-prescription', SavedPrescriptionController.savePrescriptionFromPrescription);
router.put('/:id', SavedPrescriptionController.updateSavedPrescription);
router.delete('/:id', SavedPrescriptionController.deleteSavedPrescription);
router.post('/:id/reorder', SavedPrescriptionController.reorderFromSavedPrescription);

export default router;
