import { Router } from 'express';
import { HealthSpendingController } from '../controllers/healthSpendingController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Get health spending statistics
router.get('/stats', HealthSpendingController.getHealthSpendingStats);

// Get health status
router.get('/status', HealthSpendingController.getHealthStatus);

export default router;

