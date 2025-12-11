import { Router } from 'express';
import { PaymentController } from '../controllers/paymentController';

const router = Router();

// MoMo payment routes
// Note: create endpoint doesn't require auth to support guest orders
router.post('/momo/create', PaymentController.createMomoPayment);
router.post('/momo/callback', PaymentController.handleMomoCallback);
router.get('/momo/status/:orderId', PaymentController.getPaymentStatus);

export default router;

