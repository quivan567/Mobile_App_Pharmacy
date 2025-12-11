// Test linking guest order to user account
const testGuestOrderLink = async () => {
  const API_BASE = 'http://localhost:5000';
  
  console.log('Testing guest order linking...');
  
  try {
    // 1. Create a guest order
    console.log('\n--- Creating guest order ---');
    const guestOrderResponse = await fetch(`${API_BASE}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
        shippingPhone: '0123456789',
        paymentMethod: 'cash'
      })
    });
    
    const guestOrderResult = await guestOrderResponse.json();
    console.log('Guest order created:', guestOrderResult);
    
    if (guestOrderResult.success) {
      const guestOrderId = guestOrderResult.data._id;
      const orderNumber = guestOrderResult.data.orderNumber;
      
      console.log('Guest Order ID:', guestOrderId);
      console.log('Order Number:', orderNumber);
      
      // 2. Login with existing user
      console.log('\n--- Logging in with existing user ---');
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
      
      if (loginResult.success) {
        const token = loginResult.data.token;
        const userId = loginResult.data.user._id;
        
        console.log('User ID:', userId);
        console.log('Token:', token.substring(0, 50) + '...');
        
        // 3. Try to link guest order to user account
        console.log('\n--- Attempting to link guest order to user ---');
        const linkResponse = await fetch(`${API_BASE}/api/orders/${guestOrderId}/link`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            userId: userId
          })
        });
        
        const linkResult = await linkResponse.json();
        console.log('Link result:', linkResult);
        
        // 4. Check if order now appears in user's order history
        console.log('\n--- Checking user order history ---');
        const userOrdersResponse = await fetch(`${API_BASE}/api/orders`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        const userOrdersResult = await userOrdersResponse.json();
        console.log('User orders:', userOrdersResult);
        
        if (userOrdersResult.success) {
          const userOrders = userOrdersResult.data;
          const foundOrder = userOrders.find(order => order._id === guestOrderId);
          
          if (foundOrder) {
            console.log('✅ Guest order successfully linked to user account!');
            console.log('Order found in user history:', foundOrder);
          } else {
            console.log('❌ Guest order not found in user history');
            console.log('Available orders:', userOrders.map(o => ({ id: o._id, number: o.orderNumber })));
          }
        }
      }
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

testGuestOrderLink();
