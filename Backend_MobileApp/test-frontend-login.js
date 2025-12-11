// Test frontend login process
const testFrontendLogin = async () => {
  const API_BASE = 'http://localhost:5000';
  
  console.log('Testing frontend login process...');
  
  try {
    // Test login with existing user
    const loginResponse = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: '0912345678',
        password: '123456'
      })
    });
    
    const loginResult = await loginResponse.json();
    console.log('Login result:', loginResult);
    
    if (loginResult.success && loginResult.data.token) {
      const token = loginResult.data.token;
      const user = loginResult.data.user;
      
      console.log('✅ Login successful!');
      console.log('Token:', token.substring(0, 50) + '...');
      console.log('User:', user);
      
      // Simulate localStorage storage
      console.log('\n--- Simulating localStorage storage ---');
      console.log('localStorage.setItem("auth_token", token)');
      console.log('localStorage.setItem("user", JSON.stringify(user))');
      
      // Test token retrieval
      console.log('\n--- Testing token retrieval ---');
      console.log('localStorage.getItem("auth_token"):', token.substring(0, 50) + '...');
      console.log('localStorage.getItem("user"):', user);
      
      // Test API request with token
      console.log('\n--- Testing API request with token ---');
      const orderResponse = await fetch(`${API_BASE}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          items: [
            {
              productId: '507f1f77bcf86cd799439011',
              quantity: 1,
              price: 100000
            }
          ],
          shippingAddress: 'Test Address',
          shippingPhone: '0123456789',
          paymentMethod: 'cash'
        })
      });
      
      const orderResult = await orderResponse.json();
      console.log('Order creation result:', orderResult);
      
      if (orderResult.success) {
        console.log('✅ Order created successfully!');
        console.log('Order number:', orderResult.data.orderNumber);
      } else {
        console.log('❌ Order creation failed:', orderResult.message);
      }
    } else {
      console.log('❌ Login failed:', loginResult.message);
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

testFrontendLogin();
