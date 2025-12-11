// Script to get OTP from test endpoint and create user
const API_BASE = 'http://localhost:5000';

async function createUserWithTestOTP() {
  console.log('Creating user with test OTP...');
  
  try {
    // Step 1: Get OTP from test endpoint
    console.log('1. Getting OTP from test endpoint...');
    const testResponse = await fetch(`${API_BASE}/api/auth/test-otp/0987654321`);
    
    console.log('Test OTP response:', testResponse.status, testResponse.statusText);
    const testData = await testResponse.json();
    console.log('Test OTP data:', testData);
    
    // Step 2: Generate debug OTP
    console.log('2. Generating debug OTP...');
    const debugResponse = await fetch(`${API_BASE}/api/auth/debug-generate-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: '0987654321'
      })
    });
    
    console.log('Debug OTP response:', debugResponse.status, debugResponse.statusText);
    const debugData = await debugResponse.json();
    console.log('Debug OTP data:', debugData);
    
    // Step 3: Register with the OTP
    console.log('3. Registering with OTP...');
    const registerResponse = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: '0987654321',
        email: 'test@example.com',
        otp: debugData.data.otp, // Use the OTP from debug endpoint
        firstName: 'Test',
        lastName: 'User',
        password: '123456'
      })
    });
    
    console.log('Register response:', registerResponse.status, registerResponse.statusText);
    const registerData = await registerResponse.json();
    console.log('Register data:', registerData);
    
    if (registerData.success) {
      console.log('✅ User created successfully!');
      console.log('User:', registerData.data.user);
      console.log('Token:', registerData.data.token);
      
      // Test login
      console.log('4. Testing login...');
      const loginResponse = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: 'test@example.com',
          password: '123456'
        })
      });
      
      const loginData = await loginResponse.json();
      console.log('Login response:', loginData);
      
    } else {
      console.log('❌ Registration failed:', registerData.message);
    }
    
  } catch (error) {
    console.error('❌ Failed to create user:', error);
  }
}

// Run test
createUserWithTestOTP();
