import express from 'express';
import { InvoiceController } from '../controllers/invoiceController.js';
import { authenticateToken, requireAdmin, requirePharmacist } from '../middleware/auth.js';
import { validateId } from '../middleware/validation.js';

const router = express.Router();

// Public routes (for viewing invoices and guest checkout)
router.get('/stats', InvoiceController.getInvoiceStats);
router.get('/number/:invoiceNumber', InvoiceController.getInvoiceByNumber);
router.get('/track/:invoiceNumber', InvoiceController.trackInvoice); // Allow public access to track invoice
router.get('/:id', InvoiceController.getInvoiceById); // Allow public access to view invoice by ID
router.post('/', InvoiceController.createInvoice); // Allow guest checkout

// Authenticated routes
router.get('/', authenticateToken, InvoiceController.getInvoices);
router.get('/customer/:customerId', authenticateToken, validateId, InvoiceController.getCustomerInvoices);

// Pharmacist routes (for managing invoices)
router.post('/calculate', authenticateToken, InvoiceController.calculateInvoice);
router.put('/:id/status', authenticateToken, requirePharmacist, validateId, InvoiceController.updateInvoiceStatus);
router.put('/:id/cancel', authenticateToken, requirePharmacist, validateId, InvoiceController.cancelInvoice);

export default router;
