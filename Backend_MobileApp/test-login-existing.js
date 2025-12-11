// Test login with existing user
const testLogin = async () => {
  const API_BASE = 'http://localhost:5000';
  
  console.log('Testing login with existing user...');
  try {
    const loginResponse = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: '0942808839',
        password: '123456'
      })
    });
    
    const loginResult = await loginResponse.json();
    console.log('Login result:', loginResult);
    
    if (loginResult.success && loginResult.data.token) {
      const token = loginResult.data.token;
      console.log('Got token:', token.substring(0, 50) + '...');
      
      // Now test order creation with real token
      console.log('\nTesting order creation with real token...');
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
    }
  } catch (error) {
    console.error('Login error:', error);
  }
};

testLogin();
