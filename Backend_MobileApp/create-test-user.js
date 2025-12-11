// Script to create a test user
const API_BASE = 'http://localhost:5000';

async function createTestUser() {
  console.log('Creating test user...');
  
  try {
    // Step 1: Send OTP
    console.log('1. Sending OTP...');
    const otpResponse = await fetch(`${API_BASE}/api/auth/send-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: '0987654321',
        method: 'sms'
      })
    });
    
    console.log('OTP response:', otpResponse.status, otpResponse.statusText);
    const otpData = await otpResponse.json();
    console.log('OTP data:', otpData);
    
    // Step 2: Register user
    console.log('2. Registering user...');
    const registerResponse = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: '0987654321',
        email: 'test@example.com',
        otp: '322344', // Real OTP from server
        firstName: 'Test',
        lastName: 'User',
        password: '123456'
      })
    });
    
    console.log('Register response:', registerResponse.status, registerResponse.statusText);
    const registerData = await registerResponse.json();
    console.log('Register data:', registerData);
    
    if (registerData.success) {
      console.log('✅ Test user created successfully!');
      console.log('User:', registerData.data.user);
      console.log('Token:', registerData.data.token);
    }
    
  } catch (error) {
    console.error('❌ Failed to create test user:', error);
  }
}

// Run test
createTestUser();
