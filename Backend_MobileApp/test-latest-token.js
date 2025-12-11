// Test new JWT token
import jwt from 'jsonwebtoken';

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OGU1MjUyOGI4MDEwYmRlNDJhMmY1ODkiLCJpYXQiOjE3NjExNTY4ODUsImV4cCI6MTc2MTc2MTY4NX0.7A3W82FGRKtXb4LOKd10ObznY6foXmj8yVRjU5Hqevg';
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
