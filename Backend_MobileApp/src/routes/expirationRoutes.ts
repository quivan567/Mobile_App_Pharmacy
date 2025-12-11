import express from 'express';
import { ExpirationController } from '../controllers/expirationController.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { validateId } from '../middleware/validation.js';

const router = express.Router();

// Public routes (for viewing alerts)
router.get('/alerts', ExpirationController.getExpirationAlerts);
router.get('/expired', ExpirationController.getExpiredProducts);
router.get('/expiring-soon', ExpirationController.getProductsExpiringSoon);
router.get('/stats', ExpirationController.getExpirationStats);

// Admin routes (for updating expiration dates)
router.put('/:productId', authenticateToken, requireAdmin, validateId, ExpirationController.updateExpirationDate);

export default router;
