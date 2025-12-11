// Test new JWT token
import jwt from 'jsonwebtoken';

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OGU1MjUyOGI4MDEwYmRlNDJhMmY1ODkiLCJpYXQiOjE3NjEyMTQ5MjEsImV4cCI6MTc2MTgyMzcyMX0.8K9vQ2x7mN3pL6rT1wY4uE5iO8aS2dF9gH0jK3lM6nP';
const secret = 'fallback-jwt-secret-key-for-development-only';

try {
  console.log('Testing new JWT token...');
  const decoded = jwt.verify(token, secret);
  console.log('✅ New JWT token verification successful!');
  console.log('Decoded payload:', decoded);
  console.log('Expires at:', new Date(decoded.exp * 1000));
} catch (error) {
  console.log('❌ New JWT token verification failed!');
  console.log('Error:', error.message);
}
