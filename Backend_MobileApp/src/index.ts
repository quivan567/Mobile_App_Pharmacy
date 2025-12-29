import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import session from 'express-session';
import path from 'path';
import fs from 'fs';
import { createServer } from 'http';
import { socketService } from './services/socketService.js';

import { config } from './config/index.js';
import { connectDB } from './config/database.js';
import { errorHandler, notFound, generalLimiter, authLimiter, resetRateLimit } from './middleware/errorHandler.js';

// Import routes
import authRoutes from './routes/authRoutes.js';
import productRoutes from './routes/productRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import cartRoutes from './routes/cartRoutes.js';
import expirationRoutes from './routes/expirationRoutes.js';
import supplierRoutes from './routes/supplierRoutes.js';
import invoiceRoutes from './routes/invoiceRoutes.js';
import printRoutes from './routes/printRoutes.js';
import inventoryRoutes from './routes/inventoryRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import consultationRoutes from './routes/consultationRoutes.js';
import couponRoutes from './routes/couponRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import promotionRoutes from './routes/promotionRoutes.js';
import loyaltyRoutes from './routes/loyaltyRoutes.js';
import medicineRoutes from './routes/medicineRoutes.js';
import prescriptionRoutes from './routes/prescriptionRoutes.js';
import addressRoutes from './routes/addressRoutes.js';
import pPointRoutes from './routes/pPointRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import healthSpendingRoutes from './routes/healthSpendingRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import recommendationRoutes from './routes/recommendationRoutes.js';

const app = express();
const httpServer = createServer(app);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "http://localhost:3000", "http://localhost:5000"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      fontSrc: ["'self'", "https:", "data:"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
}));

// CORS configuration - Enhanced for mobile app support
const allowedOrigins = [
  config.corsOrigin,
  'http://localhost:19006',    // Expo default web
  'http://localhost:8081',     // Expo Metro bundler
  'exp://localhost:19000',     // Expo dev client
  'exp://192.168.1.98:19000',  // Expo với IP máy tính (example)
  'http://192.168.1.98:19006', // Expo web với IP
];

// Allow all Expo origins in development
if (config.nodeEnv === 'development') {
  // Add dynamic origin support for mobile development
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) {
        return callback(null, true);
      }
      
      // Check if origin is in allowed list or is an Expo origin
      if (
        allowedOrigins.includes(origin) ||
        origin.startsWith('exp://') ||
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://192.168.') ||
        origin.startsWith('http://10.0.') ||
        origin.startsWith('http://172.')
      ) {
        return callback(null, true);
      }
      
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Authorization'],
  }));
} else {
  // Production: strict CORS
app.use(cors({
    origin: allowedOrigins,
  credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Authorization'],
}));
}

// Rate limiting
app.use(generalLimiter);

// Compression middleware
app.use(compression());

// Logging middleware
if (config.nodeEnv === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Helper function to add CORS headers for static files
const addCorsHeaders = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const origin = req.headers.origin;
  
  // Allow all Expo and local origins in development
  if (config.nodeEnv === 'development') {
    if (
      !origin ||
      origin.startsWith('exp://') ||
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://192.168.') ||
      origin.startsWith('http://10.0.') ||
      origin.startsWith('http://172.')
    ) {
      res.header('Access-Control-Allow-Origin', origin || '*');
    } else {
      res.header('Access-Control-Allow-Origin', config.corsOrigin);
    }
  } else {
  res.header('Access-Control-Allow-Origin', config.corsOrigin);
  }

  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Add cache control for images
  if (req.path.startsWith('/medicine-images')) {
    res.header('Cache-Control', 'public, max-age=31536000, immutable');
  }
  
  // Remove restrictive headers for images
  res.removeHeader('Cross-Origin-Resource-Policy');
  res.removeHeader('Cross-Origin-Opener-Policy');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
    next();
};

// Helper function to set content type for images
const setImageContentType = (res: express.Response, filePath: string) => {
  const ext = path.extname(filePath).toLowerCase();
  const contentTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.gif': 'image/gif'
  };
  if (contentTypes[ext]) {
    res.setHeader('Content-Type', contentTypes[ext]);
  }
};

// Smart file matching middleware for medicine images
const medicineImageMatcher = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Only process GET requests
  if (req.method !== 'GET') {
    return next();
  }
  
  const requestedFileName = path.basename(req.path);
  const imagesDir = path.join(process.cwd(), 'medicine-images');
  const filePath = path.join(imagesDir, requestedFileName);
  
  // Check if file exists directly - if yes, let express.static handle it
  if (fs.existsSync(filePath)) {
    return next(); // Let express.static serve it
  }
  
  // File doesn't exist, try to find similar file
  if (!fs.existsSync(imagesDir)) {
    console.error(`[Medicine Images] Directory not found: ${imagesDir}`);
    return res.status(404).json({ error: 'Images directory not found' });
  }
  
  try {
    const files = fs.readdirSync(imagesDir);
    
    // Normalize requested filename: remove extension, lowercase, remove special chars
    const normalizeName = (name: string) => {
      return name
        .replace(/\.(jpg|jpeg|png|webp|avif|gif)$/i, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
    };
    
    // Extract base name (first word or first few words) for better matching
    // Example: "Simethicon.jpg" -> "simethicon", "Simethicon_B_80mg.jpg" -> "simethicon"
    const extractBaseName = (name: string) => {
      const normalized = normalizeName(name);
      // Take first 8-12 characters as base name (most medicine names are in this range)
      // This helps match "Simethicon" with "Simethicon_B" or "Simethicon_80mg"
      const words = normalized.split(/\d+/); // Split by numbers to get base name
      return words[0] || normalized.substring(0, 12);
    };
    
    const requestedNormalized = normalizeName(requestedFileName);
    const requestedBaseName = extractBaseName(requestedFileName);
    
    // Try to find file with similar name
    let similarFile: string | undefined;
    let bestMatch: string | undefined;
    let bestScore = 0;
    
    for (const file of files) {
      const fileNormalized = normalizeName(file);
      const fileBaseName = extractBaseName(file);
      
      // Exact match (ignoring extension and case)
      if (fileNormalized === requestedNormalized) {
        similarFile = file;
        break;
      }
      
      // Base name match (e.g., "simethicon" matches "simethiconb" or "simethicon80mg")
      if (fileBaseName === requestedBaseName && requestedBaseName.length >= 5) {
        const score = 0.9; // High score for base name match
        if (score > bestScore) {
          bestScore = score;
          bestMatch = file;
        }
      }
      
      // Check if one contains the other (partial match)
      if (fileNormalized.includes(requestedNormalized) || requestedNormalized.includes(fileNormalized)) {
        const score = Math.min(
          fileNormalized.length / requestedNormalized.length,
          requestedNormalized.length / fileNormalized.length
        );
        if (score > bestScore && score > 0.5) { // At least 50% match
          bestScore = score;
          bestMatch = file;
        }
      }
      
      // Check if base names are similar (handles variations like "simethicon" vs "simethiconb")
      if (fileBaseName.length >= 5 && requestedBaseName.length >= 5) {
        const baseNameSimilarity = Math.min(
          fileBaseName.length / requestedBaseName.length,
          requestedBaseName.length / fileBaseName.length
        );
        // Check if one base name starts with the other (e.g., "simethicon" starts with "simethiconb" base)
        const startsWithMatch = fileBaseName.startsWith(requestedBaseName.substring(0, Math.min(8, requestedBaseName.length))) ||
                                requestedBaseName.startsWith(fileBaseName.substring(0, Math.min(8, fileBaseName.length)));
        
        if (startsWithMatch && baseNameSimilarity > 0.7 && baseNameSimilarity > bestScore) {
          bestScore = baseNameSimilarity;
          bestMatch = file;
        }
      }
    }
    
    if (similarFile || bestMatch) {
      const matchedFile = similarFile || bestMatch!;
      const matchedFilePath = path.resolve(path.join(imagesDir, matchedFile));
      console.log(`[Medicine Images] Matched: ${requestedFileName} -> ${matchedFile}`);
      
      // Set content type
      setImageContentType(res, matchedFile);
      
      // Serve the matched file directly
      return res.sendFile(matchedFilePath, (err: any) => {
        if (err) {
          console.error(`[Medicine Images] Error sending matched file:`, err);
          return next(err);
        }
      });
    }
    
    // No similar file found, try to find any default/placeholder image
    const defaultFile = files.find((file: string) => 
      file.toLowerCase().includes('default') || 
      file.toLowerCase() === 'default-medicine.jpg' ||
      file.toLowerCase().includes('placeholder')
    );
    
    if (defaultFile) {
      const defaultFilePath = path.resolve(path.join(imagesDir, defaultFile));
      console.log(`[Medicine Images] Using default: ${requestedFileName} -> ${defaultFile}`);
      
      // Set content type
      setImageContentType(res, defaultFile);
      
      // Serve the default file directly
      return res.sendFile(defaultFilePath, (err: any) => {
        if (err) {
          console.error(`[Medicine Images] Error sending default file:`, err);
          return next(err);
        }
      });
    }
    
    // Log the 404 for debugging
    console.warn(`[Medicine Images] 404: ${requestedFileName} (normalized: ${requestedNormalized})`);
    
    // Return 404 - let express.static handle the 404 response
    return next();
  } catch (error: any) {
    console.error('[Medicine Images] Error in middleware:', error);
    return next(error);
  }
};

// Serve static files for medicine images with CORS headers and smart file matching
// Order matters: matcher first, then static server
app.use('/medicine-images', addCorsHeaders, medicineImageMatcher, express.static(path.join(process.cwd(), 'medicine-images')));

// Serve static files for prescription images with CORS headers
app.use('/uploads/prescriptions', addCorsHeaders, express.static(path.join(process.cwd(), 'uploads/prescriptions')));
  
// Serve static files for avatar images with CORS headers
app.use('/uploads/avatars', addCorsHeaders, express.static(path.join(process.cwd(), 'uploads/avatars')));

// Session configuration
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: config.nodeEnv === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  });
});

// Development helper to reset rate limits
app.get('/reset-rate-limit', resetRateLimit);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.nodeEnv
  });
});

// API routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/expiration', expirationRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/print', printRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/consultation', consultationRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/loyalty', loyaltyRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/p-points', pPointRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/health-spending', healthSpendingRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/recommend', recommendationRoutes);

// 404 handler
app.use(notFound);

// Error handling middleware
app.use(errorHandler);

// Initialize AI services on startup
const initializeAIServices = async () => {
  try {
    const aiService = await import('./services/aiService.js');
    // Initialize AI clients (will log status)
    await aiService.initializeAIClients();
  } catch (error) {
    // AI service not available, will use rule-based system
    console.log('ℹ️ AI services will use rule-based fallback');
  }
};

// Connect to MongoDB and start server
const PORT = config.port;
const startServer = async () => {
  try {
    await connectDB();
    
    // Initialize Socket.io
    socketService.initialize(httpServer);
    
    // Initialize AI services
    await initializeAIServices();
    
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Environment: ${config.nodeEnv}`);
      console.log(`🌐 CORS Origin: ${config.corsOrigin}`);
      console.log(`📱 Mobile app support: Enabled`);
      console.log(`🔌 Socket.io: Enabled`);
      console.log(`🤖 AI Chat: Enabled`);
      console.log(`💡 Recommendations: Enabled`);
      if (config.nodeEnv === 'development') {
        console.log(`💡 Development mode: CORS allows all Expo origins`);
        console.log(`💡 To test on mobile device, use your computer's IP address`);
      }
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
