// Script to create user directly (bypass OTP for testing)
const API_BASE = 'http://localhost:5000';

async function createUserDirectly() {
  console.log('Creating user directly...');
  
  try {
    // Use debug endpoint to generate OTP
    console.log('1. Generating debug OTP...');
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
    
    // Now register with the debug OTP
    console.log('2. Registering with debug OTP...');
    const registerResponse = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: '0987654321',
        email: 'test@example.com',
        otp: '839602', // Real debug OTP from server
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
    } else {
      console.log('❌ Registration failed:', registerData.message);
    }
    
  } catch (error) {
    console.error('❌ Failed to create user:', error);
  }
}

// Run test
createUserDirectly();
