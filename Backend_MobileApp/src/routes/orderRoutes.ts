import { Router } from 'express';
import { OrderController } from '../controllers/orderController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Logging middleware for debugging
router.use((req, res, next) => {
  console.log(`[Orders Route] ${req.method} ${req.path}`, {
    query: req.query,
    hasAuth: !!req.headers.authorization,
    origin: req.headers.origin,
  });
  next();
});

// Guest checkout route (no authentication required)
router.post('/guest-checkout', OrderController.createGuestOrder);
router.get('/guest/:orderNumber', OrderController.getGuestOrderByNumber);
router.get('/guest-by-id/:id', OrderController.getGuestOrderById);
router.get('/track/:orderNumber', OrderController.trackGuestOrder);

// Create order route - supports both authenticated and guest users
router.post('/', OrderController.createOrderOrGuest);

// All other routes require authentication
router.use(authenticateToken);

// User order routes
router.get('/', OrderController.getUserOrders);
router.get('/most-recent', OrderController.getMostRecentOrder);
router.get('/stats', OrderController.getUserOrderStats);
router.get('/:id', OrderController.getOrderById);
router.put('/:id/status', OrderController.updateOrderStatus);
router.put('/:id/confirm-payment', OrderController.confirmPayment); // Admin: Confirm cash payment
router.put('/:id', OrderController.updateOrder);
router.put('/:id/link', OrderController.linkGuestOrderToUser);
router.post('/:id/reorder', OrderController.reorderFromOrder);

export default router;
