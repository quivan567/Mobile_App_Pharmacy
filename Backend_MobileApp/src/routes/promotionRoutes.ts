import { Router } from 'express';
import { PromotionController } from '../controllers/promotionController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Public
router.get('/', PromotionController.getAllPromotions);
router.get('/active', PromotionController.getActivePromotions);
router.get('/:id', PromotionController.getPromotionById);
router.post('/apply', PromotionController.applyToCart);
router.post('/validate-code', PromotionController.validateCode);

// Admin (optionally protect later with admin middleware)
router.use(authenticateToken);
router.post('/', PromotionController.createPromotion);
router.put('/:id', PromotionController.updatePromotion);
router.delete('/:id', PromotionController.deletePromotion);

export default router;


