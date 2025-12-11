// Simple test to check authentication issue
const simpleAuthTest = async () => {
  const API_BASE = 'http://localhost:5000';
  
  console.log('Simple authentication test...');
  
  try {
    // 1. Login
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
    
    const loginResult = await loginResponse.json();
    
    if (loginResult.success) {
      const token = loginResult.data.token;
      const user = loginResult.data.user;
      
      console.log('✅ Login successful!');
      console.log('User ID:', user._id);
      console.log('User isActive:', user.isActive);
      console.log('Token length:', token.length);
      
      // 2. Test với một API đơn giản trước
      console.log('\n--- Testing with a simple authenticated endpoint ---');
      
      // Thử với /api/orders/most-recent trước
      const mostRecentResponse = await fetch(`${API_BASE}/api/orders/most-recent`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Most recent response status:', mostRecentResponse.status);
      const mostRecentResult = await mostRecentResponse.json();
      console.log('Most recent result:', mostRecentResult);
      
      // 3. Nếu most-recent hoạt động, thử với /api/orders
      if (mostRecentResponse.status === 200) {
        console.log('\n--- Testing with /api/orders ---');
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
      }
      
      // 4. Test tạo order với token
      console.log('\n--- Testing order creation with token ---');
      const orderResponse = await fetch(`${API_BASE}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          items: [
            {
              productId: '68e404e4ac5f7d32f238b924',
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
        if (orderResult.data.userId === null) {
          console.log('❌ PROBLEM: Order created as guest despite authentication!');
        } else {
          console.log('✅ Order created with correct user ID!');
        }
      }
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

simpleAuthTest();
