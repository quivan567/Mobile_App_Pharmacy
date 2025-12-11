import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';

// General rate limiter
export const generalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: process.env.NODE_ENV === 'development' ? 10000 : config.rateLimit.maxRequests, // Much higher limit in development
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for static files and images
    return req.path.startsWith('/medicine-images') || req.path.startsWith('/images');
  },
});

// Strict rate limiter for auth endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 100 : 5, // More lenient in development
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// API rate limiter
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per window
  message: {
    success: false,
    message: 'API rate limit exceeded, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Error handling middleware
export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log error with context
  console.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString(),
  });

  // Default error
  let statusCode = 500;
  let message = 'Internal server error';

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = err.message || 'Validation error';
  } else if (err.name === 'UnauthorizedError' || err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Unauthorized';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  } else if (err.name === 'ForbiddenError') {
    statusCode = 403;
    message = 'Forbidden';
  } else if (err.name === 'NotFoundError' || err.name === 'CastError') {
    statusCode = 404;
    message = err.name === 'CastError' ? 'Invalid ID format' : 'Not found';
  } else if (err.code === '23505' || err.code === 11000) { // Unique violation (PostgreSQL/MongoDB)
    statusCode = 409;
    message = 'Resource already exists';
  } else if (err.code === '23503') { // PostgreSQL foreign key violation
    statusCode = 400;
    message = 'Invalid reference';
  } else if (err.name === 'MongoServerError') {
    if (err.code === 11000) {
      statusCode = 409;
      message = 'Duplicate entry';
    }
  } else if (err.message) {
    // Use error message if available
    message = err.message;
  }

  // Send error response
  const errorResponse: any = {
    success: false,
    message,
  };

  // Add stack trace in development
  if (config.nodeEnv === 'development') {
    errorResponse.stack = err.stack;
    errorResponse.error = {
      name: err.name,
      code: err.code,
    };
  }

  res.status(statusCode).json(errorResponse);
};

// Not found middleware
export const notFound = (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
};

// Development helper to reset rate limits
export const resetRateLimit = (req: Request, res: Response) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).json({
      success: false,
      message: 'Not found',
    });
  }

  // Clear rate limit for this IP
  const ip = req.ip || req.connection.remoteAddress;
  console.log(`🔄 Resetting rate limit for IP: ${ip}`);
  
  // Reset all rate limiters
  generalLimiter.resetKey(ip);
  authLimiter.resetKey(ip);
  apiLimiter.resetKey(ip);
  
  res.json({
    success: true,
    message: 'Rate limit reset successfully',
    ip,
    timestamp: new Date().toISOString(),
  });
};




