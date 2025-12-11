// Script to test frontend with the created user
const API_BASE = 'http://localhost:5000';

async function testFrontendWithUser() {
  console.log('Testing frontend with created user...');
  
  try {
    // Login to get token
    console.log('1. Logging in...');
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
    
    if (loginData.success) {
      console.log('✅ Login successful!');
      console.log('User:', loginData.data.user);
      console.log('Token:', loginData.data.token);
      
      // Test orders endpoint
      console.log('2. Testing orders endpoint...');
      const ordersResponse = await fetch(`${API_BASE}/api/orders`, {
        headers: {
          'Authorization': `Bearer ${loginData.data.token}`
        }
      });
      
      const ordersData = await ordersResponse.json();
      console.log('Orders data:', ordersData);
      
      // Test most-recent endpoint
      console.log('3. Testing most-recent endpoint...');
      const recentResponse = await fetch(`${API_BASE}/api/orders/most-recent`, {
        headers: {
          'Authorization': `Bearer ${loginData.data.token}`
        }
      });
      
      const recentData = await recentResponse.json();
      console.log('Recent data:', recentData);
      
      console.log('\n🎉 Frontend should work with these credentials:');
      console.log('Email: newuser@example.com');
      console.log('Password: 123456');
      console.log('\nYou can now test the order tracking page!');
      
    } else {
      console.log('❌ Login failed:', loginData.message);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run test
testFrontendWithUser();
