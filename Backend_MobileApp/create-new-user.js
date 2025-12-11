// Script to create a new user with different phone number
const API_BASE = 'http://localhost:5000';

async function createNewUser() {
  console.log('Creating new user...');
  
  try {
    // Step 1: Generate debug OTP for new phone
    console.log('1. Generating debug OTP...');
    const debugResponse = await fetch(`${API_BASE}/api/auth/debug-generate-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: '0912345678' // Different phone number
      })
    });
    
    console.log('Debug OTP response:', debugResponse.status, debugResponse.statusText);
    const debugData = await debugResponse.json();
    console.log('Debug OTP data:', debugData);
    
    // Step 2: Register with the OTP
    console.log('2. Registering with OTP...');
    const registerResponse = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: '0912345678',
        email: 'newuser@example.com',
        otp: debugData.data.otp,
        firstName: 'New',
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
      console.log('3. Testing login...');
      const loginResponse = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: 'newuser@example.com',
          password: '123456'
        })
      });
      
      const loginData = await loginResponse.json();
      console.log('Login response:', loginData);
      
      if (loginData.success) {
        console.log('✅ Login successful!');
        
        // Test orders endpoint
        console.log('4. Testing orders endpoint...');
        const ordersResponse = await fetch(`${API_BASE}/api/orders`, {
          headers: {
            'Authorization': `Bearer ${loginData.data.token}`
          }
        });
        
        const ordersData = await ordersResponse.json();
        console.log('Orders data:', ordersData);
        
        // Test most-recent endpoint
        console.log('5. Testing most-recent endpoint...');
        const recentResponse = await fetch(`${API_BASE}/api/orders/most-recent`, {
          headers: {
            'Authorization': `Bearer ${loginData.data.token}`
          }
        });
        
        const recentData = await recentResponse.json();
        console.log('Recent data:', recentData);
      }
      
    } else {
      console.log('❌ Registration failed:', registerData.message);
    }
    
  } catch (error) {
    console.error('❌ Failed to create user:', error);
  }
}

// Run test
createNewUser();
