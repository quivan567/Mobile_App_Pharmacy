// Create new JWT token with current server secret
import jwt from 'jsonwebtoken';

const userId = '68e52528b8010bde42a2f589';
const jwtSecret = 'fallback-jwt-secret-key-for-development-only';

console.log('Creating new JWT token...');
console.log('User ID:', userId);
console.log('Secret:', jwtSecret);

try {
  const newToken = jwt.sign({ userId }, jwtSecret, { expiresIn: '7d' });
  console.log('✅ New JWT token created!');
  console.log('Token:', newToken);
  
  // Test the token
  const decoded = jwt.verify(newToken, jwtSecret);
  console.log('✅ Token verification successful!');
  console.log('Decoded payload:', decoded);
} catch (error) {
  console.error('❌ Error creating token:', error);
}
