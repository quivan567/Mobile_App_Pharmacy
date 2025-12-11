import express from 'express';
import { AddressController } from '../controllers/addressController';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// All routes require authentication
router.get('/', authenticateToken, AddressController.getAddresses);
router.get('/:id', authenticateToken, AddressController.getAddress);
router.post('/', authenticateToken, AddressController.createAddress);
router.put('/:id', authenticateToken, AddressController.updateAddress);
router.delete('/:id', authenticateToken, AddressController.deleteAddress);
router.patch('/:id/set-default', authenticateToken, AddressController.setDefaultAddress);

export default router;

