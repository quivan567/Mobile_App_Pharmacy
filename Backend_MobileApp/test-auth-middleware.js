// Test authentication middleware directly
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { config } from './src/config/index.ts';
import { User } from './src/models/schema.ts';

const testAuthMiddleware = async () => {
  try {
    // Connect to database
    await mongoose.connect(config.mongoUri);
    console.log('✅ Connected to database');
    
    // 1. Login để lấy token
    const API_BASE = 'http://localhost:5000';
    const loginResponse = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: '0942808839',
        password: '27082003Tai@'
      })
    });
    
    const loginData = await loginResponse.json();
    console.log('Login result:', loginData);
    
    if (!loginData.success) {
      console.log('❌ Login failed');
      return;
    }
    
    const token = loginData.data.token;
    const userId = loginData.data.user._id;
    
    console.log('✅ Login successful!');
    console.log('User ID from login:', userId);
    console.log('User ID type:', typeof userId);
    
    // 2. Decode token manually
    console.log('\n--- Decoding token manually ---');
    const decoded = jwt.verify(token, config.jwtSecret);
    console.log('Decoded token:', decoded);
    console.log('Decoded userId:', decoded.userId);
    console.log('Decoded userId type:', typeof decoded.userId);
    
    // 3. Test user lookup
    console.log('\n--- Testing user lookup ---');
    console.log('Looking for user with ID:', decoded.userId);
    
    // Try different ways to find user
    const user1 = await User.findById(decoded.userId).lean();
    console.log('User found by ObjectId:', user1 ? {
      id: user1._id,
      isActive: user1.isActive,
      role: user1.role
    } : 'null');
    
    const user2 = await User.findOne({ _id: decoded.userId }).lean();
    console.log('User found by findOne:', user2 ? {
      id: user2._id,
      isActive: user2.isActive,
      role: user2.role
    } : 'null');
    
    const user3 = await User.findOne({ phone: '0942808839' }).lean();
    console.log('User found by phone:', user3 ? {
      id: user3._id,
      isActive: user3.isActive,
      role: user3.role
    } : 'null');
    
    // 4. Test if userIds match
    console.log('\n--- Comparing user IDs ---');
    console.log('Login userId:', userId);
    console.log('Decoded userId:', decoded.userId);
    console.log('Are they equal?', userId === decoded.userId);
    console.log('Are they equal (toString)?', userId.toString() === decoded.userId.toString());
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
  }
};

testAuthMiddleware();
