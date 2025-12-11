import express from 'express';
import { SupplierController } from '../controllers/supplierController.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { validateId } from '../middleware/validation.js';

const router = express.Router();

// Public routes (for viewing suppliers)
router.get('/', SupplierController.getSuppliers);
router.get('/stats', SupplierController.getSupplierStats);
router.get('/:id', validateId, SupplierController.getSupplierById);

// Admin routes (for managing suppliers)
router.post('/', authenticateToken, requireAdmin, SupplierController.createSupplier);
router.put('/:id', authenticateToken, requireAdmin, validateId, SupplierController.updateSupplier);
router.delete('/:id', authenticateToken, requireAdmin, validateId, SupplierController.deleteSupplier);

export default router;
