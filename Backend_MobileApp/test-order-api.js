// Simple test to check if authentication is working
const testAuth = async () => {
  const API_BASE = 'http://localhost:5000';
  
  // Test 1: Try to create order without token (should work as guest)
  console.log('Testing guest order creation...');
  try {
    const guestResponse = await fetch(`${API_BASE}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
    
    const guestResult = await guestResponse.json();
    console.log('Guest order result:', guestResult);
  } catch (error) {
    console.error('Guest order error:', error);
  }
  
  // Test 2: Try to create order with invalid token
  console.log('\nTesting with invalid token...');
  try {
    const invalidTokenResponse = await fetch(`${API_BASE}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer invalid-token'
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
    
    const invalidTokenResult = await invalidTokenResponse.json();
    console.log('Invalid token result:', invalidTokenResult);
  } catch (error) {
    console.error('Invalid token error:', error);
  }
};

testAuth();
