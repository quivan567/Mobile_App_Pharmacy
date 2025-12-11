// Test with the working token
const testWithWorkingToken = async () => {
  const API_BASE = 'http://localhost:5000';
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OGU1NDc2MzY2YjhkMGE2ZDgwYjQ5MjkiLCJpYXQiOjE3NTk4NjA3NzMsImV4cCI6MTc2MDQ2NTU3M30.G2mIfZEh0lmlbb2bMM-990qwvenZMnsi2OLb-2atRJY';
  
  console.log('Testing order creation with working token...');
  try {
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
    
    console.log('Response status:', orderResponse.status);
    console.log('Response headers:', Object.fromEntries(orderResponse.headers.entries()));
    
    const orderResult = await orderResponse.json();
    console.log('Order creation result:', orderResult);
  } catch (error) {
    console.error('Error:', error);
  }
};

testWithWorkingToken();
