import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { User } from '../models/schema.js';
import { chatWithAI } from '../controllers/chatController.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// Optional authentication middleware - sets req.user if token exists, but doesn't fail if no token
const optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      try {
        const decoded: any = jwt.verify(token, config.jwtSecret);
        const user = await User.findById(decoded.userId).select('_id email role');
        
        if (user) {
          (req as AuthenticatedRequest).user = {
            id: String(user._id),
            email: user.email,
            role: user.role,
          };
        }
      } catch (jwtError) {
        // Token invalid or expired, continue as guest
        // Don't fail the request
      }
    }
    // Continue regardless of auth status
    next();
  } catch (error) {
    // Continue even if there's an error
    next();
  }
};

router.post('/', optionalAuth, chatWithAI);

export default router;

