import express from 'express';
import { PrintController } from '../controllers/printController.js';
import { authenticateToken, requirePharmacist } from '../middleware/auth.js';
import { validateId } from '../middleware/validation.js';

const router = express.Router();

// Public routes (for viewing/printing invoices)
router.get('/options', PrintController.getPrintOptions);
router.get('/invoice/number/:invoiceNumber/html', PrintController.printInvoiceByNumberHTML);

// Authenticated routes
router.get('/preview/:id', authenticateToken, validateId, PrintController.previewInvoice);
router.get('/invoice/:id/html', authenticateToken, validateId, PrintController.printInvoiceHTML);
router.get('/invoice/:id/thermal', authenticateToken, validateId, PrintController.printInvoiceThermal);
router.get('/invoice/:id/pdf', authenticateToken, validateId, PrintController.printInvoicePDF);
router.get('/receipt/:id', authenticateToken, validateId, PrintController.printReceipt);

export default router;
