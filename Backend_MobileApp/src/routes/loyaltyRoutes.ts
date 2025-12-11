import { Router } from 'express';
import { LoyaltyController } from '../controllers/loyaltyController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);
router.get('/account', LoyaltyController.getAccount);
router.get('/transactions', LoyaltyController.getTransactions);
router.post('/adjust', LoyaltyController.adjustPoints);

export default router;


