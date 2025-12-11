// Simple test to check authentication issue
const testAuthIssue = async () => {
  const API_BASE = 'http://localhost:5000';
  
  console.log('🔍 Testing authentication issue...');
  
  try {
    // 1. Login để lấy token
    const loginResponse = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: '0942808839',
        password: '27082003Tai@'
      })
    });
    
    const loginData = await loginResponse.json();
    console.log('Login result:', loginData);
    
    if (!loginData.success) {
      console.log('❌ Login failed');
      return;
    }
    
    const token = loginData.data.token;
    const userId = loginData.data.user._id;
    
    console.log('✅ Login successful!');
    console.log('User ID from login:', userId);
    console.log('User isActive:', loginData.data.user.isActive);
    
    // 2. Test authenticated endpoint với token
    console.log('\n--- Testing authenticated endpoint ---');
    const authResponse = await fetch(`${API_BASE}/api/orders/most-recent`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Auth response status:', authResponse.status);
    const authResult = await authResponse.json();
    console.log('Auth result:', authResult);
    
    // 3. Test user orders endpoint
    console.log('\n--- Testing user orders endpoint ---');
    const ordersResponse = await fetch(`${API_BASE}/api/orders`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Orders response status:', ordersResponse.status);
    const ordersResult = await ordersResponse.json();
    console.log('Orders result:', ordersResult);
    
    // 4. Test order creation với token
    console.log('\n--- Testing order creation ---');
    const orderResponse = await fetch(`${API_BASE}/api/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        items: [
          {
            productId: '507f1f77bcf86cd799439011',
            quantity: 1,
            price: 85000
          }
        ],
        shippingAddress: 'Test Address',
        shippingPhone: '0942808839',
        paymentMethod: 'cash'
      })
    });
    
    console.log('Order response status:', orderResponse.status);
    const orderResult = await orderResponse.json();
    console.log('Order result:', orderResult);
    
    if (orderResult.success) {
      console.log('Order userId:', orderResult.data.userId);
      console.log('Order created as:', orderResult.data.userId ? 'authenticated user' : 'guest');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

testAuthIssue();
