import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { AuthController } from '../controllers/authController.js';
import { authenticateToken } from '../middleware/auth.js';
import { validateUserRegistration, validateUserLogin, validateUserRegisterWithOTP } from '../middleware/validation.js';

const router = Router();

// Configure multer for avatar uploads (disk storage)
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/avatars';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Configure multer for file uploads (memory storage for completeProfile)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// Configure multer for avatar uploads (disk storage)
const uploadAvatar = multer({
  storage: avatarStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// Public routes
router.post('/register', validateUserRegisterWithOTP, AuthController.register);
router.post('/login', validateUserLogin, AuthController.login);
router.post('/send-otp', AuthController.sendOTP);
router.post('/verify-otp', AuthController.verifyOTP);
router.post('/verify-firebase-token', AuthController.verifyFirebaseToken);
router.post('/google-signin', AuthController.googleSignIn);
router.post('/forgot-password', AuthController.forgotPassword);
router.post('/reset-password', AuthController.resetPassword);
router.post('/refresh-token', AuthController.refreshToken);

// Debug routes for development
if (process.env.NODE_ENV === 'development') {
  router.post('/debug-generate-otp', AuthController.generateDebugOTP);
  router.get('/test-otp/:phone', (req, res) => {
    const { phone } = req.params;
    // This is just for development testing
    res.json({ 
      message: 'Check server console for OTP',
      phone 
    });
  });
}

// Protected routes
router.get('/profile', authenticateToken, AuthController.getProfile);
router.put('/profile', authenticateToken, uploadAvatar.single('avatar'), AuthController.updateProfile as any);
router.put('/change-password', authenticateToken, AuthController.changePassword);
router.post('/complete-profile', authenticateToken, upload.single('avatar'), AuthController.completeProfile as any);

export default router;




