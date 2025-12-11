import { Router } from 'express';
import { CartController } from '../controllers/cartController.js';
import { authenticateToken } from '../middleware/auth.js';
import { validateObjectId } from '../middleware/validation.js';

const router = Router();

// All cart routes require authentication
router.use(authenticateToken);

router.get('/', CartController.getCart);
router.post('/', CartController.addToCart);
router.put('/:id', validateObjectId, CartController.updateCartItem);
router.delete('/:id', validateObjectId, CartController.removeFromCart);
router.delete('/', CartController.clearCart);

export default router;




