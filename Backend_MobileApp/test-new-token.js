// Test new JWT token
import jwt from 'jsonwebtoken';

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OGU1MjUyOGI4MDEwYmRlNDJhMmY1ODkiLCJpYXQiOjE3NjExNTY1MzcsImV4cCI6MTc2MTc2MTMzN30.5LH9EwxA8KsgguxSdddabfA7ohIXgW1VRKDk3qX0Ukk';
const secret = 'fallback-jwt-secret-key-for-development-only';

try {
  console.log('Testing new JWT token...');
  const decoded = jwt.verify(token, secret);
  console.log('✅ New JWT token verification successful!');
  console.log('Decoded payload:', decoded);
} catch (error) {
  console.log('❌ New JWT token verification failed!');
  console.log('Error:', error.message);
}
