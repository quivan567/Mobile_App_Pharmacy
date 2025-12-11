import { Router } from 'express';
import { CouponController } from '../controllers/couponController';
import { authenticateToken } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { z } from 'zod';

const router = Router();

// Public routes
router.get('/active', CouponController.getActiveCoupons);
router.post('/validate', CouponController.validateCoupon);
router.get('/debug', CouponController.debugCoupon);

// Authenticated routes
router.use(authenticateToken);

// User routes
router.post('/apply', CouponController.applyCoupon);
router.get('/history', CouponController.getUserCouponHistory);

// Admin routes (you might want to add admin middleware)
router.post('/create', CouponController.createCoupon);
router.get('/all', CouponController.getAllCoupons);
router.put('/:id', CouponController.updateCoupon);
router.delete('/:id', CouponController.deleteCoupon);

export default router;
