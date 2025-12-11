import express from 'express';
import { ReportController } from '../controllers/reportController.js';
import { authenticateToken, requireAdmin, requirePharmacist } from '../middleware/auth.js';

const router = express.Router();

// Public routes (for basic reports)
router.get('/dashboard', ReportController.getDashboardData);
router.get('/top-products', ReportController.getTopProducts);
router.get('/revenue-trends', ReportController.getRevenueTrends);

// Authenticated routes (for detailed reports)
router.get('/sales', authenticateToken, ReportController.getSalesReport);
router.get('/inventory', authenticateToken, ReportController.getInventoryReport);
router.get('/profit-loss', authenticateToken, ReportController.getProfitLossReport);
router.get('/category-performance', authenticateToken, ReportController.getCategoryPerformance);
router.get('/stock-movements', authenticateToken, ReportController.getStockMovements);
router.get('/low-stock', authenticateToken, ReportController.getLowStockReport);

// Admin/Pharmacist routes (for export functionality)
router.get('/export', authenticateToken, requirePharmacist, ReportController.exportReport);

export default router;
