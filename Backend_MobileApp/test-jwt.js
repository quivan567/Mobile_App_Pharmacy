// Simple test script to check JWT verification
import jwt from 'jsonwebtoken';

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OGU1MjUyOGI4MDEwYmRlNDJhMmY1ODkiLCJpYXQiOjE3NTk5MTM4MzUsImV4cCI6MTc2MDUxODYzNX0.xH-o0173N35I-gjB7Naro6Uu8FsBR2NrgQN0zQiC0z0';
const secret = 'fallback-jwt-secret-key-for-development-only';

try {
  console.log('Testing JWT verification...');
  console.log('Token:', token.substring(0, 50) + '...');
  console.log('Secret:', secret);
  
  const decoded = jwt.verify(token, secret);
  console.log('✅ JWT verification successful!');
  console.log('Decoded payload:', decoded);
} catch (error) {
  console.log('❌ JWT verification failed!');
  console.log('Error:', error.message);
}
