// Test MongoDB connection and user lookup
import mongoose from 'mongoose';
import { config } from './src/config/index.ts';
import { User } from './src/models/schema.ts';

const testMongoConnection = async () => {
  try {
    console.log('🔍 Testing MongoDB connection...');
    
    // Connect to database
    await mongoose.connect(config.mongoUri);
    console.log('✅ Connected to MongoDB');
    
    // Test user lookup
    const userId = '68e52528b8010bde42a2f589';
    console.log('Looking for user:', userId);
    
    const user = await User.findById(userId).lean();
    console.log('User found:', user ? {
      id: user._id,
      isActive: user.isActive,
      role: user.role,
      email: user.email,
      phone: user.phone
    } : 'null');
    
    if (user) {
      console.log('✅ User found and is active:', user.isActive);
    } else {
      console.log('❌ User not found');
    }
    
    // Test user lookup by phone
    const userByPhone = await User.findOne({ phone: '0942808839' }).lean();
    console.log('User found by phone:', userByPhone ? {
      id: userByPhone._id,
      isActive: userByPhone.isActive,
      role: userByPhone.role
    } : 'null');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

testMongoConnection();
