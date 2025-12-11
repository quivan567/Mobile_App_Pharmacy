import { Router } from 'express';
import { PPointController } from '../controllers/pPointController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Get user's P-Xu account balance
router.get('/account', PPointController.getAccount);

// Get user's P-Xu transaction history
router.get('/transactions', PPointController.getTransactions);

export default router;

