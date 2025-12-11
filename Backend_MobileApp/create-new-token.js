// Create new JWT token with current secret
import jwt from 'jsonwebtoken';

const secret = 'fallback-jwt-secret-key-for-development-only';
const userId = '68e52528b8010bde42a2f589';

try {
  console.log('Creating new JWT token...');
  console.log('User ID:', userId);
  console.log('Secret:', secret);
  
  const token = jwt.sign(
    { userId: userId },
    secret,
    { expiresIn: '7d' }
  );
  
  console.log('✅ New JWT token created!');
  console.log('Token:', token);
} catch (error) {
  console.log('❌ Failed to create JWT token!');
  console.log('Error:', error.message);
}
