import mongoose from 'mongoose';
import { config } from '../config/index.js';

// MongoDB connection
export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.mongodbUri);
    console.log(`🍃 MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Export all models
export * from '../models/schema.js';