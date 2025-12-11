import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { User } from '../models/schema.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string; // Email có thể là undefined
    role: string;
  };
}

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      if (process.env.NODE_ENV === 'development') {
        console.log('Auth middleware - No token provided');
      }
      return res.status(401).json({ 
        success: false, 
        message: 'Access token required' 
      });
    }

    // Verify token
    let decoded: any;
    try {
      decoded = jwt.verify(token, config.jwtSecret);
    } catch (jwtError: any) {
      if (process.env.NODE_ENV === 'development') {
        console.log('Auth middleware - Token verification failed:', jwtError.message);
      }
      return res.status(403).json({ 
        success: false, 
        message: jwtError.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token'
      });
    }
    
    // Get user from database
    const user = await User.findById(decoded.userId).lean();

    if (!user) {
      if (process.env.NODE_ENV === 'development') {
        console.log('Auth middleware - User not found:', decoded.userId);
      }
      return res.status(401).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    if (!user.isActive) {
      if (process.env.NODE_ENV === 'development') {
        console.log('Auth middleware - User inactive:', decoded.userId);
      }
      return res.status(401).json({ 
        success: false, 
        message: 'Account is deactivated' 
      });
    }

    // Attach user to request
    req.user = {
      id: String(user._id),
      ...(user.email && { email: user.email }),
      role: user.role,
    };
    
    if (process.env.NODE_ENV === 'development') {
      console.log('Auth middleware - User authenticated:', {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role
      });
    }

    next();
  } catch (error: any) {
    console.error('Auth middleware - Unexpected error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Authentication error' 
    });
  }
};

export const requireRole = (roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ 
        success: false, 
        message: 'Insufficient permissions' 
      });
      return;
    }

    next();
  };
};

export const requireAdmin = requireRole(['admin']);
export const requirePharmacist = requireRole(['admin', 'customer']);

