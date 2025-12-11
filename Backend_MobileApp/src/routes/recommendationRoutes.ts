import { Router } from 'express';
import { RecommendationController } from '../controllers/recommendationController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Public routes
router.get('/popular', RecommendationController.getPopularProducts);
router.get('/alternative/:medicineId', RecommendationController.getAlternativeProducts);

// Authenticated routes
router.get('/by-history/:customerId', authenticateToken, RecommendationController.getRecommendationsByHistory);
router.get('/by-category/:customerId', authenticateToken, RecommendationController.getRecommendationsByCategory);
router.get('/search-history', authenticateToken, RecommendationController.getSearchHistory);
router.get('/recent-views', authenticateToken, RecommendationController.getRecentViews);

export default router;

