import { Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';

// Validation result handler
export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array(),
    });
  }
  next();
};

// User validation rules
export const validateUserRegistration = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('phone')
    .matches(/^(0[3|5|7|8|9])[0-9]{8}$/)
    .withMessage('Valid Vietnamese phone number is required'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('firstName')
    .trim()
    .isLength({ min: 1 })
    .withMessage('First name is required'),
  body('lastName')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Last name is required'),
  handleValidationErrors,
];

export const validateUserLogin = [
  body('username')
    .notEmpty()
    .withMessage('Username (email or phone) is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  handleValidationErrors,
];

// Register with OTP validation - email và phone đều bắt buộc
export const validateUserRegisterWithOTP = [
  body('email')
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('phone')
    .notEmpty()
    .withMessage('Phone number is required')
    .matches(/^(0[3|5|7|8|9])[0-9]{8}$/)
    .withMessage('Valid Vietnamese phone number is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('otp')
    .notEmpty()
    .withMessage('OTP is required')
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('Valid 6-digit OTP is required'),
  handleValidationErrors,
];

// Product validation rules
export const validateProduct = [
  body('name')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Product name is required'),
  body('price')
    .isDecimal({ decimal_digits: '0,2' })
    .withMessage('Valid price is required'),
  body('imageUrl')
    .isURL()
    .withMessage('Valid image URL is required'),
  body('categoryId')
    .isUUID()
    .withMessage('Valid category ID is required'),
  handleValidationErrors,
];

// Category validation rules
export const validateCategory = [
  body('name')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Category name is required'),
  body('icon')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Category icon is required'),
  body('slug')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Category slug is required'),
  handleValidationErrors,
];

// Order validation rules
export const validateOrder = [
  body('shippingAddress')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Shipping address is required'),
  body('shippingPhone')
    .isMobilePhone('vi-VN')
    .withMessage('Valid Vietnamese phone number is required'),
  body('paymentMethod')
    .isIn(['cash', 'card', 'bank_transfer'])
    .withMessage('Valid payment method is required'),
  body('items')
    .isArray({ min: 1 })
    .withMessage('At least one item is required'),
  body('items.*.productId')
    .isUUID()
    .withMessage('Valid product ID is required'),
  body('items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Valid quantity is required'),
  handleValidationErrors,
];

// Review validation rules
export const validateReview = [
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('productId')
    .isUUID()
    .withMessage('Valid product ID is required'),
  handleValidationErrors,
];

// ID parameter validation (UUID format)
export const validateId = [
  param('id')
    .isUUID()
    .withMessage('Valid ID is required'),
  handleValidationErrors,
];

// MongoDB ObjectId validation
export const validateObjectId = [
  param('id')
    .isMongoId()
    .withMessage('Valid MongoDB ObjectId is required'),
  handleValidationErrors,
];

// Pagination validation
export const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  handleValidationErrors,
];

