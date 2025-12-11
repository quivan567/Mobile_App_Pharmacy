// Debug JWT secret from server
import { config } from './src/config/index.js';

console.log('🔍 Debugging JWT Secret...');
console.log('JWT Secret from config:', config.jwtSecret);
console.log('JWT Secret length:', config.jwtSecret?.length);
console.log('JWT Secret type:', typeof config.jwtSecret);

// Test if it's the fallback
if (config.jwtSecret === 'fallback-jwt-secret-key-for-development-only') {
  console.log('✅ Using fallback secret');
} else {
  console.log('❌ Using different secret');
  console.log('Expected fallback:', 'fallback-jwt-secret-key-for-development-only');
  console.log('Actual secret:', config.jwtSecret);
}
