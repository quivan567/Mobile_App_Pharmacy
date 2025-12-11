import { Router } from 'express';
import { MedicineController } from '../controllers/medicineController.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { validateObjectId, validatePagination } from '../middleware/validation.js';

const router = Router();

// Public routes
router.get('/', validatePagination, MedicineController.getMedicines);
router.get('/hot', MedicineController.getHotMedicines);
router.get('/:id', validateObjectId, MedicineController.getMedicineById);

// Admin routes
router.post('/', authenticateToken, requireAdmin, MedicineController.createMedicine);
router.put('/:id', authenticateToken, requireAdmin, validateObjectId, MedicineController.updateMedicine);
router.delete('/:id', authenticateToken, requireAdmin, validateObjectId, MedicineController.deleteMedicine);

export default router;
