import express from 'express';
import { InventoryController } from '../controllers/inventoryController.js';
import { authenticateToken, requireAdmin, requirePharmacist } from '../middleware/auth.js';
import { validateId } from '../middleware/validation.js';

const router = express.Router();

// Public routes (for viewing inventory data)
router.get('/stats', InventoryController.getInventoryStats);
router.get('/low-stock', InventoryController.getLowStockProducts);
router.get('/movements', InventoryController.getStockMovements);

// Authenticated routes
router.get('/imports', authenticateToken, InventoryController.getImports);
router.get('/imports/:id', authenticateToken, validateId, InventoryController.getImportById);
router.get('/exports', authenticateToken, InventoryController.getExports);
router.get('/exports/:id', authenticateToken, validateId, InventoryController.getExportById);
router.get('/products/:productId/stock-history', authenticateToken, validateId, InventoryController.getProductStockHistory);

// Admin/Pharmacist routes (for managing inventory)
router.post('/imports', authenticateToken, requirePharmacist, InventoryController.createImport);
router.put('/imports/:id/confirm', authenticateToken, requirePharmacist, validateId, InventoryController.confirmImport);
router.post('/exports', authenticateToken, requirePharmacist, InventoryController.createExport);
router.put('/exports/:id/confirm', authenticateToken, requirePharmacist, validateId, InventoryController.confirmExport);
router.post('/adjustments', authenticateToken, requireAdmin, InventoryController.adjustStock);

export default router;
